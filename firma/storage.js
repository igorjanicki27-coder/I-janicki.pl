import { ensureFirmyAdminSession, getSetting, setSetting, db, doc, collection, setDoc, getDoc, getDocs, deleteDoc, writeBatch } from './firebase.js?v=20';

const STORAGE_KEY = 'ijanicki_firma_state_v1';
const FIRESTORE_STATE_DOC = 'firmy_settings/state';
const SYNC_STATUS_KEY = 'ijanicki_firma_sync_status';

/* ── Sync status (globalny, per-firma) ─────────────────────── */

/**
 * Status synchronizacji:
 *   'synced'    – wszystko zapisane w chmurze
 *   'saving'    – zapis w toku
 *   'error'     – błąd zapisu (po wyczerpaniu retry)
 *   'idle'      – brak aktywności
 */
const syncStatus = {
  currentFirmId: null,
  state: 'idle',
  lastSync: null,
  lastError: null,
  pending: 0,      // liczba oczekujących zapisów
  retryCount: 0,
};

// Listenery do aktualizacji UI
const syncListeners = new Set();

export function onSyncChange(fn) {
  syncListeners.add(fn);
  return () => syncListeners.delete(fn);
}

function notifySyncListeners() {
  const status = getSyncStatus();
  for (const fn of syncListeners) {
    try { fn(status); } catch (_) { /* ignoruj */ }
  }
}

export function getSyncStatus() {
  return { ...syncStatus };
}

export function setSyncFirm(firmId) {
  syncStatus.currentFirmId = firmId;
}

/* ── Kolejka synchronizacji z retry ────────────────────────── */

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

let syncTimer = null;
let pendingSave = null;

function currentIso() {
  return new Date().toISOString();
}

function scheduleFirestoreSync(state) {
  pendingSave = state;
  syncStatus.pending += 1;
  syncStatus.state = 'saving';
  notifySyncListeners();

  // Debounce – jeśli w ciągu 500ms przyjdzie kolejny zapis, wyślij tylko najnowszy
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    const toSave = pendingSave;
    pendingSave = null;
    if (toSave) {
      flushToFirestore(toSave);
    }
  }, 500);
}

async function flushToFirestore(state, attempt = 1) {
  try {
    await ensureFirmyAdminSession();
    await setSetting(FIRESTORE_STATE_DOC, {
      state: JSON.stringify(state),
      updatedAt: currentIso(),
    });
    // Sukces
    syncStatus.state = 'synced';
    syncStatus.lastSync = currentIso();
    syncStatus.lastError = null;
    syncStatus.retryCount = 0;
    syncStatus.pending = Math.max(0, syncStatus.pending - 1);
    notifySyncListeners();
  } catch (err) {
    console.warn(`Firestore save failed (attempt ${attempt}/${MAX_RETRIES}):`, err.message);
    if (attempt < MAX_RETRIES) {
      syncStatus.retryCount = attempt;
      notifySyncListeners();
      // Retry po opóźnieniu
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
      return flushToFirestore(state, attempt + 1);
    }
    // Wyczerpano próby
    syncStatus.state = 'error';
    syncStatus.lastError = err.message;
    syncStatus.pending = Math.max(0, syncStatus.pending - 1);
    notifySyncListeners();
  }
}

/* ── State helpers ──────────────────────────────────────────── */

function defaultIssuer() {
  return {
    businessName: 'Igor Janicki',
    address: 'ul.Pułtuska 20/9 53-116 Wrocław',
    email: 'igor.janicki27@gmail.com',
    phone: '575757817',
    nip: '8993047085',
    bankAccount: '',
    vatMode: 'zw',
    invoiceFooterNote: 'Podmiot jest zwolniony z VAT.',
  };
}

function defaultPostTabs(now = currentIso()) {
  const today = now.slice(0, 10);
  return [
    { id: 'google-posts', name: 'Wpisy Google', frequency: 'monthly', startDate: today, createdAt: now, updatedAt: now },
    { id: 'google-articles', name: 'Artykuly w Google', frequency: 'monthly', startDate: today, createdAt: now, updatedAt: now },
    { id: 'social-media', name: 'Media spolecznosciowe', frequency: 'weekly', startDate: today, createdAt: now, updatedAt: now },
  ];
}

