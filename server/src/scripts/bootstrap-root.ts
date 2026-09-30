import 'dotenv/config'
import mongoose from 'mongoose'
import { bootstrapRoot, validateRootInput } from '../lib/bootstrapRoot'

async function main() {
  if (process.stdin.isTTY) throw new Error('Provide a private JSON file via stdin: npm run bootstrap:root < /path/root-user.json')
  let json = ''
  for await (const chunk of process.stdin) {
    json += chunk.toString()
    if (Buffer.byteLength(json) > 16384) throw new Error('Input exceeds 16 KiB')
  }
  let input: unknown
  try { input = JSON.parse(json) }
  catch { throw new Error('Input must be valid JSON') }
  validateRootInput(input)
  if (!process.env.MONGO_URL) throw new Error('MONGO_URL is missing')

  await mongoose.connect(process.env.MONGO_URL, {
    dbName: 'ilogokids',
    serverSelectionTimeoutMS: 8000,
    // Bootstrap writes documents only; existing production indexes are untouched.
    autoIndex: false,
    autoCreate: false,
  })
  const result = await bootstrapRoot(input)
  console.log(JSON.stringify(result))
}

main().catch((error: unknown) => {
  // Do not print connection URLs, input values or database error details.
  const message = error instanceof Error && !('code' in error) &&
    /^(Expected|Invalid loginName|publicName|A valid email|Password|Bootstrap refused|Provide|Input|MONGO_URL)/.test(error.message)
    ? error.message : 'Bootstrap failed; no partial account was created'
  console.error(message)
  process.exitCode = 1
}).finally(() => mongoose.disconnect())
