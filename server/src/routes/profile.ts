import { Router } from 'express'
import { Session } from '../models/Session'
import { User } from '../models/User'
import { sessionHash } from './auth'

export const profileRouter = Router()

profileRouter.use(async (request, response, next) => {
  response.setHeader('Cache-Control', 'no-store')
  try {
    const tokenHash = sessionHash(request)
    const session = tokenHash ? await Session.findOne({ tokenHash, expiresAt: { $gt: new Date() } }) : null
    if (!session || !await User.exists({ _id: session.userId })) {
      response.status(401).json({ error: 'Not authenticated' })
      return
    }
    if (request.method === 'PATCH') {
      const origin = request.get('origin')
      let foreignOrigin = false
      if (origin) {
        try { foreignOrigin = new URL(origin).host !== request.get('host') }
        catch { foreignOrigin = true }
      }
      if (foreignOrigin || request.get('sec-fetch-site') === 'cross-site') {
        response.status(403).json({ error: 'Cross-site profile requests are not allowed' })
        return
      }
    }
    response.locals.userId = session.userId
    next()
  } catch {
    response.status(500).json({ error: 'Failed to authenticate profile request' })
  }
})

profileRouter.get('/', async (_request, response) => {
  try {
    const user = await User.findById(response.locals.userId).select('visibility')
    if (!user) {
      response.status(401).json({ error: 'Not authenticated' })
      return
    }
    response.json({ visibility: user.visibility ?? 'visible' })
  } catch {
    response.status(500).json({ error: 'Failed to load profile' })
  }
})

profileRouter.patch('/', async (request, response) => {
  const { visibility } = request.body ?? {}
  if (visibility !== 'visible' && visibility !== 'anonymous') {
    response.status(400).json({ error: 'visibility must be visible or anonymous' })
    return
  }
  try {
    const user = await User.findOneAndUpdate(
      { _id: response.locals.userId },
      { $set: { visibility } },
      { returnDocument: 'after', runValidators: true },
    ).select('visibility')
    if (!user) {
      response.status(401).json({ error: 'Not authenticated' })
      return
    }
    response.json({ visibility: user.visibility })
  } catch {
    response.status(500).json({ error: 'Failed to update profile' })
  }
})