export function createEmptyState() {
  return {
    version: 1,
    invoiceCounters: {},
    invoiceCounterDates: {},
    settings: {
      issuer: defaultIssuer(),
    },
    firms: [],
    ui: {
      selectedFirmId: null,
      selectedMonth: null,
      activeTab: 'overview',
      activeMonthTab: 'overview',
      activeInvoiceTab: 'own',
      activePostTabId: null,
      postSearch: '',
    },
    createdAt: currentIso(),
    updatedAt: currentIso(),
  };
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeFirm(firm) {
  const now = currentIso();
  const months = Array.isArray(firm.months)
    ? firm.months
    : ensureArray(firm.budgetEntries).map((entry) => ({
        id: entry.id || `${entry.month || now}-legacy`,
        month: entry.month,
        budget: Number(entry.amount || 0),
        compensationPercent: Number(entry.compensationPercent || 50),
        note: entry.description || '',
        updatedAt: entry.date || now,
      }));
  const balanceEntries = ensureArray(firm.balanceEntries).length > 0
    ? ensureArray(firm.balanceEntries)
    : ensureArray(firm.payments).map((payment) => ({
        id: payment.id,
        date: payment.date,
        amount: Number(payment.amount || 0),
        description: payment.description || 'Wpłata klienta',
        createdAt: payment.createdAt || now,
      }));

  const address1 = firm.address1 || firm.address || '';
  const address2 = firm.address2 || '';

  return {
    id: firm.id,
    name: firm.name || '',
    displayName: firm.displayName || '',
    nip: firm.nip || '',
    address1,
    address2,
    email: firm.email || '',
    phone: firm.phone || '',
    notes: firm.notes || '',
    months: months.map((month) => ({
      id: month.id,
      month: month.month,
      budget: Number(month.budget || 0),
      compensationPercent: Number(month.compensationPercent || 50),
      note: month.note || '',
      updatedAt: month.updatedAt || now,
    })),
    adBudgetEntries: ensureArray(firm.adBudgetEntries).map((entry) => ({
      id: entry.id,
      date: entry.date || now.slice(0, 10),
      amount: Number(entry.amount || 0),
      description: entry.description || '',
      createdAt: entry.createdAt || now,
    })),
    compensationEntries: ensureArray(firm.compensationEntries).map((entry) => ({
      id: entry.id,
      date: entry.date || now.slice(0, 10),
      period: entry.period || null,
      title: entry.title || entry.description || 'Wynagrodzenie',
      amount: Number(entry.amount || 0),
      createdAt: entry.createdAt || now,
    })),
    balanceEntries: balanceEntries.map((entry) => ({
      id: entry.id,
      date: entry.date || now.slice(0, 10),
      amount: Number(entry.amount || 0),
      description: entry.description || '',
      createdAt: entry.createdAt || now,
    })),
    expenses: ensureArray(firm.expenses).map((expense) => ({
      id: expense.id,
      date: expense.date,
      month: expense.month,
      category: expense.category || 'inne',
      amount: Number(expense.amount || 0),
      payer: expense.payer || 'my_funds',
      vendor: expense.vendor || '',
      description: expense.description || '',
      linkedInvoiceId: expense.linkedInvoiceId || null,
      attachmentIds: ensureArray(expense.attachmentIds),
      createdAt: expense.createdAt || now,
    })),
    walletEntries: ensureArray(firm.walletEntries).map((entry) => ({
      id: entry.id,
      type: entry.type || 'income',
      date: entry.date || now.slice(0, 10),
      period: entry.period || null,
      title: entry.title || '',
      linkedInvoiceId: entry.linkedInvoiceId || null,
      amount: Number(entry.amount || 0),
      method: entry.method || 'card',
      createdAt: entry.createdAt || now,
    })),
    invoices: ensureArray(firm.invoices).map((invoice) => ({
      id: invoice.id,
      kind: invoice.kind || 'own',
      source: invoice.source || 'system',
      number: invoice.number || '',
      month: invoice.month || null,
      issueDate: invoice.issueDate || null,
      saleDate: invoice.saleDate || null,
      dueDate: invoice.dueDate || null,
      status: invoice.status || 'issued',
      paidBy: invoice.paidBy || null,
      vatMode: invoice.vatMode || 'zw',
      title: invoice.title || '',
      buyerSnapshot: invoice.buyerSnapshot || null,
      issuerSnapshot: invoice.issuerSnapshot || null,
      notes: invoice.notes || '',
      amount: Number(invoice.amount || 0),
      items: ensureArray(invoice.items),
      vendor: invoice.vendor || '',
      payer: invoice.payer || null,
      category: invoice.category || null,
      skipAccounting: invoice.skipAccounting === true,
      subtractFromBudget: invoice.subtractFromBudget !== false,
      attachmentIds: ensureArray(invoice.attachmentIds),
      createdAt: invoice.createdAt || now,
    })),
    history: ensureArray(firm.history).map((entry) => ({
      id: entry.id,
      at: entry.at || entry.createdAt || now,
      area: entry.area || 'system',
      action: entry.action || 'change',
      title: entry.title || entry.description || 'Zmiana',
      amount: entry.amount === null || entry.amount === undefined ? null : Number(entry.amount || 0),
      meta: entry.meta && typeof entry.meta === 'object' ? entry.meta : {},
    })),
    postTabs: (Array.isArray(firm.postTabs) ? firm.postTabs : defaultPostTabs(now)).map((tab) => ({
      id: tab.id || `post-tab-${now}`,
      name: tab.name || 'Nowa podzakladka',
      frequency: ['weekly', 'biweekly', 'monthly', 'irregular'].includes(tab.frequency) ? tab.frequency : 'monthly',
      startDate: tab.startDate || now.slice(0, 10),
      createdAt: tab.createdAt || now,
      updatedAt: tab.updatedAt || now,
    })),
    posts: ensureArray(firm.posts).map((post) => ({
      id: post.id,
      tabId: post.tabId || '',
      status: post.status === 'published' ? 'published' : 'scheduled',
      publishDate: post.publishDate || post.date || now.slice(0, 10),
      title: post.title || '',
      link: post.link || post.url || '',
      content: post.content || '',
      keywords: Array.isArray(post.keywords)
        ? post.keywords.map((item) => String(item || '').trim()).filter(Boolean)
        : String(post.keywords || '').split(',').map((item) => item.trim()).filter(Boolean),
      reminderKeys: ensureArray(post.reminderKeys),
      createdAt: post.createdAt || now,
      updatedAt: post.updatedAt || now,
    })),
    postReminderKeys: ensureArray(firm.postReminderKeys),
    postStorageFallback: firm.postStorageFallback === true,
    createdAt: firm.createdAt || now,
    updatedAt: firm.updatedAt || now,
  };
}

export function normalizeState(input) {
  const base = createEmptyState();
  if (!input || typeof input !== 'object') {
    return base;
  }

  const normalized = {
    ...base,
    ...input,
    invoiceCounters: typeof input.invoiceCounters === 'object' && input.invoiceCounters ? input.invoiceCounters : {},
    settings: {
      issuer: {
        ...base.settings.issuer,
        ...(input.settings?.issuer || {}),
      },
    },
    firms: ensureArray(input.firms).map(normalizeFirm),
    ui: {
      ...base.ui,
      ...(input.ui || {}),
    },
  };

  normalized.updatedAt = currentIso();
  return normalized;
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createEmptyState();
    }
    return normalizeState(JSON.parse(raw));
  } catch (error) {
    console.warn('Nie udało się wczytać danych lokalnych', error);
    return createEmptyState();
  }
}

