const test = require('node:test')
const assert = require('node:assert/strict')
const mongoose = require('mongoose')
const { normalizeLoginName } = require('../dist/lib/loginName')
const { User } = require('../dist/models/User')
const { Invitation } = require('../dist/models/Invitation')
const { Session } = require('../dist/models/Session')
const passwordHelper = require('../dist/lib/password')
const { authRouter } = require('../dist/routes/auth')
const { registrationRouter } = require('../dist/routes/registration')

function post(router, path, body) {
  return new Promise((resolve, reject) => {
    const request = { method: 'POST', url: path, path, body, headers: {}, get: () => undefined }
    const response = {
      statusCode: 200,
      setHeader() {},
      status(code) { this.statusCode = code; return this },
      cookie() { return this },
      json(body) { resolve({ status: this.statusCode, body }) },
    }
    router.handle(request, response, (error) => reject(error || new Error('Route not handled')))
  })
}

test('Nicks normalize consistently and reject invalid handles', () => {
  assert.equal(normalizeLoginName(' Fox_123 '), 'fox_123')
  assert.equal(normalizeLoginName('FOX-123'), 'fox-123')
  for (const value of [undefined, null, 123, {}, '', 'ab', '1fox', 'fox kid', 'fox@example.com', 'füchs', 'a'.repeat(25)]) {
    assert.equal(normalizeLoginName(value), null)
  }
})

test('registration rejects missing or invalid Nicks before database access', async (t) => {
  t.mock.method(Invitation, 'exists', () => { throw new Error('Must not access DB') })
  for (const loginName of [undefined, '', 'ab', 'fox@example.com']) {
    const result = await post(registrationRouter, '/', { token: 'a'.repeat(64), publicName: 'Fox Kid', password: 'Test-password!', loginName })
    assert.equal(result.status, 400)
    assert.equal(result.body.code, 'invalid_login_name')
  }
})

test('email-only login is rejected without a user lookup', async (t) => {
  t.mock.method(User, 'findOne', () => { throw new Error('Must not look up email') })
  const result = await post(authRouter, '/login', { email: 'fox@example.com', password: 'Test-password!' })
  assert.equal(result.status, 400)
})

test('login looks up only the normalized Nick and preserves the session response', async (t) => {
  const userId = new mongoose.Types.ObjectId()
  t.mock.method(User, 'findOne', async (query) => {
    assert.deepEqual(query, { loginName: 'fox_123' })
    return { _id: userId, publicName: 'Fox Kid', passwordHash: 'stored-password-hash' }
  })
  t.mock.method(passwordHelper, 'verifyPassword', async (password, hash) => {
    assert.equal(password, 'Test-password!')
    assert.equal(hash, 'stored-password-hash')
    return true
  })
  t.mock.method(Session, 'create', async (record) => {
    assert.equal(record.userId, userId)
    assert.match(record.tokenHash, /^[a-f0-9]{64}$/)
    return record
  })
  const result = await post(authRouter, '/login', { loginName: ' FOX_123 ', email: 'ignored@example.com', password: 'Test-password!' })
  assert.equal(result.status, 200)
  assert.deepEqual(result.body, { user: { id: userId, publicName: 'Fox Kid' } })
})

test('duplicate Nick has a distinct conflict response', async (t) => {
  t.mock.method(Invitation, 'exists', async () => ({ _id: new mongoose.Types.ObjectId() }))
  t.mock.method(passwordHelper, 'hashPassword', async () => 'stored-password-hash')
  t.mock.method(mongoose.connection, 'transaction', async () => {
    throw new mongoose.mongo.MongoServerError({ message: 'Duplicate key', code: 11000, keyPattern: { loginName: 1 } })
  })
  const result = await post(registrationRouter, '/', { token: 'a'.repeat(64), loginName: 'fox_123', publicName: 'Fox Kid', password: 'Test-password!' })
  assert.equal(result.status, 409)
  assert.equal(result.body.code, 'login_name_taken')
})
