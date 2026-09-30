import { Schema, model } from 'mongoose'

const userGraphLinkSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  graphNodeId: {
    type: Schema.Types.ObjectId,
    ref: 'GraphNode',
    required: true,
    unique: true,
  },
})

export const UserGraphLink = model('UserGraphLink', userGraphLinkSchema)
