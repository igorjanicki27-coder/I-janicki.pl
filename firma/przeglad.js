import {
  calculateFirmLedger,
  categoryLabel,
  currentMonthKey,
  EXPENSE_CATEGORIES,
  formatCurrency,
  formatDate,
  getInvoiceMonthKey,
  getMonthFinancialEntries,
  getMonthRow,
  getWalletEntryMonth,
  summarizeLedgerScope,
  monthFromDate,
  monthLabel,
  PAYER_OPTIONS,
  payerLabel,
  roundCurrency,
  uid,
  VAT_OPTIONS,
  addDays,
} from './logic.js?v=21';
import {
  deleteAttachment,
  getAttachment,
  loadState,
  syncFromCloud,
  flushSync,
} from './storage.js?v=25';
import {
  deletePost as deletePostDoc,
  deletePostTab as deletePostTabDoc,
  loadFirmPostCollections,
  savePost as savePostDoc,
  savePosts as savePostDocs,
  savePostTab as savePostTabDoc,
  savePostTabs as savePostTabDocs,
} from './post-storage.js?v=6';
import {
  icon,
  escapeHtml,
  firmDisplayName,
  statCard,
  getSettlementMeta,
  initializeState,
  persistState,
  getSelectedFirm,
  safeMonthValue,
  ensureSelectedMonth,
  setModalRoot,
  closeModal,
  openModal,
  labeledInput,
  monthYearFields,
  readMonthYear,
  textareaField,
  modalActions,
  updateTopbar,
  renderFirmList,
  renderFabMenu,
  navigateTo,
  restoreContext,
  initSyncIndicator,
  appendFirmHistory,
} from './core.js?v=31';
import { openInvoicePreview } from './invoice.js?v=26';

// --- State ---
let state = initializeState();
const shouldRestoreFirmContext = shouldRestoreOverviewContext();
applyOverviewEntryContext(state);
if (!['overview', 'posts', 'compensation'].includes(state.ui.activeTab)) {
  state.ui.activeTab = 'overview';
}
// Gdy nie ma wybranej firmy, zawsze pokazuj liste firm (nigdy 'Moje faktury')
if (!state.ui.selectedFirmId) {
  state.ui.activeGlobalTab = 'firms';
} else {
  state.ui.activeGlobalTab ||= 'firms';
}

const root = document.getElementById('app');
const modalRoot = document.getElementById('modalRoot');
setModalRoot(modalRoot);
let postSearchTimer = null;
const postCollectionStatus = new Map();
const DISMISSED_SIMILAR_ALERTS_STORAGE_KEY = 'ijanicki_firma_dismissed_similar_alerts';

function shouldRestoreOverviewContext() {
  const navEntry = performance.getEntriesByType('navigation')[0];
  if (navEntry?.type === 'reload') {
    return Boolean(sessionStorage.getItem('ijanicki_firma_activeFirm'));
  }

  if (!document.referrer) return false;

  try {
    const referrer = new URL(document.referrer);
    if (referrer.origin !== window.location.origin) return false;
    return /\/firma\/(faktury|portfel)\.html$/.test(referrer.pathname);
  } catch (_) {
    return false;
  }
}

function applyOverviewEntryContext(nextState) {
  if (shouldRestoreFirmContext) {
    restoreContext(nextState);
    return;
  }

  sessionStorage.removeItem('ijanicki_firma_activeFirm');
  sessionStorage.removeItem('ijanicki_firma_activeMonth');
  sessionStorage.removeItem('ijanicki_firma_activeTab');
  nextState.ui.selectedFirmId = null;
  nextState.ui.selectedMonth = '__all__';
  nextState.ui.activeTab = 'overview';
  nextState.ui.activeGlobalTab = 'firms';
}

// Back button — clear firm context and reload to show firm list
document.querySelector('.back-to-company')?.addEventListener('click', () => {
  sessionStorage.removeItem('ijanicki_firma_activeFirm');
  sessionStorage.removeItem('ijanicki_firma_activeMonth');
  sessionStorage.removeItem('ijanicki_firma_activeTab');
  state.ui.selectedFirmId = null;
  state.ui.activeGlobalTab = 'firms';
  persistState(state);
  window.location.reload();
});

function persist() {
  state = persistState(state);
  // Sync context to sessionStorage for other pages
  sessionStorage.setItem('ijanicki_firma_activeFirm', state.ui.selectedFirmId || '');
  sessionStorage.setItem('ijanicki_firma_activeMonth', state.ui.selectedMonth || '');
  sessionStorage.setItem('ijanicki_firma_activeTab', state.ui.activeTab || 'overview');
}

function persistAndFlush() {
  persist();
  void flushSync();
}

function isPostPermissionError(error) {
  return String(error?.code || '').includes('permission-denied')
    || String(error?.message || '').toLowerCase().includes('permission')
    || String(error?.message || '').includes('Missing or insufficient permissions');
}

async function tryPostCloudWrite(firm, operation, label) {
  if (!firm?.id || firm.postStorageFallback) return false;
  try {
    await operation();
    return true;
  } catch (error) {
    if (!isPostPermissionError(error)) throw error;
    console.warn(`${label || 'Zapis postów'}: brak uprawnień do Firestore, zapisuję lokalnie.`, error);
    firm.postStorageFallback = true;
    postCollectionStatus.set(firm.id, 'error');
    return false;
  }
}

// --- Modal helpers ---
function findMonthConfig(month) {
  return getSelectedFirm(state)?.months.find((item) => item.month === month) || null;
}

function generateMonthOptions(firm, excludeMonth) {
  var now = new Date();
  var start = new Date(now.getFullYear() - 2, 0, 1);
  var end = new Date(now.getFullYear() + 1, 11, 1);
  var used = new Set((firm?.months || []).map(function(m) { return m.month; }));
  var result = [];
  for (var d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
    var key = d.toISOString().slice(0, 7);
    if (key === excludeMonth || !used.has(key)) {
      result.push({ value: key, label: monthLabel(key) });
    }
  }
  if (excludeMonth && !result.some(function(o) { return o.value === excludeMonth; })) {
    result.push({ value: excludeMonth, label: monthLabel(excludeMonth) });
  }
  result.sort(function(a, b) { return b.value.localeCompare(a.value); });
  return result;
}

function firmMonthsOptions(firm) {
  var months = [...(firm?.months || [])].sort(function(a, b) { return b.month.localeCompare(a.month); });
  return months.map(function(m) { return { value: m.month, label: monthLabel(m.month) }; });
}

function findBalanceEntry(id) {
  return getSelectedFirm(state)?.balanceEntries.find((item) => item.id === id) || null;
}

function findAdBudgetEntry(id) {
  return getSelectedFirm(state)?.adBudgetEntries?.find((item) => item.id === id) || null;
}

function findCompensationEntry(id) {
  return getSelectedFirm(state)?.compensationEntries?.find((item) => item.id === id) || null;
}

