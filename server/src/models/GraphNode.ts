import { Schema, model } from 'mongoose'

const graphNodeSchema = new Schema(
  {
    parentNodeId: {
      type: Schema.Types.ObjectId,
      ref: 'GraphNode',
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

export const GraphNode = model('GraphNode', graphNodeSchema)
