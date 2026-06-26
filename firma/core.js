import {
  calculateFirmLedger,
  categoryLabel,
  currentMonthKey,
  formatCurrency,
  formatDate,
  getMonthRow,
  summarizeLedgerScope,
  monthFromDate,
  monthLabel,
  payerLabel,
  roundCurrency,
  uid,
} from './logic.js?v=21';
import {
  createEmptyState,
  loadState,
  saveState,
  getSyncStatus,
  onSyncChange,
  setSyncFirm,
  flushSync,
} from './storage.js?v=25';

// --- Icons ---
export function icon(name) {
  const icons = {
    plus: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14" /></svg>',
    wallet: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm0 0V6a2 2 0 0 1 2-2h11M16 13h4" /></svg>',
    file: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Zm0 0v5h5M9 13h6M9 17h6M9 9h1" /></svg>',
    chart: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5M10 19v-8M16 19V9M22 19H2" /></svg>',
    eye: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /></svg>',
    trash: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M7 6l1 14h8l1-14M10 10v6M14 10v6" /></svg>',
    edit: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 20 4.5-1 9.5-9.5-3.5-3.5L5 15.5 4 20Zm10-12 3.5 3.5" /></svg>',
    upload: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg>',
    download: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>',
    link: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L11 4.93" /><path d="M14 11a5 5 0 0 0-7.07 0L4.81 13.12a5 5 0 0 0 7.07 7.07L13 19.07" /></svg>',
    home: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></svg>',
    arrowLeft: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>',
    lock: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>',
    firm: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3" /></svg>',
    'x-circle': '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" /></svg>',
    'rotate-ccw': '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4v6h6M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>',
    cloud: '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" /></svg>',
    'cloud-off': '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24M10.73 5.08A10.43 10.43 0 0 1 12 5c2.17 0 3.95.89 5.21 2h1.29a4.5 4.5 0 0 1 1.35 8.76M2 2l20 20" /></svg>',
    'cloud-check': '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" /><path d="m9 12 2 2 4-4" /></svg>',
    'sync-spin': '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="sync-spin"><path d="M21 12a9 9 0 1 1-6.22-8.56M21 3v6h-6" /></svg>',
  };
  return `<span class="icon">${icons[name] || icons.file}</span>`;
}

// --- Escape ---
export function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// --- State helpers ---
export function initializeState() {
  let state = loadState();
  if (!state.ui) {
    state.ui = createEmptyState().ui;
  }
  state.ui.activeTab ||= 'overview';
  state.ui.activeMonthTab ||= 'overview';
  state.ui.activeInvoiceTab ||= 'own';
  state.ui.invoiceStatusFilter ||= 'all';
  return state;
}

export function persistState(state) {
  return saveState(state);
}

export function getSelectedFirm(state) {
  if (!state.ui.selectedFirmId) return null;
  const firm = state.firms.find((item) => item.id === state.ui.selectedFirmId);
  if (!firm) {
    state.ui.selectedFirmId = null;
    return null;
  }
  return firm;
}

export function appendFirmHistory(firm, input = {}) {
  if (!firm) return;
  const amount = input.amount === undefined || input.amount === null ? null : roundCurrency(input.amount);
  const entry = {
    id: uid(),
    at: new Date().toISOString(),
    area: input.area || 'system',
    action: input.action || 'change',
    title: String(input.title || 'Zmiana').trim(),
    amount,
    meta: input.meta && typeof input.meta === 'object' ? input.meta : {},
  };
  firm.history = [entry, ...(firm.history || [])].slice(0, 120);
}

export function firmDisplayName(firm) {
  return (firm && (firm.displayName || firm.name)) || '';
}

export function safeMonthValue(state) {
  const m = state.ui.selectedMonth;
  if (m === '__all__' || m === '__year__' || m === '__quarter__') return currentMonthKey();
  return m || currentMonthKey();
}

