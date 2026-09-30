import { createHash, randomBytes } from 'node:crypto'
import { Router } from 'express'
import type { CookieOptions, Request } from 'express'
import { verifyPassword } from '../lib/password'
import { normalizeLoginName } from '../lib/loginName'
import { Session } from '../models/Session'
import { User } from '../models/User'

export const authRouter = Router()

const COOKIE_NAME = 'ilogokids_session'
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000
const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/api',
}

function sessionHash(request: Request): string | null {
  const cookie = request.headers.cookie?.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
  const token = cookie?.slice(COOKIE_NAME.length + 1)
  return token && /^[a-f0-9]{64}$/.test(token) ? createHash('sha256').update(token).digest('hex') : null
}

authRouter.use((request, response, next) => {
  if (!['/login', '/session', '/logout'].includes(request.path)) {
    next()
    return
  }
  response.setHeader('Cache-Control', 'no-store')
  // Cookies are used only by the same-origin frontend, including Vite's API proxy.
  if (request.method === 'POST') {
    const origin = request.get('origin')
    let foreignOrigin = false
    if (origin) {
      try { foreignOrigin = new URL(origin).host !== request.get('host') }
      catch { foreignOrigin = true }
    }
    if (foreignOrigin || request.get('sec-fetch-site') === 'cross-site') {
      response.status(403).json({ error: 'Cross-site authentication requests are not allowed' })
      return
    }
  }
  next()
})

authRouter.post('/login', async (request, response) => {
  const { loginName: suppliedLoginName, password } = request.body ?? {}
  const loginName = normalizeLoginName(suppliedLoginName)
  if (!loginName ||
      typeof password !== 'string' || !password || password.length > 128) {
    response.status(400).json({ error: 'A valid loginName and password are required' })
    return
  }

  try {
    const user = await User.findOne({ loginName })
    if (!user || !await verifyPassword(password, user.passwordHash)) {
      response.status(401).json({ error: 'Invalid loginName or password' })
      return
    }

    const token = randomBytes(32).toString('hex')
    await Session.create({
      tokenHash: createHash('sha256').update(token).digest('hex'),
      userId: user._id,
      expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS),
    })
    const previousHash = sessionHash(request)
    if (previousHash) await Session.deleteOne({ tokenHash: previousHash })

    response.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: SESSION_LIFETIME_MS })
    response.json({ user: { id: user._id, publicName: user.publicName } })
  } catch {
    response.status(500).json({ error: 'Failed to log in' })
  }
})

authRouter.get('/session', async (request, response) => {
  try {
    const tokenHash = sessionHash(request)
    const session = tokenHash ? await Session.findOne({ tokenHash, expiresAt: { $gt: new Date() } }) : null
    const user = session ? await User.findById(session.userId).select('publicName') : null
    if (!user) {
      response.clearCookie(COOKIE_NAME, cookieOptions)
      response.status(401).json({ error: 'Not authenticated' })
      return
    }
    response.json({ user: { id: user._id, publicName: user.publicName } })
  } catch {
    response.status(500).json({ error: 'Failed to check session' })
  }
})

authRouter.post('/logout', async (request, response) => {
  try {
    const tokenHash = sessionHash(request)
    if (tokenHash) await Session.deleteOne({ tokenHash })
    response.clearCookie(COOKIE_NAME, cookieOptions)
    response.status(204).end()
  } catch {
    response.status(500).json({ error: 'Failed to log out' })
  }
})
