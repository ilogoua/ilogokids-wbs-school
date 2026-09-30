const test = require('node:test')
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { invitationsRouter } = require('../dist/routes/invitations')
const { Session } = require('../dist/models/Session')
const { User } = require('../dist/models/User')
const { UserGraphLink } = require('../dist/models/UserGraphLink')
const { GraphNode } = require('../dist/models/GraphNode')
const { Invitation } = require('../dist/models/Invitation')

const cookie = `ilogokids_session=${'a'.repeat(64)}`
function post(body = { email: 'friend@example.com' }, headers = { cookie }) {
  return new Promise((resolve, reject) => {
    const request = { method: 'POST', url: '/', body, headers, get(name) { return this.headers[name.toLowerCase()] } }
    const response = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this }, json(body) { resolve({ status: this.statusCode, body }) } }
    invitationsRouter.handle(request, response, error => reject(error || new Error('Route not handled')))
  })
}
function authenticate(t) {
  t.mock.method(Session, 'findOne', async filter => {
    assert.equal(filter.tokenHash, createHash('sha256').update('a'.repeat(64)).digest('hex'))
    assert.ok(filter.expiresAt.$gt instanceof Date)
    return { userId: 'owner' }
  })
  t.mock.method(User, 'exists', async filter => { assert.deepEqual(filter, { _id: 'owner' }); return { _id: 'owner' } })
}
function forbidCreation(t) {
  t.mock.method(Invitation, 'create', () => { assert.fail('Must not create invitation') })
}

test('missing, malformed and expired sessions cannot create invitations', async t => {
  forbidCreation(t)
  t.mock.method(UserGraphLink, 'findOne', () => { assert.fail('Must not resolve unauthenticated branch') })
  t.mock.method(Session, 'findOne', async filter => { assert.ok(filter.expiresAt.$gt instanceof Date); return null })
  for (const headers of [{}, { cookie: 'ilogokids_session=invalid' }, { cookie }]) {
    assert.equal((await post({ email: 'friend@example.com', parentNodeId: 'foreign' }, headers)).status, 401)
  }
})

test('a deleted session owner is rejected', async t => {
  forbidCreation(t)
  t.mock.method(Session, 'findOne', async () => ({ userId: 'deleted' }))
  t.mock.method(User, 'exists', async () => null)
  assert.equal((await post()).status, 401)
})

test('server resolves the owner branch and ignores supplied parentNodeId', async t => {
  authenticate(t)
  t.mock.method(UserGraphLink, 'findOne', async filter => {
    assert.deepEqual(filter, { userId: 'owner' })
    return { graphNodeId: 'own-node' }
  })
  t.mock.method(GraphNode, 'exists', async filter => {
    assert.deepEqual(filter, { _id: 'own-node' })
    return { _id: 'own-node' }
  })
  t.mock.method(GraphNode, 'create', () => { assert.fail('Invitation must not create graph topology') })
  const created = []
  t.mock.method(Invitation, 'create', async data => { created.push(data) })
  for (const parentNodeId of [undefined, 'someone-elses-node', { $ne: null }]) {
    const result = await post({ email: ' Friend@Example.COM ', parentNodeId })
    assert.equal(result.status, 201)
    assert.match(result.body.token, /^[a-f0-9]{64}$/)
    const invitation = created.at(-1)
    assert.equal(invitation.email, 'friend@example.com')
    assert.equal(invitation.parentNodeId, 'own-node')
    assert.equal(invitation.tokenHash, createHash('sha256').update(result.body.token).digest('hex'))
    assert.ok(new Date(result.body.expiresAt).getTime() > Date.now())
    assert.ok(!('token' in invitation))
  }
  assert.equal(new Set(created.map(item => item.tokenHash)).size, 3)
})

test('missing user link or missing linked GraphNode fails closed', async t => {
  authenticate(t)
  forbidCreation(t)
  t.mock.method(UserGraphLink, 'findOne', async () => null)
  assert.equal((await post()).status, 409)
  t.mock.method(UserGraphLink, 'findOne', async () => ({ graphNodeId: 'missing' }))
  t.mock.method(GraphNode, 'exists', async () => null)
  assert.equal((await post()).status, 409)
})

test('invalid emails are rejected for an authenticated user', async t => {
  authenticate(t)
  forbidCreation(t)
  for (const email of [undefined, '', 'not-email', { $ne: null }]) {
    assert.equal((await post({ email })).status, 400)
  }
})

test('cross-site invitation requests are rejected', async t => {
  authenticate(t)
  forbidCreation(t)
  for (const headers of [
    { origin: 'https://foreign.example', host: 'localhost:3000' },
    { origin: 'invalid', host: 'localhost:3000' },
    { 'sec-fetch-site': 'cross-site' },
  ]) {
    assert.equal((await post(undefined, { cookie, ...headers })).status, 403)
  }
})

test('database errors return a controlled failure', async t => {
  forbidCreation(t)
  t.mock.method(Session, 'findOne', async () => { throw new Error('Database unavailable') })
  assert.equal((await post()).status, 500)
})
