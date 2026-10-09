import { Schema, model } from 'mongoose'

const paperSchema = new Schema(
  {
    // Client-generated paper ID; a repeated pocket callback reuses it.
    clientId: { type: String, required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recipientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, maxlength: 2000 },
    // Deleting hides a paper only in that participant's own history.
    hiddenFor: { type: [Schema.Types.ObjectId], default: [] },
    sentAt: { type: Date, required: true, default: Date.now },
  },
)

paperSchema.index({ senderId: 1, clientId: 1 }, { unique: true })
paperSchema.index({ recipientId: 1 })

export const Paper = model('Paper', paperSchema)
