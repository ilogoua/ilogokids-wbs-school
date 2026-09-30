import { createHash, randomBytes } from 'node:crypto'
import { Router } from 'express'
import { isObjectIdOrHexString } from 'mongoose'
import { GraphNode } from '../models/GraphNode'
import { Invitation } from '../models/Invitation'

export const invitationsRouter = Router()

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000

invitationsRouter.post('/', async (request, response) => {
  const { email, parentNodeId } = request.body ?? {}

  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    response.status(400).json({ error: 'A valid email is required' })
    return
  }

  if (typeof parentNodeId !== 'string' || !isObjectIdOrHexString(parentNodeId)) {
    response.status(400).json({ error: 'A valid parentNodeId is required' })
    return
  }

  try {
    const parentNode = await GraphNode.exists({ _id: parentNodeId })

    if (!parentNode) {
      response.status(404).json({ error: 'Parent GraphNode not found' })
      return
    }

    const token = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(token).digest('hex')
    const expiresAt = new Date(Date.now() + INVITATION_LIFETIME_MS)

    await Invitation.create({
      email: email.trim().toLowerCase(),
      tokenHash,
      parentNodeId,
      expiresAt,
    })

    response.status(201).json({ token, expiresAt })
  } catch {
    response.status(500).json({ error: 'Failed to create invitation' })
  }
})
