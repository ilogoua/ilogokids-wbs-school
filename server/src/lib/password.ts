import { randomBytes, scrypt } from 'node:crypto'

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
