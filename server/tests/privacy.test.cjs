const test = require('node:test')
const assert = require('node:assert/strict')
const { profileRouter } = require('../dist/routes/profile')
const { graphRouter } = require('../dist/routes/graph')
const { buildGraphResponse } = require('../dist/lib/graph')
const { User } = require('../dist/models/User')
const { Session } = require('../dist/models/Session')
const { GraphNode } = require('../dist/models/GraphNode')
const { UserGraphLink } = require('../dist/models/UserGraphLink')
const cookie = `ilogokids_session=${'a'.repeat(64)}`
function request(router, method, body, headers = { cookie }) {
  return new Promise((resolve, reject) => {
    const req = { method, url: '/', body, headers, get(name) { return this.headers[name.toLowerCase()] } }
    const res = { statusCode: 200, locals: {}, setHeader() {}, status(code) { this.statusCode = code; return this }, json(body) { resolve({ status: this.statusCode, body }) } }
    router.handle(req, res, error => reject(error || new Error('Route not handled')))
  })
}
function query(value) { return { select() { return this }, sort() { return this }, lean: async () => value, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject) } } }
function authenticate(t) {
  t.mock.method(Session, 'findOne', async filter => { assert.ok(filter.expiresAt.$gt instanceof Date); return { userId: 'owner' } })
  t.mock.method(User, 'exists', async filter => { assert.deepEqual(filter, { _id: 'owner' }); return { _id: 'owner' } })
}

test('anonymous presentation hides identity for owner and other viewers while preserving all topology and counts', () => {
  const nodes = [{ id: 'root', parentNodeId: null }, { id: 'child', parentNodeId: 'root' }]
  const links = [{ userId: 'owner', graphNodeId: 'root' }, { userId: 'other', graphNodeId: 'child' }]
  const users = [{ id: 'owner', publicName: 'SECRET-NAME', visibility: 'anonymous' }, { id: 'other', publicName: 'Visible', visibility: 'visible' }]
  for (const viewer of ['owner', 'other']) {
    const graph = buildGraphResponse(nodes, links, users, viewer)
    assert.deepEqual(graph.nodes[0], { id: 'root', parentNodeId: null, descendantCount: 1 })
    assert.equal(graph.nodes[1].publicName, 'Visible')
    assert.ok(!JSON.stringify(graph).includes('SECRET'))
    assert.equal(graph.currentGraphNodeId, viewer === 'owner' ? 'root' : 'child')
  }
  assert.equal(buildGraphResponse(nodes, links, [{ ...users[0], visibility: 'visible' }], 'owner').nodes[0].publicName, 'SECRET-NAME')
})

test('legacy profiles stay visible and unknown visibility fails closed', () => {
  const nodes = [{ id: 'root', parentNodeId: null }]
  const links = [{ userId: 'owner', graphNodeId: 'root' }]
  assert.equal(buildGraphResponse(nodes, links, [{ id: 'owner', publicName: 'Legacy' }], 'owner').nodes[0].publicName, 'Legacy')
  for (const visibility of ['invalid', null]) {
    assert.ok(!('publicName' in buildGraphResponse(nodes, links, [{ id: 'owner', publicName: 'Secret', visibility }], 'owner').nodes[0]))
  }
})

test('real graph route applies persisted privacy and never exposes account fields', async t => {
  authenticate(t)
  t.mock.method(GraphNode, 'find', () => query([{ _id: 'root', parentNodeId: null }]))
  t.mock.method(UserGraphLink, 'find', () => query([{ userId: 'owner', graphNodeId: 'root' }]))
  t.mock.method(User, 'find', () => ({ select(fields) {
    assert.equal(fields, 'publicName visibility')
    return query([{ _id: 'owner', publicName: 'SECRET-NAME', visibility: 'anonymous', loginName: 'SECRET-NICK', email: 'SECRET-EMAIL', passwordHash: 'SECRET-HASH' }])
  } }))
  const result = await request(graphRouter, 'GET')
  assert.equal(result.status, 200)
  assert.deepEqual(result.body.nodes, [{ id: 'root', parentNodeId: null, descendantCount: 0 }])
  assert.ok(!JSON.stringify(result.body).includes('SECRET'))
})

test('profile reads and writes reject missing, malformed, expired and deleted-owner sessions', async t => {
  t.mock.method(User, 'findOneAndUpdate', () => assert.fail('Unauthorized write'))
  t.mock.method(Session, 'findOne', async () => null)
  for (const method of ['GET', 'PATCH']) {
    for (const headers of [{}, { cookie: 'ilogokids_session=invalid' }, { cookie }]) {
      assert.equal((await request(profileRouter, method, { visibility: 'anonymous' }, headers)).status, 401)
    }
  }
  t.mock.method(Session, 'findOne', async () => ({ userId: 'deleted' }))
  t.mock.method(User, 'exists', async () => null)
  assert.equal((await request(profileRouter, 'PATCH', { visibility: 'anonymous' })).status, 401)
})

test('profile exposes only the current visibility, including legacy default', async t => {
  authenticate(t)
  for (const visibility of [undefined, 'anonymous', 'visible']) {
    t.mock.method(User, 'findById', id => { assert.equal(id, 'owner'); return query({ visibility, email: 'private', publicName: 'private' }) })
    assert.deepEqual((await request(profileRouter, 'GET')).body, { visibility: visibility ?? 'visible' })
  }
})

test('profile writes target only authenticated user and only visibility, ignoring arbitrary userId and profile fields', async t => {
  authenticate(t)
  for (const visibility of ['anonymous', 'visible']) {
    t.mock.method(User, 'findOneAndUpdate', (filter, update, options) => {
      assert.deepEqual(filter, { _id: 'owner' })
      assert.deepEqual(update, { $set: { visibility } })
      assert.deepEqual(options, { returnDocument: 'after', runValidators: true })
      return query({ visibility })
    })
    const result = await request(profileRouter, 'PATCH', { visibility, userId: 'victim', publicName: 'overwrite', role: 'direx' })
    assert.equal(result.status, 200)
    assert.deepEqual(result.body, { visibility })
  }
})

test('invalid visibility and cross-site updates cannot write', async t => {
  authenticate(t)
  t.mock.method(User, 'findOneAndUpdate', () => assert.fail('Invalid write'))
  for (const visibility of [undefined, 'private', null, false, { $ne: null }]) {
    assert.equal((await request(profileRouter, 'PATCH', { visibility })).status, 400)
  }
  for (const extra of [{ origin: 'https://foreign.example', host: 'localhost:3001' }, { origin: 'invalid' }, { 'sec-fetch-site': 'cross-site' }]) {
    assert.equal((await request(profileRouter, 'PATCH', { visibility: 'anonymous' }, { cookie, ...extra })).status, 403)
  }
})

test('missing user at update time and database failures fail safely', async t => {
  authenticate(t)
  t.mock.method(User, 'findOneAndUpdate', () => query(null))
  assert.equal((await request(profileRouter, 'PATCH', { visibility: 'anonymous' })).status, 401)
  t.mock.method(User, 'findOneAndUpdate', () => { throw new Error('Database failure') })
  assert.equal((await request(profileRouter, 'PATCH', { visibility: 'anonymous' })).status, 500)
})
