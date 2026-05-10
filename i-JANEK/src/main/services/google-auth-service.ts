import fs from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { app, shell } from 'electron'
import { google } from 'googleapis'
import { CodeChallengeMethod } from 'google-auth-library'
import type { GoogleOAuthTokens } from '@shared/contracts'

const GOOGLE_DESKTOP_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.file'
]

const AUTH_TIMEOUT_MS = 3 * 60 * 1000
const GOOGLE_DESKTOP_CREDENTIALS_LOCAL_FILE = 'resources/google-oauth-desktop.local.json'
const GOOGLE_DESKTOP_CREDENTIALS_FILENAME = 'google-oauth-desktop.local.json'

function getEnvValue(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }

  return ''
}

function getResourceCandidates() {
  const candidates = [
    getEnvValue('GOOGLE_DESKTOP_CREDENTIALS_PATH'),
    path.join(app.getPath('userData'), GOOGLE_DESKTOP_CREDENTIALS_FILENAME),
    path.join(app.getPath('appData'), 'i-janek', GOOGLE_DESKTOP_CREDENTIALS_FILENAME),
    path.join(app.getPath('appData'), 'i-JANEK', GOOGLE_DESKTOP_CREDENTIALS_FILENAME)
  ]

  if (!app.isPackaged) {
    candidates.push(path.resolve(app.getAppPath(), GOOGLE_DESKTOP_CREDENTIALS_LOCAL_FILE))
    candidates.push(path.resolve(process.cwd(), GOOGLE_DESKTOP_CREDENTIALS_LOCAL_FILE))
  }

  return [...new Set(candidates.filter(Boolean))]
}

function describeSearchedPaths() {
  return getResourceCandidates()
    .map((candidate) => `- ${candidate}`)
    .join('\n')
}

function extractCredentials(source: unknown) {
  if (!source || typeof source !== 'object') {
    return null
  }

  const container = source as Record<string, unknown>
  const payload =
    (container.installed && typeof container.installed === 'object' ? (container.installed as Record<string, unknown>) : null) ??
    (container.web && typeof container.web === 'object' ? (container.web as Record<string, unknown>) : null) ??
    container

  const clientId = typeof payload.client_id === 'string' ? payload.client_id.trim() : ''
  const clientSecret = typeof payload.client_secret === 'string' ? payload.client_secret.trim() : ''
  const redirectUris = Array.isArray(payload.redirect_uris)
    ? payload.redirect_uris.filter((uri): uri is string => typeof uri === 'string' && uri.trim().length > 0)
    : []

  if (!clientId || !clientSecret) {
    return null
  }

  const redirectHost = (() => {
    const explicitHost = getEnvValue('GOOGLE_DESKTOP_REDIRECT_HOST')
    if (explicitHost) return explicitHost

    for (const redirectUri of redirectUris) {
      try {
        const parsed = new URL(redirectUri)
        if (parsed.hostname) return parsed.hostname
      } catch {
        continue
      }
    }

    return 'localhost'
  })()

  return { clientId, clientSecret, redirectHost }
}

function readGoogleDesktopAuthConfigFromFile(credentialsPath: string) {
  const raw = fs.readFileSync(credentialsPath, 'utf8')
  const parsed = JSON.parse(raw)
  const credentials = extractCredentials(parsed)

  if (!credentials) {
    throw new Error(
      `Plik Google OAuth ma nieprawidłowy format: ${credentialsPath}. Oczekiwano obiektu z sekcją "installed" lub "web".`
    )
  }

  return credentials
}

function getGoogleDesktopAuthConfig() {
  const explicitCredentialsPath = getEnvValue('GOOGLE_DESKTOP_CREDENTIALS_PATH')
  if (explicitCredentialsPath) {
    const resolvedCredentialsPath = path.resolve(explicitCredentialsPath)
    if (!fs.existsSync(resolvedCredentialsPath)) {
      throw new Error(
        `Nie znaleziono pliku Google OAuth pod GOOGLE_DESKTOP_CREDENTIALS_PATH=${resolvedCredentialsPath}.`
      )
    }

    return readGoogleDesktopAuthConfigFromFile(resolvedCredentialsPath)
  }

  for (const candidate of getResourceCandidates()) {
    if (!fs.existsSync(candidate)) continue
    return readGoogleDesktopAuthConfigFromFile(candidate)
  }

  const clientId = getEnvValue('GOOGLE_DESKTOP_CLIENT_ID')
  const clientSecret = getEnvValue('GOOGLE_DESKTOP_CLIENT_SECRET')
  const redirectHost = getEnvValue('GOOGLE_DESKTOP_REDIRECT_HOST') || 'localhost'

  if (!clientId || !clientSecret) {
    throw new Error(
      [
        'Brakuje konfiguracji desktopowego Google OAuth.',
        `Instalator powinien skopiować plik do ${path.join(app.getPath('userData'), GOOGLE_DESKTOP_CREDENTIALS_FILENAME)}.`,
        'Aplikacja sprawdza kolejno te lokalizacje:',
        describeSearchedPaths()
      ].join('\n')
    )
  }

  return { clientId, clientSecret, redirectHost }
}