function stripPostCollections(input) {
  return input;
}

function mergeListById(primary = [], backup = []) {
  const merged = [];
  const seen = new Set();
  for (const item of ensureArray(primary)) {
    if (!item?.id || seen.has(item.id)) continue;
    merged.push(item);
    seen.add(item.id);
  }
  for (const item of ensureArray(backup)) {
    if (!item?.id || seen.has(item.id)) continue;
    merged.push(item);
    seen.add(item.id);
  }
  return merged;
}

function mergePostBackups(preferredFirm, fallbackFirm) {
  return {
    ...preferredFirm,
    postTabs: mergeListById(preferredFirm.postTabs, fallbackFirm.postTabs),
    posts: mergeListById(preferredFirm.posts, fallbackFirm.posts),
    postReminderKeys: [...new Set([
      ...ensureArray(preferredFirm.postReminderKeys),
      ...ensureArray(fallbackFirm.postReminderKeys),
    ])],
    postStorageFallback: preferredFirm.postStorageFallback === true || fallbackFirm.postStorageFallback === true,
  };
}

/**
 * Zapisuje stan natychmiast do localStorage,
 * a synchronizację z Firestore kolejkuje w tle (z retry).
 */
export function saveState(state) {
  const normalized = normalizeState({
    ...state,
    updatedAt: currentIso(),
  });
  const serializable = stripPostCollections(normalized);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  // Kolejkuj synchronizację z Firestore (z debounce i retry)
  scheduleFirestoreSync(serializable);
  return normalized;
}

/* ── Firestore sync ────────────────────────────────────────── */

async function loadFromFirestore() {
  try {
    await ensureFirmyAdminSession();
    const data = await getSetting(FIRESTORE_STATE_DOC);
    if (data && data.state) {
      const cloud = JSON.parse(data.state);
      return normalizeState(cloud);
    }
    return null;
  } catch (err) {
    console.warn('Nie udało się odczytać stanu z Firestore:', err);
    return null;
  }
}

