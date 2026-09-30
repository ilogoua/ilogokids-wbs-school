import { Schema, model } from 'mongoose'

const invitationSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },

    parentNodeId: {
      type: Schema.Types.ObjectId,
      ref: 'GraphNode',
      required: true,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    usedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
  },
)

export const Invitation = model('Invitation', invitationSchema)