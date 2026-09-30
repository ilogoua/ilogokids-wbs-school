import { Schema, model } from 'mongoose'

const userSchema = new Schema(
  {
    loginName: {
      type: String,
      required: true,
      unique: true,
      // Existing users without an assigned Nick do not collide in this index.
      sparse: true,
      lowercase: true,
      trim: true,
      match: /^[a-z][a-z0-9_-]{2,23}$/,
    },

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
