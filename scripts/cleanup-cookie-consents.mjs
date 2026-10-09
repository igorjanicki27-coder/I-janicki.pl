import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { expiresAfter12Months } = require('../cookie-consent.js');
const DATABASE_URL = 'https://i-janicki-default-rtdb.europe-west1.firebasedatabase.app';

export function isExpired(record, now) {
  if (!record || typeof record !== 'object') return false;
  const expiresAt = expiresAfter12Months(record.updated_at || record.created_at);
  return expiresAt !== null && Date.parse(expiresAt) <= now;
}

export function evidenceExpiresAt(record) {
  if (!record || typeof record !== 'object') return null;
  let date = expiresAfter12Months(record.updated_at || record.created_at);
  for (let year = 0; year < 3 && date; year++) date = expiresAfter12Months(date);
  return date;
}

const EVIDENCE_FIELDS = new Set([
  'consent_id', 'anonymous_user_id', 'created_at', 'updated_at', 'expires_at',
  'policy_version', 'essential', 'analytics', 'marketing', 'external_media', 'action',
]);

function limitedEvidence(record) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => EVIDENCE_FIELDS.has(key)));
}

const STATS_FIELDS = new Set(['type', 'path', 'timestamp', 'durationSeconds', 'channel', 'retentionUntil', 'retentionReason']);
const FIRESTORE_ROOT = 'https://firestore.googleapis.com/v1/projects/i-janicki/databases/(default)/documents/analytics_events';

export async function minimizeStatsData({ accessToken, fetchImpl = fetch, dryRun = false }) {
  if (!accessToken) throw new Error('Firebase access token is required.');
  const summary = { minimized: 0, changed: 0, candidates: 0 };
  let pageToken;
  do {
    const url = new URL(FIRESTORE_ROOT);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetchImpl(url.href, {
      headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Stats minimization failed (HTTP ${response.status}).`);
    const page = await response.json();
    for (const document of page.documents || []) {
      const fields = document.fields || {};
      const extras = Object.keys(fields).filter(key => !STATS_FIELDS.has(key));
      if (!extras.length) continue;
      summary.candidates++;
      if (dryRun) continue;
      const expected = 'projects/i-janicki/databases/(default)/documents/analytics_events/';
      if (!document.name?.startsWith(expected) || document.name.slice(expected.length).includes('/') || !document.updateTime) {
        throw new Error('Unexpected analytics document; minimization stopped safely.');
      }
      const target = new URL(`https://firestore.googleapis.com/v1/${document.name}`);
      const preserved = Object.fromEntries(Object.entries(fields).filter(([key]) => STATS_FIELDS.has(key)));
      // Preserve /stats' fallback for legacy events that stored page without path.
      if (!fields.path && fields.page?.stringValue) {
        preserved.path = { stringValue: fields.page.stringValue === 'home' ? '/' : fields.page.stringValue };
        target.searchParams.append('updateMask.fieldPaths', 'path');
      }
      for (const key of extras) {
        const fieldPath = `\`${key.replaceAll('\\', '\\\\').replaceAll('`', '\\`')}\``;
        target.searchParams.append('updateMask.fieldPaths', fieldPath);
      }
      target.searchParams.set('currentDocument.updateTime', document.updateTime);
      const updated = await fetchImpl(target.href, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: preserved }), signal: AbortSignal.timeout(30000),
      });
      if (updated.status === 409 || updated.status === 412) summary.changed++;
      else if (!updated.ok) throw new Error(`Stats minimization failed (HTTP ${updated.status}).`);
      else summary.minimized++;
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return summary;
}

export async function cleanupCookieConsents({ accessToken, now = Date.now(), fetchImpl = fetch, dryRun = false }) {
  if (!accessToken) throw new Error('Firebase access token is required.');
  const headers = { Authorization: `Bearer ${accessToken}` };
  async function request(path, options = {}) {
    const response = await fetchImpl(`${DATABASE_URL}/cookie_consents${path}.json`, {
      ...options,
      headers: { ...headers, ...options.headers },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok && response.status !== 412) {
      throw new Error(`Cookie consent cleanup failed (HTTP ${response.status}).`);
    }
    return response;
  }

  const snapshot = await (await request('')).json();
  const summary = { expired: 0, minimized: 0, deleted: 0, changed: 0, invalid: 0, dryRun };
  for (const [userId, records] of Object.entries(snapshot || {})) {
    for (const [consentId, record] of Object.entries(records || {})) {
      if (!evidenceExpiresAt(record)) {
        summary.invalid++;
        continue;
      }
      if (!isExpired(record, now)) continue;
      summary.expired++;
      if (dryRun) continue;
      const deleteEvidence = Date.parse(evidenceExpiresAt(record)) <= now;
      if (!deleteEvidence && Object.keys(record).every(key => EVIDENCE_FIELDS.has(key))) continue;
      const path = `/${encodeURIComponent(userId)}/${encodeURIComponent(consentId)}`;
      // Re-read before changing evidence; the ETag protects concurrent changes.
      const current = await request(path, { headers: { 'X-Firebase-ETag': 'true' } });
      const currentRecord = await current.json();
      if (!isExpired(currentRecord, now)) {
        summary.changed++;
        continue;
      }
      const etag = current.headers.get('etag');
      if (!etag) throw new Error('Firebase did not return an ETag; cleanup stopped safely.');
      const deadline = evidenceExpiresAt(currentRecord);
      if (!deadline) { summary.invalid++; continue; }
      const shouldDelete = Date.parse(deadline) <= now;
      const result = await request(path, {
        method: shouldDelete ? 'DELETE' : 'PUT',
        headers: { 'if-match': etag, 'Content-Type': 'application/json' },
        ...(shouldDelete ? {} : { body: JSON.stringify(limitedEvidence(currentRecord)) }),
      });
      if (result.status === 412) summary.changed++;
      else if (shouldDelete) summary.deleted++;
      else summary.minimized++;
    }
  }
  return summary;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--dry-run', '--delete'].includes(arg)) || (args.includes('--delete') && args.includes('--dry-run'))) {
    throw new Error('Use --dry-run (default) or --delete.');
  }
  const dryRun = !args.includes('--delete');
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) throw new Error('Missing GOOGLE_APPLICATION_CREDENTIALS.');
  const credentials = JSON.parse(await readFile(credentialsPath, 'utf8'));
  if (credentials.project_id !== 'i-janicki' || credentials.type !== 'service_account') {
    throw new Error('Cleanup requires an i-janicki service account.');
  }
  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/firebase.database', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/datastore'],
  });
  const accessToken = await auth.getAccessToken();
  const summary = await cleanupCookieConsents({ accessToken, dryRun });
  summary.stats = await minimizeStatsData({ accessToken, dryRun });
  // Do not log records, identifiers or access tokens.
  console.log(JSON.stringify(summary));
  if (summary.invalid) throw new Error('Consent records without a valid date require review.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error('Cookie consent cleanup failed. Check credentials, database access and record dates.');
    process.exitCode = 1;
  });
}
