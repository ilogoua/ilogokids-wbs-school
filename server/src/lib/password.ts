import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex')
  const cost = 131072
  const blockSize = 8
  const parallelization = 1

  const derivedKey = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, {
      N: cost,
      r: blockSize,
      p: parallelization,
      maxmem: 256 * 1024 * 1024,
    }, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })

  return `scrypt$${cost}$${blockSize}$${parallelization}$${salt}$${derivedKey.toString('hex')}`
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  // Accept the exact format and bounded parameters produced by hashPassword.
  if (!/^scrypt\$131072\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(passwordHash)) return false
  const [, , , , salt, key] = passwordHash.split('$')
  const derivedKey = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (error, result) => {
      if (error) reject(error)
      else resolve(result)
    })
  })
  return timingSafeEqual(derivedKey, Buffer.from(key, 'hex'))
}
