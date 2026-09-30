const test = require('node:test')
const assert = require('node:assert/strict')
const { validateRootInput } = require('../dist/lib/bootstrapRoot')

const valid = { loginName: ' Direx ', publicName: ' Direx ', email: ' ROOT@EXAMPLE.COM ', password: 'long-password' }

test('bootstrap uses the shared Nick normalization and trims profile values', () => {
  assert.deepEqual(validateRootInput(valid), { loginName: 'direx', publicName: 'Direx', email: 'root@example.com', password: 'long-password' })
})

test('bootstrap rejects malformed input before any database connection or write', () => {
  for (const input of [null, [], {}, 'text',
    { ...valid, loginName: 'ab' }, { ...valid, loginName: 'root@example.com' },
    { ...valid, publicName: ' ' }, { ...valid, publicName: 'a'.repeat(51) },
    { ...valid, email: 'invalid' }, { ...valid, email: 'a @example.com' },
    { ...valid, password: 'short' }, { ...valid, password: 'a'.repeat(129) },
  ]) assert.throws(() => validateRootInput(input))
})
