import { createHash } from 'node:crypto'
import { Router } from 'express'
import mongoose from 'mongoose'
import { hashPassword } from '../lib/password'
import { GraphNode } from '../models/GraphNode'
import { Invitation } from '../models/Invitation'
import { User } from '../models/User'
import { UserGraphLink } from '../models/UserGraphLink'

export const registrationRouter = Router()

class RegistrationError extends Error {}

registrationRouter.post('/', async (request, response) => {
  const { token, password, publicName } = request.body ?? {}

  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
    response.status(400).json({ error: 'A valid invitation token is required' })
    return
  }

  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    response.status(400).json({ error: 'Password must contain 8 to 128 characters' })
    return
  }

  if (typeof publicName !== 'string' || !publicName.trim() || publicName.trim().length > 50) {
    response.status(400).json({ error: 'publicName must contain 1 to 50 characters' })
    return
  }

  const tokenHash = createHash('sha256').update(token).digest('hex')

  try {
    const invitation = await Invitation.exists({ tokenHash, usedAt: null, expiresAt: { $gt: new Date() } })

    if (!invitation) {
      response.status(400).json({ error: 'Invitation is invalid, expired, or already used' })
      return
    }

    const passwordHash = await hashPassword(password)

    const result = await mongoose.connection.transaction(async (session) => {
      // Claim inside the transaction so concurrent requests cannot consume the same invitation.
      const invitation = await Invitation.findOneAndUpdate(
        { tokenHash, usedAt: null, expiresAt: { $gt: new Date() } },
        { $set: { usedAt: new Date() } },
        { new: true, session },
      )

      if (!invitation) throw new RegistrationError('Invitation is invalid, expired, or already used')

      const parent = await GraphNode.exists({ _id: invitation.parentNodeId }).session(session)
      if (!parent) throw new RegistrationError('Parent GraphNode not found')

      const [user] = await User.create([{
        email: invitation.email,
        passwordHash,
        publicName: publicName.trim(),
      }], { session })

      const [graphNode] = await GraphNode.create([{ parentNodeId: invitation.parentNodeId }], { session })

      await UserGraphLink.create([{ userId: user._id, graphNodeId: graphNode._id }], { session })

      return { userId: user._id, graphNodeId: graphNode._id }
    })

    response.status(201).json(result)
  } catch (error) {
    if (error instanceof RegistrationError) {
      response.status(400).json({ error: error.message })
    } else if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) {
      response.status(409).json({ error: 'An account already exists for this invitation email' })
    } else {
      response.status(500).json({ error: 'Failed to register' })
    }
  }
})
