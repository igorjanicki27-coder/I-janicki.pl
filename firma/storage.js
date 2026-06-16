import { ensureAuth, getSetting, setSetting } from './firebase.js';

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
    await ensureAuth();
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
      subtractFromBudget: invoice.subtractFromBudget !== false,
      attachmentIds: ensureArray(invoice.attachmentIds),
      createdAt: invoice.createdAt || now,
    })),
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

/**
 * Zapisuje stan natychmiast do localStorage,
 * a synchronizację z Firestore kolejkuje w tle (z retry).
 */
export function saveState(state) {
  const normalized = normalizeState({
    ...state,
    updatedAt: currentIso(),
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  // Kolejkuj synchronizację z Firestore (z debounce i retry)
  scheduleFirestoreSync(normalized);
  return normalized;
}

/* ── Firestore sync ────────────────────────────────────────── */

async function loadFromFirestore() {
  try {
    await ensureAuth();
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
        mergedFirms.push(cloudTime > localTime ? cloudFirm : localFirm);
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

/* ── Firebase Storage – załączniki ─────────────────────────── */

// Lazy-load Firebase Storage (unikamy cyklicznych zależności)
let _storageModule = null;
let _storageInstance = null;

async function getStorageInstance() {
  if (_storageInstance) return _storageInstance;
  if (!_storageModule) {
    _storageModule = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js');
  }
  const { app } = await import('./firebase.js');
  _storageInstance = _storageModule.getStorage(app);
  return _storageInstance;
}

const ATTACHMENTS_PREFIX = 'attachments';

/**
 * Zapisuje załącznik w Firebase Storage.
 * @param {Object} record - { id, blob, name, type }
 */
export async function storeAttachment(record) {
  try {
    await ensureAuth();
    if (!_storageModule) {
      _storageModule = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js');
    }
    const storage = await getStorageInstance();
    const path = `${ATTACHMENTS_PREFIX}/${record.id}`;
    const fileRef = _storageModule.ref(storage, path);

    const metadata = {
      contentType: record.type || 'application/octet-stream',
      customMetadata: {
        name: record.name || '',
        uploadedAt: currentIso(),
      },
    };

    await _storageModule.uploadBytes(fileRef, record.blob, metadata);
    return { id: record.id, path };
  } catch (err) {
    console.error('storeAttachment failed:', err);
    throw err;
  }
}

/**
 * Pobiera załącznik z Firebase Storage.
 * @param {string} id – identyfikator załącznika
 * @returns {Promise<{id: string, blob: Blob, name: string} | null>}
 */
export async function getAttachment(id) {
  try {
    await ensureAuth();
    if (!_storageModule) {
      _storageModule = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js');
    }
    const storage = await getStorageInstance();
    const fileRef = _storageModule.ref(storage, `${ATTACHMENTS_PREFIX}/${id}`);

    // Pobierz URL i ściągnij przez fetch
    const url = await _storageModule.getDownloadURL(fileRef);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const blob = await response.blob();
    return { id, blob, name: id };
  } catch (err) {
    console.warn('getAttachment failed:', err.message);
    return null;
  }
}

/**
 * Usuwa załącznik z Firebase Storage.
 */
export async function deleteAttachment(id) {
  try {
    await ensureAuth();
    if (!_storageModule) {
      _storageModule = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js');
    }
    const storage = await getStorageInstance();
    const fileRef = _storageModule.ref(storage, `${ATTACHMENTS_PREFIX}/${id}`);
    await _storageModule.deleteObject(fileRef);
  } catch (err) {
    console.warn('deleteAttachment failed:', err.message);
  }
}

// Re-eksport dla kompatybilności
export { FIRESTORE_STATE_DOC };
