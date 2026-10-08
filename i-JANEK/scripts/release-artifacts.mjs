import { createHash, createPublicKey, verify } from 'node:crypto'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

async function sha512(filePath) {
  const hash = createHash('sha512')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return hash.digest('base64')
}

export async function validateReleaseArtifacts(appRoot, version, channel) {
  const channelFile = channel === 'stable' ? 'latest' : channel
  const installer = `i-JANEK-Setup-${version}.exe`
  const dmg = `i-JANEK-${version}-arm64.dmg`
  const zip = `i-JANEK-${version}-arm64.zip`
  const dist = resolve(appRoot, 'dist')
  const artifacts = [installer, `${installer}.blockmap`, dmg, `${dmg}.blockmap`, zip, `${zip}.blockmap`,
    `${channelFile}.yml`, `${channelFile}-mac.yml`, 'update-windows.json', 'update-windows.sig']
    .map((name) => resolve(dist, name))
  const missing = artifacts.filter((path) => !existsSync(path) || !statSync(path).isFile() || statSync(path).size === 0)
  if (missing.length) throw new Error(`Brakuje gotowych plików wydania:\n${missing.join('\n')}`)

  // Czytamy wyłącznie format metadanych generowany przez electron-builder.
  const scalar = (value) => value?.trim().replace(/^(['"])(.*)\1$/u, '$2')
  const digests = new Map()
  for (const name of [installer, dmg, zip]) digests.set(name, await sha512(resolve(dist, name)))
  for (const [file, expectedNames] of [[`${channelFile}.yml`, [installer]], [`${channelFile}-mac.yml`, [zip, dmg]]]) {
    const metadata = readFileSync(resolve(dist, file), 'utf8').replace(/\r\n/gu, '\n')
    if (scalar(/^version:\s*(.+)$/mu.exec(metadata)?.[1]) !== version) {
      throw new Error(`${file}: wersja metadanych nie odpowiada ${version}. Zbuduj paczki ponownie.`)
    }
    const entries = [...metadata.matchAll(/^\s+- url:\s*(.+)\n\s+sha512:\s*(.+)\n\s+size:\s*(\d+)\s*$/gmu)]
    if (entries.length !== expectedNames.length) throw new Error(`${file}: nieprawidłowa lista paczek.`)
    const names = entries.map((entry) => scalar(entry[1]))
    if (new Set(names).size !== expectedNames.length || expectedNames.some((name) => !names.includes(name))) {
      throw new Error(`${file}: nazwy paczek nie odpowiadają wersji wydania.`)
    }
    for (const entry of entries) {
      const name = scalar(entry[1])
      if (scalar(entry[2]) !== digests.get(name) || Number(entry[3]) !== statSync(resolve(dist, name)).size) {
        throw new Error(`${file}: suma kontrolna lub rozmiar ${name} nie pasuje do paczki.`)
      }
    }
    const primary = scalar(/^path:\s*(.+)$/mu.exec(metadata)?.[1])
    if (!expectedNames.includes(primary) || scalar(/^sha512:\s*(.+)$/mu.exec(metadata)?.[1]) !== digests.get(primary)) {
      throw new Error(`${file}: główna paczka nie odpowiada metadanym.`)
    }
  }

  const bytes = readFileSync(resolve(dist, 'update-windows.json'))
  const manifest = JSON.parse(bytes.toString('utf8'))
  if (manifest.schema !== 1 || manifest.version !== version || manifest.channel !== channelFile ||
      manifest.asset !== installer || manifest.sha512 !== digests.get(installer)) {
    throw new Error('Manifest Windows nie odpowiada wersji, kanałowi lub gotowej paczce.')
  }
  const publicKey = createPublicKey({
    key: JSON.parse(readFileSync(resolve(appRoot, 'resources/scripts/update-signing-public.json'), 'utf8')),
    format: 'jwk'
  })
  const signature = Buffer.from(readFileSync(resolve(dist, 'update-windows.sig'), 'utf8').trim(), 'base64')
  if (!verify('sha256', bytes, publicKey, signature)) throw new Error('Nieprawidłowy podpis manifestu Windows.')
  return artifacts
}
