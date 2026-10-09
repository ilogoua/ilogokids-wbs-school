import { Router } from 'express'
import { isObjectIdOrHexString } from 'mongoose'
import { Paper } from '../models/Paper'
import { Session } from '../models/Session'
import { User } from '../models/User'
import { UserGraphLink } from '../models/UserGraphLink'
import { sessionHash } from './auth'

export const papersRouter = Router()

const MAX_TEXT_LENGTH = 2000

type StoredPaper = { _id: unknown; senderId: unknown; recipientId: unknown; text: string; sentAt: Date }

papersRouter.use(async (request, response, next) => {
  response.setHeader('Cache-Control', 'no-store')
  try {
    const tokenHash = sessionHash(request)
    const session = tokenHash ? await Session.findOne({ tokenHash, expiresAt: { $gt: new Date() } }) : null
    if (!session || !await User.exists({ _id: session.userId })) {
      response.status(401).json({ error: 'Not authenticated' })
      return
    }
    if (request.method !== 'GET') {
      const origin = request.get('origin')
      let foreignOrigin = false
      if (origin) {
        try { foreignOrigin = new URL(origin).host !== request.get('host') }
        catch { foreignOrigin = true }
      }
      if (foreignOrigin || request.get('sec-fetch-site') === 'cross-site') {
        response.status(403).json({ error: 'Cross-site paper requests are not allowed' })
        return
      }
    }
    response.locals.userId = String(session.userId)
    next()
  } catch {
    response.status(500).json({ error: 'Failed to authenticate paper request' })
  }
})

// Contacts are keyed by graph node, as on the Schulhof; names are public names.
async function present(papers: StoredPaper[], userId: string) {
  const counterpart = (paper: StoredPaper) => String(String(paper.senderId) === userId ? paper.recipientId : paper.senderId)
  const ids = [...new Set(papers.map(counterpart))]
  const [users, links] = await Promise.all([
    User.find({ _id: { $in: ids } }).select('publicName').lean(),
    UserGraphLink.find({ userId: { $in: ids } }).select('userId graphNodeId').lean(),
  ])
  const names = new Map(users.map((user) => [String(user._id), user.publicName]))
  const nodes = new Map(links.map((link) => [String(link.userId), String(link.graphNodeId)]))
  return papers.map((paper) => {
    const other = counterpart(paper)
    return {
      id: String(paper._id),
      direction: String(paper.senderId) === userId ? 'sent' : 'received',
      contactNodeId: nodes.get(other) ?? other,
      contactName: names.get(other) ?? '',
      text: paper.text,
      sentAt: paper.sentAt.toISOString(),
    }
  })
}

papersRouter.get('/', async (_request, response) => {
  const userId = response.locals.userId as string
  try {
    const papers = await Paper.find({ $or: [{ senderId: userId }, { recipientId: userId }], hiddenFor: { $ne: userId } })
      .select('senderId recipientId text sentAt').sort({ sentAt: 1 }).limit(500).lean()
    response.json({ papers: await present(papers, userId) })
  } catch {
    response.status(500).json({ error: 'Failed to load papers' })
  }
})

papersRouter.post('/', async (request, response) => {
  const userId = response.locals.userId as string
  const { clientId, recipientNodeId, text } = request.body ?? {}
  if (typeof clientId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(clientId) ||
      typeof recipientNodeId !== 'string' || !isObjectIdOrHexString(recipientNodeId) ||
      typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT_LENGTH) {
    response.status(400).json({ error: 'clientId, recipientNodeId and text (1-2000 characters) are required' })
    return
  }
  try {
    // The sender always comes from the session; the pocket names a graph node.
    const link = await UserGraphLink.findOne({ graphNodeId: recipientNodeId }).select('userId').lean()
    if (!link || !await User.exists({ _id: link.userId })) {
      response.status(404).json({ error: 'Recipient not found' })
      return
    }
    if (String(link.userId) === userId) {
      response.status(400).json({ error: 'Cannot send a paper to yourself' })
      return
    }
    let paper
    try {
      paper = (await Paper.create({ clientId, senderId: userId, recipientId: link.userId, text })).toObject()
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error
      paper = await Paper.findOne({ senderId: userId, clientId }).lean()
      if (!paper) throw error
    }
    response.status(201).json({ paper: (await present([paper], userId))[0] })
  } catch {
    response.status(500).json({ error: 'Failed to send paper' })
  }
})

papersRouter.delete('/:id', async (request, response) => {
  const userId = response.locals.userId as string
  const { id } = request.params
  if (!isObjectIdOrHexString(id)) {
    response.status(404).json({ error: 'Paper not found' })
    return
  }
  try {
    const result = await Paper.updateOne(
      { _id: id, $or: [{ senderId: userId }, { recipientId: userId }] },
      { $addToSet: { hiddenFor: userId } },
    )
    if (!result.matchedCount) {
      response.status(404).json({ error: 'Paper not found' })
      return
    }
    response.status(204).end()
  } catch {
    response.status(500).json({ error: 'Failed to delete paper' })
  }
})
