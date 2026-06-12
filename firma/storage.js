import { ensureAuth, getSetting, setSetting } from './firebase.js';

const STORAGE_KEY = 'ijanicki_firma_state_v1';
const FIRESTORE_STATE_DOC = 'firmy_settings/state';
const DB_NAME = 'ijanicki-firma-files';
const DB_VERSION = 1;
const FILE_STORE = 'attachments';

function currentIso() {
  return new Date().toISOString();
}

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
  // Używaj firm.months jeśli jest tablicą (nawet pustą – użytkownik mógł usunąć wszystkie).
  // budgetEntries to stara migracja – tylko gdy months nie istnieje w ogóle.
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

  // Migracja starego address -> address1/address2
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
      // expense fields
      linkedInvoiceId: entry.linkedInvoiceId || null,
      // income fields
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

export function saveState(state) {
  const normalized = normalizeState({
    ...state,
    updatedAt: currentIso(),
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  // Fire-and-forget – zapisz do Firestore w tle
  saveToFirestore(normalized).catch((err) => {
    console.warn('Firestore save failed:', err);
  });
  return normalized;
}

/* ── Firestore sync ────────────────────────────────────────── */

async function saveToFirestore(state) {
  try {
    await ensureAuth();
    await setSetting(FIRESTORE_STATE_DOC, {
      state: JSON.stringify(state),
      updatedAt: currentIso()
    });
  } catch (err) {
    console.warn('Nie udało się zapisać stanu do Firestore:', err);
  }
}

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
 * Jeżeli dane w Firestore są nowsze – nadpisuje localStorage.
 * Wywołaj raz przy inicjalizacji (np. w przeglad.js).
 */
export async function syncFromCloud() {
  try {
    const cloud = await loadFromFirestore();
    if (!cloud || !cloud.updatedAt) return;

    const localRaw = localStorage.getItem(STORAGE_KEY);
    if (!localRaw) {
      // Brak lokalnych danych – zapisz z chmury
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cloud));
      return;
    }

    const local = JSON.parse(localRaw);
    // Użyj nowszych danych
    if (!local.updatedAt || cloud.updatedAt > local.updatedAt) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cloud));
    }
  } catch (err) {
    console.warn('syncFromCloud error:', err);
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        db.createObjectStore(FILE_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction(mode, callback) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, mode);
    const store = tx.objectStore(FILE_STORE);
    const result = callback(store);

    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };

    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function storeAttachment(record) {
  await transaction('readwrite', (store) => {
    store.put(record);
  });
}

export async function getAttachment(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILE_STORE, 'readonly');
    const store = tx.objectStore(FILE_STORE);
    const request = store.get(id);

    request.onsuccess = () => {
      db.close();
      resolve(request.result || null);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

export async function deleteAttachment(id) {
  await transaction('readwrite', (store) => {
    store.delete(id);
  });
}
