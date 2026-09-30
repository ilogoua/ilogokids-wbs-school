import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { connectDB } from './db'

const app = express()
const port = Number(process.env.PORT) || 3000

app.use(cors())
app.use(express.json())

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, project: 'iLogoKids' })
})

async function startServer() {
  try {
    await connectDB()

    app.listen(port, () => {
      console.log(`iLogoKids server listening on http://localhost:${port}`)
    })
  } catch (error) {
    console.error('Failed to start server')
    console.error(error)
    process.exit(1)
  }
}

void startServer()
