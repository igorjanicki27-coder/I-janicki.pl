import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function stripWrappingQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('`') && value.endsWith('`'))
  ) {
    return value.slice(1, -1)
  }

  return value
}

function parseEnvFile(contents: string) {
  const entries: Array<[string, string]> = []

  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const normalizedLine = line.startsWith('export ') ? line.slice(7).trim() : line
    const separatorIndex = normalizedLine.indexOf('=')
    if (separatorIndex <= 0) continue

    const key = normalizedLine.slice(0, separatorIndex).trim()
    const value = stripWrappingQuotes(normalizedLine.slice(separatorIndex + 1).trim())
    if (!key) continue

    entries.push([key, value])
  }

  return entries
}

function findProjectEnvFiles() {
  const currentDir = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.resolve(currentDir, '../../.env'),
    path.resolve(process.cwd(), '.env')
  ]

  const uniqueCandidates = [...new Set(candidates)]
  return uniqueCandidates.filter((candidate) => fs.existsSync(candidate))
}

function loadMainProcessEnv() {
  for (const envFile of findProjectEnvFiles()) {
    const parsedEntries = parseEnvFile(fs.readFileSync(envFile, 'utf8'))
    for (const [key, value] of parsedEntries) {
      if (process.env[key] == null || process.env[key] === '') {
        process.env[key] = value
      }
    }
  }
}

loadMainProcessEnv()
