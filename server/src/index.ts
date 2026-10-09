import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { connectDB } from './db'
import { invitationsRouter } from './routes/invitations'
import { registrationRouter } from './routes/registration'
import { authRouter } from './routes/auth'
import { graphRouter } from './routes/graph'
import { profileRouter } from './routes/profile'
import { papersRouter } from './routes/papers'

const app = express()
const port = Number(process.env.PORT) || 3000

app.use(cors())
app.use(express.json())
app.use('/api', authRouter)
app.use('/api/graph', graphRouter)
app.use('/api/profile', profileRouter)
app.use('/api/papers', papersRouter)
app.use('/api/invitations', invitationsRouter)
app.use('/api/register', registrationRouter)

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, project: 'iLogoKids' })
})

if (process.env.NODE_ENV === 'production') {
  const clientDist = path.resolve(__dirname, '../../client/dist')
  const frontend = express.Router()
  frontend.use(express.static(clientDist))
  frontend.get('/{*path}', (_request, response) => {
    response.sendFile(path.join(clientDist, 'index.html'))
  })

  app.use((request, response, next) => {
    // Keep API requests out of both static serving and the SPA fallback.
    if (/^\/api(?:\/|$)/i.test(request.path)) {
      next()
      return
    }
    frontend(request, response, next)
  })
}

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