/**
 * Synchronizuje dane z chmury przy starcie aplikacji.
 * Merge per-firma: dla każdej firmy porównuje updatedAt,
 * nowsza wersja wygrywa (zamiast globalnego "ostatni wygrywa").
 */
export async function syncFromCloud() {
  try {
    const cloud = await loadFromFirestore();
    if (!cloud || !cloud.updatedAt) return;

    const localRaw = localStorage.getItem(STORAGE_KEY);
    if (!localRaw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cloud));
      syncStatus.state = 'synced';
      syncStatus.lastSync = currentIso();
      notifySyncListeners();
      return;
    }

    const local = normalizeState(JSON.parse(localRaw));

    // Merge per-firma: dla każdej firmy porównaj updatedAt
    const mergedFirms = [];

    // Mapa firm z chmury
    const cloudFirmMap = new Map();
    for (const cf of cloud.firms) {
      cloudFirmMap.set(cf.id, cf);
    }

    // Mapa firm lokalnych
    const localFirmMap = new Map();
    for (const lf of local.firms) {
      localFirmMap.set(lf.id, lf);
    }

    // Wszystkie unikalne ID firm
    const allFirmIds = new Set([
      ...cloudFirmMap.keys(),
      ...localFirmMap.keys(),
    ]);

    for (const firmId of allFirmIds) {
      const cloudFirm = cloudFirmMap.get(firmId);
      const localFirm = localFirmMap.get(firmId);

      if (!cloudFirm) {
        // Firma tylko lokalnie – zachowaj
        mergedFirms.push(localFirm);
      } else if (!localFirm) {
        // Firma tylko w chmurze – dodaj
        mergedFirms.push(cloudFirm);
      } else {
        // Firma w obu – nowsza wygrywa
        const cloudTime = cloudFirm.updatedAt || '';
        const localTime = localFirm.updatedAt || '';
        const preferred = cloudTime > localTime ? cloudFirm : localFirm;
        const fallback = cloudTime > localTime ? localFirm : cloudFirm;
        mergedFirms.push(mergePostBackups(preferred, fallback));
      }
    }

    // Merge ustawień globalnych: nowsze wygrywa
    const mergedSettings = cloud.updatedAt > local.updatedAt ? cloud.settings : local.settings;
    const mergedInvoiceCounters = cloud.updatedAt > local.updatedAt ? cloud.invoiceCounters : local.invoiceCounters;
    const mergedInvoiceCounterDates = cloud.updatedAt > local.updatedAt ? cloud.invoiceCounterDates : local.invoiceCounterDates;

    const merged = {
      ...local,
      firms: mergedFirms,
      settings: mergedSettings,
      invoiceCounters: mergedInvoiceCounters,
      invoiceCounterDates: mergedInvoiceCounterDates,
      updatedAt: currentIso(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    syncStatus.state = 'synced';
    syncStatus.lastSync = currentIso();
    notifySyncListeners();
  } catch (err) {
    console.warn('syncFromCloud error:', err);
    syncStatus.state = 'error';
    syncStatus.lastError = err.message;
    notifySyncListeners();
  }
}

/**
 * Wymusza natychmiastową synchronizację (np. przed opuszczeniem strony).
 */
export async function flushSync() {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  if (pendingSave) {
    const toSave = pendingSave;
    pendingSave = null;
    await flushToFirestore(toSave);
  }
}

/* ── Firestore załączniki (chunkowane, zamiast Firebase Storage) ─ */

const ATTACHMENTS_COLLECTION = 'attachments';
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MB – całkowity limit pliku
const CHUNK_SIZE = 900 * 1024; // 900 KB base64 na chunk (bezpiecznie poniżej 1 MB limitu dokumentu Firestore)

/**
 * Konwertuje Blob na base64 string.
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // reader.result to "data:mime/type;base64,XXXXX" – wycinamy tylko base64
      const dataUrl = reader.result;
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Konwertuje base64 string na Blob.
 */
function base64ToBlob(base64, mimeType) {
  const byteChars = atob(base64);
  const byteArrays = [];
  for (let offset = 0; offset < byteChars.length; offset += 512) {
    const slice = byteChars.slice(offset, offset + 512);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    byteArrays.push(new Uint8Array(byteNumbers));
  }
  return new Blob(byteArrays, { type: mimeType });
}

export { MAX_ATTACHMENT_BYTES };

