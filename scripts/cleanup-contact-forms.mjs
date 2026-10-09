import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const { expiresAfter12Months } = createRequire(import.meta.url)('../cookie-consent.js');
const ROOT = 'projects/i-janicki/databases/(default)/documents';
const API = 'https://firestore.googleapis.com/v1/';
const COUNTER = `${ROOT}/contact_form_stats/total`;

function validDate(value, now) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)
    && Number.isFinite(Date.parse(value)) && Date.parse(value) <= now;
}

export function planContactRetention(document, now) {
  const datesField = document.fields?.consentAcceptedDates;
  if (datesField) {
    const values = datesField.arrayValue?.values;
    if (!Array.isArray(values) || !values.length || values.some(value => !validDate(value.timestampValue, now))) {
      return { invalid: true };
    }
    const remaining = values.filter(value => Date.parse(expiresAfter12Months(value.timestampValue)) > now);
    return { count: values.length, expired: values.length - remaining.length, remaining };
  }
  if (!validDate(document.createTime, now)) return { invalid: true };
  return { count: 1, expired: Date.parse(expiresAfter12Months(document.createTime)) <= now ? 1 : 0, remaining: [] };
}

export async function cleanupContactForms({ accessToken, now = Date.now(), fetchImpl = fetch, dryRun = true, pageSize = 200 }) {
  if (!accessToken || !Number.isFinite(now) || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new Error('Invalid contact retention parameters.');
  }
  const summary = { dryRun, scanned: 0, expired: 0, deleted: 0, trimmed: 0, changed: 0, invalid: 0 };
  const headers = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
  async function request(url, options = {}) {
    return fetchImpl(url, { ...options, headers, signal: AbortSignal.timeout(30000) });
  }
  async function* documents() {
    let cursor;
    for (;;) {
      const response = await request(`${API}${ROOT}:runQuery`, {
        method: 'POST', body: JSON.stringify({ structuredQuery: {
          from: [{ collectionId: 'contact_leads', allDescendants: false }],
          select: { fields: [{ fieldPath: 'consentAcceptedDates' }] },
          orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
          limit: pageSize,
          ...(cursor ? { startAt: { values: [{ referenceValue: cursor }], before: false } } : {}),
        } }),
      });
      if (!response.ok) throw new Error(`Contact query failed (HTTP ${response.status}).`);
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.some(row => row.error)) throw new Error('Invalid contact query response.');
      const page = rows.filter(row => row.document).map(row => row.document);
      for (const document of page) {
        const prefix = `${ROOT}/contact_leads/`;
        if (!document.name?.startsWith(prefix) || !document.name.slice(prefix.length)
          || document.name.slice(prefix.length).includes('/') || (cursor && document.name <= cursor)) {
          throw new Error('Unexpected contact document or pagination order.');
        }
        cursor = document.name;
        yield document;
      }
      if (page.length < pageSize) return;
    }
  }
  for await (const document of documents()) {
    summary.scanned++;
    const plan = planContactRetention(document, now);
    if (plan.invalid) { summary.invalid++; continue; }
    if (!plan.expired) continue;
    summary.expired += plan.expired;
    if (dryRun) continue;
    if (!validDate(document.updateTime, now)) throw new Error('Missing contact document version.');
    const sourceWrite = plan.remaining.length
      ? { update: { name: document.name, fields: { consentAcceptedDates: { arrayValue: { values: plan.remaining } } } },
          updateMask: { fieldPaths: ['consentAcceptedDates'] } }
      : { delete: document.name };
    sourceWrite.currentDocument = { updateTime: document.updateTime };
    const response = await request(`${API}${ROOT}:commit`, { method: 'POST', body: JSON.stringify({ writes: [
      sourceWrite,
      { update: { name: COUNTER, fields: {} }, updateMask: { fieldPaths: [] },
        updateTransforms: [{ fieldPath: 'archivedCount', increment: { integerValue: String(plan.expired) } }] },
    ] }) });
    // Both writes succeed together: reruns cannot count the same deleted data twice.
    if (response.ok) {
      if (plan.remaining.length) summary.trimmed++;
      else summary.deleted++;
    } else {
      const error = await response.json();
      if (['FAILED_PRECONDITION', 'NOT_FOUND', 'ABORTED'].includes(error?.error?.status)) summary.changed++;
      else throw new Error(`Contact retention commit failed (HTTP ${response.status}).`);
    }
  }
  if (!dryRun) {
    // Publish only a numeric total for /stats, without exposing contact records.
    for (let attempt = 0; attempt < 3; attempt++) {
      const counterResponse = await request(`${API}${COUNTER}`);
      if (!counterResponse.ok && counterResponse.status !== 404) throw new Error('Contact counter read failed.');
      const counter = counterResponse.status === 404 ? null : await counterResponse.json();
      const archived = Number(counter?.fields?.archivedCount?.integerValue || 0);
      if (!Number.isSafeInteger(archived) || archived < 0) throw new Error('Invalid archived contact count.');
      let live = 0;
      for await (const document of documents()) {
        const plan = planContactRetention(document, now);
        if (plan.invalid) throw new Error('Cannot publish a count for invalid contact records.');
        live += plan.count;
      }
      if (!Number.isSafeInteger(archived + live)) throw new Error('Invalid contact total.');
      const response = await request(`${API}${ROOT}:commit`, { method: 'POST', body: JSON.stringify({ writes: [
        { update: { name: COUNTER, fields: { totalCount: { integerValue: String(archived + live) } } },
          updateMask: { fieldPaths: ['totalCount'] },
          currentDocument: counter ? { updateTime: counter.updateTime } : { exists: false } },
      ] }) });
      if (response.ok) break;
      const error = await response.json();
      if (!['FAILED_PRECONDITION', 'ALREADY_EXISTS', 'ABORTED'].includes(error?.error?.status) || attempt === 2) {
        throw new Error('Contact counter publication failed.');
      }
    }
  }
  return summary;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--dry-run', '--delete'].includes(arg)) || (args.includes('--dry-run') && args.includes('--delete'))) {
    throw new Error('Use --dry-run (default) or --delete.');
  }
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) throw new Error('Missing credentials.');
  const credentials = JSON.parse(await readFile(credentialsPath, 'utf8'));
  if (credentials.project_id !== 'i-janicki' || credentials.type !== 'service_account') throw new Error('Invalid project.');
  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/datastore'] });
  const summary = await cleanupContactForms({ accessToken: await auth.getAccessToken(), dryRun: !args.includes('--delete') });
  console.log(JSON.stringify(summary)); // Counters only; never log contact records or identifiers.
  if (summary.invalid) throw new Error('Invalid contact dates require review.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error('Contact retention failed. Check dates, credentials and Firestore access.');
    process.exitCode = 1;
  });
}
