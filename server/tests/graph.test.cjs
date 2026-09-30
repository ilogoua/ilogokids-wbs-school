const test = require('node:test')
const assert = require('node:assert/strict')
const { buildGraphResponse } = require('../dist/lib/graph')
const { graphRouter } = require('../dist/routes/graph')
const { GraphNode } = require('../dist/models/GraphNode')
const { UserGraphLink } = require('../dist/models/UserGraphLink')
const { User } = require('../dist/models/User')
const { Session } = require('../dist/models/Session')
const nodes = ['direx', 'mia', 'leo', 'lina'].map((id, index, ids) => ({ id, parentNodeId: index ? ids[index - 1] : null }))
function get(cookie) {
  return new Promise((resolve, reject) => {
    const request = { method: 'GET', url: '/', headers: cookie ? { cookie } : {} }
    const response = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this }, json(body) { resolve({ status: this.statusCode, body }) } }
    graphRouter.handle(request, response, error => reject(error || new Error('Route not handled')))
  })
}
function query(value) { return { select() { return this }, sort() { return this }, lean: async () => value } }

test('chain counts total descendants and exposes only linked public names', () => {
  const links = [{ userId: 'u-mia', graphNodeId: 'mia' }, { userId: 'missing-user', graphNodeId: 'leo' }]
  const result = buildGraphResponse(nodes, links, [{ id: 'u-mia', publicName: 'Mia' }], 'u-mia')
  assert.deepEqual(result.nodes.map(node => node.descendantCount), [3, 2, 1, 0])
  assert.equal(result.currentGraphNodeId, 'mia')
  assert.deepEqual(result.nodes[1], { id: 'mia', parentNodeId: 'direx', descendantCount: 2, publicName: 'Mia' })
  assert.ok(!('publicName' in result.nodes[0]))
  assert.ok(!('publicName' in result.nodes[2]))
})

test('branching, forests, dangling parents, empty graphs, and missing links are handled', () => {
  const result = buildGraphResponse([...nodes, { id: 'sibling', parentNodeId: 'direx' }, { id: 'orphan', parentNodeId: 'missing' }], [], [], 'user')
  assert.deepEqual(result.nodes.map(node => node.descendantCount), [4, 2, 1, 0, 0, 0])
  assert.equal(result.currentGraphNodeId, null)
  assert.deepEqual(buildGraphResponse([], [], [], 'user'), { nodes: [], currentGraphNodeId: null })
  assert.throws(() => buildGraphResponse([{ id: 'a', parentNodeId: 'b' }, { id: 'b', parentNodeId: 'a' }], [], [], 'user'), /cycle/)
})

test('graph rejects missing, malformed and expired sessions before reading topology', async (t) => {
  t.mock.method(GraphNode, 'find', () => { throw new Error('Unauthenticated graph lookup') })
  t.mock.method(Session, 'findOne', async filter => { assert.ok(filter.expiresAt.$gt instanceof Date); return null })
  for (const cookie of [undefined, 'ilogokids_session=invalid', `ilogokids_session=${'a'.repeat(64)}`]) {
    assert.equal((await get(cookie)).status, 401)
  }
})

test('authenticated graph resolves presentation separately and returns current node', async (t) => {
  t.mock.method(Session, 'findOne', async () => ({ userId: 'user' }))
  t.mock.method(User, 'exists', async () => ({ _id: 'user' }))
  t.mock.method(GraphNode, 'find', () => query(nodes.map(node => ({ _id: node.id, parentNodeId: node.parentNodeId, email: 'must-not-leak' }))))
  t.mock.method(UserGraphLink, 'find', () => query([{ userId: 'user', graphNodeId: 'leo' }]))
  t.mock.method(User, 'find', () => query([{ _id: 'user', publicName: 'Leo', loginName: 'private-nick', passwordHash: 'private-hash', email: 'private-email' }]))
  const result = await get(`ilogokids_session=${'a'.repeat(64)}`)
  assert.equal(result.status, 200)
  assert.equal(result.body.currentGraphNodeId, 'leo')
  assert.equal(result.body.nodes[2].publicName, 'Leo')
  assert.ok(!JSON.stringify(result.body).includes('private'))
  assert.ok(!JSON.stringify(result.body).includes('must-not-leak'))
})

test('deleted session owner is rejected', async (t) => {
  t.mock.method(Session, 'findOne', async () => ({ userId: 'deleted-user' }))
  t.mock.method(User, 'exists', async () => null)
  assert.equal((await get(`ilogokids_session=${'a'.repeat(64)}`)).status, 401)
})