/**
 * Zapisuje załącznik w Firestore z chunkowaniem.
 * Struktura:
 *   attachments/{id}          – metadane (name, type, size, chunkCount)
 *   attachments/{id}/chunks/0 – chunk 0 (base64)
 *   attachments/{id}/chunks/1 – chunk 1 ...
 *
 * @param {Object} record - { id, blob, name, type }
 */
export async function storeAttachment(record) {
  try {
    await ensureFirmyAdminSession();
    if (record.blob.size > MAX_ATTACHMENT_BYTES) {
      throw new Error(`Plik przekracza limit ${Math.round(MAX_ATTACHMENT_BYTES / 1024)} KB.`);
    }

    const base64 = await blobToBase64(record.blob);
    const now = new Date().toISOString();

    // Podziel base64 na chunki
    const chunks = [];
    for (let i = 0; i < base64.length; i += CHUNK_SIZE) {
      chunks.push(base64.slice(i, i + CHUNK_SIZE));
    }

    console.log(`storeAttachment: ${record.name} – ${Math.round(record.blob.size / 1024)} KB, ${chunks.length} chunk(ów)`);

    // Zapis metadanych + wszystkich chunków w batchu (maks. 500 operacji)
    const batch = writeBatch(db);

    // Metadane
    const metaRef = doc(db, ATTACHMENTS_COLLECTION, record.id);
    batch.set(metaRef, {
      id: record.id,
      name: record.name || '',
      type: record.type || 'application/octet-stream',
      size: record.blob.size,
      chunkCount: chunks.length,
      createdAt: now,
    });

    // Chunki – każdy jako osobny dokument w subkolekcji
    for (let i = 0; i < chunks.length; i++) {
      const chunkRef = doc(db, ATTACHMENTS_COLLECTION, record.id, 'chunks', String(i));
      batch.set(chunkRef, { index: i, data: chunks[i] });
    }

    await batch.commit();
    return { id: record.id };
  } catch (err) {
    console.error('storeAttachment failed:', err);
    throw err;
  }
}

/**
 * Pobiera załącznik z Firestore (łączy chunki).
 * @param {string} id – identyfikator załącznika
 * @returns {Promise<{id: string, blob: Blob, name: string} | null>}
 */
export async function getAttachment(id) {
  try {
    await ensureFirmyAdminSession();

    // Pobierz metadane
    const metaSnap = await getDoc(doc(db, ATTACHMENTS_COLLECTION, id));
    if (!metaSnap.exists()) {
      console.warn('getAttachment: nie znaleziono metadanych', id);
      return null;
    }
    const meta = metaSnap.data();

    // Jeśli stary format (wszystko w jednym dokumencie – pole "data")
    if (meta.data) {
      const blob = base64ToBlob(meta.data, meta.type || 'application/octet-stream');
      return { id, blob, name: meta.name || 'zalacznik' };
    }

    // Nowy format – pobierz chunki
    const chunkCount = meta.chunkCount || 0;
    if (chunkCount === 0) {
      console.warn('getAttachment: brak chunków', id);
      return null;
    }

    const chunksCol = collection(db, ATTACHMENTS_COLLECTION, id, 'chunks');
    const chunkSnaps = await getDocs(chunksCol);

    if (chunkSnaps.empty) {
      console.warn('getAttachment: brak dokumentów chunków', id);
      return null;
    }

    // Posortuj po indeksie i połącz
    const sorted = chunkSnaps.docs
      .map((d) => d.data())
      .sort((a, b) => a.index - b.index);

    const fullBase64 = sorted.map((c) => c.data).join('');
    const blob = base64ToBlob(fullBase64, meta.type || 'application/octet-stream');
    return { id, blob, name: meta.name || 'zalacznik' };
  } catch (err) {
    console.warn('getAttachment failed:', err.message);
    return null;
  }
}

/**
 * Usuwa załącznik z Firestore (metadane + chunki).
 */
export async function deleteAttachment(id) {
  try {
    await ensureFirmyAdminSession();

    // Pobierz chunki
    const chunksCol = collection(db, ATTACHMENTS_COLLECTION, id, 'chunks');
    const chunkSnaps = await getDocs(chunksCol);

    // Batch delete: metadane + wszystkie chunki
    const batch = writeBatch(db);
    batch.delete(doc(db, ATTACHMENTS_COLLECTION, id));
    for (const d of chunkSnaps.docs) {
      batch.delete(d.ref);
    }
    await batch.commit();
  } catch (err) {
    console.warn('deleteAttachment failed:', err.message);
  }
}

// Re-eksport dla kompatybilności
export { FIRESTORE_STATE_DOC };
