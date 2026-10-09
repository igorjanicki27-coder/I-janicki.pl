import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const RETENTION_DAYS = 90;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;
const DATABASE = 'projects/i-janicki/databases/(default)/documents';
const API = 'https://firestore.googleapis.com/v1/';
// Explicit allowlist: never sweep the entire database or application audit logs.
export const COLLECTIONS = ['stats_pin_attempts', 'stats_sessions'];

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return NaN;
  return Date.parse(value);
}

export function retentionState(document, collection, now) {
  if (!COLLECTIONS.includes(collection)) throw new Error('Collection is outside the retention scope.');
  const createdAt = timestamp(document.createTime);
  if (!Number.isFinite(createdAt) || createdAt > now) return 'invalid';
  // Security state has a server timestamp of the latest attempt/session;
  // adding an incident hold must not reset its retention clock.
  const updatedAt = timestamp(document.fields?.updatedAt?.timestampValue);
  if (document.fields?.updatedAt && !Number.isFinite(updatedAt)) return 'invalid';
  if (Number.isFinite(updatedAt) && updatedAt > now) return 'invalid';
  const recordedAt = Number.isFinite(updatedAt) ? Math.max(createdAt, updatedAt) : createdAt;
  if (recordedAt + RETENTION_MS > now) return 'current';

  const fields = document.fields || {};
  if (fields.retentionUntil || fields.retentionReason) {
    const until = timestamp(fields.retentionUntil?.timestampValue);
    const reason = fields.retentionReason?.stringValue;
    // Holds are admin-only, require a reason and a finite review deadline.
    if (!Number.isFinite(until) || typeof reason !== 'string' || !reason.trim()) return 'invalid';
    if (until > now) return 'held';
  }
  return 'expired';
}

export async function cleanupTechnicalData({ accessToken, now = Date.now(), fetchImpl = fetch, dryRun = true, pageSize = 200 }) {
  if (!accessToken) throw new Error('Firebase access token is required.');
  if (!Number.isFinite(now) || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new Error('Invalid cleanup parameters.');
  }
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
  const summary = { retentionDays: RETENTION_DAYS, dryRun, collections: {} };
  for (const collection of COLLECTIONS) {
    const counts = { scanned: 0, expired: 0, deleted: 0, changed: 0, held: 0, invalid: 0 };
    summary.collections[collection] = counts;
    let cursor;
    for (;;) {
      const structuredQuery = {
        from: [{ collectionId: collection, allDescendants: false }],
        // Do not retrieve PIN hashes, IPs or any other event contents.
        select: { fields: ['updatedAt', 'retentionUntil', 'retentionReason'].map(fieldPath => ({ fieldPath })) },
        orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
        limit: pageSize,
        ...(cursor ? { startAt: { values: [{ referenceValue: cursor }], before: false } } : {}),
      };
      const response = await fetchImpl(`${API}${DATABASE}:runQuery`, {
        method: 'POST', headers, body: JSON.stringify({ structuredQuery }), signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`Technical data query failed (HTTP ${response.status}).`);
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.some(row => row.error)) throw new Error('Invalid Firestore query response.');
      const documents = rows.filter(row => row.document).map(row => row.document);
      for (const document of documents) {
        const prefix = `${DATABASE}/${collection}/`;
        if (typeof document.name !== 'string' || !document.name.startsWith(prefix)
          || !document.name.slice(prefix.length) || document.name.slice(prefix.length).includes('/')
          || (cursor && document.name <= cursor)) {
          throw new Error('Unexpected document path or pagination order.');
        }
        cursor = document.name;
        counts.scanned++;
        const state = retentionState(document, collection, now);
        if (state === 'current') continue;
        counts[state]++;
        if (state !== 'expired' || dryRun) continue;
        if (!Number.isFinite(timestamp(document.updateTime))) throw new Error('Missing document version; deletion stopped.');
        // The precondition protects a concurrently renewed session or new hold.
        const url = new URL(`${API}${document.name.split('/').map(encodeURIComponent).join('/')}`);
        url.searchParams.set('currentDocument.updateTime', document.updateTime);
        const removed = await fetchImpl(url.toString(), { method: 'DELETE', headers, signal: AbortSignal.timeout(30000) });
        if (removed.ok) counts.deleted++;
        else {
          const error = await removed.json();
          if (['FAILED_PRECONDITION', 'NOT_FOUND'].includes(error?.error?.status)) counts.changed++;
          else throw new Error(`Technical data deletion failed (HTTP ${removed.status}).`);
        }
      }
      if (documents.length < pageSize) break;
    }
  }
  return summary;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--dry-run', '--delete'].includes(arg)) || (args.includes('--delete') && args.includes('--dry-run'))) {
    throw new Error('Use --dry-run (default) or --delete.');
  }
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) throw new Error('Missing GOOGLE_APPLICATION_CREDENTIALS.');
  const credentials = JSON.parse(await readFile(credentialsPath, 'utf8'));
  if (credentials.project_id !== 'i-janicki' || credentials.type !== 'service_account') {
    throw new Error('Cleanup requires an i-janicki service account.');
  }
  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/datastore'] });
  const summary = await cleanupTechnicalData({ accessToken: await auth.getAccessToken(), dryRun: !args.includes('--delete') });
  // Only counters; no personal data, identifiers, hold reasons or credentials.
  console.log(JSON.stringify(summary));
  if (Object.values(summary.collections).some(counts => counts.invalid)) {
    throw new Error('Some records have invalid dates or holds and require review.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error('Technical data cleanup failed. Check credentials, database access, dates and incident holds.');
    process.exitCode = 1;
  });
}
