import 'dotenv/config'
import express from 'express'
import cors from 'cors'

const app = express()
const port = Number(process.env.PORT) || 3000

app.use(cors())
app.use(express.json())

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, project: 'iLogoKids' })
})

app.listen(port, () => {
  console.log(`iLogoKids server listening on http://localhost:${port}`)
})