function ensureFirmPostCollectionsLoaded(firm) {
  if (!firm?.id) return false;
  const status = postCollectionStatus.get(firm.id);
  if (status === 'loaded') return true;
  if (status === 'loading') return false;
  if (status === 'error') return true;

  postCollectionStatus.set(firm.id, 'loading');
  loadFirmPostCollections(firm)
    .then(({ tabs, posts, fallback }) => {
      firm.postTabs = tabs;
      firm.posts = posts;
      firm.postReminderKeys = [];
      postCollectionStatus.set(firm.id, 'loaded');
      if (fallback) {
        firm.postStorageFallback = true;
      } else {
        delete firm.postStorageFallback;
      }
      persistAndFlush();
      render();
    })
    .catch((error) => {
      console.error('Nie udało się wczytać postów z Firestore:', error);
      firm.postTabs = (firm.postTabs || []).length ? firm.postTabs : [
        { id: 'google-posts', name: 'Wpisy Google', frequency: 'monthly', startDate: todayKey(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: 'google-articles', name: 'Artykuly w Google', frequency: 'monthly', startDate: todayKey(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: 'social-media', name: 'Media spolecznosciowe', frequency: 'weekly', startDate: todayKey(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ];
      firm.posts = firm.posts || [];
      firm.postStorageFallback = true;
      postCollectionStatus.set(firm.id, 'error');
      render();
    });
  return false;
}

const POST_FREQUENCY_OPTIONS = [
  { value: 'weekly', label: 'Raz w tygodniu' },
  { value: 'biweekly', label: 'Raz na 2 tygodnie' },
  { value: 'monthly', label: 'Raz w miesiacu' },
  { value: 'irregular', label: 'Nieregularnie' },
];

const POST_STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Zaplanowane' },
  { value: 'published', label: 'Opublikowane' },
];

const XLSX_CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function parseDateKey(value) {
  if (!value) return null;
  const date = new Date(String(value) + 'T00:00:00');
  return isNaN(date.getTime()) ? null : date;
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function addMonthsKey(value, months) {
  const date = parseDateKey(value);
  if (!date) return value;
  const day = date.getDate();
  date.setMonth(date.getMonth() + months);
  if (date.getDate() !== day) {
    date.setDate(0);
  }
  return dateKey(date);
}

function addFrequencyKey(value, frequency) {
  if (frequency === 'weekly') return addDays(value, 7);
  if (frequency === 'biweekly') return addDays(value, 14);
  return addMonthsKey(value, 1);
}

function postFrequencyLabel(value) {
  return POST_FREQUENCY_OPTIONS.find((item) => item.value === value)?.label || 'Raz w miesiacu';
}

function isIrregularPostTab(tab) {
  return tab?.frequency === 'irregular';
}

function ensurePostTabSelection(firm) {
  const tabs = firm.postTabs || [];
  if (!tabs.length) {
    state.ui.activePostTabId = null;
    return null;
  }
  if (!state.ui.activePostTabId || !tabs.some((tab) => tab.id === state.ui.activePostTabId)) {
    state.ui.activePostTabId = tabs[0].id;
  }
  return state.ui.activePostTabId;
}

function postsForTab(firm, tabId) {
  return (firm.posts || [])
    .filter((post) => post.tabId === tabId)
    .sort((a, b) => {
      const statusWeight = (post) => post.status === 'scheduled' ? 0 : 1;
      const statusDiff = statusWeight(a) - statusWeight(b);
      if (statusDiff !== 0) return statusDiff;
      return String(b.publishDate || '').localeCompare(String(a.publishDate || ''));
    });
}

function latestPublishedPost(firm, tabId) {
  return postsForTab(firm, tabId)
    .filter((post) => post.status === 'published')
    .sort((a, b) => String(b.publishDate || '').localeCompare(String(a.publishDate || '')))[0] || null;
}

function daysBetween(fromKey, toKey) {
  const from = parseDateKey(fromKey);
  const to = parseDateKey(toKey);
  if (!from || !to) return null;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86400000));
}

function getPostTabStatus(firm, tab) {
  const startDate = tab.startDate || todayKey();
  const lastPost = latestPublishedPost(firm, tab.id);
  const today = todayKey();
  if (isIrregularPostTab(tab)) {
    return {
      dueDate: null,
      isOverdue: false,
      lastPost,
      daysSinceLast: lastPost ? daysBetween(lastPost.publishDate, today) : null,
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
    daysSinceLast: lastPost ? daysBetween(lastPost.publishDate, today) : null,
  };
}

function splitKeywords(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function postKeywordText(post) {
  return Array.isArray(post.keywords) ? post.keywords.join(', ') : String(post.keywords || '');
}

function normalizePostLink(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function safePostLink(value) {
  const normalized = normalizePostLink(value);
  if (!normalized) return '';
  try {
    const url = new URL(normalized);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function postLinkLabel(value) {
  try {
    const url = new URL(normalizePostLink(value));
    const path = url.pathname && url.pathname !== '/' ? url.pathname : '';
    return `${url.hostname.replace(/^www\./, '')}${path}`;
  } catch {
    return String(value || '').trim();
  }
}

function normalizeTopicText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

function findSimilarPosts(firm, draft, excludeId = null) {
  const draftTokens = new Set(normalizeTopicText(`${draft.title || ''} ${postKeywordText(draft)}`));
  if (!draftTokens.size) return [];

  return (firm.posts || [])
    .filter((post) => post.id !== excludeId)
    .map((post) => {
      const tokens = new Set(normalizeTopicText(`${post.title || ''} ${postKeywordText(post)}`));
      const common = [...draftTokens].filter((token) => tokens.has(token)).length;
      const score = common / Math.max(1, Math.min(draftTokens.size, tokens.size));
      return { post, score, common };
    })
    .filter((item) => item.common >= 2 || item.score >= 0.45)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function getSimilarAlertKey(post, similar) {
  const similarSignature = similar
    .map((item) => `${item.post.id || ''}:${item.post.title || ''}`)
    .sort()
    .join('|');
  return `${post.id || ''}::${similarSignature}`;
}

function getDismissedSimilarAlerts() {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_SIMILAR_ALERTS_STORAGE_KEY) || '{}') || {};
  } catch (_) {
    return {};
  }
}

function isSimilarAlertDismissed(post, similar) {
  const key = getSimilarAlertKey(post, similar);
  return Boolean(getDismissedSimilarAlerts()[key]);
}

function dismissSimilarAlert(key) {
  if (!key) return;
  const dismissed = getDismissedSimilarAlerts();
  dismissed[key] = true;
  try {
    localStorage.setItem(DISMISSED_SIMILAR_ALERTS_STORAGE_KEY, JSON.stringify(dismissed));
  } catch (_) {
    // Prefer leaving the UI responsive over failing because local storage is unavailable.
  }
}

// ---------------------------------------------------------------------------
// period filter helper
// ---------------------------------------------------------------------------

function walletTotalForPeriod(firm, selectedMonth) {
  var entries = [...(firm.walletEntries || [])].filter(function(e) { return e.type === 'income'; });
  var filtered = entries.filter(function(entry) {
    if (selectedMonth === '__all__' || !selectedMonth) return true;
    var p = entry.period || entry.date;
    if (!p) return true;
    var year = String(new Date().getFullYear());
    if (selectedMonth === '__year__') {
      return p.startsWith(year);
    }
    if (selectedMonth === '__quarter__') {
      var now = new Date();
      var q = Math.floor(now.getMonth() / 3);
      var m1 = year + '-' + String(q * 3 + 1).padStart(2, '0');
      var m2 = year + '-' + String(q * 3 + 2).padStart(2, '0');
      var m3 = year + '-' + String(q * 3 + 3).padStart(2, '0');
      return p.startsWith(m1) || p.startsWith(m2) || p.startsWith(m3);
    }
    return p.startsWith(selectedMonth);
  });
  return roundCurrency(filtered.reduce(function(acc, e) { return acc + e.amount; }, 0));
}

// --- Global helpers ---
function findInvoiceGlobal(invoiceId, firmId) {
  const f = state.firms.find(function(x) { return x.id === firmId; });
  if (!f) return null;
  const inv = f.invoices.find(function(x) { return x.id === invoiceId; });
  if (!inv) return null;
  return { invoice: inv, firm: f };
}

async function openAttachmentById(id) {
  const attachment = await getAttachment(id);
  if (!attachment || !attachment.blob) {
    window.alert('Nie udalo sie odczytac pliku.');
    return;
  }
  const url = URL.createObjectURL(attachment.blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(function() { URL.revokeObjectURL(url); }, 60000);
}

function openInvoiceDetailModal(invoice, firm) {
  const items = invoice.items || [];
  const kindLabel = invoice.kind === 'own' ? 'Wlasna' : 'Zewnetrzna';
  const paidLabel = invoice.paidBy === 'me' ? 'Oplacilem ja' : invoice.paidBy === 'client' ? 'Oplacil klient' : 'Nieoplacona';
  const itemsHtml = items.length === 0
    ? '<p style="text-align:center;color:var(--text-dim);padding:12px">Brak pozycji.</p>'
    : '<table class="data-table" style="margin:0">' +
        '<thead><tr>' +
          '<th style="width:40px">Lp.</th>' +
          '<th>Opis</th>' +
          '<th style="width:80px;text-align:right">Ilosc</th>' +
          '<th style="width:120px;text-align:right">Cena</th>' +
          '<th style="width:120px;text-align:right">Wartosc</th>' +
        '</tr></thead>' +
        '<tbody>' +
          items.map(function(item, i) {
            return '<tr>' +
              '<td>' + (i + 1) + '</td>' +
              '<td>' + escapeHtml(item.description || '-') + '</td>' +
              '<td style="text-align:right">' + (item.quantity || 1) + '</td>' +
              '<td style="text-align:right">' + formatCurrency(item.unitPrice) + '</td>' +
              '<td style="text-align:right">' + formatCurrency((item.unitPrice || 0) * (item.quantity || 1)) + '</td>' +
            '</tr>';
          }).join('') +
        '</tbody>' +
        '<tfoot style="border-top:2px solid var(--border);">' +
          '<tr>' +
            '<td colspan="4" style="text-align:right;font-weight:700">RAZEM:</td>' +
            '<td style="text-align:right;font-weight:700">' + formatCurrency(invoice.amount) + '</td>' +
          '</tr>' +
        '</tfoot>' +
      '</table>';

  const html = '<div style="display:flex;flex-direction:column;gap:12px">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">' +
      '<div>' +
        '<strong>' + escapeHtml(invoice.number || '-') + '</strong>' +
        '<span class="kind-badge kind-' + invoice.kind + '" style="margin-left:8px">' + kindLabel + '</span>' +
      '</div>' +
      '<div style="font-size:13px;color:var(--text-dim)">' +
        escapeHtml(invoice.title || '') +
        (invoice.kind === 'external' && invoice.vendor ? ' &middot; ' + escapeHtml(invoice.vendor) : '') +
      '</div>' +
      '<div style="font-size:13px;color:var(--text-dim)">' +
        formatDate(invoice.issueDate) + ' &middot; ' + paidLabel + ' &middot; Firma: ' + escapeHtml(firmDisplayName(firm)) +
      '</div>' +
    '</div>' +
    itemsHtml +
    (invoice.notes ? '<div style="border-top:1px solid var(--border);padding-top:8px;font-size:13px;color:var(--text-dim)"><strong>Notatki:</strong> ' + escapeHtml(invoice.notes) + '</div>' : '') +
  '</div>';
  openModal('Szczegoly faktury — ' + (invoice.number || '-'), html, { wide: true });
}

function renderAllOwnInvoices() {
  // Zbierz wszystkie faktury wlasne ze wszystkich firm
  var allOwn = [];
  for (var fi = 0; fi < state.firms.length; fi++) {
    var f = state.firms[fi];
    for (var ii = 0; ii < f.invoices.length; ii++) {
      var inv = f.invoices[ii];
      if (inv.kind === 'own' && inv.status !== 'cancelled') {
        allOwn.push({ invoice: inv, firm: f });
      }
    }
  }
  allOwn.sort(function(a, b) { return (b.invoice.issueDate || '').localeCompare(a.invoice.issueDate || ''); });

  return '<div class="firm-list-page">' +
    '<div class="list-page-head">' +
      '<div>' +
        '<p class="eyebrow">Moje faktury</p>' +
        '<h1>Wszystkie faktury wlasne</h1>' +
      '</div>' +
      '<div style="font-size:13px;color:var(--text-dim)">' +
        'Lacznie: <strong>' + allOwn.length + '</strong> faktur z <strong>' + new Set(allOwn.map(function(x) { return x.firm.id; })).size + '</strong> firm' +
      '</div>' +
    '</div>' +
    (allOwn.length === 0 ?
      '<div class="empty-block"><p>Brak faktur wlasnych. Dodaj pierwsza firme i wystaw fakture.</p></div>' :
      '<div class="table-wrap">' +
        '<table class="data-table invoice-table">' +
          '<thead><tr>' +
            '<th class="col-lp">Lp.</th>' +
            '<th class="col-date">Data</th>' +
            '<th class="col-title">Tytul</th>' +
            '<th class="col-number">Nr FV</th>' +
            '<th class="col-amount">Kwota</th>' +
            '<th>Firma</th>' +
            '<th class="col-kind">Status</th>' +
            '<th class="col-actions">Akcje</th>' +
          '</tr></thead>' +
          '<tbody>' +
            allOwn.map(function(item, i) {
              var paid = item.invoice.paidBy === 'me' || item.invoice.paidBy === 'client';
              var statusLabel = paid ? (item.invoice.paidBy === 'me' ? 'Oplacona' : 'Oplac. klient') : 'Nieoplacona';
              var statusTone = paid ? 'tone-mint' : 'tone-amber';
              return '<tr>' +
                '<td class="col-lp">' + (i + 1) + '</td>' +
                '<td class="col-date">' + formatDate(item.invoice.issueDate) + '</td>' +
                '<td class="col-title"><strong>' + escapeHtml(item.invoice.title || '-') + '</strong></td>' +
                '<td class="col-number">' + escapeHtml(item.invoice.number || '-') + '</td>' +
                '<td class="col-amount">' + formatCurrency(item.invoice.amount) + '</td>' +
                '<td>' + escapeHtml(firmDisplayName(item.firm)) + '</td>' +
                '<td class="col-kind"><span class="' + statusTone + '">' + statusLabel + '</span></td>' +
                '<td class="col-actions">' +
                  '<div class="actions-dropdown">' +
                    '<button class="mini-button actions-toggle" type="button" data-action="toggle-global-actions" data-inv="' + item.invoice.id + '" data-firm="' + item.firm.id + '" title="Akcje">⋯</button>' +
                    '<div class="actions-menu" data-global-actions-menu="' + item.invoice.id + '">' +
                      '<button class="table-action-btn" type="button" data-action="preview-global-invoice" data-inv="' + item.invoice.id + '" data-firm="' + item.firm.id + '" title="Podglad faktury">' + icon('eye') + ' Podglad</button>' +
                      '<button class="table-action-btn" type="button" data-action="view-global-invoice" data-inv="' + item.invoice.id + '" data-firm="' + item.firm.id + '" title="Szczegoly">' + icon('file') + ' Szczegoly</button>' +
                      (item.invoice.attachmentIds && item.invoice.attachmentIds.length ? '<button class="table-action-btn" type="button" data-action="download-global-attachment" data-inv="' + item.invoice.id + '" data-firm="' + item.firm.id + '" title="Pobierz">' + icon('download') + ' Pobierz</button>' : '') +
                    '</div>' +
                  '</div>' +
                '</td>' +
              '</tr>';
            }).join('') +
          '</tbody>' +
        '</table>' +
      '</div>') +
    '</div>';
}

// --- Rendering ---
function renderMonthList(ledger, selectedMonth) {
  return `
    <div class="table-wrap responsive-table-wrap">
      <table class="data-table responsive-table">
        <thead>
          <tr>
            <th>Miesiąc</th>
            <th>Budżet reklamowy</th>
            <th>Wydatki reklamowe</th>
            <th>Saldo reklamy</th>
            <th>Koszty moje</th>
            <th>Wynagrodzenia</th>
            <th>Wpłaty</th>
            <th>Rozrachunek</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${ledger.rows.map((row) => {
            const settlement = getSettlementMeta(row.settlementNetChange);
            return `
            <tr class="${row.month === selectedMonth ? 'is-current-row' : ''}">
              <td data-label="Miesiąc">
                <button class="row-link strong-link" type="button" data-action="select-month" data-month="${row.month}">
                  ${row.label}
                </button>
              </td>
              <td data-label="Budżet reklamowy">${formatCurrency(row.budget)}</td>
              <td data-label="Wydatki reklamowe">${formatCurrency(row.expensesTotal)}</td>
              <td data-label="Saldo reklamy">
                <span class="${row.expensesTotal > row.budget ? 'tone-amber' : 'tone-mint'}">${formatCurrency(roundCurrency((row.budget || 0) - (row.expensesTotal || 0)))}</span>
                <span class="table-subline">Nie jest rozrachunkiem klienta</span>
              </td>
              <td data-label="Koszty moje">${formatCurrency(row.ownPaidExpenses || 0)}</td>
              <td data-label="Wynagrodzenia">${formatCurrency(row.compensation || 0)}</td>
              <td data-label="Wpłaty">${formatCurrency(row.paymentsReceived || 0)}</td>
              <td data-label="Rozrachunek">
                <div class="settlement-cell">
                  <strong class="${settlement.textClass}">${settlement.shortLabel}</strong>
                  <span class="table-subline">${formatCurrency(settlement.amount)}</span>
                  <span class="table-subline">Koszty moje ${formatCurrency(row.ownPaidExpenses || 0)} + wynagrodzenia ${formatCurrency(row.compensation || 0)} - wpłaty ${formatCurrency(row.paymentsReceived || 0)}</span>
                </div>
              </td>
              <td data-label="Akcje" class="table-actions">
                <button class="mini-button" type="button" data-action="edit-month" data-month="${row.month}">${icon('edit')}</button>
                <button class="mini-button tone-danger" type="button" data-action="delete-month" data-month="${row.month}">${icon('trash')}</button>
              </td>
            </tr>
          `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderOverviewHero({ eyebrow, title, settlement, adBalance, budget, expenses, payments }) {
  const adIsNegative = adBalance < 0;
  return `
    <section class="overview-hero">
      <div class="overview-hero-main overview-hero-main-${settlement.tone}">
        <p class="eyebrow">${escapeHtml(eyebrow)}</p>
        <h3>${escapeHtml(title)}</h3>
        <div class="overview-hero-grid">
          <article class="overview-focus-card focus-${settlement.tone}">
            <span class="overview-focus-label">${settlement.label}</span>
            <strong class="overview-focus-value">${formatCurrency(settlement.amount)}</strong>
            <span class="overview-focus-note">Liczone z faktur, kosztów opłaconych przeze mnie, ręcznych wynagrodzeń i wpłat klienta.</span>
          </article>
          <article class="overview-focus-card focus-${adIsNegative ? 'rose' : 'emerald'}">
            <span class="overview-focus-label">${adIsNegative ? 'Przekroczony budżet reklamy' : 'Dostępne na reklamę'}</span>
            <strong class="overview-focus-value">${formatCurrency(Math.abs(adBalance))}</strong>
            <span class="overview-focus-note">${adIsNegative ? 'Wydatki są wyższe niż aktualna pula reklamowa.' : 'Tyle możesz jeszcze wydać w ramach bieżącej puli.'}</span>
          </article>
        </div>
      </div>
      <div class="overview-hero-side">
        <div class="overview-chip">
          <span>Budżet reklamowy</span>
          <strong>${formatCurrency(budget)}</strong>
        </div>
        <div class="overview-chip">
          <span>Wydatki budżetowe</span>
          <strong>${formatCurrency(expenses)}</strong>
        </div>
        <div class="overview-chip">
          <span>Wpłaty klienta</span>
          <strong>${formatCurrency(payments)}</strong>
        </div>
      </div>
    </section>
  `;
}

function renderOverviewSummaryLine({ ledger, selectedMonth, budget, expenses, payments }) {
  return `
    <div class="overview-summary-line">
      <div class="overview-summary-chart">
        ${renderTrendChart(ledger, selectedMonth)}
      </div>
      <div class="overview-summary-stats">
        ${statCard('Budżet reklamowy', formatCurrency(budget), 'cyan', 'Suma budżetów w tym widoku')}
        ${statCard('Wydatki budżetowe', formatCurrency(expenses), 'amber', 'Koszty odejmowane od budżetu reklamowego')}
        ${statCard('Wpłaty klienta', formatCurrency(payments), 'emerald', 'Ręczne wpłaty klienta do rozrachunku')}
      </div>
    </div>
  `;
}

function renderFlowBar(label, amount, percent, tone, note = '') {
  const safePercent = Number.isFinite(percent) ? percent : 0;
  const width = Math.max(0, Math.min(100, Math.round(safePercent)));
  return `
    <div class="flow-row">
      <div class="flow-row-head">
        <span>${label}</span>
        <strong>${formatCurrency(amount)}</strong>
      </div>
      <div class="flow-track">
        <span class="flow-fill flow-${tone}" style="width:${width}%"></span>
      </div>
      ${note ? `<span class="flow-note">${note}</span>` : ''}
    </div>
  `;
}

function renderBudgetFlowSection({ title, eyebrow, carryIn, compensation, adInjection, adOnlyBudget, expenses, adBalance }) {
  const positiveCarry = Math.max(0, carryIn || 0);
  const carryDebt = Math.max(0, -(carryIn || 0));
  const adOnly = roundCurrency(adOnlyBudget || 0);
  const availablePool = roundCurrency(positiveCarry + (adInjection || 0) + adOnly);
  const spent = roundCurrency(expenses || 0);
  const remaining = roundCurrency(Math.max(0, adBalance || 0));
  const overrun = roundCurrency(Math.max(0, -(adBalance || 0)));
  const baseForPercent = Math.max(availablePool, spent, 1);
  const spentPercent = availablePool > 0 ? (Math.min(spent, availablePool) / availablePool) * 100 : 0;
  const remainingPercent = availablePool > 0 ? (remaining / availablePool) * 100 : 0;

  return `
    <section class="section-band overview-panel">
      <div class="panel-head">
        <div>
          <p class="eyebrow">${escapeHtml(eyebrow)}</p>
          <h3>${escapeHtml(title)}</h3>
        </div>
      </div>
      <div class="overview-panel-grid">
        <div class="flow-chart">
          ${renderFlowBar('Dostępny budżet reklamowy', availablePool, 100, 'cyan', 'Budżet okresu + budżet poza okresem + dodatnie przeniesienia.')}
          ${renderFlowBar('Wydatki budżetowe', spent, (spent / baseForPercent) * 100, 'amber', availablePool > 0 ? `Wykorzystano ${Math.round(spentPercent)}% budżetu.` : 'Brak aktywnej puli do porównania.')}
          ${overrun > 0
            ? renderFlowBar('Przekroczenie budżetu', overrun, (overrun / baseForPercent) * 100, 'rose', 'Wydatki przekroczyły dostępny budżet reklamowy.')
            : renderFlowBar('Zostało na reklamę', remaining, remainingPercent, 'emerald', availablePool > 0 ? `Pozostało ${Math.round(remainingPercent)}% budżetu.` : 'Brak środków do wydania.')}
          ${carryDebt > 0 ? renderFlowBar('Minus z poprzednich okresów', carryDebt, (Math.min(carryDebt, baseForPercent) / baseForPercent) * 100, 'rose', 'Minus obniża realnie dostępny budżet.') : ''}
        </div>
        <div class="overview-compact-cards">
          ${statCard('Budżet okresów', formatCurrency(adInjection || 0), 'cyan', 'Kwota przeznaczona na działania reklamowe')}
          ${statCard('Budżet poza okresem', formatCurrency(adOnly), 'default', 'Dodatkowa pula bez przypisania do miesiąca')}
          ${statCard('Wydane', formatCurrency(spent), 'amber', availablePool > 0 ? `${Math.round(spentPercent)}% wykorzystania` : 'Brak budżetu')}
          ${statCard(overrun > 0 ? 'Przekroczenie' : 'Zostało', formatCurrency(overrun > 0 ? overrun : remaining), overrun > 0 ? 'rose' : 'emerald', overrun > 0 ? 'Wydatki są wyższe niż budżet' : 'Środki na kolejne działania')}
        </div>
      </div>
    </section>
  `;
}

function renderSettlementBreakdown({ unpaidOwnInvoices = 0, ownPaid = 0, compensation = 0, balanceNet = 0, paymentsReceived = 0 }) {
  const totalBeforePayments = roundCurrency(unpaidOwnInvoices + ownPaid + compensation + balanceNet);
  const result = roundCurrency(totalBeforePayments - paymentsReceived);
  const resultMeta = getSettlementMeta(result);
  return `
    <div class="settlement-breakdown">
      <div class="settlement-breakdown-head">
        <strong>Skąd bierze się kwota do zapłaty</strong>
        <span>${resultMeta.shortLabel}: ${formatCurrency(resultMeta.amount)}</span>
      </div>
      <div class="overview-detail-row">
        <span>Faktury własne nieopłacone</span>
        <strong>${formatCurrency(unpaidOwnInvoices)}</strong>
      </div>
      <div class="overview-detail-row">
        <span>Koszty opłacone przeze mnie</span>
        <strong>${formatCurrency(ownPaid)}</strong>
      </div>
      <div class="overview-detail-row">
        <span>Wynagrodzenia ręczne</span>
        <strong>${formatCurrency(compensation)}</strong>
      </div>
      <div class="overview-detail-row">
        <span>Korekty rozrachunku</span>
        <strong>${formatCurrency(balanceNet)}</strong>
      </div>
      <div class="overview-detail-row is-muted">
        <span>Wpłaty klienta do Ciebie</span>
        <strong>-${formatCurrency(paymentsReceived)}</strong>
      </div>
    </div>
  `;
}

function renderSettlementDetails({ eyebrow, title, paymentsReceived, clientPaid, ownPaid, reserved, compensation, adOnlyBudget, unpaidOwnInvoices, balanceNet }) {
  return `
    <section class="section-band overview-panel">
      <div class="panel-head">
        <div>
          <p class="eyebrow">${escapeHtml(eyebrow)}</p>
          <h3>${escapeHtml(title)}</h3>
        </div>
      </div>
      <div class="overview-detail-list">
        <div class="overview-detail-row is-strong">
          <span>Twoje wynagrodzenie</span>
          <strong>${formatCurrency(compensation || 0)}</strong>
        </div>
        ${(adOnlyBudget || 0) > 0 ? `
        <div class="overview-detail-row is-strong">
          <span>Budżet poza okresem</span>
          <strong>${formatCurrency(adOnlyBudget)}</strong>
        </div>` : ''}
        <div class="overview-detail-row">
          <span>Wpłaty klienta do Ciebie</span>
          <strong>${formatCurrency(paymentsReceived || 0)}</strong>
        </div>
        <div class="overview-detail-row">
          <span>Koszty budżetowe opłacone przez klienta</span>
          <strong>${formatCurrency(clientPaid || 0)}</strong>
        </div>
        <div class="overview-detail-row is-muted">
          <span>Koszty opłacone z Twoich środków</span>
          <strong>${formatCurrency(ownPaid || 0)}</strong>
        </div>
        <div class="overview-detail-row is-muted">
          <span>Rezerwacje bez oznaczonej płatności</span>
          <strong>${formatCurrency(reserved || 0)}</strong>
        </div>
      </div>
      ${renderSettlementBreakdown({
        unpaidOwnInvoices,
        ownPaid,
        compensation,
        balanceNet,
        paymentsReceived,
      })}
    </section>
  `;
}

function historyAreaLabel(area) {
  const labels = {
    budget: 'Budżet',
    compensation: 'Wynagrodzenie',
    invoice: 'Faktura',
    wallet: 'Wpłata',
    firm: 'Klient',
    post: 'Posty',
    system: 'System',
  };
  return labels[area] || area || 'Zmiana';
}

function renderHistoryPanel(firm) {
  const entries = [...(firm.history || [])]
    .sort((a, b) => (b.at || '').localeCompare(a.at || ''))
    .slice(0, 12);
  return `
    <section class="section-band overview-panel history-panel">
      <div class="panel-head space-between">
        <div>
          <p class="eyebrow">Historia zmian</p>
          <h3>Ostatnie operacje</h3>
        </div>
      </div>
      ${entries.length === 0 ? `
        <div class="empty-block compact"><p>Brak zapisanych zmian dla tego klienta.</p></div>
      ` : `
        <div class="history-list">
          ${entries.map((entry) => `
            <article class="history-item">
              <span class="history-badge">${escapeHtml(historyAreaLabel(entry.area))}</span>
              <div>
                <strong>${escapeHtml(entry.title || 'Zmiana')}</strong>
                <span>${formatDate(entry.at)}${entry.meta?.period ? ` · ${escapeHtml(entry.meta.period)}` : ''}</span>
              </div>
              ${entry.amount === null || entry.amount === undefined ? '' : `<strong class="history-amount">${formatCurrency(entry.amount)}</strong>`}
            </article>
          `).join('')}
        </div>
      `}
    </section>
  `;
}

function renderAdBudgetEntriesPanel(firm) {
  const entries = [...(firm.adBudgetEntries || [])]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const total = roundCurrency(entries.reduce((acc, entry) => acc + Number(entry.amount || 0), 0));

  return `
    <section class="section-band overview-panel">
      <div class="panel-head space-between">
        <div>
          <p class="eyebrow">Bez okresu</p>
          <h3>Budżet poza okresem</h3>
          <p class="table-note">Suma: <strong>${formatCurrency(total)}</strong></p>
        </div>
        <button class="ghost-button" type="button" data-action="add-ad-budget">${icon('plus')}Dodaj budżet</button>
      </div>
      ${entries.length === 0 ? `
        <div class="empty-block"><p>Brak dodatkowego budżetu bez wynagrodzenia.</p></div>
      ` : `
        <div class="table-wrap responsive-table-wrap">
          <table class="data-table responsive-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Opis</th>
                <th>Kwota</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${entries.map((entry) => `
                <tr>
                  <td data-label="Data">${formatDate(entry.date)}</td>
                  <td data-label="Opis">${escapeHtml(entry.description || '-')}</td>
                  <td data-label="Kwota" class="tone-mint">${formatCurrency(entry.amount)}</td>
                  <td data-label="Akcje" class="table-actions">
                    <button class="mini-button" type="button" data-action="edit-ad-budget" data-id="${entry.id}">${icon('edit')}</button>
                    <button class="mini-button tone-danger" type="button" data-action="delete-ad-budget" data-id="${entry.id}">${icon('trash')}</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </section>
  `;
}

function compensationEntryPeriod(entry) {
  return entry.period || monthFromDate(entry.date);
}

function compensationEntriesForSelection(firm, selectedMonth) {
  const entries = [...(firm.compensationEntries || [])];
  if (!selectedMonth || selectedMonth === '__all__') {
    return entries;
  }
  if (selectedMonth === '__year__') {
    const year = String(new Date().getFullYear());
    return entries.filter((entry) => compensationEntryPeriod(entry).startsWith(year));
  }
  if (selectedMonth === '__quarter__') {
    const now = new Date();
    const year = String(now.getFullYear());
    const q = Math.floor(now.getMonth() / 3);
    const qMonths = [
      `${year}-${String(q * 3 + 1).padStart(2, '0')}`,
      `${year}-${String(q * 3 + 2).padStart(2, '0')}`,
      `${year}-${String(q * 3 + 3).padStart(2, '0')}`,
    ];
    return entries.filter((entry) => qMonths.includes(compensationEntryPeriod(entry)));
  }
  return entries.filter((entry) => compensationEntryPeriod(entry) === selectedMonth);
}

function renderCompensationPage(firm, ledger, selectedMonth) {
  const entries = compensationEntriesForSelection(firm, selectedMonth)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const total = roundCurrency(entries.reduce((acc, entry) => acc + Number(entry.amount || 0), 0));
  const periodLabel = selectedMonth === '__all__' || !selectedMonth
    ? 'Razem'
    : selectedMonth === '__year__'
      ? 'Ten rok'
      : selectedMonth === '__quarter__'
        ? 'Ten kwartał'
        : monthLabel(selectedMonth);

  return `
    <div class="firm-detail-page">
      <section class="main-area">
        ${renderFirmContextHeader(firm, ledger, selectedMonth)}
        <section class="section-band overview-panel">
          <div class="panel-head space-between">
            <div>
              <p class="eyebrow">Wynagrodzenia</p>
              <h3>Ręczne koszty wynagrodzenia</h3>
              <p class="table-note">Zakres: <strong>${escapeHtml(periodLabel)}</strong>. Te pozycje zwiększają kwotę, którą klient ma zapłacić.</p>
            </div>
            <button class="primary-button" type="button" data-action="add-compensation">${icon('plus')}Dodaj wynagrodzenie</button>
          </div>
          <div class="compensation-summary">
            <article class="compensation-total-card">
              <span>Suma wynagrodzeń</span>
              <strong>${formatCurrency(total)}</strong>
            </article>
          </div>
        </section>
        <section class="section-band overview-panel">
          ${entries.length === 0 ? `
            <div class="empty-block"><p>Brak wynagrodzeń w tym zakresie.</p></div>
          ` : `
            <div class="table-wrap responsive-table-wrap">
              <table class="data-table responsive-table compensation-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Okres</th>
                    <th>Opis</th>
                    <th>Kwota</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${entries.map((entry) => `
                    <tr>
                      <td data-label="Data">${formatDate(entry.date)}</td>
                      <td data-label="Okres">${entry.period ? monthLabel(entry.period) : 'Według daty'}</td>
                      <td data-label="Opis"><strong>${escapeHtml(entry.title || 'Wynagrodzenie')}</strong></td>
                      <td data-label="Kwota" class="tone-rose">${formatCurrency(entry.amount)}</td>
                      <td data-label="Akcje" class="table-actions">
                        <button class="mini-button" type="button" data-action="edit-compensation" data-id="${entry.id}">${icon('edit')}</button>
                        <button class="mini-button tone-danger" type="button" data-action="delete-compensation" data-id="${entry.id}">${icon('trash')}</button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </section>
        ${renderHistoryPanel(firm)}
      </section>
      ${renderFabMenu('add-compensation')}
    </div>
  `;
}

function renderTrendChart(ledger, selectedMonth) {
  const rows = [...ledger.rows].reverse().slice(-8);
  if (!rows.length) return '';
  const maxValue = Math.max(
    ...rows.flatMap((row) => [row.budget || 0, row.expensesTotal || 0, row.paymentsReceived || 0]),
    1
  );

  return `
    <section class="section-band overview-panel">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Trend miesięcy</p>
          <h3>Budżet, wydatki i wpłaty</h3>
        </div>
      </div>
      <div class="mini-chart-legend">
        <span><i class="legend-dot legend-cyan"></i>Budżet</span>
        <span><i class="legend-dot legend-amber"></i>Wydatki</span>
        <span><i class="legend-dot legend-emerald"></i>Wpłaty</span>
      </div>
      <div class="mini-chart">
        ${rows.map((row) => {
          const budgetH = Math.max(10, Math.round(((row.budget || 0) / maxValue) * 100));
          const expensesH = Math.max(10, Math.round(((row.expensesTotal || 0) / maxValue) * 100));
          const paymentsH = Math.max(10, Math.round(((row.paymentsReceived || 0) / maxValue) * 100));
          const isActive = row.month === selectedMonth;
          return `
            <div class="mini-chart-col ${isActive ? 'is-active' : ''}">
              <div class="mini-chart-bars">
                <span class="mini-bar bar-cyan" style="height:${budgetH}%"></span>
                <span class="mini-bar bar-amber" style="height:${expensesH}%"></span>
                <span class="mini-bar bar-emerald" style="height:${paymentsH}%"></span>
              </div>
              <span class="mini-chart-label">${escapeHtml(row.label.replace(/\s+\d{4}$/, ''))}</span>
            </div>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

function renderMonthOverview(firm, ledger, selectedMonth, monthRow) {
  const adOnlyBudget = selectedMonth === ledger.rows[0]?.month
    ? (ledger.totals.totalAdOnlyBudget || 0)
    : 0;
  const settlement = getSettlementMeta(roundCurrency((monthRow.settlementNetChange || 0) + adOnlyBudget));
  const adBalance = roundCurrency((monthRow.adEndingBalance || 0) + adOnlyBudget);
  const monthEntries = getMonthFinancialEntries(firm, selectedMonth);
  const expensePreview = [...monthEntries.expenses]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 5);

  return `
    <div class="overview-stack">
      ${renderOverviewSummaryLine({
        ledger,
        selectedMonth,
        budget: roundCurrency((monthRow.budget || 0) + adOnlyBudget),
        expenses: monthRow.expensesTotal || 0,
        payments: monthRow.paymentsReceived || 0,
      })}

      <div class="overview-analysis-grid">
          ${renderBudgetFlowSection({
            title: 'Jak rozszedł się budżet tego miesiąca',
            eyebrow: 'Budżet i wykorzystanie',
            carryIn: monthRow.adCarryIn || 0,
            compensation: monthRow.compensation || 0,
            adInjection: monthRow.adInjection || 0,
            adOnlyBudget,
            expenses: monthRow.expensesTotal || 0,
            adBalance,
          })}
          ${renderSettlementDetails({
            eyebrow: 'Rozliczenie klienta',
            title: 'Co wpływa na rozrachunek w tym miesiącu',
            paymentsReceived: monthRow.paymentsReceived || 0,
            clientPaid: monthRow.clientCardExpenses || 0,
            ownPaid: monthRow.ownPaidExpenses || 0,
            reserved: monthRow.reservedBudgetExpenses || 0,
            compensation: monthRow.compensation || 0,
            adOnlyBudget,
            unpaidOwnInvoices: monthRow.unpaidOwnInvoices || 0,
            balanceNet: monthRow.balanceNet || 0,
          })}
      </div>

      <section class="section-band overview-panel">
        <div class="panel-head space-between">
          <div>
            <p class="eyebrow">Ostatnie wydatki</p>
            <h3>Najświeższe pozycje z tego miesiąca</h3>
          </div>
        </div>
        ${expensePreview.length === 0 ? `
          <div class="empty-block"><p>Brak wydatków w tym miesiącu.</p></div>
        ` : `
          <div class="table-wrap responsive-table-wrap">
            <table class="data-table responsive-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Kategoria</th>
                  <th>Opis</th>
                  <th>Płatnik</th>
                  <th>Kwota</th>
                </tr>
              </thead>
              <tbody>
                ${expensePreview.map((expense) => `
                  <tr>
                    <td data-label="Data">${formatDate(expense.date)}</td>
                    <td data-label="Kategoria">${categoryLabel(expense.category)}</td>
                    <td data-label="Opis">
                      <strong>${escapeHtml(expense.vendor || 'Wydatek')}</strong>
                      <span class="table-subline">${escapeHtml(expense.description || '-')}</span>
                    </td>
                    <td data-label="Płatnik">${payerLabel(expense.payer)}</td>
                    <td data-label="Kwota">${formatCurrency(expense.amount)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
      </section>
    </div>
  `;
}

function renderFirmContextHeader(firm, ledger, selectedMonth) {
  const settlement = getSettlementMeta(ledger.totals.totalSettlementNet);
  const unpaidCount = (firm.invoices || []).filter((invoice) => invoice.status !== 'cancelled' && !invoice.paidBy).length;
  const selectedLabel = selectedMonth === '__all__'
    ? 'Razem'
    : selectedMonth === '__year__'
      ? 'Ten rok'
      : selectedMonth === '__quarter__'
        ? 'Ten kwartał'
        : monthLabel(selectedMonth);

  return `
    <section class="firm-context-header">
      <div class="firm-context-main">
        <button class="ghost-button compact-button" type="button" data-action="back-to-list">${icon('arrowLeft')}Klienci</button>
        <div>
          <h2>${escapeHtml(firmDisplayName(firm))}</h2>
        </div>
      </div>
      <div class="firm-context-stats">
        <span><strong>${ledger.rows.length}</strong> okresów</span>
        <span>${unpaidCount > 0 ? `<strong>${unpaidCount}</strong> faktur do opłacenia` : 'Brak zaległych faktur'}</span>
        <span><strong>${formatCurrency(settlement.amount)}</strong> ${settlement.shortLabel.toLowerCase()}</span>
        <span>${escapeHtml(selectedLabel)}</span>
      </div>
      <div class="firm-context-actions">
        <button class="ghost-button compact-button" type="button" data-action="edit-firm">${icon('edit')}Edytuj</button>
        <button class="ghost-button compact-button" type="button" data-action="issue-invoice">${icon('file')}Faktura</button>
        <button class="primary-button compact-button" type="button" data-action="add-month">${icon('plus')}Miesiąc</button>
      </div>
    </section>
  `;
}

function renderMonthExpenses(month, expenses) {
  return `
    <div class="panel-head space-between">
      <div>
        <p class="eyebrow">Wydatki</p>
        <h3>${monthLabel(month)}</h3>
      </div>
    </div>

    ${expenses.length === 0 ? `
      <div class="empty-block">
        <p>Brak wydatkow w tym miesiacu.</p>
      </div>
    ` : `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Kategoria</th>
              <th>Opis</th>
              <th>Platnik</th>
              <th>Kwota</th>
            </tr>
          </thead>
          <tbody>
            ${expenses.map((expense) => `
              <tr>
                <td>${formatDate(expense.date)}</td>
                <td>${categoryLabel(expense.category)}</td>
                <td>
                  <strong>${escapeHtml(expense.vendor || 'Wydatek')}</strong>
                  <span class="table-subline">${escapeHtml(expense.description || '-')}</span>
                </td>
                <td>${payerLabel(expense.payer)}</td>
                <td>${formatCurrency(expense.amount)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `}
  `;
}

function renderTilesGrid(budget, compensation, carryIn, wydano) {
  const doWydania = roundCurrency(budget);
  const zostalo = roundCurrency(doWydania + carryIn - wydano);
  return `
    <div class="section-stack" style="display:grid; gap:20px;">
      <div class="stats-grid" style="grid-template-columns: repeat(2, minmax(0, 1fr));">
        ${statCard('Budzet klienta', formatCurrency(budget), 'cyan', 'Suma budzetow dla tego widoku')}
        ${statCard(zostalo < 0 ? 'Przekroczony budzet reklamy' : 'Dostepne na reklame', formatCurrency(Math.abs(zostalo)), zostalo < 0 ? 'rose' : 'emerald', 'Bilans puli reklamowej dla wybranego zakresu')}
      </div>
      <div class="section-band" style="padding:20px;">
        <div class="panel-head">
          <div>
            <p class="eyebrow">Podsumowanie</p>
            <h3>Budzet i wykorzystanie</h3>
          </div>
        </div>
        <div class="stats-grid" style="grid-template-columns: repeat(2, minmax(0, 1fr));">
          ${statCard('Dawna sugestia wynagrodzenia', formatCurrency(compensation), 'default', 'Informacyjnie, bez automatycznego naliczania')}
          ${statCard('Pula reklamowa', formatCurrency(doWydania), 'amber', 'Budżet reklamowy w tym widoku')}
          ${statCard('Przeniesione', formatCurrency(carryIn), carryIn < 0 ? 'rose' : 'default', 'Stan z okresu przed wybranym zakresem')}
          ${statCard('Wydane lacznie', formatCurrency(wydano), 'rose', 'Suma wydatkow w tym widoku')}
        </div>
      </div>
    </div>
  `;
}

function renderScopeOverview(scope, title, eyebrow, ledger) {
  const settlement = getSettlementMeta(scope.settlementBalance);
  const adBalance = roundCurrency(scope.adBalance || 0);

  return `
    <div class="overview-stack">
      ${renderOverviewSummaryLine({
        ledger,
        selectedMonth: null,
        budget: scope.totalBudget,
        expenses: scope.totalExpenses,
        payments: scope.totalPaymentsReceived,
      })}

      <div class="overview-analysis-grid">
          ${renderBudgetFlowSection({
            title: 'Budżet reklamowy w tym zakresie',
            eyebrow: 'Budżet i wykorzystanie',
            carryIn: scope.adCarryIn || 0,
            compensation: scope.totalCompensation || 0,
            adInjection: scope.totalAdInjection || 0,
            adOnlyBudget: scope.adOnlyBudget || 0,
            expenses: scope.totalExpenses || 0,
            adBalance,
          })}
          ${renderSettlementDetails({
            eyebrow: 'Rozliczenie klienta',
            title: 'Co składa się na rozrachunek w tym zakresie',
            paymentsReceived: scope.totalPaymentsReceived || 0,
            clientPaid: scope.totalClientCardExpenses || 0,
            ownPaid: scope.totalOwnPaidExpenses || 0,
            reserved: 0,
            compensation: scope.totalCompensation || 0,
            adOnlyBudget: scope.adOnlyBudget || 0,
            unpaidOwnInvoices: scope.totalUnpaidOwnInvoices || 0,
            balanceNet: scope.totalBalanceNet || 0,
          })}
      </div>
    </div>
  `;
}

function renderOverview(firm, ledger, selectedMonth, monthRow) {
  if (ledger.rows.length === 0) {
      return `
        <section class="section-band">
          <div class="panel-head space-between">
            <div>
              <p class="eyebrow">Przeglad</p>
            <h3>Miesiace i budzety</h3>
          </div>
        </div>
        <div class="empty-block">
          <p>Ta firma nie ma jeszcze żadnego okresu. Dodaj pierwszy budżet reklamowy.</p>
        </div>
      </section>
    `;
  }

  if (selectedMonth === '__all__') {
    return renderScopeOverview(
      summarizeLedgerScope(ledger, selectedMonth),
      'Razem - wszystkie miesiace',
      firmDisplayName(firm),
      ledger
    );
  }

  if (selectedMonth === '__year__') {
    const currentYear = String(new Date().getFullYear());
    const scope = summarizeLedgerScope(ledger, selectedMonth);
    if (scope.rowCount === 0) {
      return `
        <section class="section-band">
          <div class="panel-head space-between">
            <div>
              <p class="eyebrow">${escapeHtml(firmDisplayName(firm))}</p>
              <h3>Rok ${currentYear}</h3>
            </div>
          </div>
          <div class="empty-block">
            <p>Brak danych dla roku ${currentYear}.</p>
          </div>
        </section>
      `;
    }
    return renderScopeOverview(scope, `Rok ${currentYear}`, firmDisplayName(firm), ledger);
  }

  if (selectedMonth === '__quarter__') {
    const now = new Date();
    const year = String(now.getFullYear());
    const q = Math.floor(now.getMonth() / 3);
    const qMonths = [
      `${year}-${String(q * 3 + 1).padStart(2, '0')}`,
      `${year}-${String(q * 3 + 2).padStart(2, '0')}`,
      `${year}-${String(q * 3 + 3).padStart(2, '0')}`
    ];
    const quarterLabel = `Q${q + 1} ${year}`;
    const scope = summarizeLedgerScope(ledger, selectedMonth);
    if (scope.rowCount === 0) {
      return `
        <section class="section-band">
          <div class="panel-head space-between">
            <div>
              <p class="eyebrow">${escapeHtml(firmDisplayName(firm))}</p>
              <h3>Kwartal ${quarterLabel}</h3>
            </div>
          </div>
          <div class="empty-block">
            <p>Brak danych dla kwartalu ${quarterLabel}.</p>
          </div>
        </section>
      `;
    }
    return renderScopeOverview(scope, `Kwartal ${quarterLabel}`, firmDisplayName(firm), ledger);
  }

  if (!monthRow) {
    const totalBudget = roundCurrency(ledger.rows.reduce((acc, row) => acc + row.budget, 0));
    return `
      <section class="section-band">
        <div class="panel-head space-between">
          <div>
            <p class="eyebrow">Przeglad</p>
            <h3>${escapeHtml(firmDisplayName(firm))}</h3>
          </div>
        </div>
        <div class="stats-grid" style="grid-template-columns: repeat(3, minmax(0, 1fr));">
          ${statCard('Liczba miesiecy', String(ledger.rows.length), 'default', 'Aktywne okresy rozliczeniowe')}
          ${statCard('Laczny budzet', formatCurrency(totalBudget), 'cyan', 'Suma budzetow ze wszystkich miesiecy')}
          ${(() => {
            const settlement = getSettlementMeta(ledger.totals.totalSettlementNet);
            return statCard(settlement.label, formatCurrency(settlement.amount), settlement.tone, 'Aktualny stan rozliczenia z klientem');
          })()}
        </div>
        <p style="margin-top: 16px; color: var(--text-soft); font-size: 0.9rem;">
          Wybierz miesiac z listy ponizej, aby zobaczyc szczegoly.
        </p>
      </section>
    `;
  }

  return renderMonthOverview(firm, ledger, selectedMonth, monthRow);
}

// --- Firm Detail (Overview page) ---
function renderFirmDetail() {
  const firm = getSelectedFirm(state);
  if (!firm) return renderFirmList(state);

  const { ledger, selectedMonth, monthRow } = ensureSelectedMonth(firm, state);

  if (state.ui.activeTab === 'posts') {
    return renderPostsPage(firm);
  }
  if (state.ui.activeTab === 'compensation') {
    return renderCompensationPage(firm, ledger, selectedMonth);
  }

  return `
    <div class="firm-detail-page">
      <section class="main-area">
        ${renderFirmContextHeader(firm, ledger, selectedMonth)}
        ${renderOverview(firm, ledger, selectedMonth, monthRow)}
        ${renderAdBudgetEntriesPanel(firm)}
        <section class="section-band overview-panel">
          <div class="panel-head space-between">
            <div>
              <p class="eyebrow">Historia miesięcy</p>
              <h3>Wszystkie okresy rozliczeniowe</h3>
            </div>
            <div class="panel-actions">
              <button class="ghost-button" type="button" data-action="add-ad-budget">${icon('plus')}Budżet poza okresem</button>
              <button class="primary-button" type="button" data-action="add-month">${icon('plus')}Dodaj miesiąc</button>
            </div>
          </div>
          ${renderMonthList(ledger, selectedMonth)}
        </section>
        ${renderHistoryPanel(firm)}
      </section>
      ${renderFabMenu('add-month')}
    </div>
  `;
}

function renderPostTabButton(firm, tab) {
  const tabStatus = getPostTabStatus(firm, tab);
  const lastLabel = tabStatus.lastPost
    ? `Ostatnia publikacja ${tabStatus.daysSinceLast === 0 ? 'dzisiaj' : `${tabStatus.daysSinceLast} dni temu`}`
    : 'Brak opublikowanych materialow';
  const frequencyMeta = isIrregularPostTab(tab)
    ? postFrequencyLabel(tab.frequency)
    : `${postFrequencyLabel(tab.frequency)} od ${formatDate(tab.startDate)}`;
  const dueLabel = tabStatus.isSkipped ? 'Bez terminu' : `Termin: ${formatDate(tabStatus.dueDate)}`;
  return `
    <article class="post-tab-card ${state.ui.activePostTabId === tab.id ? 'is-active' : ''} ${tabStatus.isOverdue ? 'is-overdue' : ''}">
      <button class="post-tab-main" type="button" data-action="select-post-tab" data-id="${tab.id}">
        <span class="post-tab-title">${escapeHtml(tab.name)}</span>
        <span class="post-tab-meta">${frequencyMeta}</span>
        <span class="post-tab-note">${escapeHtml(lastLabel)}</span>
      </button>
      <div class="post-tab-actions">
        <span class="post-due-pill ${tabStatus.isOverdue ? 'is-overdue' : ''}">${dueLabel}</span>
        <span class="post-tab-icon-actions">
          <button class="icon-button" type="button" data-action="edit-post-tab" data-id="${tab.id}" aria-label="Edytuj podzakładkę">${icon('edit')}</button>
          <button class="icon-button tone-danger" type="button" data-action="delete-post-tab" data-id="${tab.id}" aria-label="Usuń podzakładkę">${icon('trash')}</button>
        </span>
      </div>
    </article>
  `;
}

function postMatchesSearch(post, query) {
  if (!query) return true;
  const haystack = `${post.title || ''} ${post.link || ''} ${post.content || ''} ${postKeywordText(post)}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function renderPostCard(firm, post) {
  const similar = findSimilarPosts(firm, post, post.id);
  const similarAlertKey = similar.length ? getSimilarAlertKey(post, similar) : '';
  const showSimilarAlert = similar.length && !isSimilarAlertDismissed(post, similar);
  const preview = String(post.content || '').trim();
  const shortPreview = preview.length > 80 ? `${preview.slice(0, 80)}...` : preview;
  const postLink = safePostLink(post.link);
  return `
    <article class="post-card">
      <div class="post-card-top">
        <div>
          <span class="status-pill ${post.status === 'published' ? 'is-positive' : 'is-muted'}">
            ${post.status === 'published' ? 'Opublikowane' : 'Zaplanowane'}
          </span>
          <h4>${escapeHtml(post.title || 'Bez tytulu')}</h4>
        </div>
        <span class="post-date">${formatDate(post.publishDate)}</span>
      </div>
      <p class="post-preview">${escapeHtml(shortPreview || 'Brak tresci.')}</p>
      ${postLink ? `<a class="post-link-pill" href="${escapeHtml(postLink)}" target="_blank" rel="noopener noreferrer">${icon('link')}<span>${escapeHtml(postLinkLabel(post.link))}</span></a>` : ''}
      ${post.keywords?.length ? `<div class="keyword-row">${post.keywords.map((keyword) => `<span>${escapeHtml(keyword)}</span>`).join('')}</div>` : ''}
      ${showSimilarAlert ? `
        <div class="post-similar-alert" role="status">
          <span>Podobne tematy: ${similar.map((item) => escapeHtml(item.post.title || 'Bez tytulu')).join(', ')}</span>
          <button class="post-similar-dismiss" type="button" data-action="dismiss-similar-alert" data-alert-key="${escapeHtml(similarAlertKey)}" aria-label="Zamknij powiadomienie o podobnych tematach">
            ${icon('x-circle')}
          </button>
        </div>
      ` : ''}
      <div class="post-card-actions">
        ${post.status !== 'published' ? `<button class="publish-post-button" type="button" data-action="publish-post" data-id="${post.id}">${icon('cloud-check')}OPUBLIKUJ</button>` : ''}
        <button class="ghost-button" type="button" data-action="preview-post" data-id="${post.id}">${icon('eye')}Podgląd</button>
        <button class="ghost-button" type="button" data-action="edit-post" data-id="${post.id}">${icon('edit')}Edytuj</button>
        <button class="ghost-button tone-danger" type="button" data-action="delete-post" data-id="${post.id}">${icon('trash')}Usuń</button>
      </div>
    </article>
  `;
}

function renderPostsPage(firm) {
  if (!ensureFirmPostCollectionsLoaded(firm)) {
    const status = postCollectionStatus.get(firm.id);
    return `
      <div class="firm-detail-page posts-page">
        <section class="section-band posts-panel">
          <div class="panel-head">
            <div>
              <p class="eyebrow">Posty</p>
              <h3>${status === 'error' ? 'Nie udało się wczytać danych' : 'Ładowanie danych postów'}</h3>
            </div>
          </div>
          <div class="empty-block">
            <p>${status === 'error' ? 'Sprawdź połączenie z Firestore i uprawnienia.' : 'Pobieram podzakładki i wpisy z osobnych kolekcji Firestore.'}</p>
          </div>
        </section>
      </div>
    `;
  }

  const activeTabId = ensurePostTabSelection(firm);
  const tabs = firm.postTabs || [];
  const activeTab = tabs.find((tab) => tab.id === activeTabId) || null;
  const query = state.ui.postSearch || '';
  const posts = activeTab ? postsForTab(firm, activeTab.id).filter((post) => postMatchesSearch(post, query)) : [];
  const overdueTabs = tabs.filter((tab) => getPostTabStatus(firm, tab).isOverdue).length;

  return `
    <div class="firm-detail-page posts-page">
      <section class="main-area">
        ${firm.postStorageFallback ? `
          <section class="section-band posts-panel post-storage-warning">
            <strong>Posty działają w trybie lokalnym</strong>
            <span>Firestore odmówił dostępu do subkolekcji postów. Widok korzysta z danych zapisanych w stanie klienta.</span>
          </section>
        ` : ''}
        <section class="section-band posts-header">
          <div class="panel-head space-between">
            <div>
              <p class="eyebrow">Posty</p>
              <h3>${escapeHtml(firmDisplayName(firm))}</h3>
            </div>
            <div class="posts-actions">
              <button class="ghost-button" type="button" data-action="import-posts">${icon('upload')}Import CSV/Excel</button>
              <button class="ghost-button" type="button" data-action="export-posts-csv">${icon('download')}CSV</button>
              <button class="primary-button" type="button" data-action="export-posts-excel">${icon('download')}Excel</button>
            </div>
          </div>
          <div class="posts-summary-grid">
            ${statCard('Podzakladki', String(tabs.length), 'default', 'Osobne dla tej firmy')}
            ${statCard('Wpisy', String((firm.posts || []).length), 'cyan', 'Opublikowane i zaplanowane')}
            ${statCard('Po terminie', String(overdueTabs), overdueTabs ? 'rose' : 'emerald', 'Licza sie tylko opublikowane')}
          </div>
        </section>

        <section class="section-band posts-panel">
          <div class="panel-head space-between">
            <div>
              <p class="eyebrow">Podzakladki</p>
              <h3>Kalendarz publikacji</h3>
            </div>
            <button class="primary-button" type="button" data-action="add-post-tab">${icon('plus')}Dodaj podzakładkę</button>
          </div>
          ${tabs.length ? `<div class="post-tabs-grid">${tabs.map((tab) => renderPostTabButton(firm, tab)).join('')}</div>` : `
            <div class="empty-block"><p>Brak podzakładek. Dodaj pierwszą kategorię publikacji.</p></div>
          `}
        </section>

        <section class="section-band posts-panel">
          <div class="panel-head space-between">
            <div>
              <p class="eyebrow">${activeTab ? escapeHtml(activeTab.name) : 'Wpisy'}</p>
              <h3>Materiały publikacyjne</h3>
            </div>
            <button class="primary-button" type="button" data-action="add-post" ${activeTab ? '' : 'disabled'}>${icon('plus')}Dodaj wpis</button>
          </div>
          <div class="post-search-row">
            <input class="post-search-input" type="search" data-action="filter-post-search" value="${escapeHtml(query)}" placeholder="Szukaj po tytule, treści lub słowach kluczowych..." />
          </div>
          ${activeTab ? `
            ${posts.length ? `<div class="post-list">${posts.map((post) => renderPostCard(firm, post)).join('')}</div>` : `
              <div class="empty-block"><p>Brak wpisów dla tej podzakładki lub filtra.</p></div>
            `}
          ` : `<div class="empty-block"><p>Dodaj podzakładkę, aby zapisywać publikacje.</p></div>`}
        </section>
      </section>
      ${renderFabMenu(activeTab ? 'add-post' : 'add-post-tab')}
    </div>
  `;
}

// --- Modals ---

function findPostTab(id) {
  return getSelectedFirm(state)?.postTabs.find((tab) => tab.id === id) || null;
}

function findPost(id) {
  return getSelectedFirm(state)?.posts.find((post) => post.id === id) || null;
}

function openPostTabModal(existing = null) {
  const firm = getSelectedFirm(state);
  if (!firm) return;

  openModal(existing ? 'Edytuj podzakladke' : 'Dodaj podzakladke', `
    <form id="postTabForm" class="form-grid">
      ${labeledInput({ name: 'name', label: 'Nazwa', value: existing?.name || '', placeholder: 'Np. Wpisy Google', required: true })}
      ${labeledInput({ name: 'frequency', label: 'Czestotliwosc', type: 'select', value: existing?.frequency || 'monthly', options: POST_FREQUENCY_OPTIONS })}
      ${labeledInput({ name: 'startDate', label: 'Data poczatkowa', type: 'date', value: existing?.startDate || todayKey(), required: true })}
      <div class="modal-actions ${existing ? 'is-split' : ''}">
        ${existing ? '<button class="ghost-button tone-danger" type="button" id="deletePostTabButton">Usun z wpisami</button>' : '<span></span>'}
        <div class="modal-actions-group">
          <button class="ghost-button" type="button" data-action="close-modal">Anuluj</button>
          <button class="primary-button" type="submit">${existing ? 'Zapisz' : 'Dodaj'}</button>
        </div>
      </div>
    </form>
  `);

  document.getElementById('deletePostTabButton')?.addEventListener('click', async () => {
    if (!existing) return;
    if (!confirm(`Usunac podzakladke "${existing.name}" razem ze wszystkimi wpisami?`)) return;
    await tryPostCloudWrite(firm, () => deletePostTabDoc(firm, existing.id), 'Usuwanie podzakładki postów');
    firm.postTabs = (firm.postTabs || []).filter((tab) => tab.id !== existing.id);
    firm.posts = (firm.posts || []).filter((post) => post.tabId !== existing.id);
    firm.updatedAt = new Date().toISOString();
    state.ui.activePostTabId = firm.postTabs[0]?.id || null;
    persistAndFlush();
    closeModal();
    render();
  });

  document.getElementById('postTabForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const now = new Date().toISOString();
    const tab = {
      id: existing?.id || uid(),
      name: String(data.get('name') || '').trim(),
      frequency: String(data.get('frequency') || 'monthly'),
      startDate: String(data.get('startDate') || todayKey()),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    await tryPostCloudWrite(firm, () => savePostTabDoc(firm, tab), 'Zapis podzakładki postów');
    firm.postTabs = existing
      ? (firm.postTabs || []).map((item) => item.id === tab.id ? tab : item)
      : [...(firm.postTabs || []), tab];
    firm.updatedAt = now;
    state.ui.activePostTabId = tab.id;
    persistAndFlush();
    closeModal();
    render();
  });
}

function renderSimilarWarningHtml(firm, draft, excludeId) {
  const similar = findSimilarPosts(firm, draft, excludeId);
  if (!similar.length) return '';
  return `
    <div class="similar-topic-box">
      <strong>Podobne tematy</strong>
      ${similar.map((item) => `
        <p>${escapeHtml(item.post.title || 'Bez tytulu')} <span>${formatDate(item.post.publishDate)}</span></p>
      `).join('')}
    </div>
  `;
}

function openPostModal(existing = null, template = null) {
  const firm = getSelectedFirm(state);
  if (!firm) return;
  const activeTabId = ensurePostTabSelection(firm);
  if (!activeTabId) return;
  const source = existing || template || {};

  openModal(existing ? 'Edytuj wpis' : 'Dodaj wpis', `
    <form id="postForm" class="form-grid post-form">
      ${labeledInput({ name: 'tabId', label: 'Podzakladka', type: 'select', value: source.tabId || activeTabId, options: (firm.postTabs || []).map((tab) => ({ value: tab.id, label: tab.name })) })}
      ${labeledInput({ name: 'status', label: 'Status', type: 'select', value: source.status || 'scheduled', options: POST_STATUS_OPTIONS })}
      ${labeledInput({ name: 'publishDate', label: 'Data', type: 'date', value: source.publishDate || todayKey(), required: true })}
      ${labeledInput({ name: 'title', label: 'Tytul', value: source.title || '', required: true })}
      ${labeledInput({ name: 'link', label: 'Link', value: source.link || '', placeholder: 'https://adres-strony.pl/wpis' })}
      <label class="field field-span-2">
        <span>Tresc artykulu</span>
        <textarea name="content" rows="10" placeholder="Wklej lub opisz tresc materialu">${escapeHtml(source.content || '')}</textarea>
      </label>
      <label class="field field-span-2">
        <span>Slowa kluczowe</span>
        <input name="keywords" value="${escapeHtml(postKeywordText(source))}" placeholder="fraza 1, fraza 2, fraza 3" />
      </label>
      <div id="similarTopicPreview" class="field-span-2">
        ${renderSimilarWarningHtml(firm, source, existing?.id || null)}
      </div>
      ${modalActions(existing ? 'Zapisz wpis' : 'Dodaj wpis')}
    </form>
  `);

  const form = document.getElementById('postForm');
  const preview = document.getElementById('similarTopicPreview');

  const updateSimilarPreview = () => {
    const data = new FormData(form);
    const draft = {
      title: String(data.get('title') || ''),
      keywords: splitKeywords(data.get('keywords')),
    };
    preview.innerHTML = renderSimilarWarningHtml(firm, draft, existing?.id || null);
  };
  form.querySelector('[name="title"]')?.addEventListener('input', updateSimilarPreview);
  form.querySelector('[name="keywords"]')?.addEventListener('input', updateSimilarPreview);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const now = new Date().toISOString();
    const link = normalizePostLink(data.get('link'));
    if (link && !safePostLink(link)) {
      alert('Podaj poprawny link zaczynający się od http:// albo https://.');
      return;
    }
    const post = {
      id: existing?.id || uid(),
      tabId: String(data.get('tabId') || activeTabId),
      status: String(data.get('status') || 'scheduled') === 'published' ? 'published' : 'scheduled',
      publishDate: String(data.get('publishDate') || todayKey()),
      title: String(data.get('title') || '').trim(),
      link,
      content: String(data.get('content') || '').trim(),
      keywords: splitKeywords(data.get('keywords')),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    const similar = findSimilarPosts(firm, post, existing?.id || null);
    if (similar.length && !confirm(`Znaleziono podobne tematy: ${similar.map((item) => item.post.title || 'Bez tytulu').join(', ')}. Zapisać mimo to?`)) {
      return;
    }

    await tryPostCloudWrite(firm, () => savePostDoc(firm, post), 'Zapis wpisu');
    firm.posts = [
      ...(firm.posts || []).filter((item) => item.id !== post.id),
      post,
    ];
    firm.updatedAt = now;
    state.ui.activePostTabId = post.tabId;
    persistAndFlush();
    closeModal();
    render();
  });
}

function openPostPreview(post) {
  if (!post) return;
  const tab = findPostTab(post.tabId);
  const postLink = safePostLink(post.link);
  openModal('Podglad wpisu', `
    <div class="post-preview-modal">
      <p class="eyebrow">${escapeHtml(tab?.name || 'Posty')}</p>
      <h3>${escapeHtml(post.title || 'Bez tytulu')}</h3>
      <div class="post-preview-meta">
        <span>${post.status === 'published' ? 'Opublikowane' : 'Zaplanowane'}</span>
        <span>${formatDate(post.publishDate)}</span>
      </div>
      ${post.keywords?.length ? `<div class="keyword-row">${post.keywords.map((keyword) => `<span>${escapeHtml(keyword)}</span>`).join('')}</div>` : ''}
      ${postLink ? `<a class="post-link-pill" href="${escapeHtml(postLink)}" target="_blank" rel="noopener noreferrer">${icon('link')}<span>${escapeHtml(postLinkLabel(post.link))}</span></a>` : ''}
      <div class="post-full-content">${escapeHtml(post.content || 'Brak tresci.').replace(/\n/g, '<br>')}</div>
    </div>
  `);
}

function postExportRows(firm) {
  const tabs = firm.postTabs || [];
  const rows = [];
  for (const tab of tabs) {
    const posts = postsForTab(firm, tab.id);
    if (!posts.length) {
      rows.push({
        podzakladka: tab.name,
        czestotliwosc: tab.frequency,
        data_poczatkowa: tab.startDate,
        status: '',
        data: '',
        tytul: '',
        link: '',
        tresc: '',
        slowa_kluczowe: '',
      });
      continue;
    }
    for (const post of posts) {
      rows.push({
        podzakladka: tab.name,
        czestotliwosc: tab.frequency,
        data_poczatkowa: tab.startDate,
        status: post.status,
        data: post.publishDate,
        tytul: post.title,
        link: post.link || '',
        tresc: post.content,
        slowa_kluczowe: postKeywordText(post),
      });
    }
  }
  return rows;
}

function downloadBlob(filename, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvEscape(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function exportPostsCsv() {
  const firm = getSelectedFirm(state);
  if (!firm) return;
  const headers = ['podzakladka', 'czestotliwosc', 'data_poczatkowa', 'status', 'data', 'tytul', 'link', 'tresc', 'slowa_kluczowe'];
  const rows = postExportRows(firm);
  const csv = '\ufeff' + [
    headers.join(','),
    ...rows.map((row) => headers.map((key) => csvEscape(row[key])).join(',')),
  ].join('\n');
  downloadBlob(`posty-${firmDisplayName(firm) || 'firma'}.csv`, csv, 'text/csv;charset=utf-8');
}

function exportPostsExcelFallback(firm) {
  const headers = ['Podzakladka', 'Czestotliwosc', 'Data poczatkowa', 'Status', 'Data', 'Tytul', 'Link', 'Tresc', 'Slowa kluczowe'];
  const keys = ['podzakladka', 'czestotliwosc', 'data_poczatkowa', 'status', 'data', 'tytul', 'link', 'tresc', 'slowa_kluczowe'];
  const rows = postExportRows(firm);
  const html = `
    <html><head><meta charset="utf-8"></head><body>
      <table>
        <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((row) => `<tr>${keys.map((key) => `<td>${escapeHtml(row[key])}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </body></html>
  `;
  downloadBlob(`posty-${firmDisplayName(firm) || 'firma'}.xls`, html, 'application/vnd.ms-excel;charset=utf-8');
}

function loadXlsxLibrary() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = XLSX_CDN_URL;
    script.async = true;
    script.onload = () => resolve(window.XLSX);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function exportPostsExcel() {
  const firm = getSelectedFirm(state);
  if (!firm) return;
  try {
    const XLSX = await loadXlsxLibrary();
    const worksheet = XLSX.utils.json_to_sheet(postExportRows(firm));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Posty');
    XLSX.writeFile(workbook, `posty-${firmDisplayName(firm) || 'firma'}.xlsx`);
  } catch (err) {
    console.warn('XLSX export fallback:', err);
    exportPostsExcelFallback(firm);
  }
}

function parseCsv(text) {
  const headerLine = String(text || '').split(/\r?\n/, 1)[0] || '';
  const delimiter = (headerLine.match(/;/g) || []).length > (headerLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value !== '')) rows.push(row);
  return rows;
}

function rowsToPostImport(records) {
  if (!records.length) return [];
  const headers = records[0].map((header) => String(header || '').trim().toLowerCase());
  return records.slice(1).map((row) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] || '';
    });
    return obj;
  });
}

async function importPostRows(importRows) {
  const firm = getSelectedFirm(state);
  if (!firm) return;
  const now = new Date().toISOString();
  const tabByName = new Map((firm.postTabs || []).map((tab) => [tab.name.toLowerCase(), tab]));
  let imported = 0;

  for (const row of importRows) {
    const tabName = String(row.podzakladka || row['podzakładka'] || row.category || '').trim();
    if (!tabName) continue;
    let tab = tabByName.get(tabName.toLowerCase());
    if (!tab) {
      tab = {
        id: uid(),
        name: tabName,
        frequency: String(row.czestotliwosc || row['częstotliwość'] || 'monthly'),
        startDate: String(row.data_poczatkowa || row['data poczatkowa'] || row['data początkowa'] || todayKey()),
        createdAt: now,
        updatedAt: now,
      };
      firm.postTabs = [...(firm.postTabs || []), tab];
      tabByName.set(tab.name.toLowerCase(), tab);
    }

    const title = String(row.tytul || row['tytuł'] || '').trim();
    const link = normalizePostLink(row.link || row.url || row['adres url'] || row['link do publikacji']);
    if (link && !safePostLink(link)) continue;
    const content = String(row.tresc || row['treść'] || '').trim();
    if (!title && !content) continue;
    firm.posts = [
      ...(firm.posts || []),
      {
        id: uid(),
        tabId: tab.id,
        status: String(row.status || 'scheduled') === 'published' || String(row.status || '').toLowerCase() === 'opublikowane' ? 'published' : 'scheduled',
        publishDate: String(row.data || row.date || todayKey()).slice(0, 10),
        title,
        link,
        content,
        keywords: splitKeywords(row.slowa_kluczowe || row['slowa kluczowe'] || row['słowa kluczowe'] || row.keywords),
        createdAt: now,
        updatedAt: now,
      },
    ];
    imported += 1;
  }

  firm.updatedAt = now;
  await tryPostCloudWrite(firm, async () => {
    await savePostTabDocs(firm, firm.postTabs || []);
    await savePostDocs(firm, firm.posts || []);
  }, 'Import postów');
  persistAndFlush();
  render();
  alert(`Import zakonczony. Dodano wpisow: ${imported}.`);
}

async function importPostsFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,.xls,.xlsx';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    try {
      if (ext === 'csv') {
        await importPostRows(rowsToPostImport(parseCsv(await file.text())));
        return;
      }
      if (ext === 'xls') {
        const html = await file.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const records = [...doc.querySelectorAll('tr')].map((tr) => [...tr.children].map((td) => td.textContent || ''));
        await importPostRows(rowsToPostImport(records));
        return;
      }
      const XLSX = await loadXlsxLibrary();
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
      await importPostRows(rows.map((row) => {
        const normalized = {};
        Object.keys(row).forEach((key) => {
          normalized[String(key).trim().toLowerCase()] = row[key];
        });
        return normalized;
      }));
    } catch (err) {
      console.error(err);
      alert('Nie udało się zaimportować pliku. Spróbuj CSV albo pliku wyeksportowanego z tej zakładki.');
    }
  });
  input.click();
}

function openFirmModal(firm = null) {
  openModal(
    firm ? 'Edytuj firme' : 'Dodaj firme',
    `
      <form id="firmForm" class="form-grid">
        ${labeledInput({ name: 'displayName', label: 'Nazwa własna', value: firm?.displayName || '', placeholder: 'Widoczna tylko dla Ciebie' })}
        ${labeledInput({ name: 'name', label: 'Nazwa firmy (do faktury)', value: firm?.name || '', required: true })}
        ${labeledInput({ name: 'nip', label: 'NIP', value: firm?.nip || '' })}
        ${labeledInput({ name: 'email', label: 'E-mail', type: 'email', value: firm?.email || '' })}
        ${labeledInput({ name: 'phone', label: 'Telefon', value: firm?.phone || '' })}
        ${labeledInput({ name: 'address1', label: 'Adres – ulica i numer', value: firm?.address1 || '' })}
        ${labeledInput({ name: 'address2', label: 'Adres – kod pocztowy, miejscowość', value: firm?.address2 || '' })}
        <div class="field field-span-2">
          <span>Notatki</span>
          <textarea name="notes" rows="4">${escapeHtml(firm?.notes || '')}</textarea>
        </div>
        <div class="modal-actions ${firm ? 'is-split' : ''}">
          ${firm ? '<button class="ghost-button tone-danger" type="button" id="deleteFirmButton">Usun firme</button>' : '<span></span>'}
          <div class="modal-actions-group">
            <button class="ghost-button" type="button" data-action="close-modal">Anuluj</button>
            <button class="primary-button" type="submit">${firm ? 'Zapisz firme' : 'Dodaj firme'}</button>
          </div>
        </div>
      </form>
    `
  );

  const form = document.getElementById('firmForm');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const now = new Date().toISOString();
    const firmId = firm?.id || uid();
    const nextFirm = {
      id: firmId,
      name: String(data.get('name') || '').trim(),
      displayName: String(data.get('displayName') || '').trim(),
      nip: String(data.get('nip') || '').trim(),
      address1: String(data.get('address1') || '').trim(),
      address2: String(data.get('address2') || '').trim(),
      email: String(data.get('email') || '').trim(),
      phone: String(data.get('phone') || '').trim(),
      notes: String(data.get('notes') || '').trim(),
      months: firm?.months || [],
      adBudgetEntries: firm?.adBudgetEntries || [],
      compensationEntries: firm?.compensationEntries || [],
      balanceEntries: firm?.balanceEntries || [],
      walletEntries: firm?.walletEntries || [],
      expenses: firm?.expenses || [],
      invoices: firm?.invoices || [],
      history: firm?.history || [],
      postTabs: firm ? (firm.postTabs || []) : undefined,
      posts: firm?.posts || [],
      postReminderKeys: firm?.postReminderKeys || [],
      createdAt: firm?.createdAt || now,
      updatedAt: now,
    };
    appendFirmHistory(nextFirm, {
      area: 'firm',
      action: firm ? 'edit' : 'create',
      title: firm ? 'Zmieniono dane klienta' : 'Dodano klienta',
    });

    state.firms = firm
      ? state.firms.map((item) => (item.id === firm.id ? nextFirm : item))
      : [...state.firms, nextFirm];

    state.ui.selectedFirmId = firmId;
    persist();
    closeModal();
    render();
  });

  if (firm) {
    document.getElementById('deleteFirmButton')?.addEventListener('click', () => {
      if (!window.confirm(`Usunac firme "${firmDisplayName(firm)}" razem z miesiacami, saldem, wydatkami i fakturami?`)) {
        return;
      }
      state.firms = state.firms.filter((item) => item.id !== firm.id);
      state.ui.selectedFirmId = state.firms[0]?.id || null;
      state.ui.selectedMonth = state.firms[0] ? '__all__' : null;
      persist();
      closeModal();
      render();
    });
  }
}

function budgetPeriodOptions(firm, existingMonth = null) {
  const used = new Set((firm.months || []).map((item) => item.month).filter(Boolean));
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear() + 1, 11, 1);
  const options = [];
  for (const date = new Date(start); date <= end; date.setMonth(date.getMonth() + 1)) {
    const key = date.toISOString().slice(0, 7);
    if (key === existingMonth || !used.has(key)) {
      options.push({ value: key, label: monthLabel(key) });
    }
  }
  const currentKey = currentMonthKey();
  const defaultMonth = options.find((item) => item.value >= currentKey)?.value || options[0]?.value || currentKey;
  return { options, defaultMonth };
}

function openMonthModal(existing = null) {
  const firm = getSelectedFirm(state);
  if (!firm) return;
  const isOutsideDefault = existing === '__out_of_period__';
  const monthExisting = existing && existing !== '__out_of_period__' ? existing : null;
  const { options, defaultMonth } = budgetPeriodOptions(firm, monthExisting?.month || null);
  const periodOptions = [
    ...options,
    { value: '__out_of_period__', label: 'Poza okresem' },
  ];
  const periodValue = isOutsideDefault
    ? '__out_of_period__'
    : monthExisting?.month || defaultMonth;

  openModal(
    monthExisting ? 'Edytuj okres' : 'Dodaj budżet',
    `
      <form id="monthForm" class="form-grid">
        ${monthExisting ? monthYearFields('month', monthExisting.month) : labeledInput({ name: 'period', label: 'Okres', type: 'select', value: periodValue, options: periodOptions })}
        ${labeledInput({ name: 'budget', label: 'Budżet reklamowy', type: 'number', value: monthExisting?.budget ?? '', min: '0', required: true })}
        ${monthExisting ? `
        <div class="modal-actions is-split">
          <button class="ghost-button tone-danger" type="button" id="deleteMonthButton" data-action="delete-month-from-modal" data-month="${monthExisting.month}">Usuń okres</button>
          <div class="modal-actions-group">
            <button class="ghost-button" type="button" data-action="close-modal">Anuluj</button>
            <button class="primary-button" type="submit">Zapisz okres</button>
          </div>
        </div>` : modalActions('Dodaj budżet')}
      </form>
    `
  );

  // Usun miesiac (inline listener)
  if (monthExisting) {
    const delBtn = document.getElementById('deleteMonthButton');
    delBtn?.addEventListener('click', () => {
      const month = monthExisting.month;
      if (!confirm(`Usunąć okres ${monthLabel(month)}?`)) return;
      firm.months = (firm.months || []).filter(m => m.month !== month);
      firm.expenses = (firm.expenses || []).filter(e => (e.month || monthFromDate(e.date)) !== month);
      firm.balanceEntries = (firm.balanceEntries || []).filter(e => monthFromDate(e.date) !== month);
      firm.walletEntries = (firm.walletEntries || []).filter(e => getWalletEntryMonth(e) !== month);
      firm.invoices = (firm.invoices || []).filter(inv => getInvoiceMonthKey(inv) !== month);
      firm.updatedAt = new Date().toISOString();
      appendFirmHistory(firm, {
        area: 'budget',
        action: 'delete',
        title: 'Usunięto okres rozliczeniowy',
        amount: monthExisting.budget || 0,
        meta: { period: monthLabel(month) },
      });
      state.ui.selectedMonth = '__all__';
      state.ui.activeMonthTab = 'overview';
      persist();
      closeModal();
      render();
    });
  }

  const form = document.getElementById('monthForm');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const selectedPeriod = monthExisting ? readMonthYear(data, 'month') : String(data.get('period') || defaultMonth);
    const budget = roundCurrency(data.get('budget'));

    if (!monthExisting && selectedPeriod === '__out_of_period__') {
      const entry = {
        id: uid(),
        date: new Date().toISOString().slice(0, 10),
        amount: budget,
        description: 'Budżet poza okresem',
        createdAt: new Date().toISOString(),
      };
      firm.adBudgetEntries = [...(firm.adBudgetEntries || []), entry];
      firm.updatedAt = new Date().toISOString();
      appendFirmHistory(firm, {
        area: 'budget',
        action: 'create',
        title: 'Dodano budżet poza okresem',
        amount: budget,
        meta: { period: 'Poza okresem' },
      });
      state.ui.selectedMonth = '__all__';
      persist();
      closeModal();
      render();
      return;
    }

    const month = selectedPeriod;

    // Blokada duplikatow
    if (!monthExisting && firm.months.some(m => m.month === month)) {
      alert('Ten okres już istnieje. Wybierz inny.');
      return;
    }

    const monthEntry = {
      id: monthExisting?.id || uid(),
      month,
      budget,
      compensationPercent: monthExisting?.compensationPercent ?? 0,
      updatedAt: new Date().toISOString(),
    };

    firm.months = [
      ...firm.months.filter((item) => item.month !== month && item.id !== monthEntry.id),
      monthEntry,
    ].sort((a, b) => a.month.localeCompare(b.month));
    firm.updatedAt = new Date().toISOString();
    appendFirmHistory(firm, {
      area: 'budget',
      action: monthExisting ? 'edit' : 'create',
      title: monthExisting ? 'Zmieniono budżet okresu' : 'Dodano okres rozliczeniowy',
      amount: budget,
      meta: { period: monthLabel(month) },
    });
    state.ui.selectedMonth = '__all__';
    state.ui.activeMonthTab = 'overview';
    persist();
    closeModal();
    render();
  });
}

/** 2-krokowy modal edycji miesiaca (wywolywany z dropdowna "Edytuj miesiac...")
 *  Krok 1: wybor miesiaca z listy.
 *  Krok 2: formularz edycji wybranego miesiaca.
 */
function openEditMonthPicker() {
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
    showMonthEditStep2(row.dataset.month);
  });
}

/** Krok 2 - formularz edycji wybranego miesiaca */
function showMonthEditStep2(month) {
  const firm = getSelectedFirm(state);
  if (!firm) return;
  const existing = findMonthConfig(month);
  if (!existing) return;

  const formContent = `
    <div class="edit-month-step2">
      <p class="eyebrow">Krok 2 z 2</p>
      <h3>Edytuj: ${monthLabel(month)}</h3>
      <form id="monthForm" class="form-grid">
        ${monthYearFields('month', existing.month)}
        ${labeledInput({ name: 'budget', label: 'Budżet reklamowy', type: 'number', value: existing.budget ?? '', min: '0', required: true })}
        <div class="modal-actions is-split">
          <button class="ghost-button tone-danger" type="button" id="deleteMonthButton">Usun miesiac</button>
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

  // Usun miesiac
  const delBtn2 = document.getElementById('deleteMonthButton');
  delBtn2?.addEventListener('click', () => {
    if (!confirm(`Usunac miesiac ${monthLabel(month)}?`)) return;
    firm.months = (firm.months || []).filter(m => m.month !== month);
    firm.expenses = (firm.expenses || []).filter(e => (e.month || monthFromDate(e.date)) !== month);
    firm.balanceEntries = (firm.balanceEntries || []).filter(e => monthFromDate(e.date) !== month);
    firm.walletEntries = (firm.walletEntries || []).filter(e => getWalletEntryMonth(e) !== month);
    firm.invoices = (firm.invoices || []).filter(inv => getInvoiceMonthKey(inv) !== month);
    firm.updatedAt = new Date().toISOString();
    appendFirmHistory(firm, {
      area: 'budget',
      action: 'delete',
      title: 'Usunięto okres rozliczeniowy',
      amount: existing.budget || 0,
      meta: { period: monthLabel(month) },
    });
    state.ui.selectedMonth = '__all__';
    state.ui.activeMonthTab = 'overview';
    persist();
    closeModal();
    render();
  });

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
      id: existing.id,
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
    appendFirmHistory(firm, {
      area: 'budget',
      action: 'edit',
      title: 'Zmieniono budżet okresu',
      amount: monthEntry.budget,
      meta: { period: monthLabel(monthVal) },
    });
    state.ui.selectedMonth = monthVal;
    state.ui.activeMonthTab = 'overview';
    persist();
    closeModal();
    render();
  });
}

function openBalanceEntryModal(existing = null, defaultDirection = 'plus') {
  const firm = getSelectedFirm(state);
  if (!firm) return;
  const direction = existing ? (Number(existing.amount || 0) < 0 ? 'minus' : 'plus') : defaultDirection;

  openModal(
    existing ? 'Edytuj saldo' : (direction === 'minus' ? 'Odejmij z salda' : 'Dodaj do salda'),
    `
      <form id="balanceForm" class="form-grid">
        ${labeledInput({ name: 'date', label: 'Data', type: 'date', value: existing?.date || new Date().toISOString().slice(0, 10), required: true })}
        ${labeledInput({
          name: 'direction',
          label: 'Typ zmiany',
          type: 'select',
          value: direction,
          options: [
            { value: 'plus', label: 'Dodaj do salda' },
            { value: 'minus', label: 'Odejmij z salda' },
          ],
        })}
        ${labeledInput({ name: 'amount', label: 'Kwota', type: 'number', value: Math.abs(existing?.amount ?? ''), min: '0', required: true })}
        <div class="field field-span-2">
          <span>Opis</span>
          <input type="text" name="description" value="${escapeHtml(existing?.description || '')}" placeholder="Np. wplata klienta, korekta, zwrot" required />
        </div>
        ${modalActions(existing ? 'Zapisz zmiane' : 'Dodaj zmiane')}
      </form>
    `
  );

  const form = document.getElementById('balanceForm');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const sign = String(data.get('direction')) === 'minus' ? -1 : 1;
    const entry = {
      id: existing?.id || uid(),
      date: String(data.get('date')),
      amount: roundCurrency(Number(data.get('amount') || 0) * sign),
      description: String(data.get('description') || '').trim(),
      createdAt: existing?.createdAt || new Date().toISOString(),
    };
    firm.balanceEntries = [...firm.balanceEntries.filter((item) => item.id !== entry.id), entry]
      .sort((a, b) => a.date.localeCompare(b.date));
    firm.updatedAt = new Date().toISOString();
    appendFirmHistory(firm, {
      area: 'wallet',
      action: existing ? 'edit' : 'create',
      title: existing ? 'Zmieniono korektę rozrachunku' : 'Dodano korektę rozrachunku',
      amount: entry.amount,
      meta: { period: monthLabel(monthFromDate(entry.date)) },
    });
    persist();
    closeModal();
    render();
  });
}

function openAdBudgetEntryModal(existing = null) {
  const firm = getSelectedFirm(state);
  if (!firm) return;

  openModal(
    existing ? 'Edytuj budżet poza okresem' : 'Dodaj budżet poza okresem',
    `
      <form id="adBudgetForm" class="form-grid">
        ${labeledInput({ name: 'date', label: 'Data', type: 'date', value: existing?.date || new Date().toISOString().slice(0, 10), required: true })}
        ${labeledInput({ name: 'amount', label: 'Kwota', type: 'number', value: existing?.amount ?? '', min: '0', required: true })}
        <div class="field field-span-2">
          <span>Opis</span>
          <input type="text" name="description" value="${escapeHtml(existing?.description || '')}" placeholder="Np. dodatkowy budżet reklamowy bez wynagrodzenia" required />
        </div>
        ${modalActions(existing ? 'Zapisz budżet' : 'Dodaj budżet')}
      </form>
    `
  );

  const form = document.getElementById('adBudgetForm');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const amount = roundCurrency(data.get('amount'));
    if (amount <= 0) {
      window.alert('Podaj kwotę większą od 0.');
      return;
    }

    const entry = {
      id: existing?.id || uid(),
      date: String(data.get('date')),
      amount,
      description: String(data.get('description') || '').trim(),
      createdAt: existing?.createdAt || new Date().toISOString(),
    };

    firm.adBudgetEntries = [
      ...(firm.adBudgetEntries || []).filter((item) => item.id !== entry.id),
      entry,
    ].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    firm.updatedAt = new Date().toISOString();
    appendFirmHistory(firm, {
      area: 'budget',
      action: existing ? 'edit' : 'create',
      title: existing ? 'Zmieniono budżet poza okresem' : 'Dodano budżet poza okresem',
      amount,
      meta: { period: 'Poza okresem' },
    });
    persist();
    closeModal();
    render();
  });
}

function openCompensationEntryModal(existing = null) {
  const firm = getSelectedFirm(state);
  if (!firm) return;
  const monthOptions = [
    { value: '', label: 'Według daty' },
    ...(firm.months || [])
      .slice()
      .sort((a, b) => b.month.localeCompare(a.month))
      .map((month) => ({ value: month.month, label: monthLabel(month.month) })),
  ];

  openModal(
    existing ? 'Edytuj wynagrodzenie' : 'Dodaj wynagrodzenie',
    `
      <form id="compensationForm" class="form-grid">
        ${labeledInput({ name: 'date', label: 'Data', type: 'date', value: existing?.date || new Date().toISOString().slice(0, 10), required: true })}
        ${labeledInput({ name: 'period', label: 'Okres', type: 'select', value: existing?.period || '', options: monthOptions })}
        ${labeledInput({ name: 'amount', label: 'Kwota', type: 'number', value: existing?.amount ?? '', min: '0', required: true })}
        <div class="field field-span-2">
          <span>Opis</span>
          <input type="text" name="title" value="${escapeHtml(existing?.title || '')}" placeholder="Np. wynagrodzenie za obsługę kampanii" required />
        </div>
        ${modalActions(existing ? 'Zapisz wynagrodzenie' : 'Dodaj wynagrodzenie')}
      </form>
    `
  );

  const form = document.getElementById('compensationForm');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const amount = roundCurrency(data.get('amount'));
    if (amount <= 0) {
      window.alert('Podaj kwotę większą od 0.');
      return;
    }

    const entry = {
      id: existing?.id || uid(),
      date: String(data.get('date')),
      period: String(data.get('period') || '') || null,
      title: String(data.get('title') || '').trim(),
      amount,
      createdAt: existing?.createdAt || new Date().toISOString(),
    };

    firm.compensationEntries = [
      ...(firm.compensationEntries || []).filter((item) => item.id !== entry.id),
      entry,
    ].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    firm.updatedAt = new Date().toISOString();
    appendFirmHistory(firm, {
      area: 'compensation',
      action: existing ? 'edit' : 'create',
      title: existing ? 'Zmieniono wynagrodzenie' : 'Dodano wynagrodzenie',
      amount,
      meta: { period: entry.period ? monthLabel(entry.period) : 'Według daty' },
    });
    persist();
    closeModal();
    render();
  });
}

function openWalletIncomeModal(existing) {
  existing = existing || null;
  var firm = getSelectedFirm(state);
  if (!firm) return;
  var monthOpts = [{ value: '', label: '-- Wybierz okres --' }];
  var months = [...(firm.months || [])].sort(function(a, b) { return b.month.localeCompare(a.month); });
  for (var i = 0; i < months.length; i++) {
    monthOpts.push({ value: months[i].month, label: monthLabel(months[i].month) });
  }
  var defaultPeriod = existing ? (existing.period || existing.date.slice(0, 7)) : (state.ui.selectedMonth || new Date().toISOString().slice(0, 7));
  var hasValidPeriod = monthOpts.some(function(o) { return o.value === defaultPeriod; });
  var periodVal = hasValidPeriod ? defaultPeriod : '';

  var formContent = (function() {
    var dateVal = existing ? existing.date : new Date().toISOString().slice(0, 10);
    var titleVal = existing ? existing.title : '';
    var amountVal = existing ? existing.amount : '';
    return labeledInput({ name: 'date', label: 'Data', type: 'date', value: dateVal, required: true })
      + labeledInput({ name: 'title', label: 'Opis', value: titleVal, placeholder: 'Np. Wplata klienta za dwa miesiace', required: true })
      + labeledInput({ name: 'amount', label: 'Kwota', type: 'number', value: amountVal, min: '0', required: true })
      + labeledInput({ name: 'period', label: 'Okres rozliczeniowy', type: 'select', value: periodVal, options: monthOpts })
      + modalActions(existing ? 'Zapisz wplate' : 'Dodaj wplate');
  })();

  openModal(existing ? 'Edytuj wplate klienta' : 'Dodaj wplate klienta', '<form id="walletIncomeForm" class="form-grid">' + formContent + '</form>');

  var form = document.getElementById('walletIncomeForm');
  form.addEventListener('submit', function(event) {
    event.preventDefault();
    var data = new FormData(form);
    var periodRaw = String(data.get('period') || '');
    var dateVal = String(data.get('date'));
    var entry = {
      id: existing ? existing.id : uid(),
      type: 'income',
      date: dateVal,
      title: String(data.get('title') || '').trim(),
      amount: roundCurrency(data.get('amount')),

      period: periodRaw || dateVal.slice(0, 7),
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
    };
    firm.walletEntries = [
      ...(firm.walletEntries || []).filter(function(e) { return e.id !== entry.id; }),
      entry,
    ].sort(function(a, b) { return (a.date || '').localeCompare(b.date || ''); });
    firm.updatedAt = new Date().toISOString();
    appendFirmHistory(firm, {
      area: 'wallet',
      action: existing ? 'edit' : 'create',
      title: existing ? 'Zmieniono wpłatę klienta' : 'Dodano wpłatę klienta',
      amount: entry.amount,
      meta: { period: monthLabel(entry.period) },
    });
    persist();
    closeModal();
    render();
  });
}

// --- Event Handling ---
async function handleClick(event) {
  if (event.target instanceof HTMLElement && event.target.classList.contains('modal-overlay')) {
    closeModal();
    return;
  }

  const target = event.target.closest('[data-action]');
  if (!target) return;

  const { action } = target.dataset;
  const firm = getSelectedFirm(state);

  if (action === 'close-modal') return closeModal();
  if (action === 'add-firm') return openFirmModal();
  if (action === 'edit-firm') return openFirmModal(firm);
  if (action === 'back-to-list') {
    sessionStorage.removeItem('ijanicki_firma_activeFirm');
    sessionStorage.removeItem('ijanicki_firma_activeMonth');
    sessionStorage.removeItem('ijanicki_firma_activeTab');
    state.ui.selectedFirmId = null;
    state.ui.selectedMonth = '__all__';
    state.ui.activeTab = 'overview';
    state.ui.activeGlobalTab = 'firms';
    persist();
    return render();
  }
  if (action === 'switch-firm-tab') {
    state.ui.activeTab = target.dataset.tab || 'overview';
    persist();
    render();
    return;
  }

  // Navigation
  if (action === 'nav-faktury') return navigateTo('faktury.html', state);
  if (action === 'nav-portfel') return navigateTo('portfel.html', state);

  if (action === 'edit-firm-from-list') {
    const found = state.firms.find((item) => item.id === target.dataset.id);
    if (found) return openFirmModal(found);
    return;
  }
  if (action === 'delete-firm-from-list') {
    const found = state.firms.find((item) => item.id === target.dataset.id);
    if (!found) return;
    if (!window.confirm(`Usunac firme "${found.name}" razem z miesiacami, saldem, wydatkami i fakturami?`)) return;
    state.firms = state.firms.filter((item) => item.id !== found.id);
    if (state.ui.selectedFirmId === found.id) {
      state.ui.selectedFirmId = state.firms[0]?.id || null;
      state.ui.selectedMonth = state.firms[0] ? '__all__' : null;
    }
    persist();
    return render();
  }
  if (action === 'select-firm') {
    state.ui.selectedFirmId = target.dataset.id;
    state.ui.selectedMonth = '__all__';
    state.ui.activeTab = 'overview';
    state.ui.activePostTabId = null;
    state.ui.activeMonthTab = 'overview';
    state.ui.activeGlobalTab = 'firms';
    persist();
    return render();
  }
  if (action === 'switch-global-tab') {
    state.ui.activeGlobalTab = target.dataset.tab;
    state.ui.selectedFirmId = null;
    persist();
    return render();
  }
  if (action === 'preview-global-invoice') {
    var inv = findInvoiceGlobal(target.dataset.inv, target.dataset.firm);
    if (inv) {
      openInvoicePreview({ invoice: inv.invoice, firm: inv.firm, issuer: state.settings.issuer });
    }
    return;
  }
  if (action === 'view-global-invoice') {
    var inv = findInvoiceGlobal(target.dataset.inv, target.dataset.firm);
    if (inv) {
      openInvoiceDetailModal(inv.invoice, inv.firm);
    }
    return;
  }
  if (action === 'download-global-attachment') {
    var inv = findInvoiceGlobal(target.dataset.inv, target.dataset.firm);
    if (inv && inv.invoice.attachmentIds && inv.invoice.attachmentIds.length) {
      for (var i = 0; i < inv.invoice.attachmentIds.length; i++) {
        void openAttachmentById(inv.invoice.attachmentIds[i]);
      }
    }
    return;
  }
  if (action === 'toggle-global-actions') {
    var menu = document.querySelector('[data-global-actions-menu="' + target.dataset.inv + '"]');
    if (!menu) return;
    document.querySelectorAll('.actions-menu.open').forEach(function(m) {
      if (m !== menu) m.classList.remove('open');
    });
    var isOpen = menu.classList.contains('open');
    if (!isOpen) {
      var btn = target.closest('.actions-toggle') || target;
      var rect = btn.getBoundingClientRect();
      menu.style.left = Math.max(8, rect.right - 180) + 'px';
      menu.style.top = (rect.bottom + 4) + 'px';
    }
    menu.classList.toggle('open');
    return;
  }
  if (action === 'select-month') {
    state.ui.selectedMonth = target.dataset.month;
    state.ui.activeMonthTab = 'overview';
    persist();
    return render();
  }
  if (action === 'add-month') return openMonthModal();
  if (action === 'edit-month') {
    const month = target.dataset.month;
    const existing = findMonthConfig(month);
    return openMonthModal(existing || { month });
  }
  if (action === 'edit-month-from-picker') {
    const month = target.dataset.month;
    if (!month) return;
    const existing = findMonthConfig(month);
    if (!existing) return;
    return openMonthModal(existing);
  }
  if (action === 'delete-month') {
    if (!firm || !window.confirm(`Usunac miesiac ${monthLabel(target.dataset.month)}?`)) return;
    const month = target.dataset.month;
    const removedMonth = findMonthConfig(month);
    // Usuń konfigurację miesiąca
    firm.months = (firm.months || []).filter(m => m.month !== month);
    // Usuń wydatki
    firm.expenses = (firm.expenses || []).filter(e => (e.month || monthFromDate(e.date)) !== month);
    // Usuń wpisy bilansowe
    firm.balanceEntries = (firm.balanceEntries || []).filter(e => monthFromDate(e.date) !== month);
    // Usuń wpisy portfela
    firm.walletEntries = (firm.walletEntries || []).filter(e => getWalletEntryMonth(e) !== month);
    // Usuń faktury
    firm.invoices = (firm.invoices || []).filter(inv => getInvoiceMonthKey(inv) !== month);
    firm.updatedAt = new Date().toISOString();
    appendFirmHistory(firm, {
      area: 'budget',
      action: 'delete',
      title: 'Usunięto okres rozliczeniowy',
      amount: removedMonth?.budget || 0,
      meta: { period: monthLabel(month) },
    });
    persist();
    return render();
  }
  if (action === 'delete-month-from-modal') {
    if (!firm || !window.confirm(`Usunac miesiac ${monthLabel(target.dataset.month)}?`)) return;
    const month = target.dataset.month;
    const removedMonth = findMonthConfig(month);
    firm.months = (firm.months || []).filter(m => m.month !== month);
    firm.expenses = (firm.expenses || []).filter(e => (e.month || monthFromDate(e.date)) !== month);
    firm.balanceEntries = (firm.balanceEntries || []).filter(e => monthFromDate(e.date) !== month);
    firm.walletEntries = (firm.walletEntries || []).filter(e => getWalletEntryMonth(e) !== month);
    firm.invoices = (firm.invoices || []).filter(inv => getInvoiceMonthKey(inv) !== month);
    firm.updatedAt = new Date().toISOString();
    appendFirmHistory(firm, {
      area: 'budget',
      action: 'delete',
      title: 'Usunięto okres rozliczeniowy',
      amount: removedMonth?.budget || 0,
      meta: { period: monthLabel(month) },
    });
    state.ui.selectedMonth = '__all__';
    state.ui.activeMonthTab = 'overview';
    persist();
    closeModal();
    return render();
  }
  if (action === 'add-balance-plus') return openBalanceEntryModal(null, 'plus');
  if (action === 'add-balance-minus') return openBalanceEntryModal(null, 'minus');
  if (action === 'edit-balance') return openBalanceEntryModal(findBalanceEntry(target.dataset.id));
  if (action === 'add-ad-budget') return openMonthModal('__out_of_period__');
  if (action === 'edit-ad-budget') return openAdBudgetEntryModal(findAdBudgetEntry(target.dataset.id));
  if (action === 'delete-ad-budget') {
    if (!firm || !window.confirm('Usunac ten budzet poza okresem?')) return;
    const removed = (firm.adBudgetEntries || []).find((item) => item.id === target.dataset.id);
    firm.adBudgetEntries = (firm.adBudgetEntries || []).filter((item) => item.id !== target.dataset.id);
    firm.updatedAt = new Date().toISOString();
    appendFirmHistory(firm, {
      area: 'budget',
      action: 'delete',
      title: 'Usunięto budżet poza okresem',
      amount: removed?.amount || 0,
      meta: { period: 'Poza okresem' },
    });
    persist();
    return render();
  }
  if (action === 'add-compensation') return openCompensationEntryModal();
  if (action === 'edit-compensation') return openCompensationEntryModal(findCompensationEntry(target.dataset.id));
  if (action === 'delete-compensation') {
    if (!firm || !window.confirm('Usunąć to wynagrodzenie?')) return;
    const removed = (firm.compensationEntries || []).find((item) => item.id === target.dataset.id);
    firm.compensationEntries = (firm.compensationEntries || []).filter((item) => item.id !== target.dataset.id);
    firm.updatedAt = new Date().toISOString();
    appendFirmHistory(firm, {
      area: 'compensation',
      action: 'delete',
      title: 'Usunięto wynagrodzenie',
      amount: removed?.amount || 0,
      meta: { period: removed?.period ? monthLabel(removed.period) : 'Według daty' },
    });
    persist();
    return render();
  }
  if (action === 'delete-balance') {
    if (!firm || !window.confirm('Usunac te zmiane salda?')) return;
    const removed = firm.balanceEntries.find((item) => item.id === target.dataset.id);
    firm.balanceEntries = firm.balanceEntries.filter((item) => item.id !== target.dataset.id);
    firm.updatedAt = new Date().toISOString();
    appendFirmHistory(firm, {
      area: 'wallet',
      action: 'delete',
      title: 'Usunięto korektę rozrachunku',
      amount: removed?.amount || 0,
      meta: { period: removed?.date ? monthLabel(monthFromDate(removed.date)) : '' },
    });
    persist();
    return render();
  }
  if (action === 'add-wallet-expense') {
    navigateTo('portfel.html', state);
    return;
  }
  if (action === 'add-wallet-income') {
    openWalletIncomeModal(null);
    return;
  }
  if (action === 'delete-wallet-entry') {
    if (!firm || !window.confirm('Usunac ten wpis portfela?')) return;
    const removed = (firm.walletEntries || []).find(function(item) { return item.id === target.dataset.id; });
    firm.walletEntries = (firm.walletEntries || []).filter(function(item) { return item.id !== target.dataset.id; });
    firm.updatedAt = new Date().toISOString();
    appendFirmHistory(firm, {
      area: 'wallet',
      action: 'delete',
      title: 'Usunięto wpłatę klienta',
      amount: removed?.amount || 0,
      meta: { period: removed?.period ? monthLabel(removed.period) : '' },
    });
    persist();
    return render();
  }
  if (action === 'issue-invoice') {
    navigateTo('faktury.html', state);
    return;
  }
  if (action === 'select-post-tab') {
    state.ui.activePostTabId = target.dataset.id;
    persist();
    return render();
  }
  if (action === 'add-post-tab') return openPostTabModal();
  if (action === 'edit-post-tab') return openPostTabModal(findPostTab(target.dataset.id));
  if (action === 'delete-post-tab') {
    const tab = findPostTab(target.dataset.id);
    if (!firm || !tab) return;
    if (!confirm(`Usunac podzakladke "${tab.name}" razem ze wszystkimi wpisami?`)) return;
    await tryPostCloudWrite(firm, () => deletePostTabDoc(firm, tab.id), 'Usuwanie podzakładki postów');
    firm.postTabs = (firm.postTabs || []).filter((item) => item.id !== tab.id);
    firm.posts = (firm.posts || []).filter((post) => post.tabId !== tab.id);
    firm.updatedAt = new Date().toISOString();
    state.ui.activePostTabId = firm.postTabs[0]?.id || null;
    persistAndFlush();
    return render();
  }
  if (action === 'add-post') return openPostModal();
  if (action === 'edit-post') return openPostModal(findPost(target.dataset.id));
  if (action === 'preview-post') return openPostPreview(findPost(target.dataset.id));
  if (action === 'dismiss-similar-alert') {
    const key = target.dataset.alertKey;
    if (!key) return;
    dismissSimilarAlert(key);
    return render();
  }
  if (action === 'publish-post') {
    const post = findPost(target.dataset.id);
    if (!firm || !post) return;
    if (post.status === 'published') return;
    post.status = 'published';
    post.publishDate = todayKey();
    post.updatedAt = new Date().toISOString();
    firm.updatedAt = post.updatedAt;
    await tryPostCloudWrite(firm, () => savePostDoc(firm, post), 'Publikacja wpisu');
    persistAndFlush();
    return render();
  }
  if (action === 'delete-post') {
    if (!firm || !confirm('Usunac ten wpis?')) return;
    await tryPostCloudWrite(firm, () => deletePostDoc(firm, target.dataset.id), 'Usuwanie wpisu');
    firm.posts = (firm.posts || []).filter((post) => post.id !== target.dataset.id);
    firm.updatedAt = new Date().toISOString();
    persistAndFlush();
    return render();
  }
  if (action === 'export-posts-csv') return exportPostsCsv();
  if (action === 'export-posts-excel') {
    void exportPostsExcel();
    return;
  }
  if (action === 'import-posts') {
    void importPostsFile();
    return;
  }
}

// --- Render ---
function render() {
  try {
    const firm = getSelectedFirm(state);
    if (firm && state.ui.selectedFirmId) {
      root.innerHTML = renderFirmDetail();
      updateTopbar(state, state.ui.activeTab || 'overview');
    } else if (state.ui.activeGlobalTab === 'my-invoices') {
      state.ui.selectedFirmId = null;
      root.innerHTML = renderAllOwnInvoices();
      updateTopbar(state, state.ui.activeTab || 'overview');
      document.querySelector('[data-action="switch-global-tab"][data-tab="firms"]')?.classList.remove('is-active');
      document.querySelector('[data-action="switch-global-tab"][data-tab="my-invoices"]')?.classList.add('is-active');
    } else {
      state.ui.selectedFirmId = null;
      root.innerHTML = renderFirmList(state);
      updateTopbar(state, state.ui.activeTab || 'overview');
    }
  } catch (e) {
    root.innerHTML = `
      <div style="padding: 40px; color: #f44; font-family: monospace;">
        <h2>Blad renderowania</h2>
        <pre>${escapeHtml(e.message)}</pre>
        <pre style="font-size: 0.8rem; color: #888;">${escapeHtml(e.stack)}</pre>
      </div>
    `;
  }
}

// --- Init ---
document.body.addEventListener('click', handleClick);

// Zamknij dropdowny po kliknieciu poza menu
document.body.addEventListener('click', function(event) {
  if (!event.target.closest('.actions-dropdown')) {
    document.querySelectorAll('.actions-menu.open').forEach(function(m) { m.classList.remove('open'); });
  }
});

document.body.addEventListener('change', (event) => {
  const firmTarget = event.target.closest('[data-action="select-firm-dropdown"]');
  if (firmTarget) {
    if (!state.firms.some((item) => item.id === firmTarget.value)) return;
    state.ui.selectedFirmId = firmTarget.value;
    state.ui.selectedMonth = '__all__';
    state.ui.activeMonthTab = 'overview';
    persist();
    return render();
  }

  const financeTarget = event.target.closest('[data-action="finance-nav"]');
  if (financeTarget) {
    const value = financeTarget.value || '';
    if (value === 'invoices') return navigateTo('faktury.html', state);
    if (value === 'balance') return navigateTo('portfel.html', state);
    if (value === 'compensation') {
      state.ui.activeTab = 'compensation';
      persist();
      render();
    }
    return;
  }

  const target = event.target.closest('[data-action="select-month-dropdown"]');
  if (!target) return;
  const firm = getSelectedFirm(state);
  if (!firm) return;

  state.ui.selectedMonth = target.value;
  state.ui.activeMonthTab = 'overview';
  persist();
  render();
});

document.body.addEventListener('input', (event) => {
  const target = event.target.closest('[data-action="filter-post-search"]');
  if (!target) return;
  state.ui.postSearch = target.value || '';
  if (postSearchTimer) clearTimeout(postSearchTimer);
  postSearchTimer = setTimeout(() => {
    postSearchTimer = null;
    render();
    const input = document.querySelector('[data-action="filter-post-search"]');
    if (input) {
      input.focus();
      const end = String(input.value || '').length;
      input.setSelectionRange(end, end);
    }
  }, 180);
});

// Sprawdz czy zalogowany
if (sessionStorage.getItem('ijanicki_firma_loggedIn') !== 'true') {
  window.location.href = 'index.html';
} else {
  initSyncIndicator();
  syncFromCloud().then(() => {
    // Po synchronizacji z chmury, przeładuj stan z localStorage
    // (syncFromCloud zapisuje do localStorage, ale nie aktualizuje
    // lokalnej zmiennej state, przez co render() widział pusty stan)
    state = initializeState();
    applyOverviewEntryContext(state);
    render();
  });
}