export function ensureSelectedMonth(firm, state) {
  const ledger = calculateFirmLedger(firm);
  let selected = state.ui.selectedMonth;
  if (!selected) {
    selected = '__all__';
    state.ui.selectedMonth = selected;
  }
  if (selected !== '__all__' && selected !== '__year__' && selected !== '__quarter__') {
    if (!selected || !ledger.months.includes(selected)) {
      selected = '__all__';
      state.ui.selectedMonth = selected;
    }
  }
  return {
    ledger,
    selectedMonth: selected,
    monthRow: selected && !['__all__', '__year__', '__quarter__'].includes(selected) ? getMonthRow(ledger, selected) : null,
  };
}

export function selectFirm(state, firmId, persistFn, renderFn) {
  state.ui.selectedFirmId = firmId;
  state.ui.selectedMonth = '__all__';
  state.ui.activeMonthTab = 'overview';
  persistFn(state);
  renderFn();
}

// --- UI Components ---
export function statCard(label, value, tone = 'default', note = '') {
  return `
    <article class="stat-card stat-${tone}">
      <span class="stat-label">${label}</span>
      <strong class="stat-value">${value}</strong>
      ${note ? `<span class="stat-note">${note}</span>` : ''}
    </article>
  `;
}

export function getSettlementMeta(value) {
  const amount = roundCurrency(Math.abs(value || 0));
  if (value > 0) {
    return {
      label: 'Klient ma do zapłaty',
      shortLabel: 'Klient ma do zapłaty',
      amount,
      tone: 'rose',
      badgeClass: 'is-negative',
      textClass: 'tone-rose',
    };
  }
  if (value < 0) {
    return {
      label: 'Nadpłata klienta',
      shortLabel: 'Nadpłata klienta',
      amount,
      tone: 'emerald',
      badgeClass: 'is-positive',
      textClass: 'tone-mint',
    };
  }
  return {
    label: 'Klient rozliczony',
    shortLabel: 'Klient rozliczony',
    amount: 0,
    tone: 'default',
    badgeClass: 'is-positive',
    textClass: '',
  };
}