function renderAuthPage(title: string, message: string) {
  return `<!doctype html>
<html lang="pl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: dark;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: radial-gradient(circle at top, #16233b 0%, #070b14 62%);
        color: #f5f7fb;
        font-family: Inter, system-ui, sans-serif;
      }

      main {
        width: min(92vw, 560px);
        padding: 32px;
        border-radius: 24px;
        background: rgba(12, 18, 31, 0.86);
        border: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.36);
      }

      h1 {
        margin: 0 0 12px;
        font-size: 1.75rem;
      }

      p {
        margin: 0;
        line-height: 1.6;
        color: #d8e1f0;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p>${message}</p>
    </main>
  </body>
</html>`
}

export async function signInWithGoogleDesktop(): Promise<GoogleOAuthTokens> {
  const { clientId, clientSecret, redirectHost } = getGoogleDesktopAuthConfig()

  return new Promise<GoogleOAuthTokens>((resolve, reject) => {
    let settled = false

    const server = createServer((request, response) => {
      const finish = (error?: Error, payload?: GoogleOAuthTokens) => {
        if (settled) return
        settled = true
        clearTimeout(timeoutId)
        server.close()
        if (error) {
          reject(error)
          return
        }
        resolve(payload!)
      }

      const requestUrl = new URL(request.url || '/', `http://${redirectHost}`)

      if (requestUrl.pathname === '/favicon.ico') {
        response.writeHead(204)
        response.end()
        return
      }

      const state = requestUrl.searchParams.get('state')
      const code = requestUrl.searchParams.get('code')
      const providerError = requestUrl.searchParams.get('error')
      const providerErrorDescription = requestUrl.searchParams.get('error_description')

      if (providerError) {
        response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        response.end(renderAuthPage('Logowanie anulowane', 'Google przerwał logowanie. Wróć do aplikacji i spróbuj ponownie.'))
        finish(new Error(providerErrorDescription || `Google OAuth error: ${providerError}`))
        return
      }

      if (!state || state !== expectedState || !code) {
        response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        response.end(renderAuthPage('Nieprawidłowy callback', 'Odpowiedź logowania była niekompletna. Zamknij kartę i spróbuj ponownie.'))
        finish(new Error('Google OAuth callback is missing required parameters.'))
        return
      }

      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      response.end(renderAuthPage('Logowanie zakończone', 'Możesz zamknąć tę kartę i wrócić do aplikacji i-JANEK.'))

      void (async () => {
        try {
          const tokenResponse = await oauthClient.getToken({
            code,
            codeVerifier,
            redirect_uri: redirectUri
          })
          const { id_token: idToken, access_token: accessToken, refresh_token: refreshToken, expiry_date: expiryDate } = tokenResponse.tokens

          if (!idToken || !accessToken) {
            throw new Error('Google OAuth did not return the required ID token or access token.')
          }

          finish(undefined, {
            idToken,
            accessToken,
            refreshToken: refreshToken ?? null,
            expiresAt: expiryDate ?? null
          })
        } catch (error) {
          finish(error instanceof Error ? error : new Error('Nie udało się wymienić kodu OAuth na tokeny Google.'))
        }
      })()
    })

    const timeoutId = setTimeout(() => {
      if (settled) return
      settled = true
      server.close()
      reject(new Error('Przekroczono czas oczekiwania na logowanie Google.'))
    }, AUTH_TIMEOUT_MS)

    const expectedState = randomUUID()
    let redirectUri = ''
    let codeVerifier = ''
    let oauthClient: InstanceType<typeof google.auth.OAuth2>

    server.listen(0, redirectHost, () => {
      void (async () => {
        try {
          const address = server.address() as AddressInfo | null
          if (!address?.port) {
            throw new Error('Nie udało się uruchomić lokalnego callbacku OAuth.')
          }

          redirectUri = `http://${redirectHost}:${address.port}`
          oauthClient = new google.auth.OAuth2(clientId, clientSecret, redirectUri)

          const verifier = await oauthClient.generateCodeVerifierAsync()
          codeVerifier = verifier.codeVerifier

          const authUrl = oauthClient.generateAuthUrl({
            access_type: 'offline',
            scope: GOOGLE_DESKTOP_SCOPES,
            include_granted_scopes: true,
            prompt: 'consent select_account',
            state: expectedState,
            code_challenge_method: CodeChallengeMethod.S256,
            code_challenge: verifier.codeChallenge
          })

          await shell.openExternal(authUrl)
        } catch (error) {
          if (settled) return
          settled = true
          clearTimeout(timeoutId)
          server.close()
          reject(error instanceof Error ? error : new Error('Nie udało się rozpocząć logowania Google.'))
        }
      })()
    })

    server.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      reject(error)
    })
  })
}
