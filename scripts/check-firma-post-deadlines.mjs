import {
  compensationFrequencyLabel,
  getCompensationReminderStatus,
} from '../firma/compensation-reminders.mjs';
import { postTodayKey as warsawTodayKey } from '../firma/post-schedule.mjs';
import { getPostReminderDigest } from './firma-post-reminders.mjs';
import { filterDeletedPostCollections, mergeDeletedPostTabs, mergePostRecords } from '../firma/post-state.mjs';
import { requestJson } from './firma-reminder-request.mjs';

const FIREBASE_API_KEY = (process.env.FIREBASE_API_KEY || 'AIzaSyDnBGZh-HSHx2gqFm78S7p86coHk25u0xc').trim();
const FIREBASE_PROJECT_ID = (process.env.FIREBASE_PROJECT_ID || 'i-janicki').trim();
const FIREBASE_SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
const FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 || '';
const IS_GITHUB_ACTIONS = process.env.GITHUB_ACTIONS === 'true';
const WEB3FORMS_ACCESS_KEY = (process.env.WEB3FORMS_ACCESS_KEY || '').trim().replace(/^['"]|['"]$/g, '');
const REMINDER_EMAIL = (process.env.POST_REMINDER_EMAIL || 'kontakt@i-janicki.pl').trim();
const SMTP_HOST = (process.env.SMTP_HOST || '').trim();
const SMTP_PORT = Number((process.env.SMTP_PORT || '465').trim());
const SMTP_SECURE = (process.env.SMTP_SECURE || '').trim()
  ? !['0', 'false', 'no'].includes((process.env.SMTP_SECURE || '').trim().toLowerCase())
  : SMTP_PORT === 465;
const SMTP_USER = (process.env.SMTP_USER || '').trim();
const SMTP_PASS = (process.env.SMTP_PASS || '').trim().replace(/^['"]|['"]$/g, '');
const SMTP_FROM = (process.env.SMTP_FROM || SMTP_USER || REMINDER_EMAIL).trim();
const STATE_DOC = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/firmy_settings/state`;
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

function parseDateKey(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(fromValue, toValue) {
  const fromDate = parseDateKey(fromValue);
  const toDate = parseDateKey(toValue);
  if (!fromDate || !toDate) return null;
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
}

function formatDatePl(value) {
  const date = parseDateKey(value);
  if (!date) return String(value || '');
  return [
    String(date.getUTCDate()).padStart(2, '0'),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    date.getUTCFullYear(),
  ].join('/');
}

function formatPeriodPl(value) {
  const [year, month] = String(value || '').split('-');
  return year && month ? `${month}/${year}` : String(value || '');
}

function firmName(firm) {
  return (firm && (firm.displayName || firm.name)) || 'Firma bez nazwy';
}

function findDomainExpiryReminders(state) {
  const reminders = [];
  const today = warsawTodayKey();
  const reminderOffsets = new Set([30, 14, 0]);
  for (const firm of state.firms || []) {
    const expiryDate = String(firm.domainExpiryDate || '').slice(0, 10);
    if (!parseDateKey(expiryDate)) continue;
    const daysUntilExpiry = daysBetween(today, expiryDate);
    if (!reminderOffsets.has(daysUntilExpiry)) continue;
    const reminderKey = `domain-expiry:${expiryDate}:${daysUntilExpiry}`;
    const sentKeys = new Set(Array.isArray(firm.domainReminderKeys) ? firm.domainReminderKeys : []);
    if (sentKeys.has(reminderKey)) continue;
    reminders.push({ firm, expiryDate, daysUntilExpiry, reminderKey });
  }
  return reminders;
}

function findCompensationReminders(state) {
  const reminders = [];
  const today = warsawTodayKey();
  for (const firm of state.firms || []) {
    const status = getCompensationReminderStatus(firm, today);
    const sentKeys = new Set(Array.isArray(firm.compensationReminderKeys) ? firm.compensationReminderKeys : []);
    for (const dueItem of status.overdueItems) {
      if (!dueItem.shouldSendToday) continue;
      const reminderKey = `compensation:${dueItem.dueDate}:${today}`;
      if (sentKeys.has(reminderKey)) continue;
      reminders.push({
        firm,
        settings: status.settings,
        dueItem,
        reminderKey,
      });
    }
  }
  return reminders;
}

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function getServiceAccountToken() {
  const rawServiceAccount = FIREBASE_SERVICE_ACCOUNT_JSON.trim()
    || (FIREBASE_SERVICE_ACCOUNT_JSON_BASE64.trim()
      ? Buffer.from(FIREBASE_SERVICE_ACCOUNT_JSON_BASE64.trim(), 'base64').toString('utf8')
      : '');
  if (!rawServiceAccount) return null;
  try {
    const { createSign } = await import('node:crypto');
    const serviceAccount = JSON.parse(rawServiceAccount);
    if (!serviceAccount.client_email || !serviceAccount.private_key) {
      throw new Error('missing client_email or private_key');
    }
    serviceAccount.private_key = String(serviceAccount.private_key).replace(/\\n/g, '\n');
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const claim = {
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    };
    const unsignedJwt = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
    const signer = createSign('RSA-SHA256');
    signer.update(unsignedJwt);
    signer.end();
    const signature = signer
      .sign(serviceAccount.private_key, 'base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    const assertion = `${unsignedJwt}.${signature}`;
    const token = await requestJson('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    });
    return {
      idToken: token.access_token,
      mode: 'service-account',
    };
  } catch (error) {
    throw new Error(`Firebase service-account authentication failed: ${error.message}`);
  }
}

async function signInAnonymously() {
  return requestJson(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  });
}

async function ensureFirmyAdminSession(auth) {
  const now = new Date().toISOString();
  const sessionUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/firmy_sessions/${auth.localId}`;
  await requestJson(sessionUrl, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${auth.idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        uid: { stringValue: auth.localId },
        pin: { stringValue: '151100' },
        role: { stringValue: 'admin' },
        clientId: { stringValue: '' },
        clientSlug: { stringValue: '' },
        lastLoginAt: { timestampValue: now },
        updatedAt: { timestampValue: now },
      },
    }),
  });
}

