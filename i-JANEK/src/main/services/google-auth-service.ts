import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import { shell } from 'electron'
import { google } from 'googleapis'
import type { GoogleOAuthTokens } from '@shared/contracts'

const GOOGLE_DESKTOP_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.file'
]

const AUTH_TIMEOUT_MS = 3 * 60 * 1000

function getEnvValue(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }

  return ''
}

function getGoogleDesktopAuthConfig() {
  const clientId = getEnvValue('GOOGLE_DESKTOP_CLIENT_ID')
  const clientSecret = getEnvValue('GOOGLE_DESKTOP_CLIENT_SECRET')
  const redirectHost = getEnvValue('GOOGLE_DESKTOP_REDIRECT_HOST') || 'localhost'

  if (!clientId || !clientSecret) {
    throw new Error(
      'Brakuje konfiguracji desktopowego Google OAuth. Ustaw GOOGLE_DESKTOP_CLIENT_ID oraz GOOGLE_DESKTOP_CLIENT_SECRET w pliku .env.'
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
            code_challenge_method: 'S256',
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
