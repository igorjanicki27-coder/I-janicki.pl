const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyDnBGZh-HSHx2gqFm78S7p86coHk25u0xc';
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'i-janicki';
const FIREBASE_SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
const WEB3FORMS_ACCESS_KEY = process.env.WEB3FORMS_ACCESS_KEY || 'e1b3a82b-63d0-4f05-a808-676a7b22537a';
const REMINDER_EMAIL = process.env.POST_REMINDER_EMAIL || 'igor.janicki27@gmail.com';
const STATE_DOC = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/firmy_settings/state`;

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

function getPostTabStatus(firm, tab) {
  const startDate = tab.startDate || warsawTodayKey();
  const lastPost = latestPublishedPost(firm, tab.id);
  const today = warsawTodayKey();
  let dueDate = startDate;

  if (lastPost?.publishDate && String(lastPost.publishDate) >= dueDate) {
    while (dueDate <= lastPost.publishDate) {
      dueDate = addFrequencyKey(dueDate, tab.frequency);
    }
  }

  return {
    dueDate,
    isOverdue: today > dueDate,
    lastPost,
  };
}

function findDueReminders(state) {
  const reminders = [];
  for (const firm of state.firms || []) {
    const sentKeys = new Set(Array.isArray(firm.postReminderKeys) ? firm.postReminderKeys : []);
    for (const tab of firm.postTabs || []) {
      const status = getPostTabStatus(firm, tab);
      const reminderKey = `${tab.id}:${status.dueDate}`;
      if (!status.isOverdue || sentKeys.has(reminderKey)) continue;
      reminders.push({ firm, tab, status, reminderKey });
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
  if (!FIREBASE_SERVICE_ACCOUNT_JSON.trim()) return null;
  const { createSign } = await import('node:crypto');
  const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT_JSON);
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

async function sendReminderEmail(reminder) {
  const { firm, tab, status } = reminder;
  const message = [
    `Minął termin publikacji dla firmy: ${firmName(firm)}`,
    `Podzakładka: ${tab.name}`,
    `Częstotliwość: ${frequencyLabel(tab.frequency)}`,
    `Termin: ${status.dueDate}`,
    `Ostatnia publikacja: ${status.lastPost ? `${status.lastPost.title || 'Bez tytulu'} (${status.lastPost.publishDate})` : 'brak'}`,
  ].join('\n');

  const response = await fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_key: WEB3FORMS_ACCESS_KEY,
      subject: `Firma - zalegla publikacja: ${firmName(firm)}`,
      from_name: 'Panel Firma',
      name: 'Panel Firma',
      email: REMINDER_EMAIL,
      message,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(data.message || `Web3Forms ${response.status}`);
  }
}

function markReminderSent(state, firmId, reminderKey) {
  for (const firm of state.firms || []) {
    if (firm.id !== firmId) continue;
    firm.postReminderKeys = Array.isArray(firm.postReminderKeys) ? firm.postReminderKeys : [];
    if (!firm.postReminderKeys.includes(reminderKey)) {
      firm.postReminderKeys.push(reminderKey);
      firm.updatedAt = new Date().toISOString();
    }
    return;
  }
}

async function main() {
  const auth = await getServiceAccountToken() || await signInAnonymously();
  if (auth.mode !== 'service-account') {
    await ensureFirmyAdminSession(auth);
    console.warn('Using anonymous Firebase auth fallback. Prefer FIREBASE_SERVICE_ACCOUNT_JSON for GitHub Actions.');
  }

  const state = await loadState(auth.idToken);
  const reminders = findDueReminders(state);

  if (!reminders.length) {
    console.log('No overdue post tabs found.');
    return;
  }

  const sent = [];
  for (const reminder of reminders) {
    try {
      await sendReminderEmail(reminder);
      sent.push({ firmId: reminder.firm.id, reminderKey: reminder.reminderKey });
      console.log(`Sent reminder: ${firmName(reminder.firm)} / ${reminder.tab.name} / ${reminder.status.dueDate}`);
    } catch (error) {
      console.error(`Reminder failed: ${firmName(reminder.firm)} / ${reminder.tab.name}: ${error.message}`);
    }
  }

  if (!sent.length) return;

  const freshState = await loadState(auth.idToken);
  for (const item of sent) {
    markReminderSent(freshState, item.firmId, item.reminderKey);
  }
  await saveState(auth.idToken, freshState);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