function countUnpaidInvoices(firm) {
  return (firm.invoices || []).filter((invoice) => invoice.status !== 'cancelled' && !invoice.paidBy).length;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function parseDateKey(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function addDaysKey(value, days) {
  const date = parseDateKey(value);
  if (!date) return value;
  date.setDate(date.getDate() + Number(days || 0));
  return dateKey(date);
}

function addMonthsKey(value, months) {
  const date = parseDateKey(value);
  if (!date) return value;
  const day = date.getDate();
  date.setMonth(date.getMonth() + Number(months || 0));
  if (date.getDate() !== day) {
    date.setDate(0);
  }
  return dateKey(date);
}

function addPostFrequencyKey(value, frequency) {
  if (frequency === 'weekly') return addDaysKey(value, 7);
  if (frequency === 'biweekly') return addDaysKey(value, 14);
  return addMonthsKey(value, 1);
}

function latestPublishedPost(firm, tabId) {
  return (firm.posts || [])
    .filter((post) => post.tabId === tabId && post.status === 'published')
    .sort((a, b) => String(b.publishDate || '').localeCompare(String(a.publishDate || '')))[0] || null;
}

function isPostTabOverdue(firm, tab) {
  if (!tab || tab.frequency === 'irregular') return false;
  const today = todayKey();
  const lastPost = latestPublishedPost(firm, tab.id);
  let dueDate = tab.startDate || today;

  if (lastPost?.publishDate && String(lastPost.publishDate) >= dueDate) {
    while (dueDate <= lastPost.publishDate) {
      dueDate = addPostFrequencyKey(dueDate, tab.frequency);
    }
  }

  return today >= dueDate;
}

function firmHasOverduePostTabs(firm) {
  return (firm.postTabs || []).some((tab) => isPostTabOverdue(firm, tab));
}

function firmContactSummary(firm) {
  const parts = [
    firm.nip ? `NIP ${firm.nip}` : '',
    firm.email || '',
    firm.phone || '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Brak danych kontaktowych';
}

// --- Modal helpers ---
let modalRoot = null;

export function setModalRoot(root) {
  modalRoot = root;
}

export function closeModal() {
  if (modalRoot) modalRoot.innerHTML = '';
}

export function openModal(title, content, { wide = false } = {}) {
  if (!modalRoot) return;
  modalRoot.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-card ${wide ? 'is-wide' : ''}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <div class="modal-head">
          <h2>${escapeHtml(title)}</h2>
          <button class="icon-button" type="button" data-action="close-modal" aria-label="Zamknij">
            <span class="close-mark">×</span>
          </button>
        </div>
        <div class="modal-body">${content}</div>
      </div>
    </div>
  `;
}

export function labeledInput({ name, label, type = 'text', value = '', placeholder = '', required = false, step = 'any', min = '', options = null }) {
  if (type === 'select') {
    return `
      <label class="field">
        <span>${label}</span>
        <select name="${name}" ${required ? 'required' : ''}>
          ${options.map((option) => `
            <option value="${option.value}" ${String(option.value) === String(value) ? 'selected' : ''}>${option.label}</option>
          `).join('')}
        </select>
      </label>
    `;
  }

  return `
    <label class="field">
      <span>${label}</span>
      <input
        type="${type}"
        name="${name}"
        value="${escapeHtml(value ?? '')}"
        placeholder="${escapeHtml(placeholder)}"
        ${required ? 'required' : ''}
        ${type === 'number' ? `step="${step}" ${min !== '' ? `min="${min}"` : ''}` : ''}
      />
    </label>
  `;
}

// Dwa osobne selecty: miesiąc (1-12) i rok (+/- 5 lat)
export function monthYearFields(prefix, value) {
  const MONTH_NAMES = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
  const [yearStr, monthStr] = value ? value.split('-') : [String(currentYear), currentMonth];
  const years = [];
  for (let y = currentYear - 5; y <= currentYear + 5; y++) years.push(y);

  return `
    <label class="field">
      <span>Miesiąc</span>
      <select name="${prefix}Month" required>
        ${MONTH_NAMES.map((name, i) => {
          const m = String(i + 1).padStart(2, '0');
          return `<option value="${m}" ${m === monthStr ? 'selected' : ''}>${name}</option>`;
        }).join('')}
      </select>
    </label>
    <label class="field">
      <span>Rok</span>
      <select name="${prefix}Year" required>
        ${years.map((y) => `<option value="${y}" ${String(y) === yearStr ? 'selected' : ''}>${y}</option>`).join('')}
      </select>
    </label>
  `;
}

// Odczytuje YYYY-MM z dwóch pól FormData
export function readMonthYear(formData, prefix) {
  const month = String(formData.get(`${prefix}Month`)).padStart(2, '0');
  const year = String(formData.get(`${prefix}Year`));
  return `${year}-${month}`;
}

export function textareaField({ name, label, value = '', placeholder = '' }) {
  return `
    <label class="field">
      <span>${label}</span>
      <textarea name="${name}" rows="4" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value || '')}</textarea>
    </label>
  `;
}

export function modalActions(primaryLabel, secondaryLabel = 'Anuluj') {
  return `
    <div class="modal-actions">
      <button class="ghost-button" type="button" data-action="close-modal">${secondaryLabel}</button>
      <button class="primary-button" type="submit">${primaryLabel}</button>
    </div>
  `;
}

// --- Sync indicator (globalny, per-firma) ---
export function renderSyncIndicator() {
  const status = getSyncStatus();
  let iconName = 'cloud';
  let title = 'Synchronizacja';
  let cssClass = 'sync-idle';

  switch (status.state) {
    case 'synced':
      iconName = 'cloud-check';
      title = 'Zsynchronizowano';
      cssClass = 'sync-synced';
      break;
    case 'saving':
      iconName = 'sync-spin';
      title = 'Zapisywanie...';
      cssClass = 'sync-saving';
      break;
    case 'error':
      iconName = 'cloud-off';
      title = `Błąd synchronizacji: ${status.lastError || 'nieznany'}`;
      cssClass = 'sync-error';
      break;
    default:
      iconName = 'cloud';
      title = 'Oczekiwanie na synchronizację';
      cssClass = 'sync-idle';
      break;
  }

  return `<span class="sync-indicator ${cssClass}" title="${title}" aria-label="${title}">${icon(iconName)}</span>`;
}

/**
 * Rejestruje live-update wskaźnika synchronizacji.
 * Wywołaj raz przy inicjalizacji strony (przeglad.js, faktury.js, portfel.js).
 */
export function initSyncIndicator() {
  // Live-update wskaźnika
  onSyncChange(() => {
    const el = document.querySelector('.sync-indicator');
    if (!el) return;
    const newHtml = renderSyncIndicator();
    // Parsuj nowy HTML i podmień tylko atrybuty + zawartość
    const temp = document.createElement('div');
    temp.innerHTML = newHtml;
    const newEl = temp.firstElementChild;
    if (!el) return;
    el.className = newEl.className;
    el.title = newEl.title;
    el.setAttribute('aria-label', newEl.getAttribute('aria-label') || '');
    el.innerHTML = newEl.innerHTML;
  });

  // Próbuj wysłać zaległe dane przed opuszczeniem strony
  window.addEventListener('beforeunload', () => {
    flushSync();
  });

  // Również przy ukryciu strony (mobile)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      flushSync();
    }
  });
}

// --- Breadcrumb ---
export function updateTopbar(state, activeTab) {
  const container = document.getElementById('topbarContent');
  if (!container) return;

  const firm = state.firms.find((item) => item.id === state.ui.selectedFirmId) || null;
  if (!firm || !state.ui.selectedFirmId) {
    container.innerHTML = `
      <div class="topbar-global-compact">
        <div class="topbar-title">
          <strong>Firma</strong>
          <span>${state.firms.length} ${state.firms.length === 1 ? 'klient' : 'klientów'}</span>
        </div>
        <div class="tab-row">
          <button class="tab-button is-active" type="button" data-action="switch-global-tab" data-tab="firms">Klienci</button>
          <button class="tab-button" type="button" data-action="switch-global-tab" data-tab="my-invoices">Moje faktury</button>
        </div>
        <button class="primary-button compact-button" type="button" data-action="add-firm">${icon('plus')}Dodaj firmę</button>
      </div>
    `;
    return;
  }

  // Ustaw ID firmy dla wskaźnika synchronizacji
  setSyncFirm(firm.id);

  const { ledger, selectedMonth } = ensureSelectedMonth(firm, state);
  const availableBalance = ledger.totals.adBalance || 0;
  const settlement = getSettlementMeta(ledger.totals.totalSettlementNet);
  const financeValue = activeTab === 'invoices' || activeTab === 'balance' || activeTab === 'compensation'
    ? activeTab
    : '';
  const hasOverduePosts = firmHasOverduePostTabs(firm);
  const firmOptions = state.firms.map((item) => `
    <option value="${item.id}" ${item.id === firm.id ? 'selected' : ''}>${escapeHtml(firmDisplayName(item) || item.name || 'Firma bez nazwy')}</option>
  `).join('');

  container.innerHTML = `
    <div class="topbar-compact">
      <div class="topbar-nav">
        <label class="firm-picker">
          <span>Klient</span>
          <select data-action="select-firm-dropdown" aria-label="Wybierz klienta">
            ${firmOptions}
          </select>
        </label>
        <div class="tab-row">
          <button class="tab-button ${activeTab === 'overview' ? 'is-active' : ''}" type="button" data-action="switch-firm-tab" data-tab="overview">Przegląd</button>
          <button class="tab-button ${activeTab === 'posts' ? 'is-active' : ''} ${hasOverduePosts ? 'has-alert' : ''}" type="button" data-action="switch-firm-tab" data-tab="posts" ${hasOverduePosts ? 'title="Są zaległe podzakładki postów"' : ''}>Posty</button>
        </div>
      </div>
      <div class="topbar-finance">
        <label class="finance-picker ${financeValue ? 'is-active' : ''}">
          <span>Finanse</span>
          <select data-action="finance-nav" aria-label="Finanse">
            <option value="" ${financeValue ? '' : 'selected'}>Finanse</option>
            <option value="invoices" ${financeValue === 'invoices' ? 'selected' : ''}>Faktury</option>
            <option value="balance" ${financeValue === 'balance' ? 'selected' : ''}>Rozrachunek</option>
            <option value="compensation" ${financeValue === 'compensation' ? 'selected' : ''}>Wynagrodzenia</option>
          </select>
        </label>
      </div>
      <div class="topbar-spacer"></div>
      <div class="topbar-metrics">
        <div class="saldo-badge ${settlement.badgeClass}">
          <span class="saldo-label">${settlement.shortLabel}</span>
          <strong class="saldo-value">${formatCurrency(settlement.amount)}</strong>
        </div>
        <div class="do-wydania-badge ${availableBalance < 0 ? 'is-negative' : 'is-positive'}">
          <span class="do-wydania-label">Reklama</span>
          <strong class="do-wydania-value">${formatCurrency(availableBalance)}</strong>
        </div>
      </div>
      <div class="topbar-controls">
        ${renderSyncIndicator()}
        ${ledger.rows.length > 0 ? `
        <div class="month-picker">
          <select data-action="select-month-dropdown" aria-label="Wybierz miesiąc">
            <option value="__all__" ${selectedMonth === '__all__' ? 'selected' : ''}>Razem</option>
            <option value="__year__" ${selectedMonth === '__year__' ? 'selected' : ''}>Ten rok</option>
            <option value="__quarter__" ${selectedMonth === '__quarter__' ? 'selected' : ''}>Ten kwartał</option>
            <option disabled class="month-separator">───</option>
            ${ledger.rows.map((row) => `
              <option value="${row.month}" ${row.month === selectedMonth ? 'selected' : ''}>
                ${row.label}
              </option>
            `).join('')}
            <option disabled class="month-separator">───</option>
          </select>
        </div>
      ` : ''}
      </div>
    </div>
  `;
}

// --- Firm List (shared by przeglad and other pages) ---
export function renderFirmList(state) {
  const totalUnpaid = state.firms.reduce((acc, firm) => acc + countUnpaidInvoices(firm), 0);
  return `
    <div class="firm-list-page">
      <div class="list-page-head">
        <div>
          <h1>Klienci</h1>
          <p class="list-page-lead">Wybierz klienta, żeby przejść do budżetów, faktur, rozrachunku i postów.</p>
        </div>
        <div class="list-summary">
          <span><strong>${state.firms.length}</strong> klientów</span>
          <span>${totalUnpaid > 0 ? `<strong>${totalUnpaid}</strong> faktur do opłacenia` : 'Brak zaległych faktur'}</span>
        </div>
      </div>

      ${state.firms.length === 0 ? `
        <div class="empty-block">
          <p>Dodaj pierwszą firmę i zacznij od miesiąca, salda albo faktury.</p>
          <button class="primary-button" type="button" data-action="add-firm">Dodaj firmę</button>
        </div>
      ` : `
        <div class="firm-grid">
          ${state.firms.map((firm) => {
            const ledger = calculateFirmLedger(firm);
            const settlement = getSettlementMeta(ledger.totals.totalSettlementNet);
            const unpaidCount = countUnpaidInvoices(firm);
            const latestMonth = ledger.rows[0]?.label || 'Brak miesięcy';
            return `
            <div class="firm-card tile-card" data-action="select-firm" data-id="${firm.id}" tabindex="0" role="button">
              <div class="tile-card-top">
                <div class="firm-title-group">
                  <span class="firm-title">${escapeHtml(firmDisplayName(firm))}</span>
                  ${firm.notes ? `<span class="firm-notes">${escapeHtml(firm.notes)}</span>` : ''}
                </div>
                <span class="firm-card-actions">
                  <button class="icon-button" type="button" data-action="edit-firm-from-list" data-id="${firm.id}" aria-label="Edytuj">
                    ${icon('edit')}
                  </button>
                  <button class="icon-button tone-danger" type="button" data-action="delete-firm-from-list" data-id="${firm.id}" aria-label="Usuń">
                    ${icon('trash')}
                  </button>
                </span>
              </div>
              <div class="firm-contact-line">
                <span>${escapeHtml(firmContactSummary(firm))}</span>
              </div>
              <div class="firm-card-metrics">
                <span><strong>${ledger.rows.length}</strong> okresów</span>
                <span>${unpaidCount > 0 ? `<strong>${unpaidCount}</strong> faktur do opłacenia` : 'Brak zaległych faktur'}</span>
                <span>${escapeHtml(latestMonth)}</span>
              </div>
              <div class="tile-card-balance ${settlement.badgeClass}">
                <span class="balance-label">${settlement.shortLabel}</span>
                <strong class="balance-value">${formatCurrency(settlement.amount)}</strong>
              </div>
            </div>
          `}).join('')}
        </div>
      `}

      <button class="fab-button" type="button" data-action="add-firm" aria-label="Dodaj firmę">
        ${icon('plus')}
      </button>
    </div>
  `;
}

// --- FAB Menu (direct action, no dropdown) ---
export function renderFabMenu(directAction) {
  return `
    <div class="fab-container">
      <button class="fab-button" type="button" data-action="${directAction}" aria-label="Dodaj">
        ${icon('plus')}
      </button>
    </div>
  `;
}

// --- Toolbar (tabs + saldo, used in firm detail) ---


// --- Category summary ---
export function getCategorySummary(expenses) {
  const map = new Map();
  for (const expense of expenses) {
    const key = expense.category || 'inne';
    map.set(key, roundCurrency((map.get(key) || 0) + Number(expense.amount || 0)));
  }
  return [...map.entries()]
    .map(([key, amount]) => ({ key, label: categoryLabel(key), amount }))
    .sort((a, b) => b.amount - a.amount);
}

// --- Navigate to subpage preserving firm context ---
export function navigateTo(page, state) {
  if (state.ui.selectedFirmId) {
    sessionStorage.setItem('ijanicki_firma_activeFirm', state.ui.selectedFirmId);
    sessionStorage.setItem('ijanicki_firma_activeMonth', state.ui.selectedMonth || '');
    sessionStorage.setItem('ijanicki_firma_activeTab', state.ui.activeTab || 'overview');
  }
  window.location.href = page;
}

// --- Restore firm context from sessionStorage ---
export function restoreContext(state) {
  const firmId = sessionStorage.getItem('ijanicki_firma_activeFirm');
  const month = sessionStorage.getItem('ijanicki_firma_activeMonth');
  const tab = sessionStorage.getItem('ijanicki_firma_activeTab');
  if (firmId && state.firms.some(f => f.id === firmId)) {
    state.ui.selectedFirmId = firmId;
    state.ui.selectedMonth = month || null;
    state.ui.activeTab = tab || 'overview';
  }
}

// --- Edit month (2-step modal from dropdown) ---
export function findMonthConfig(state, month) {
  return getSelectedFirm(state)?.months.find((item) => item.month === month) || null;
}

/**
 * 2-krokowy modal edycji miesiaca wywolywany z dropdowna ("Edytuj miesiac...").
 * Krok 1: wybor miesiaca z listy.
 * Krok 2: formularz edycji wybranego miesiaca.
 */
export function openEditMonthPicker(state, renderFn) {
  const firm = getSelectedFirm(state);
  if (!firm) return;

  const rows = calculateFirmLedger(firm).rows;

  if (rows.length === 0) {
    openModal('Edytuj miesiac', '<p class="empty-msg">Brak miesiecy do edycji.</p>');
    return;
  }

  const monthRows = rows.map((r) => `
    <div class="month-edit-row" data-action="select-edit-month" data-month="${r.month}">
      <span class="month-edit-label">${r.label}</span>
      <button class="mini-button" type="button">Edytuj</button>
    </div>
  `).join('');

  openModal('Edytuj miesiac', `
    <div class="edit-month-step1">
      <p class="eyebrow">Krok 1 z 2</p>
      <h3>Wybierz miesiac do edycji</h3>
      <div class="month-edit-list">${monthRows}</div>
    </div>
  `);

  // Delegacja klikniecia na wierszach listy miesiecy
  const body = document.querySelector('.modal-body');
  if (!body) return;
  body.addEventListener('click', function stepHandler(e) {
    const row = e.target.closest('[data-action="select-edit-month"]');
    if (!row) return;
    body.removeEventListener('click', stepHandler);
    showMonthEditStep2(state, row.dataset.month, renderFn);
  });
}

/** Krok 2 – formularz edycji wybranego miesiaca */
function showMonthEditStep2(state, month, renderFn) {
  const firm = getSelectedFirm(state);
  if (!firm) return;
  const existing = findMonthConfig(state, month);
  if (!existing) return;

  const formContent = `
    <div class="edit-month-step2">
      <p class="eyebrow">Krok 2 z 2</p>
      <h3>Edytuj: ${monthLabel(month)}</h3>
      <form id="monthForm" class="form-grid">
        <div class="form-row">
          ${monthYearFields('month', existing.month)}
          ${labeledInput({ name: 'budget', label: 'Budżet reklamowy', type: 'number', value: existing.budget ?? '', min: '0', required: true })}
        </div>
        <div class="modal-actions is-split">
          <button class="ghost-button tone-danger" type="button" data-action="delete-month-from-modal" data-month="${month}">Usun miesiac</button>
          <div class="modal-actions-group">
            <button class="ghost-button" type="button" data-action="close-modal">Anuluj</button>
            <button class="primary-button" type="submit">Zapisz miesiac</button>
          </div>
        </div>
      </form>
    </div>
  `;

  const modalBody = document.querySelector('.modal-body');
  if (!modalBody) return;
  modalBody.innerHTML = formContent;

  const form = document.getElementById('monthForm');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const monthVal = readMonthYear(data, 'month');

    // Blokada duplikatow (przy zmianie miesiaca na inny)
    if (monthVal !== month && firm.months.some(m => m.month === monthVal && m.id !== existing.id)) {
      alert('Ten miesiac juz istnieje.');
      return;
    }

    const monthEntry = {
      id: existing.id || uid(),
      month: monthVal,
      budget: roundCurrency(data.get('budget')),
      compensationPercent: existing.compensationPercent ?? 0,
      updatedAt: new Date().toISOString(),
    };

    firm.months = [
      ...firm.months.filter((item) => item.month !== monthVal && item.id !== monthEntry.id),
      monthEntry,
    ].sort((a, b) => a.month.localeCompare(b.month));
    firm.updatedAt = new Date().toISOString();
    state.ui.selectedMonth = monthVal;
    state.ui.activeMonthTab = 'overview';
    persistState(state);
    // Aktualizuj sessionStorage, aby odswiezenie strony nie cofnęło zmiany
    if (state.ui.selectedFirmId) {
      sessionStorage.setItem('ijanicki_firma_activeFirm', state.ui.selectedFirmId);
      sessionStorage.setItem('ijanicki_firma_activeMonth', state.ui.selectedMonth || '');
      sessionStorage.setItem('ijanicki_firma_activeTab', state.ui.activeTab || 'overview');
    }
    closeModal();
    renderFn();
  });
}