async function loadState(idToken) {
  const doc = await requestJson(STATE_DOC, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  return JSON.parse(doc.fields?.state?.stringValue || '{}');
}

function fromFirestoreValue(value) {
  if (!value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromFirestoreValue);
  if ('mapValue' in value) return fromFirestoreFields(value.mapValue.fields || {});
  return null;
}

function fromFirestoreFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)]));
}

function toStringArrayValue(values) {
  return {
    arrayValue: {
      values: values.map((value) => ({ stringValue: String(value) })),
    },
  };
}

async function listDocs(idToken, path) {
  const documents = [];
  let pageToken;
  do {
    const url = new URL(`${FIRESTORE_BASE}/${path}`);
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const data = await requestJson(url.href, {
      headers: { Authorization: `Bearer ${idToken}` },
    }).catch((error) => {
      if (String(error.message || '').includes('404')) return { documents: [] };
      throw error;
    });
    documents.push(...(data.documents || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return documents.map((doc) => ({
    ...fromFirestoreFields(doc.fields || {}),
    id: doc.name.split('/').pop(),
  }));
}

async function getFirmDoc(idToken, firmId) {
  const data = await requestJson(`${FIRESTORE_BASE}/firmy_clients/${firmId}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  }).catch((error) => {
    if (String(error.message || '').includes('404')) return null;
    throw error;
  });
  return data ? fromFirestoreFields(data.fields || {}) : {};
}

async function loadFirmPostCollections(idToken, firm) {
  const [firmDoc, tabs, posts] = await Promise.all([
    getFirmDoc(idToken, firm.id),
    listDocs(idToken, `firmy_clients/${firm.id}/post_tabs`),
    listDocs(idToken, `firmy_clients/${firm.id}/posts`),
  ]);
  const firmDocTabs = Array.isArray(firmDoc.postTabs) ? firmDoc.postTabs : [];
  const firmDocPosts = Array.isArray(firmDoc.posts) ? firmDoc.posts : [];
  return {
    ...firm,
    postReminderKeys: Array.isArray(firmDoc.postReminderKeys) ? firmDoc.postReminderKeys : [],
    domainReminderKeys: Array.isArray(firmDoc.domainReminderKeys)
      ? firmDoc.domainReminderKeys
      : (firm.domainReminderKeys || []),
    compensationReminderKeys: Array.isArray(firmDoc.compensationReminderKeys)
      ? firmDoc.compensationReminderKeys
      : (firm.compensationReminderKeys || []),
    ...filterDeletedPostCollections({
      deletedPostTabs: mergeDeletedPostTabs(firm, firmDoc),
      postTabs: mergePostRecords(tabs, Array.isArray(firm.postTabs) ? firm.postTabs : firmDocTabs),
      posts: mergePostRecords(posts, Array.isArray(firm.posts) ? firm.posts : firmDocPosts),
    }),
  };
}

function buildReminderDigest(postDigest, domainReminders, compensationReminders) {
  const lines = [
    `Podsumowanie przypomnień na ${warsawTodayKey()}`,
    '',
  ];

  if (domainReminders.length) {
    lines.push('Ważność domen:');
    domainReminders.forEach((reminder, index) => {
      const remainingLabel = reminder.daysUntilExpiry === 0
        ? 'Termin upływa dzisiaj'
        : `Pozostało ${reminder.daysUntilExpiry} dni`;
      lines.push(`${index + 1}. Domena firmy ${firmName(reminder.firm)}, dnia ${formatDatePl(reminder.expiryDate)} kończy swoją ważność.`);
      lines.push(`   ${remainingLabel}`);
      lines.push('');
    });
  }

  if (compensationReminders.length) {
    lines.push('Wynagrodzenia wymagające uzupełnienia:');
    compensationReminders.forEach((reminder, index) => {
      const { firm, settings, dueItem } = reminder;
      lines.push(`${index + 1}. Termin płatności wynagrodzenia przez firmę ${firmName(firm)}: ${formatDatePl(dueItem.dueDate)}.`);
      lines.push(`   Okres: ${formatPeriodPl(dueItem.period)}`);
      lines.push(`   Częstotliwość: ${compensationFrequencyLabel(settings.frequency)}`);
      lines.push(`   Nie dodano wynagrodzenia w zakładce Wynagrodzenia.`);
      lines.push('');
    });
  }

  if (postDigest.reminders.length) {
    lines.push('Brak tytułów publikacji:');
    for (const { firm, tab, date, days } of postDigest.reminders) {
      const timing = days < 0 ? 'po terminie' : days === 0 ? 'dzisiaj' : `za ${days} dni`;
      lines.push(`- ${firmName(firm)} / ${tab.name} — ${formatDatePl(date)} (${timing})`);
    }
    lines.push('');
  }

  if (postDigest.allClear) {
    lines.push('Wszystkie publikacje są na bieżąco. Najbliższe wolne terminy:');
    for (const { firm, next } of postDigest.allClear.statuses) {
      const label = next ? `${formatDatePl(next.date)} / ${next.tab.name}` : 'brak stałych terminów';
      lines.push(`- ${firmName(firm)} — ${label}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
}

function hasSmtpConfig() {
  return Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && SMTP_FROM);
}

function encodeMailSubject(value) {
  return `=?UTF-8?B?${Buffer.from(String(value), 'utf8').toString('base64')}?=`;
}

function smtpSafeAddress(value) {
  const text = String(value || '').trim();
  const match = text.match(/<([^>]+)>/);
  return (match ? match[1] : text).replace(/[<>\r\n]/g, '');
}

function smtpEscapeData(value) {
  return String(value || '')
    .replace(/\r?\n/g, '\r\n')
    .replace(/^\./gm, '..');
}

async function sendSmtpMail({ subject, message, host = SMTP_HOST, port = SMTP_PORT, secure = SMTP_SECURE }) {
  const tls = await import('node:tls');
  const net = await import('node:net');
  let socket;
  const configureSocket = (nextSocket) => {
    socket = nextSocket;
    socket.setEncoding('utf8');
    socket.setTimeout(30000, () => {
      socket.destroy(new Error('SMTP connection timed out after 30s'));
    });
  };
  configureSocket(secure
    ? tls.connect({ host, port, servername: host })
    : net.connect({ host, port }));

  let buffer = '';
  const readResponse = () => new Promise((resolve, reject) => {
    const onData = (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || '';
      if (/^\d{3} /.test(last)) {
        socket.off('data', onData);
        socket.off('error', onError);
        const response = buffer;
        buffer = '';
        resolve(response);
      }
    };
    const onError = (error) => {
      socket.off('data', onData);
      reject(error);
    };
    socket.on('data', onData);
    socket.once('error', onError);
  });

  const command = async (line, expected = /^[23]/) => {
    if (line) socket.write(`${line}\r\n`);
    const response = await readResponse();
    if (!expected.test(response)) {
      throw new Error(`SMTP command failed: ${line || 'connect'} -> ${response.trim()}`);
    }
    return response;
  };

  await command('', /^220/);
  await command('EHLO github-actions');
  if (!secure) {
    await command('STARTTLS', /^220/);
    const secureSocket = tls.connect({ socket, servername: host });
    configureSocket(secureSocket);
    await new Promise((resolve, reject) => {
      secureSocket.once('secureConnect', resolve);
      secureSocket.once('error', reject);
    });
    await command('EHLO github-actions');
  }
  await command('AUTH LOGIN', /^334/);
  await command(Buffer.from(SMTP_USER).toString('base64'), /^334/);
  await command(Buffer.from(SMTP_PASS).toString('base64'), /^235/);
  await command(`MAIL FROM:<${smtpSafeAddress(SMTP_FROM)}>`);
  await command(`RCPT TO:<${smtpSafeAddress(REMINDER_EMAIL)}>`);
  await command('DATA', /^354/);
  socket.write([
    `From: ${SMTP_FROM}`,
    `To: ${REMINDER_EMAIL}`,
    `Subject: ${encodeMailSubject(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    smtpEscapeData(message),
    '.',
    '',
  ].join('\r\n'));
  await command('', /^250/);
  await command('QUIT', /^221/);
  socket.end();
}

async function sendWeb3FormsMail({ subject, message }) {
  const response = await fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_key: WEB3FORMS_ACCESS_KEY,
      subject,
      from_name: 'Panel Firma',
      name: 'Panel Firma',
      email: REMINDER_EMAIL,
      message,
    }),
  });
  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {};
  }
  if (!response.ok || data.success === false) {
    const details = data.message || data.error || raw || response.statusText || '';
    throw new Error(`Web3Forms ${response.status}${details ? `: ${details}` : ''}`);
  }
}

async function sendReminderDigest(postDigest, domainReminders, compensationReminders) {
  const total = postDigest.reminders.length + domainReminders.length + compensationReminders.length;
  const message = buildReminderDigest(postDigest, domainReminders, compensationReminders);
  const subject = total ? `Firma - przypomnienia (${total})` : 'Firma - publikacje na bieżąco';

  if (hasSmtpConfig()) {
    console.log(`SMTP configured: ${SMTP_HOST}:${SMTP_PORT} (${SMTP_SECURE ? 'TLS' : 'STARTTLS'}) as ${SMTP_USER}.`);
    try {
      await sendSmtpMail({ subject, message });
    } catch (error) {
      const canRetryStartTls = SMTP_SECURE && SMTP_PORT !== 587 && /timed out|timeout|ETIMEDOUT/i.test(String(error?.message || error));
      if (!canRetryStartTls) throw error;
      console.warn(`SMTP TLS attempt failed: ${error.message}. Retrying ${SMTP_HOST}:587 (STARTTLS).`);
      await sendSmtpMail({ subject, message, host: SMTP_HOST, port: 587, secure: false });
    }
    return;
  }

  if (!WEB3FORMS_ACCESS_KEY) {
    throw new Error('Missing email sender config. Add SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and optionally SMTP_FROM as firebase environment secrets.');
  }

  console.warn('SMTP is not configured. Falling back to Web3Forms, which may be blocked by Cloudflare in GitHub Actions.');
  console.log(`Web3Forms key configured: yes (${WEB3FORMS_ACCESS_KEY.length} chars).`);
  await sendWeb3FormsMail({ subject, message });
}

async function markReminderSent(idToken, firmId, existingKeys, reminderKeys, fieldName = 'postReminderKeys') {
  const nextKeys = Array.from(new Set([...(existingKeys || []), ...reminderKeys]));
  await requestJson(`${FIRESTORE_BASE}/firmy_clients/${firmId}?updateMask.fieldPaths=${fieldName}&updateMask.fieldPaths=updatedAt`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        [fieldName]: toStringArrayValue(nextKeys),
        updatedAt: { stringValue: new Date().toISOString() },
      },
    }),
  });
  return nextKeys;
}

async function main() {
  const serviceAccountAuth = await getServiceAccountToken();
  if (!serviceAccountAuth && IS_GITHUB_ACTIONS) {
    throw new Error([
      'GitHub Actions requires Firebase service-account auth for Firestore post reminders.',
      'Add repository secret FIREBASE_SERVICE_ACCOUNT_JSON with the full service account JSON,',
      'or FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 with the base64-encoded JSON.',
      'Anonymous Firebase auth cannot read firmy_clients/*/posts under current Firestore rules.',
    ].join(' '));
  }

  const auth = serviceAccountAuth || await signInAnonymously();
  if (auth.mode !== 'service-account') {
    await ensureFirmyAdminSession(auth);
    console.warn('Using anonymous Firebase auth fallback. Prefer FIREBASE_SERVICE_ACCOUNT_JSON for GitHub Actions.');
  }

  const state = await loadState(auth.idToken);
  const firms = await Promise.all((state.firms || []).map((firm) => loadFirmPostCollections(auth.idToken, firm)));
  const today = warsawTodayKey();
  const postDigest = getPostReminderDigest(firms, today);
  const domainReminders = findDomainExpiryReminders({ firms });
  const compensationReminders = findCompensationReminders({ firms });
  const postReminders = postDigest.allClear ? [postDigest.allClear] : postDigest.reminders;

  console.log(`Reminder scan for ${today}: ${firms.length} firms, ${postDigest.reminders.length} publication reminders, ${domainReminders.length} domain reminders, ${compensationReminders.length} compensation reminders, all clear: ${Boolean(postDigest.allClear)}.`);
  if (!postReminders.length && !domainReminders.length && !compensationReminders.length) return;

  await sendReminderDigest(postDigest, domainReminders, compensationReminders);

  const sent = [
    ...postReminders.map((reminder) => ({
      firmId: reminder.firm.id,
      reminderKey: reminder.reminderKey,
      fieldName: 'postReminderKeys',
    })),
    ...domainReminders.map((reminder) => ({
      firmId: reminder.firm.id,
      reminderKey: reminder.reminderKey,
      fieldName: 'domainReminderKeys',
    })),
    ...compensationReminders.map((reminder) => ({
      firmId: reminder.firm.id,
      reminderKey: reminder.reminderKey,
      fieldName: 'compensationReminderKeys',
    })),
  ];
  for (const firm of firms) {
    for (const fieldName of ['postReminderKeys', 'domainReminderKeys', 'compensationReminderKeys']) {
      const keys = sent.filter((item) => item.firmId === firm.id && item.fieldName === fieldName)
        .map((item) => item.reminderKey);
      if (keys.length) await markReminderSent(auth.idToken, firm.id, firm[fieldName], keys, fieldName);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
