import { createHash, randomBytes } from 'node:crypto'
import { Router } from 'express'
import { GraphNode } from '../models/GraphNode'
import { Invitation } from '../models/Invitation'
import { Session } from '../models/Session'
import { User } from '../models/User'
import { UserGraphLink } from '../models/UserGraphLink'
import { sessionHash } from './auth'

export const invitationsRouter = Router()

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000

invitationsRouter.post('/', async (request, response) => {
  response.setHeader('Cache-Control', 'no-store')
  try {
    const tokenHash = sessionHash(request)
    const session = tokenHash ? await Session.findOne({ tokenHash, expiresAt: { $gt: new Date() } }) : null
    if (!session || !await User.exists({ _id: session.userId })) {
      response.status(401).json({ error: 'Not authenticated' })
      return
    }

    const origin = request.get('origin')
    let foreignOrigin = false
    if (origin) {
      try { foreignOrigin = new URL(origin).host !== request.get('host') }
      catch { foreignOrigin = true }
    }
    if (foreignOrigin || request.get('sec-fetch-site') === 'cross-site') {
      response.status(403).json({ error: 'Cross-site invitation requests are not allowed' })
      return
    }

    const { email } = request.body ?? {}
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      response.status(400).json({ error: 'A valid email is required' })
      return
    }

    const link = await UserGraphLink.findOne({ userId: session.userId })
    if (!link) {
      response.status(409).json({ error: 'Your graph branch is unavailable' })
      return
    }
    const parentNodeId = link.graphNodeId
    const parentNode = await GraphNode.exists({ _id: parentNodeId })

    if (!parentNode) {
      response.status(409).json({ error: 'Your graph branch is unavailable' })
      return
    }

    const token = randomBytes(32).toString('hex')
    const invitationTokenHash = createHash('sha256').update(token).digest('hex')
    const expiresAt = new Date(Date.now() + INVITATION_LIFETIME_MS)

    await Invitation.create({
      email: email.trim().toLowerCase(),
      tokenHash: invitationTokenHash,
      parentNodeId,
      expiresAt,
    })

    response.status(201).json({ token, expiresAt })
  } catch {
    response.status(500).json({ error: 'Failed to create invitation' })
  }
})
