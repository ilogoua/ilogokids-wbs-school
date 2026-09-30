import mongoose from 'mongoose'
import { normalizeLoginName } from './loginName'
import { hashPassword } from './password'
import { User } from '../models/User'
import { GraphNode } from '../models/GraphNode'
import { UserGraphLink } from '../models/UserGraphLink'

// The built-in unique _id makes concurrent bootstrap transactions conflict.
export const BOOTSTRAP_ROOT_ID = new mongoose.Types.ObjectId('000000000000000000000001')

export function validateRootInput(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Expected a JSON object with loginName, publicName, email and password')
  }
  const { loginName: suppliedLoginName, publicName, email, password } = input as Record<string, unknown>
  const loginName = normalizeLoginName(suppliedLoginName)
  if (!loginName) throw new Error('Invalid loginName: use 3 to 24 letters, digits, underscores or hyphens, starting with a letter')
  if (typeof publicName !== 'string' || !publicName.trim() || publicName.trim().length > 50) {
    throw new Error('publicName must contain 1 to 50 characters')
  }
  if (typeof email !== 'string' || email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    throw new Error('A valid email is required')
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new Error('Password must contain 8 to 128 characters')
  }
  return { loginName, publicName: publicName.trim(), email: email.trim().toLowerCase(), password }
}

export async function bootstrapRoot(input: unknown) {
  const { password, ...profile } = validateRootInput(input)
  const passwordHash = await hashPassword(password)
  return mongoose.connection.transaction(async (session) => {
    if (await User.exists({}).session(session) ||
        await GraphNode.exists({}).session(session) ||
        await UserGraphLink.exists({}).session(session)) {
      throw new Error('Bootstrap refused: users, graph nodes or links already exist')
    }

    const [graphNode] = await GraphNode.create([{
      _id: BOOTSTRAP_ROOT_ID,
      parentNodeId: null,
    }], { session })
    const [user] = await User.create([{ ...profile, passwordHash, role: 'direx' }], { session })
    await UserGraphLink.create([{ userId: user._id, graphNodeId: graphNode._id }], { session })
    return { userId: user._id, graphNodeId: graphNode._id }
  })
}
