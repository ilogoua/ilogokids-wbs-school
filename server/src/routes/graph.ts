import { Router } from 'express'
import { buildGraphResponse } from '../lib/graph'
import { GraphNode } from '../models/GraphNode'
import { UserGraphLink } from '../models/UserGraphLink'
import { User } from '../models/User'
import { Session } from '../models/Session'
import { sessionHash } from './auth'

export const graphRouter = Router()

graphRouter.get('/', async (request, response) => {
  response.setHeader('Cache-Control', 'no-store')
  try {
    const tokenHash = sessionHash(request)
    const session = tokenHash ? await Session.findOne({ tokenHash, expiresAt: { $gt: new Date() } }) : null
    if (!session || !await User.exists({ _id: session.userId })) {
      response.status(401).json({ error: 'Not authenticated' })
      return
    }

    const nodes = await GraphNode.find().select('_id parentNodeId').sort({ _id: 1 }).lean()
    const links = await UserGraphLink.find({ graphNodeId: { $in: nodes.map((node) => node._id) } })
      .select('userId graphNodeId').lean()
    const users = await User.find({ _id: { $in: links.map((link) => link.userId) } }).select('publicName visibility').lean()

    response.json(buildGraphResponse(
      nodes.map((node) => ({ id: String(node._id), parentNodeId: node.parentNodeId ? String(node.parentNodeId) : null })),
      links.map((link) => ({ userId: String(link.userId), graphNodeId: String(link.graphNodeId) })),
      users.map((user) => ({ id: String(user._id), publicName: user.publicName, visibility: user.visibility })),
      String(session.userId),
    ))
  } catch {
    response.status(500).json({ error: 'Failed to load graph' })
  }
})
