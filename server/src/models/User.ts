import { Schema, model } from 'mongoose'

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    passwordHash: {
      type: String,
      required: true,
    },

    publicName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },

    role: {
      type: String,
      enum: ['direx', 'user'],
      default: 'user',
      required: true,
    },
  },
  {
    timestamps: true,
  },
)

export const User = model('User', userSchema)
