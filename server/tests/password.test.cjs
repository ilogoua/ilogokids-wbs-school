const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword, verifyPassword } = require('../dist/lib/password')

test('password hashing is salted and verifies only the original password', async () => {
  const password = 'Test-password-123!'
  const first = await hashPassword(password)
  const second = await hashPassword(password)
  assert.notEqual(first, second)
  assert.equal(await verifyPassword(password, first), true)
  assert.equal(await verifyPassword('Wrong-password-123!', first), false)
  assert.equal(await verifyPassword(password + ' ', first), false)
})

test('malformed hashes and unexpected scrypt parameters are rejected', async () => {
  for (const hash of ['', 'plaintext', 'scrypt$999999999$8$1$bad$bad', 'scrypt$131072$8$1$bad$bad']) {
    assert.equal(await verifyPassword('Test-password-123!', hash), false)
  }
})
