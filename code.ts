// Export selected node without Drop Shadow
// 只导出当前选中的图层 / Group，不导出框选区域里的其他内容。
// 做法：复制选中节点 -> 遍历副本删除 DROP_SHADOW -> 导出副本 -> 删除副本。

if (figma.editorType === 'figma') {
  figma.showUI(__html__, {
    width: 320,
    height: 180,
    title: 'Export Without Drop Shadow',
    themeColors: true
  })

  type PluginMessage = {
    type: 'export'
    scale: number
  }

  figma.ui.onmessage = async (msg: PluginMessage) => {
    if (msg.type !== 'export') return

    const selectedNodes = figma.currentPage.selection

    if (selectedNodes.length !== 1) {
      figma.notify('请只选中一个图层、Group、Frame 或组件后再导出')
      return
    }

    const selectedNode = selectedNodes[0]

    if (!('exportAsync' in selectedNode)) {
      figma.notify('当前选中的节点不支持导出')
      return
    }

    const scale = msg.scale || 1
    let clone: SceneNode | null = null

    try {
      // 复制当前选中的节点。
      // 注意：不要用 Slice，因为 Slice 会导出所在矩形区域里的所有可见内容。
      clone = selectedNode.clone()

      // 为了避免临时副本挡住原设计稿，稍微挪远一点。
      // 导出的是 clone 本身，所以不会导出原图层或背景。
      if ('x' in clone && 'y' in clone) {
        clone.x = selectedNode.x + 100000
        clone.y = selectedNode.y
      }

      // 如果副本里有 Instance，先临时 detach，方便递归修改里面的子图层效果。
      // 只处理临时副本，不会影响你的原设计稿。
      clone = detachInstancesDeep(clone)

      const removedCount = removeDropShadowDeep(clone)

      const bytes = await clone.exportAsync({
        format: 'PNG',
        constraint: {
          type: 'SCALE',
          value: scale
        }
      })

      const filename = `${safeFileName(selectedNode.name)}@${scale}x-no-shadow.png`

      figma.ui.postMessage({
        type: 'download',
        filename,
        bytes
      })

      clone.remove()

      figma.notify(`导出成功，已移除 ${removedCount} 个 Drop Shadow`)
    } catch (error) {
      if (clone && !clone.removed) {
        clone.remove()
      }

      console.error(error)
      figma.notify('导出失败，请检查选中的图层结构')
    }
  }
}

if (figma.editorType === 'figjam') {
  figma.closePlugin('这个插件只支持 Figma Design，不支持 FigJam')
}

/**
 * 递归删除节点和子节点中的 DROP_SHADOW。
 * 只删除 DROP_SHADOW，保留 INNER_SHADOW、LAYER_BLUR、BACKGROUND_BLUR 等其他效果。
 */
function removeDropShadowDeep(node: SceneNode): number {
  let removedCount = 0

  if ('effects' in node) {
    const currentEffects = node.effects

    const nextEffects = currentEffects.filter(effect => {
      if (effect.type === 'DROP_SHADOW') {
        removedCount++
        return false
      }

      return true
    })

    if (nextEffects.length !== currentEffects.length) {
      node.effects = nextEffects
    }
  }

  if ('children' in node) {
    for (const child of node.children) {
      removedCount += removeDropShadowDeep(child)
    }
  }

  return removedCount
}

/**
 * 递归 detach 临时副本里的 Instance。
 * 原因：如果 Drop Shadow 在组件实例内部的子图层上，直接修改可能会受 Instance 限制。
 * 这里只 detach 临时 clone，不会影响原来的设计稿。
 */
function detachInstancesDeep(node: SceneNode): SceneNode {
  let currentNode = node

  if (currentNode.type === 'INSTANCE') {
    currentNode = currentNode.detachInstance()
  }

  if ('children' in currentNode) {
    const children = [...currentNode.children]

    for (const child of children) {
      detachInstancesDeep(child)
    }
  }

  return currentNode
}

function safeFileName(name: string) {
  return name
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '-')
    .toLowerCase()
}