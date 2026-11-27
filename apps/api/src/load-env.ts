import { existsSync } from 'node:fs'
import path from 'node:path'
import { loadEnvFile } from 'node:process'

const envPath = path.resolve(__dirname, '../../../.env')

if (existsSync(envPath)) {
  loadEnvFile(envPath)
}
