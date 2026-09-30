type TopologyNode = { id: string; parentNodeId: string | null }
type Link = { userId: string; graphNodeId: string }
type Presentation = { id: string; publicName: string; visibility?: string }

export function buildGraphResponse(nodes: TopologyNode[], links: Link[], users: Presentation[], currentUserId: string) {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const counts = new Map(nodes.map((node) => [node.id, 0]))
  const remainingChildren = new Map(nodes.map((node) => [node.id, 0]))
  for (const node of nodes) {
    if (node.parentNodeId && byId.has(node.parentNodeId)) {
      remainingChildren.set(node.parentNodeId, remainingChildren.get(node.parentNodeId)! + 1)
    }
  }
  const queue = nodes.filter((node) => remainingChildren.get(node.id) === 0).map((node) => node.id)
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index]
    const parentId = byId.get(id)!.parentNodeId
    if (!parentId || !byId.has(parentId)) continue
    counts.set(parentId, counts.get(parentId)! + counts.get(id)! + 1)
    remainingChildren.set(parentId, remainingChildren.get(parentId)! - 1)
    if (remainingChildren.get(parentId) === 0) queue.push(parentId)
  }
  if (queue.length !== nodes.length) throw new Error('Graph topology contains a cycle')

  // Missing visibility preserves existing profiles; unknown values hide identity.
  const names = new Map(users
    .filter((user) => user.visibility === undefined || user.visibility === 'visible')
    .map((user) => [user.id, user.publicName]))
  const nodeNames = new Map(links.flatMap((link) => {
    const name = names.get(link.userId)
    return name ? [[link.graphNodeId, name] as const] : []
  }))
  const currentLink = links.find((link) => link.userId === currentUserId && byId.has(link.graphNodeId))

  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      parentNodeId: node.parentNodeId,
      descendantCount: counts.get(node.id)!,
      ...(nodeNames.has(node.id) ? { publicName: nodeNames.get(node.id)! } : {}),
    })),
    currentGraphNodeId: currentLink?.graphNodeId ?? null,
  }
}
