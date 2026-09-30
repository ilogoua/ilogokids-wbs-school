import mongoose from 'mongoose'

export async function connectDB() {
  const mongoUrl = process.env.MONGO_URL

  if (!mongoUrl) {
    throw new Error('MONGO_URL is missing')
  }

  await mongoose.connect(mongoUrl, {
    dbName: 'ilogokids',
    serverSelectionTimeoutMS: 8000,
  })

  console.log('Connected to MongoDB')
}
