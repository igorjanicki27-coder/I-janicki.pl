const FIREBASE_API_KEY = (process.env.FIREBASE_API_KEY || 'AIzaSyDnBGZh-HSHx2gqFm78S7p86coHk25u0xc').trim();
const FIREBASE_PROJECT_ID = (process.env.FIREBASE_PROJECT_ID || 'i-janicki').trim();
const FIREBASE_SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
const FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 || '';
const IS_GITHUB_ACTIONS = process.env.GITHUB_ACTIONS === 'true';
const WEB3FORMS_ACCESS_KEY = (process.env.WEB3FORMS_ACCESS_KEY || '').trim().replace(/^['"]|['"]$/g, '');
const REMINDER_EMAIL = (process.env.POST_REMINDER_EMAIL || 'igor.janicki27@gmail.com').trim();
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

function warsawTodayKey() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function parseDateKey(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(value, days) {
  const date = parseDateKey(value);
  if (!date) return value;
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return dateKey(date);
}

function addMonthsKey(value, months) {
  const date = parseDateKey(value);
  if (!date) return value;
  const day = date.getUTCDate();
  date.setUTCMonth(date.getUTCMonth() + Number(months || 0));
  if (date.getUTCDate() !== day) {
    date.setUTCDate(0);
  }
  return dateKey(date);
}

function addFrequencyKey(value, frequency) {
  if (frequency === 'weekly') return addDays(value, 7);
  if (frequency === 'biweekly') return addDays(value, 14);
  return addMonthsKey(value, 1);
}

function frequencyLabel(value) {
  if (value === 'weekly') return 'Raz w tygodniu';
  if (value === 'biweekly') return 'Raz na 2 tygodnie';
  if (value === 'irregular') return 'Nieregularnie';
  return 'Raz w miesiacu';
}

function firmName(firm) {
  return (firm && (firm.displayName || firm.name)) || 'Firma bez nazwy';
}

function postsForTab(firm, tabId) {
  return Array.isArray(firm.posts)
    ? firm.posts.filter((post) => post.tabId === tabId)
    : [];
}

function latestPublishedPost(firm, tabId) {
  return postsForTab(firm, tabId)
    .filter((post) => post.status === 'published')
    .sort((a, b) => String(b.publishDate || '').localeCompare(String(a.publishDate || '')))[0] || null;
}

function nearestScheduledPost(firm, tabId, referenceDate = warsawTodayKey()) {
  const scheduled = postsForTab(firm, tabId)
    .filter((post) => post.status !== 'published')
    .filter((post) => post.publishDate || post.title || post.content);
  if (!scheduled.length) return null;

  const futureOrToday = scheduled
    .filter((post) => String(post.publishDate || '').slice(0, 10) >= referenceDate)
    .sort((a, b) => String(a.publishDate || '').localeCompare(String(b.publishDate || '')));
  if (futureOrToday.length) return futureOrToday[0];

  return scheduled
    .sort((a, b) => String(b.publishDate || '').localeCompare(String(a.publishDate || '')))[0] || null;
}

function getPostTabStatus(firm, tab) {
  const startDate = tab.startDate || warsawTodayKey();
  const lastPost = latestPublishedPost(firm, tab.id);
  const today = warsawTodayKey();
  if (tab.frequency === 'irregular') {
    return {
      dueDate: null,
      isOverdue: false,
      lastPost,
      isSkipped: true,
    };
  }
  let dueDate = startDate;

  if (lastPost?.publishDate && String(lastPost.publishDate) >= dueDate) {
    while (dueDate <= lastPost.publishDate) {
      dueDate = addFrequencyKey(dueDate, tab.frequency);
    }
  }

  return {
    dueDate,
    isOverdue: today >= dueDate,
    lastPost,
  };
}

function findDueReminders(state) {
  const reminders = [];
  for (const firm of state.firms || []) {
    const sentKeys = new Set(Array.isArray(firm.postReminderKeys) ? firm.postReminderKeys : []);
    for (const tab of firm.postTabs || []) {
      const status = getPostTabStatus(firm, tab);
      if (status.isSkipped) continue;
      const reminderKey = `${tab.id}:${status.dueDate}`;
      if (!status.isOverdue || sentKeys.has(reminderKey)) continue;
      reminders.push({
        firm,
        tab,
        status,
        nearestScheduledPost: nearestScheduledPost(firm, tab.id, status.dueDate || warsawTodayKey()),
        reminderKey,
      });
    }
  }
  return reminders;
}

function findDuePostTabs(state) {
  const dueTabs = [];
  for (const firm of state.firms || []) {
    for (const tab of firm.postTabs || []) {
      const status = getPostTabStatus(firm, tab);
      if (status.isSkipped || !status.isOverdue) continue;
      dueTabs.push({ firm, tab, status });
    }
  }
  return dueTabs;
}

function findScheduledPostsForToday(state) {
  const today = warsawTodayKey();
  const posts = [];
  for (const firm of state.firms || []) {
    for (const post of firm.posts || []) {
      if (post.status === 'published') continue;
      if (String(post.publishDate || '').slice(0, 10) !== today) continue;
      posts.push({ firm, post });
    }
  }
  return posts;
}

function findScheduledPostReminders(state) {
  const reminders = [];
  const today = warsawTodayKey();
  for (const firm of state.firms || []) {
    const sentKeys = new Set(Array.isArray(firm.postReminderKeys) ? firm.postReminderKeys : []);
    for (const post of firm.posts || []) {
      if (post.status === 'published') continue;
      if (String(post.publishDate || '').slice(0, 10) !== today) continue;
      const reminderKey = `scheduled-post:${post.id || post.title || 'post'}:${today}`;
      if (sentKeys.has(reminderKey)) continue;
      reminders.push({ firm, post, reminderKey });
    }
  }
  return reminders;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${url} failed: ${response.status} ${JSON.stringify(data)}`);
  }
  return data;
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
    throw new Error(`Invalid Firebase service account secret: ${error.message}`);
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
  const url = `${FIRESTORE_BASE}/${path}`;
  const data = await requestJson(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  }).catch((error) => {
    if (String(error.message || '').includes('404')) return { documents: [] };
    throw error;
  });
  return (data.documents || []).map((doc) => ({
    id: doc.name.split('/').pop(),
    ...fromFirestoreFields(doc.fields || {}),
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
    postTabs: tabs.length ? tabs : (firmDocTabs.length ? firmDocTabs : (firm.postTabs || [])),
    posts: posts.length ? posts : (firmDocPosts.length ? firmDocPosts : (firm.posts || [])),
  };
}

async function saveState(idToken, state) {
  const updatedAt = new Date().toISOString();
  state.updatedAt = updatedAt;
  await requestJson(`${STATE_DOC}?updateMask.fieldPaths=state&updateMask.fieldPaths=updatedAt`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        state: { stringValue: JSON.stringify(state) },
        updatedAt: { stringValue: updatedAt },
      },
    }),
  });
}

function buildReminderDigest(overdueReminders, scheduledReminders) {
  const lines = [
    `Podsumowanie publikacji na ${warsawTodayKey()}`,
    '',
  ];

  if (scheduledReminders.length) {
    lines.push('Zaplanowane publikacje na dzis:');
    scheduledReminders.forEach((reminder, index) => {
      const { firm, post } = reminder;
      lines.push(`${index + 1}. ${firmName(firm)}`);
      lines.push(`   Tytul: ${post.title || 'Bez tytulu'}`);
      lines.push(`   Data: ${post.publishDate || warsawTodayKey()}`);
      lines.push(`   Utworzony: ${post.isCreated ? 'tak' : 'nie'}`);
      if (post.link) lines.push(`   Link: ${post.link}`);
      lines.push('');
    });
  }

  if (overdueReminders.length) {
    lines.push('Podzakladki wymagajace publikacji:');
    overdueReminders.forEach((reminder, index) => {
      const { firm, tab, status, nearestScheduledPost: nearestPost } = reminder;
      lines.push(`${index + 1}. ${firmName(firm)} / ${tab.name}`);
      lines.push(`   Czestotliwosc: ${frequencyLabel(tab.frequency)}`);
      lines.push(`   Termin: ${status.dueDate}`);
      lines.push(`   Ostatnia publikacja: ${status.lastPost ? `${status.lastPost.title || 'Bez tytulu'} (${status.lastPost.publishDate})` : 'brak'}`);
      if (nearestPost) {
        lines.push(`   Najblizszy zaplanowany post: ${nearestPost.title || 'Bez tytulu'} (${nearestPost.publishDate || 'brak daty'})`);
        lines.push(`   Utworzony: ${nearestPost.isCreated ? 'tak' : 'nie'}`);
      } else {
        lines.push('   Najblizszy zaplanowany post: brak');
      }
      lines.push('');
    });
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

async function sendReminderDigest(overdueReminders, scheduledReminders) {
  const total = overdueReminders.length + scheduledReminders.length;
  const message = buildReminderDigest(overdueReminders, scheduledReminders);
  const subject = `Firma - przypomnienia publikacji (${total})`;

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

async function markReminderSent(idToken, firmId, existingKeys, reminderKey) {
  const nextKeys = Array.from(new Set([...(existingKeys || []), reminderKey]));
  await requestJson(`${FIRESTORE_BASE}/firmy_clients/${firmId}?updateMask.fieldPaths=postReminderKeys&updateMask.fieldPaths=updatedAt`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        postReminderKeys: toStringArrayValue(nextKeys),
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
  const duePostTabs = findDuePostTabs({ firms });
  const scheduledPostsToday = findScheduledPostsForToday({ firms });
  const overdueReminders = findDueReminders({ firms });
  const scheduledReminders = findScheduledPostReminders({ firms });

  const tabCount = firms.reduce((sum, firm) => sum + ((firm.postTabs || []).length), 0);
  const postCount = firms.reduce((sum, firm) => sum + ((firm.posts || []).length), 0);
  console.log([
    `Post reminder scan for ${warsawTodayKey()}:`,
    `${firms.length} firms`,
    `${tabCount} post tabs`,
    `${postCount} posts`,
    `${duePostTabs.length} tabs due today or overdue`,
    `${scheduledPostsToday.length} scheduled posts for today`,
    `${overdueReminders.length + scheduledReminders.length} emails pending after sent-key filtering`,
  ].join(' '));
  if (postCount === 0) {
    console.warn('No posts were loaded from Firestore. Scheduled-post reminders cannot be detected until posts are saved/migrated to firmy_clients/*/posts or preserved in firmy_settings/state.');
  }

  if (!overdueReminders.length && !scheduledReminders.length) {
    console.log('No overdue post tabs or scheduled posts for today found.');
    return;
  }

  await sendReminderDigest(overdueReminders, scheduledReminders);
  console.log(`Sent reminder digest: ${overdueReminders.length} overdue tab(s), ${scheduledReminders.length} scheduled post(s).`);

  const sent = [
    ...overdueReminders.map((reminder) => ({ firmId: reminder.firm.id, reminderKey: reminder.reminderKey })),
    ...scheduledReminders.map((reminder) => ({ firmId: reminder.firm.id, reminderKey: reminder.reminderKey })),
  ];
  for (const item of sent) {
    const firm = firms.find((candidate) => candidate.id === item.firmId);
    const nextKeys = await markReminderSent(auth.idToken, item.firmId, firm?.postReminderKeys || [], item.reminderKey);
    if (firm) firm.postReminderKeys = nextKeys;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
