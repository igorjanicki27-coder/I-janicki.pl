import {
  calculateFirmLedger,
  currentMonthKey,
  formatCurrency,
  formatDate,
  getInvoiceMonthKey,
  getScopeMonthKeys,
  monthLabel,
  roundCurrency,
  uid,
  VAT_OPTIONS,
} from './logic.js?v=17';
import {
  deleteAttachment,
  getAttachment,
  storeAttachment,
  syncFromCloud,
  MAX_ATTACHMENT_BYTES,
} from './storage.js?v=17';
import {
  icon,
  escapeHtml,
  statCard,
  firmDisplayName,
  initializeState,
  persistState,
  getSelectedFirm,
  ensureSelectedMonth,
  safeMonthValue,
  setModalRoot,
  closeModal,
  openModal,
  labeledInput,
  modalActions,
  updateTopbar,
  renderFabMenu,
  navigateTo,
  openEditMonthPicker,
  restoreContext,
  initSyncIndicator,
} from './core.js?v=17';
import { openInvoicePreview } from './invoice.js?v=18';

// --- State ---
let state = initializeState();
restoreContext(state);
state.ui.activeTab = 'invoices';

const root = document.getElementById('app');
const modalRoot = document.getElementById('modalRoot');
setModalRoot(modalRoot);

// Back button — clear firm context and return to firm list
document.querySelector('.back-to-company')?.addEventListener('click', () => {
  sessionStorage.removeItem('ijanicki_firma_activeFirm');
  sessionStorage.removeItem('ijanicki_firma_activeMonth');
  state.ui.selectedFirmId = null;
  state.ui.activeGlobalTab = 'firms';
  persistState(state);
  window.location.href = 'przeglad.html';
});

function persist() {
  state = persistState(state);
  firm = getSelectedFirm(state);
  sessionStorage.setItem('ijanicki_firma_activeFirm', state.ui.selectedFirmId || '');
  sessionStorage.setItem('ijanicki_firma_activeMonth', state.ui.selectedMonth || '');
}

let firm = getSelectedFirm(state);

function removeLinkedWalletEntries(invoiceId) {
  if (!firm) return;
  firm.walletEntries = (firm.walletEntries || []).filter((entry) => entry.linkedInvoiceId !== invoiceId);
}

function removeLinkedExpenses(invoiceId) {
  if (!firm) return;
  firm.expenses = (firm.expenses || []).filter((entry) => entry.linkedInvoiceId !== invoiceId);
}

function ensureIncomeForOwnInvoice(invoice) {
  if (!firm) return;
  if (!firm.walletEntries) firm.walletEntries = [];
  const existing = firm.walletEntries.find((entry) => entry.linkedInvoiceId === invoice.id && entry.type === 'income');
  const nextEntry = {
    id: existing?.id || uid(),
    type: 'income',
    date: invoice.issueDate,
    title: invoice.title || invoice.number || 'Wpłata klienta',
    amount: invoice.amount,
    period: invoice.month || invoice.issueDate?.slice(0, 7),
    linkedInvoiceId: invoice.id,
    createdAt: existing?.createdAt || new Date().toISOString(),
  };
  firm.walletEntries = [
    ...(firm.walletEntries || []).filter((entry) => entry.id !== nextEntry.id),
    nextEntry,
  ].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

function ensureExpenseForExternalInvoice(invoice, payer) {
  if (!firm) return;
  if (!firm.expenses) firm.expenses = [];
  const existing = firm.expenses.find((entry) => entry.linkedInvoiceId === invoice.id);
  const nextExpense = {
    id: existing?.id || uid(),
    date: invoice.issueDate,
    month: invoice.month || invoice.issueDate?.slice(0, 7),
    category: invoice.category || 'inne',
    amount: invoice.amount,
    payer,
    vendor: invoice.vendor || '',
    description: invoice.title || invoice.number || '',
    linkedInvoiceId: invoice.id,
    attachmentIds: invoice.attachmentIds || [],
    createdAt: existing?.createdAt || new Date().toISOString(),
  };
  firm.expenses = [
    ...(firm.expenses || []).filter((entry) => entry.id !== nextExpense.id),
    nextExpense,
  ].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

function syncInvoiceFinancialState(invoice, paidBy) {
  if (!firm || !invoice) return;

  invoice.paidBy = paidBy;
  invoice.status = paidBy ? 'paid' : 'issued';

  removeLinkedWalletEntries(invoice.id);
  removeLinkedExpenses(invoice.id);

  // Faktury z flagą skipAccounting są całkowicie pomijane w rozliczeniach
  if (invoice.skipAccounting) {
    return;
  }

  if (!paidBy) {
    return;
  }

  if (invoice.kind === 'own') {
    if (paidBy === 'client') {
      ensureIncomeForOwnInvoice(invoice);
    }
    return;
  }

  if (invoice.kind === 'external') {
    ensureExpenseForExternalInvoice(invoice, paidBy === 'client' ? 'client_card' : 'my_funds');
  }
}

function findInvoice(id) {
  return firm?.invoices.find((item) => item.id === id) || null;
}

function findInvoiceGlobal(invoiceId, firmId) {
  const f = state.firms.find((x) => x.id === firmId);
  if (!f) return null;
  const inv = f.invoices.find((x) => x.id === invoiceId);
  if (!inv) return null;
  return { invoice: inv, firm: f };
}

function findAllOwnInvoices() {
  const result = [];
  for (const f of state.firms) {
    for (const inv of f.invoices) {
      if (inv.kind === 'own' && inv.status !== 'cancelled') {
        result.push({ invoice: inv, firm: f });
      }
    }
  }
  result.sort((a, b) => (b.invoice.issueDate || '').localeCompare(a.invoice.issueDate || ''));
  return result;
}

function renderAllOwnInvoicesView() {
  const allOwn = findAllOwnInvoices();
  return `
    <div class="firm-list-page">
      <div class="list-page-head">
        <div>
          <p class="eyebrow">Moje faktury</p>
          <h1>Wszystkie faktury własne</h1>
        </div>
        <div style="font-size:13px;color:var(--text-dim)">
          Łącznie: <strong>${allOwn.length}</strong> faktur z <strong>${new Set(allOwn.map(x => x.firm.id)).size}</strong> firm
        </div>
      </div>

      ${allOwn.length === 0 ? `
        <div class="empty-block">
          <p>Brak faktur własnych. Dodaj pierwszą firmę i wystaw fakturę.</p>
        </div>
      ` : `
        <div class="table-wrap">
          <table class="data-table invoice-table">
            <thead>
              <tr>
                <th class="col-lp">Lp.</th>
                <th class="col-date">Data</th>
                <th class="col-title">Tytuł</th>
                <th class="col-number">Nr FV</th>
                <th class="col-amount">Kwota</th>
                <th>Firma</th>
                <th class="col-kind">Status</th>
                <th class="col-actions">Akcje</th>
              </tr>
            </thead>
            <tbody>
              ${allOwn.map(({ invoice, firm }, i) => {
                const paid = invoice.paidBy === 'me' || invoice.paidBy === 'client';
                const statusLabel = paid ? (invoice.paidBy === 'me' ? 'Opłacona' : 'Opłac. klient') : 'Nieopłacona';
                const statusTone = paid ? 'tone-mint' : 'tone-amber';
                return `
                <tr>
                  <td class="col-lp">${i + 1}</td>
                  <td class="col-date">${formatDate(invoice.issueDate)}</td>
                  <td class="col-title">
                    <strong>${escapeHtml(invoice.title || '-')}</strong>
                  </td>
                  <td class="col-number">${escapeHtml(invoice.number || '-')}</td>
                  <td class="col-amount">${formatCurrency(invoice.amount)}</td>
                  <td>${escapeHtml(firmDisplayName(firm))}</td>
                  <td class="col-kind">
                    <span class="${statusTone}">${statusLabel}</span>
                  </td>
                  <td class="col-actions">
                    <div class="actions-dropdown">
                      <button class="mini-button actions-toggle" type="button" data-action="toggle-global-actions" data-inv="${invoice.id}" data-firm="${firm.id}" title="Akcje">⋯</button>
                      <div class="actions-menu" data-global-actions-menu="${invoice.id}">
                        <button class="table-action-btn" type="button" data-action="preview-global-invoice" data-inv="${invoice.id}" data-firm="${firm.id}" title="Podgląd faktury">${icon('eye')} Podgląd</button>
                        <button class="table-action-btn" type="button" data-action="view-global-invoice" data-inv="${invoice.id}" data-firm="${firm.id}" title="Szczegóły">${icon('file')} Szczegóły</button>
                        <button class="table-action-btn" type="button" data-action="edit-global-invoice" data-inv="${invoice.id}" data-firm="${firm.id}" title="Edytuj">${icon('edit')} Edytuj</button>
                        ${invoice.attachmentIds?.length ? `<button class="table-action-btn" type="button" data-action="download-global-attachment" data-inv="${invoice.id}" data-firm="${firm.id}" title="Pobierz">${icon('download')} Pobierz</button>` : ''}
                      </div>
                    </div>
                  </td>
                </tr>
              `;}).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

// --- Invoice row rendering ---
function renderInvoiceRow(invoice, index, showActions = false) {
  const kindLabel = invoice.kind === 'own' ? 'W' : 'Z';
  const kindTitle = invoice.kind === 'own' ? 'Wewnetrzna (wystawiona dla klienta)' : 'Zewnetrzna (dokument kosztowy)';
  const paid = invoice.paidBy === 'me' || invoice.paidBy === 'client';
  const budgetFlag = invoice.subtractFromBudget === false ? '<span class="table-subline">Nie odejmuje od budżetu</span>' : '';
  return `
    <tr data-id="${invoice.id}">
      <td class="col-lp">${index + 1}</td>
      <td class="col-date">${formatDate(invoice.issueDate)}</td>
      <td class="col-title">
        <strong>${escapeHtml(invoice.title || invoice.vendor || invoice.number || '-')}</strong>
        ${invoice.kind === 'external' && invoice.vendor ? `<span class="table-subline">${escapeHtml(invoice.vendor)}</span>` : ''}
        ${budgetFlag}
      </td>
      <td class="col-number">${escapeHtml(invoice.number || '-')}</td>
      <td class="col-amount">${formatCurrency(invoice.amount)}</td>
      <td class="col-kind">
        <span class="kind-badge kind-${invoice.kind}" title="${escapeHtml(kindTitle)}">${kindLabel}</span>
      </td>
      ${!showActions ? '' : paid ? `
        <td class="col-actions">
          <div class="actions-dropdown">
            <button class="mini-button actions-toggle" type="button" data-action="toggle-actions" data-id="${invoice.id}" title="Akcje">⋯</button>
            <div class="actions-menu" data-actions-menu="${invoice.id}">
              <button class="table-action-btn" type="button" data-action="preview-invoice" data-id="${invoice.id}" title="Podglad faktury">${icon('eye')} Podglad</button>
              <button class="table-action-btn" type="button" data-action="view-invoice" data-id="${invoice.id}" title="Szczegoly">${icon('file')} Szczegoly</button>
              <button class="table-action-btn" type="button" data-action="download-attachment" data-id="${invoice.id}" title="Pobierz">${icon('download')} Pobierz</button>
              <button class="table-action-btn" type="button" data-action="edit-invoice" data-id="${invoice.id}" title="Edytuj">${icon('edit')} Edytuj</button>
              <button class="table-action-btn tone-amber" type="button" data-action="unmark-paid" data-id="${invoice.id}" title="Cofnij oplacenie">${icon('rotate-ccw')} Cofnij</button>
              <button class="table-action-btn tone-danger" type="button" data-action="delete-invoice" data-id="${invoice.id}" title="Usun">${icon('trash')} Usun</button>
            </div>
          </div>
        </td>
      ` : `
        <td class="col-actions">
          <div class="actions-dropdown">
            <button class="mini-button actions-toggle" type="button" data-action="toggle-actions" data-id="${invoice.id}" title="Akcje">⋯</button>
            <div class="actions-menu" data-actions-menu="${invoice.id}">
              <button class="table-action-btn" type="button" data-action="preview-invoice" data-id="${invoice.id}" title="Podglad faktury">${icon('eye')} Podglad</button>
              <button class="table-action-btn" type="button" data-action="view-invoice" data-id="${invoice.id}" title="Szczegoly">${icon('file')} Szczegoly</button>
              <button class="table-action-btn" type="button" data-action="download-attachment" data-id="${invoice.id}" title="Pobierz">${icon('download')} Pobierz</button>
              <button class="table-action-btn" type="button" data-action="edit-invoice" data-id="${invoice.id}" title="Edytuj">${icon('edit')} Edytuj</button>
              <button class="table-action-btn tone-me" type="button" data-action="mark-paid-me" data-id="${invoice.id}" title="Oplacilem ja">${icon('wallet')} Ja oplacilem</button>
              <button class="table-action-btn tone-client" type="button" data-action="mark-paid-client" data-id="${invoice.id}" title="Oplacil klient">${icon('wallet')} Klient oplacil</button>
              <button class="table-action-btn tone-amber" type="button" data-action="cancel-invoice" data-id="${invoice.id}" title="Anuluj fakture">${icon('x-circle')} Anuluj</button>
              <button class="table-action-btn tone-danger" type="button" data-action="delete-invoice" data-id="${invoice.id}" title="Usun">${icon('trash')} Usun</button>
            </div>
          </div>
        </td>
      `}
    </tr>
  `;
}

function renderInvoiceTable(invoices, emptyMessage, showActions = false) {
  if (invoices.length === 0) {
    return `
      <div class="empty-block compact">
        <p>${emptyMessage}</p>
      </div>
    `;
  }
  return `
    <div class="table-wrap">
      <table class="data-table invoice-table">
        <thead>
          <tr>
            <th class="col-lp">Lp.</th>
            <th class="col-date">Data</th>
            <th class="col-title">Tytul</th>
            <th class="col-number">Nr FV</th>
            <th class="col-amount">Kwota</th>
            <th class="col-kind">Z/W</th>
            <th class="col-actions">Akcje</th>
          </tr>
        </thead>
        <tbody>
          ${invoices.map((invoice, index) => renderInvoiceRow(invoice, index, showActions)).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function getFilteredInvoices(kind) {
  const selectedMonth = state.ui.selectedMonth;
  let allInvoices = [...firm.invoices];
  allInvoices = filterInvoicesByMonth(allInvoices, selectedMonth);
  allInvoices.sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''));

  if (kind === 'own') {
    return allInvoices.filter((inv) => inv.kind === 'own' && inv.status !== 'cancelled');
  }
  if (kind === 'external') {
    return allInvoices.filter((inv) => inv.kind === 'external' && inv.status !== 'cancelled');
  }
  if (kind === 'cancelled') {
    return allInvoices.filter((inv) => inv.status === 'cancelled');
  }
  return [];
}

function openInvoicesKindModal(kind) {
  const titles = { own: 'Faktury wlasne', external: 'Faktury zewnetrzne', cancelled: 'Faktury anulowane' };
  const invoices = getFilteredInvoices(kind);
  const title = titles[kind] || 'Faktury';
  openModal(title, renderInvoiceTable(invoices, 'Brak faktur tego typu.', true), { wide: true });
}

function monthLabelSafe(value) {
  if (value === '__all__') return 'Razem';
  if (value === '__year__') return 'Ten rok';
  if (value === '__quarter__') return 'Ten kwartał';
  return monthLabel(value);
}

function filterInvoicesByMonth(invoices, selectedMonth) {
  const ledger = calculateFirmLedger(firm);
  const scopeMonths = new Set(getScopeMonthKeys(ledger, selectedMonth));
  if (scopeMonths.size === 0) {
    return selectedMonth && !String(selectedMonth).startsWith('__')
      ? invoices.filter((inv) => getInvoiceMonthKey(inv) === selectedMonth)
      : invoices;
  }
  return invoices.filter((inv) => scopeMonths.has(getInvoiceMonthKey(inv)));
}

function getInvoiceMonthOptions() {
  const ledger = calculateFirmLedger(firm);
  const exactSelectedMonth = state.ui.selectedMonth && !String(state.ui.selectedMonth).startsWith('__')
    ? state.ui.selectedMonth
    : null;
  const months = ledger.months.length > 0 ? [...ledger.months] : [exactSelectedMonth || currentMonthKey()];
  const selected = exactSelectedMonth && months.includes(exactSelectedMonth)
    ? exactSelectedMonth
    : months[0];

  return {
    months,
    selectedMonth: selected,
  };
}

function renderInvoices() {
  const selectedMonth = state.ui.selectedMonth;
  let allInvoices = [...firm.invoices];
  allInvoices = filterInvoicesByMonth(allInvoices, selectedMonth);
  allInvoices.sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''));

  const unpaidInvoices = allInvoices.filter((inv) => !inv.paidBy && inv.status !== 'cancelled');
  const paidByMe = allInvoices.filter((inv) => inv.paidBy === 'me' && inv.status !== 'cancelled');
  const paidByClient = allInvoices.filter((inv) => inv.paidBy === 'client' && inv.status !== 'cancelled');

  return `
    <section class="section-band">
      <div class="panel-head panel-head-3col">
        <div>
          <p class="eyebrow">Firma</p>
          <h3>${escapeHtml(firmDisplayName(firm))}</h3>
        </div>
        <div class="panel-head-center">
          <p class="eyebrow">Okres rozliczeniowy</p>
          <h3>${monthLabelSafe(selectedMonth)}</h3>
        </div>
        <div class="panel-head-right">
          <div class="display-dropdown">
            <button class="ghost-button" type="button" data-action="toggle-display-filter">
              ${icon('eye')} Wyswietl
            </button>
            <div class="display-menu" data-display-menu>
              <button class="table-action-btn" type="button" data-action="show-filter-own">Faktury wlasne</button>
              <button class="table-action-btn" type="button" data-action="show-filter-external">Faktury zewnetrzne</button>
              <button class="table-action-btn" type="button" data-action="show-filter-cancelled">Faktury anulowane</button>
            </div>
          </div>
        </div>
      </div>

      <hr class="section-hr">

      ${unpaidInvoices.length > 0 ? `
        <div class="invoices-section invoices-unpaid">
          <div class="invoices-section-head">
            <h4 class="invoices-section-title tone-rose">● NIEOPLACONE</h4>
            <span class="invoices-section-count">${unpaidInvoices.length}</span>
          </div>
          ${renderInvoiceTable(unpaidInvoices, 'Brak nieoplaconych faktur.', true)}
        </div>
      ` : ''}

        <div class="invoices-section invoices-paid-me">
          <div class="invoices-section-head">
            <h4 class="invoices-section-title tone-mint">● Oplacilem ja</h4>
            <span class="invoices-section-count">${paidByMe.length}</span>
          </div>
          ${renderInvoiceTable(paidByMe, 'Brak faktur oplaconych przeze mnie.', true)}
        </div>

        <div class="invoices-section invoices-paid-client">
          <div class="invoices-section-head">
            <h4 class="invoices-section-title tone-cyan">● Oplacil klient</h4>
            <span class="invoices-section-count">${paidByClient.length}</span>
          </div>
          ${renderInvoiceTable(paidByClient, 'Brak faktur oplaconych przez klienta.', true)}
        </div>


    </section>
  `;
}

// --- Firm selector rendering ---
function renderFirmSelector() {
  return `
    <div class="firm-detail-page">
      <section class="main-area">
        ${renderInvoices()}
      </section>
      ${renderFabMenu('issue-invoice')}
    </div>
  `;
}

// --- Modals ---
function nextInvoiceNumber(issueDate, commit = false) {
  const year = String(issueDate).slice(0, 4);
  if (!state.invoiceCounterDates) state.invoiceCounterDates = {};
  const lastDate = state.invoiceCounterDates[year];
  // Sprawdz, czy data nie jest wczesniejsza niz ostatnia dla tego roku
  if (lastDate && issueDate < lastDate) {
    return null; // sygnalizuje blad – data wczesniejsza niz poprzednia
  }
  const current = Number(state.invoiceCounters[year] || 0) + 1;
  if (commit) {
    state.invoiceCounters[year] = current;
    state.invoiceCounterDates[year] = issueDate;
  }
  return `${current}/i-JANICKI/${year}`;
}


function openInvoiceModal() {
  if (!firm) return;
  openModal(
    'Nowa faktura',
    `
      <div class="invoice-type-choice">
        <p class="invoice-type-prompt">Co chcesz zrobic?</p>
        <div class="invoice-type-actions">
          <button type="button" class="invoice-type-btn invoice-type-btn--own" data-action="open-own-invoice">
            <span class="invoice-type-icon">📄</span>
            <span class="invoice-type-label">Utworz fakture (własna)</span>
            <span class="invoice-type-desc">Wystaw fakture dla klienta</span>
          </button>
          <button type="button" class="invoice-type-btn invoice-type-btn--external" data-action="open-external-invoice">
            <span class="invoice-type-icon">📥</span>
            <span class="invoice-type-label">Dodaj fakture (cudza)</span>
            <span class="invoice-type-desc">Dodaj dokument kosztowy</span>
          </button>
        </div>
      </div>
    `,
    { wide: true }
  );
}

function openInvoiceEdit(invoice) {
  if (!firm) return;
  if (invoice.kind === 'own') {
    // Faktura własna – przechodzi od razu do step 3 z danymi
    openOwnInvoiceStep3({
      title: invoice.title,
      issueDate: invoice.issueDate,
      vatMode: invoice.vatMode || 'zw',
      month: invoice.month,
    }, invoice);
  } else {
    // Faktura cudza – przechodzi do step 3 z danymi
    openExternalInvoiceStep3({
      title: invoice.title,
      month: invoice.month,
      issueDate: invoice.issueDate,
    }, invoice);
  }
}

function bindInvoiceCheckboxes(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const skipBudget = container.querySelector('[name="skipBudget"]');
  const skipAccounting = container.querySelector('[name="skipAccounting"]');
  if (!skipBudget || !skipAccounting) return;

  const syncState = () => {
    if (skipAccounting.checked) skipBudget.checked = true;
    const budgetOption = skipBudget.closest('.checkbox-opt');
    budgetOption?.classList.toggle('is-locked', skipAccounting.checked);
    skipBudget.setAttribute('aria-checked', String(skipBudget.checked));
  };

  container.addEventListener('change', (event) => {
    const target = event.target;
    if (target !== skipBudget && target !== skipAccounting) return;

    if (target === skipBudget && skipAccounting.checked && !skipBudget.checked) {
      skipBudget.checked = true;
    }
    syncState();
  });

  container.addEventListener('click', (event) => {
    const option = event.target.closest('.checkbox-opt');
    if (!option || !option.contains(skipBudget)) return;
    if (skipAccounting.checked && event.target !== skipAccounting) {
      event.preventDefault();
      skipBudget.checked = true;
      syncState();
    }
  });

  syncState();
}

function openOwnInvoiceStep2() {
  if (!firm) return;
  const issueDate = new Date().toISOString().slice(0, 10);
  const currentYear = issueDate.slice(0, 4);
  let minDate = '';
  if (state.invoiceCounterDates?.[currentYear]) {
    const nextDay = new Date(state.invoiceCounterDates[currentYear]);
    nextDay.setDate(nextDay.getDate() + 1);
    minDate = nextDay.toISOString().slice(0, 10);
  }
  const { months, selectedMonth: selMonth } = getInvoiceMonthOptions();

  openModal(
    'Nowa faktura własna – dane',
    `
      <form id="ownInvoiceStep2Form" class="form-grid form-grid--single">
        <div class="form-row">
          ${labeledInput({ name: 'title', label: 'Opis (nazwa) faktury', value: 'Uslugi marketingowe - ' + monthLabel(selMonth), required: true })}
          ${labeledInput({ name: 'issueDate', label: 'Data wystawienia', type: 'date', value: issueDate, required: true, min: minDate })}
        </div>
        <div class="form-row">
          ${labeledInput({ name: 'vatMode', label: 'Typ faktury', type: 'select', value: 'zw', options: VAT_OPTIONS })}
          ${labeledInput({ name: 'month', label: 'Okres rozliczeniowy', type: 'select', value: selMonth, options: months.map((m) => ({ value: m, label: monthLabel(m) })) })}
        </div>
        ${modalActions('Dalej →')}
      </form>
    `,
    { wide: true }
  );

  const form = document.getElementById('ownInvoiceStep2Form');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const issueDate = String(data.get('issueDate'));
    const year = issueDate.slice(0, 4);
    if (!state.invoiceCounterDates) state.invoiceCounterDates = {};
    const lastDate = state.invoiceCounterDates[year];
    if (lastDate && issueDate < lastDate) {
      window.alert(`Nie mozesz wystawic faktury z data ${issueDate}. Ostatnia faktura z tego roku ma date ${lastDate}. Numer nie moze miec daty wczesniejszej niz poprzedni.`);
      return;
    }
    const step2Data = {
      title: String(data.get('title') || '').trim(),
      issueDate,
      vatMode: String(data.get('vatMode')),
      month: String(data.get('month')),
    };
    openOwnInvoiceStep3(step2Data);
  });
}

function openOwnInvoiceStep3(step2Data, existingInvoice = null) {
  // Step 3: position table + summary
  const isEdit = !!existingInvoice;
  let items = existingInvoice?.items?.length
    ? existingInvoice.items.map((it) => ({ id: it.id || uid(), description: it.description || '', quantity: it.quantity || 1, unitPrice: it.unitPrice ?? '' }))
    : [{ id: uid(), description: step2Data.title, quantity: 1, unitPrice: '' }];

  function renderItems() {
    const total = items.reduce((sum, it) => sum + (parseFloat(it.unitPrice) || 0) * (it.quantity || 1), 0);
    return `
      <div class="items-table-wrap">
        <table class="data-table invoice-items-table">
          <thead>
            <tr>
              <th class="col-lp">Lp.</th>
              <th class="col-desc">Nazwa</th>
              <th class="col-qty">Ilosc</th>
              <th class="col-price">Cena</th>
              <th class="col-sum">Wartosc</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="itemsBody">
            ${items.map((item, i) => `
              <tr>
                <td class="col-lp">${i + 1}</td>
                <td><input type="text" class="item-desc" data-idx="${i}" value="${escapeHtml(item.description)}" /></td>
                <td><input type="number" class="item-qty" data-idx="${i}" value="${item.quantity}" min="1" style="width:70px" /></td>
                <td><input type="number" class="item-price" data-idx="${i}" value="${item.unitPrice}" min="0" step="0.01" style="width:110px" /></td>
                <td class="col-sum">${item.unitPrice ? formatCurrency(parseFloat(item.unitPrice) * item.quantity) : '—'}</td>
                <td class="col-remove"><button type="button" class="item-remove-btn" data-action="remove-item" data-idx="${i}" ${items.length <= 1 ? 'disabled' : ''}>✕</button></td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4"><strong>SUMA</strong></td>
              <td class="col-sum"><strong>${formatCurrency(total)}</strong></td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        <div class="add-item-wrap"><button type="button" class="add-item-btn" data-action="add-item">+ Dodaj pozycje</button></div>
      </div>
    `;
  }

  openModal(
    isEdit ? 'Edytuj fakturę własną' : 'Nowa faktura własna – pozycje',
    `
      <form id="ownInvoiceStep3Form" class="form-grid form-grid--single">
        <div id="itemsContainer">${renderItems()}</div>
        <label class="field">
          <span>Uwagi</span>
          <textarea name="notes" rows="2">${isEdit ? escapeHtml(existingInvoice.notes || '') : ''}</textarea>
        </label>
        <div class="field checkbox-row field-span-2" id="ownInvoiceCheckboxes">
          <label class="checkbox-opt">
            <input type="checkbox" name="skipBudget" value="1" id="skipBudgetOwn" ${isEdit && existingInvoice.subtractFromBudget === false ? 'checked' : ''} />
            <span>Nie odejmuj od budżetu</span>
          </label>
          <label class="checkbox-opt">
            <input type="checkbox" name="skipAccounting" value="1" id="skipAccountingOwn" ${isEdit && existingInvoice.skipAccounting ? 'checked' : ''} />
            <span>Pomiń w rozliczeniach</span>
          </label>
        </div>
        ${modalActions(isEdit ? 'Zapisz zmiany' : 'Wystaw fakture')}
      </form>
    `,
    { wide: true }
  );

  const itemsContainer = document.getElementById('itemsContainer');
  bindInvoiceCheckboxes('ownInvoiceCheckboxes');

  function refreshItemsUI() {
    itemsContainer.innerHTML = renderItems();
  }

  itemsContainer.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'add-item') {
      items.push({ id: uid(), description: '', quantity: 1, unitPrice: '' });
      refreshItemsUI();
    } else if (btn.dataset.action === 'remove-item') {
      const idx = parseInt(btn.dataset.idx, 10);
      if (items.length > 1 && !isNaN(idx)) {
        items.splice(idx, 1);
        refreshItemsUI();
      }
    }
  });

  // Delegacja input – aktualizacja w pamieci i tylko wartosc wiersza + suma
  itemsContainer.addEventListener('input', (event) => {
    const input = event.target.closest('.item-desc, .item-qty, .item-price');
    if (!input) return;
    const idx = parseInt(input.dataset.idx, 10);
    if (isNaN(idx) || !items[idx]) return;
    if (input.classList.contains('item-desc')) items[idx].description = input.value;
    else if (input.classList.contains('item-qty')) items[idx].quantity = parseInt(input.value, 10) || 1;
    else if (input.classList.contains('item-price')) items[idx].unitPrice = parseFloat(input.value) || '';
    // Odswiez tylko wartosc w danym wierszu
    const row = input.closest('tr');
    if (row) {
      const qty = parseFloat(items[idx].quantity) || 1;
      const price = parseFloat(items[idx].unitPrice) || 0;
      const sumCell = row.querySelector('.col-sum');
      if (sumCell) sumCell.textContent = price > 0 ? formatCurrency(price * qty) : '—';
    }
    // Odswiez SUMA w stopce
    const total = items.reduce((sum, it) => sum + (parseFloat(it.unitPrice) || 0) * (it.quantity || 1), 0);
    const tfoot = itemsContainer.querySelector('tfoot .col-sum strong');
    if (tfoot) tfoot.textContent = formatCurrency(total);
  });

  const form = document.getElementById('ownInvoiceStep3Form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const itemsData = items.filter((it) => parseFloat(it.unitPrice) > 0).map((it) => ({
      description: it.description || step2Data.title,
      quantity: it.quantity || 1,
      unitPrice: parseFloat(it.unitPrice) || 0,
    }));

    if (itemsData.length === 0) {
      window.alert('Dodaj co najmniej jedna pozycje z kwota > 0.');
      return;
    }

    const total = itemsData.reduce((s, it) => s + it.unitPrice * it.quantity, 0);
    const formData = new FormData(form);
    const notes = String(formData.get('notes') || '').trim();
    const skipAccounting = !!formData.get('skipAccounting');
    const subtractFromBudget = skipAccounting ? false : !formData.get('skipBudget');

    if (isEdit) {
      // Tryb edycji – aktualizuj istniejącą fakturę
      existingInvoice.title = step2Data.title;
      existingInvoice.month = step2Data.month;
      existingInvoice.issueDate = step2Data.issueDate;
      existingInvoice.saleDate = step2Data.issueDate;
      existingInvoice.vatMode = step2Data.vatMode;
      existingInvoice.buyerSnapshot = {
        name: firm.name,
        nip: firm.nip,
        address1: firm.address1,
        address2: firm.address2,
        phone: firm.phone,
        email: firm.email,
      };
      existingInvoice.issuerSnapshot = { ...state.settings.issuer };
      existingInvoice.notes = notes;
      existingInvoice.subtractFromBudget = subtractFromBudget;
      existingInvoice.skipAccounting = skipAccounting;
      existingInvoice.amount = roundCurrency(total);
      existingInvoice.items = itemsData;
      existingInvoice.attachmentIds = existingInvoice.attachmentIds || [];

      closeModal();
      openInvoicePreview({
        invoice: existingInvoice,
        firm,
        issuer: state.settings.issuer,
        onSave: () => {
          firm.updatedAt = new Date().toISOString();
          state.ui.selectedFirmId = firm.id;
          persist();
          render();
        },
        onCancel: () => {
          openOwnInvoiceStep3(step2Data, existingInvoice);
        },
      });
    } else {
      // Nowa faktura
      const invoice = {
        id: uid(),
        kind: 'own',
        source: 'system',
        number: nextInvoiceNumber(step2Data.issueDate),
        month: step2Data.month,
        issueDate: step2Data.issueDate,
        saleDate: step2Data.issueDate,
        dueDate: null,
        status: 'issued',
        paidBy: null,
        vatMode: step2Data.vatMode,
        title: step2Data.title,
        buyerSnapshot: {
          name: firm.name,
          nip: firm.nip,
          address1: firm.address1,
          address2: firm.address2,
          phone: firm.phone,
          email: firm.email,
        },
        issuerSnapshot: { ...state.settings.issuer },
        notes,
        subtractFromBudget,
        skipAccounting,
        amount: roundCurrency(total),
        items: itemsData,
        attachmentIds: [],
        createdAt: new Date().toISOString(),
      };

      closeModal();
      openInvoicePreview({
        invoice,
        firm,
        issuer: state.settings.issuer,
        onSave: () => {
          invoice.number = nextInvoiceNumber(invoice.issueDate, true);
          firm.invoices.push(invoice);
          firm.updatedAt = new Date().toISOString();
          state.ui.selectedFirmId = firm.id;
          persist();
          render();
        },
        onCancel: () => {
          openOwnInvoiceStep3(step2Data);
        },
      });
    }
  });
}

function openExternalInvoiceStep2() {
  if (!firm) return;
  const today = new Date().toISOString().slice(0, 10);
  const { months, selectedMonth: selMonth } = getInvoiceMonthOptions();

  openModal(
    'Dodaj fakture cudza – dane',
    `
      <form id="extInvoiceStep2" class="form-grid form-grid--single">
        <div class="form-row form-row--3cols">
          ${labeledInput({ name: 'title', label: 'Opis (nazwa) faktury', value: '', required: true })}
          ${labeledInput({ name: 'issueDate', label: 'Data wystawienia', type: 'date', value: today, required: true })}
          ${labeledInput({ name: 'month', label: 'Okres rozliczeniowy', type: 'select', value: selMonth, options: months.map((m) => ({ value: m, label: monthLabel(m) })) })}
        </div>
        <p class="form-hint">Firma: <strong>${escapeHtml(firm.name)}</strong> (automatycznie)</p>
        ${modalActions('Dalej →')}
      </form>
    `,
    { wide: true }
  );

  const form = document.getElementById('extInvoiceStep2');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    openExternalInvoiceStep3({
      title: String(data.get('title') || '').trim(),
      month: String(data.get('month')),
      issueDate: String(data.get('issueDate')),
    });
  });
}

function openExternalInvoiceStep3(step2Data, existingInvoice = null) {
  const isEdit = !!existingInvoice;
  openModal(
    isEdit ? 'Edytuj fakturę cudzą' : 'Dodaj fakture cudza – dane',
    `
      <form id="extInvoiceStep3" class="form-grid form-grid--single">
        <div class="form-row">
          ${labeledInput({ name: 'number', label: 'Nr FV', value: isEdit ? existingInvoice.number : '', required: true })}
          ${labeledInput({ name: 'amount', label: 'Kwota', type: 'number', value: isEdit ? existingInvoice.amount : '', min: '0', step: '0.01', required: true })}
        </div>
        ${isEdit ? '' : `<label class="field">
          <span>Zalacznik (PDF lub obraz, do 1 MB)</span>
          <input type="file" name="file" accept=".pdf,image/*" />
        </label>`}
        <div class="field checkbox-row field-span-2" id="extInvoiceCheckboxes">
          <label class="checkbox-opt">
            <input type="checkbox" name="skipBudget" value="1" id="skipBudgetExt" ${isEdit && existingInvoice.subtractFromBudget === false ? 'checked' : ''} />
            <span>Nie odejmuj od budżetu</span>
          </label>
          <label class="checkbox-opt">
            <input type="checkbox" name="skipAccounting" value="1" id="skipAccountingExt" ${isEdit && existingInvoice.skipAccounting ? 'checked' : ''} />
            <span>Pomiń w rozliczeniach</span>
          </label>
        </div>
        ${modalActions(isEdit ? 'Zapisz zmiany' : 'Dodaj fakture')}
      </form>
    `,
    { wide: true }
  );

  const form = document.getElementById('extInvoiceStep3');
  bindInvoiceCheckboxes('extInvoiceCheckboxes');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const invoiceNumber = String(data.get('number') || '').trim();
    const amount = roundCurrency(data.get('amount'));

    if (!amount || amount <= 0) {
      window.alert('Podaj kwote > 0.');
      return;
    }

    const file = form.querySelector('[name="file"]').files?.[0] || null;
    const attachmentIds = [];

    if (file) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        window.alert(`Plik jest większy niż ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB (limit dla załączników).`);
        return;
      }
      const attachmentId = uid();
      await storeAttachment({
        id: attachmentId,
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified,
        blob: file,
        createdAt: new Date().toISOString(),
      });
      attachmentIds.push(attachmentId);
    }

    if (isEdit) {
      // Tryb edycji – aktualizuj istniejącą fakturę
      existingInvoice.number = invoiceNumber;
      existingInvoice.amount = amount;
      existingInvoice.month = step2Data.month;
      existingInvoice.issueDate = step2Data.issueDate;
      existingInvoice.saleDate = step2Data.issueDate;
      existingInvoice.title = step2Data.title;
      existingInvoice.skipAccounting = !!data.get('skipAccounting');
      existingInvoice.subtractFromBudget = existingInvoice.skipAccounting ? false : !data.get('skipBudget');

      // Dolacz nowy zalacznik jesli dodano
      if (file) {
        const attachmentId = uid();
        await storeAttachment({
          id: attachmentId,
          name: file.name,
          type: file.type,
          size: file.size,
          lastModified: file.lastModified,
          blob: file,
          createdAt: new Date().toISOString(),
        });
        if (!existingInvoice.attachmentIds) existingInvoice.attachmentIds = [];
        existingInvoice.attachmentIds.push(attachmentId);
      }

      firm.updatedAt = new Date().toISOString();
      state.ui.selectedMonth = step2Data.month;
      await syncInvoiceFinancialState(existingInvoice, existingInvoice.paidBy);
      persist();
      closeModal();
      render();
    } else {
      // Nowa faktura
      const invoice = {
        id: uid(),
        kind: 'external',
        source: 'manual',
        number: invoiceNumber,
        month: step2Data.month,
        issueDate: step2Data.issueDate,
        saleDate: step2Data.issueDate,
        dueDate: null,
        status: 'issued',
        paidBy: null,
        vatMode: 'zw',
        title: step2Data.title,
        vendor: '',
        payer: 'my_funds',
        category: 'other',
        skipAccounting: !!data.get('skipAccounting'),
        subtractFromBudget: !!data.get('skipAccounting') ? false : !data.get('skipBudget'),
        notes: '',
        amount,
        items: [],
        attachmentIds,
        createdAt: new Date().toISOString(),
      };

      firm.invoices.push(invoice);
      firm.updatedAt = new Date().toISOString();
      state.ui.selectedMonth = step2Data.month;
      persist();
      closeModal();
      render();
    }
  });
}

async function openAttachmentById(id) {
  const attachment = await getAttachment(id);
  if (!attachment?.blob) {
    window.alert('Nie udalo sie odczytac pliku.');
    return;
  }
  const url = URL.createObjectURL(attachment.blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function downloadAttachmentById(id) {
  const attachment = await getAttachment(id);
  if (!attachment?.blob) {
    window.alert('Nie udalo sie odczytac pliku.');
    return;
  }
  const url = URL.createObjectURL(attachment.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = attachment.name || 'zalacznik';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function deleteInvoice(id) {
  const invoice = findInvoice(id);
  if (!firm || !invoice) return;

  // Sprawdz, czy numer moze zostac zwolniony
  let canFreeNumber = false;
  if (invoice.kind === 'own' && invoice.number) {
    const parts = invoice.number.split('/');
    const numYear = parts[parts.length - 1]; // rok z numeru, np. "2026"
    // Sprawdz czy istnieje nowsza faktura wlasna w tym samym roku
    const newerExists = firm.invoices.some((inv) =>
      inv.id !== invoice.id &&
      inv.kind === 'own' &&
      inv.status !== 'cancelled' &&
      inv.number &&
      inv.number.endsWith('/' + numYear) &&
      inv.issueDate > invoice.issueDate
    );
    canFreeNumber = !newerExists;
  }

  const msg = canFreeNumber
    ? 'Usunac ten dokument? Numer faktury zostanie zwolniony i bedzie mogl byc ponownie uzyty.'
    : 'Usunac ten dokument? Numer faktury NIE zostanie zwolniony (istnieje nowsza faktura w tym roku).';

  if (!window.confirm(msg)) return;

  for (const attachmentId of invoice.attachmentIds || []) {
    await deleteAttachment(attachmentId);
  }
  firm.invoices = firm.invoices.filter((item) => item.id !== id);
  removeLinkedWalletEntries(id);
  firm.expenses = firm.expenses.filter((item) => item.linkedInvoiceId !== id);
  firm.updatedAt = new Date().toISOString();

  // Zwolnij numer jezeli mozna
  if (canFreeNumber && invoice.number) {
    const parts = invoice.number.split('/');
    const numYear = parts[parts.length - 1];
    if (state.invoiceCounters[numYear]) {
      const current = state.invoiceCounters[numYear];
      if (current > 0) {
        state.invoiceCounters[numYear] = current - 1;
      }
      if (state.invoiceCounters[numYear] <= 0) {
        delete state.invoiceCounters[numYear];
        delete state.invoiceCounterDates[numYear];
      } else {
        // Ustaw date licznika na date ostatniej pozostalej faktury w tym roku (globalnie)
        let latestRemainingDate = '';
        for (const f of state.firms) {
          for (const inv of f.invoices) {
            if (inv.kind === 'own' && inv.status !== 'cancelled' && inv.number && inv.number.endsWith('/' + numYear)) {
              if (inv.issueDate > latestRemainingDate) {
                latestRemainingDate = inv.issueDate;
              }
            }
          }
        }
        if (latestRemainingDate) {
          state.invoiceCounterDates[numYear] = latestRemainingDate;
        } else {
          delete state.invoiceCounterDates[numYear];
        }
      }
    }
  }

  persist();
  render();
}

// --- Invoice Detail Modal ---
function openInvoiceDetailModal(invoice) {
  const items = invoice.items || [];
  const kindLabel = invoice.kind === 'own' ? 'Wlasna' : 'Zewnetrzna';
  const paidLabel = invoice.paidBy === 'me' ? 'Oplacilem ja' : invoice.paidBy === 'client' ? 'Oplacil klient' : 'Nieoplacona';
  const budgetLabel = invoice.subtractFromBudget === false ? 'Nie odejmuje od budżetu' : 'Odejmuje od budżetu';
  const itemsHtml = items.length === 0
    ? '<p style="text-align:center;color:var(--text-dim);padding:12px">Brak pozycji.</p>'
    : `<table class="data-table" style="margin:0">
        <thead>
          <tr>
            <th style="width:40px">Lp.</th>
            <th>Opis</th>
            <th style="width:80px;text-align:right">Ilość</th>
            <th style="width:120px;text-align:right">Cena</th>
            <th style="width:120px;text-align:right">Wartość</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item, i) => `
            <tr>
              <td>${i + 1}</td>
              <td>${escapeHtml(item.description || '-')}</td>
              <td style="text-align:right">${item.quantity || 1}</td>
              <td style="text-align:right">${formatCurrency(item.unitPrice)}</td>
              <td style="text-align:right">${formatCurrency((item.unitPrice || 0) * (item.quantity || 1))}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot style="border-top:2px solid var(--border);">
          <tr>
            <td colspan="4" style="text-align:right;font-weight:700">RAZEM:</td>
            <td style="text-align:right;font-weight:700">${formatCurrency(invoice.amount)}</td>
          </tr>
        </tfoot>
      </table>`;

  const html = `
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div>
          <strong>${escapeHtml(invoice.number || '-')}</strong>
          <span class="kind-badge kind-${invoice.kind}" style="margin-left:8px">${kindLabel}</span>
        </div>
        <div style="font-size:13px;color:var(--text-dim)">
          ${escapeHtml(invoice.title || '')}
          ${invoice.kind === 'external' && invoice.vendor ? '&middot; ' + escapeHtml(invoice.vendor) : ''}
        </div>
        <div style="font-size:13px;color:var(--text-dim)">
          ${formatDate(invoice.issueDate)} &middot; ${paidLabel}
          ${budgetLabel ? '&middot; ' + budgetLabel : ''}
        </div>
      </div>
      ${itemsHtml}
      ${invoice.attachmentIds?.length ? `
        <div style="border-top:1px solid var(--border);padding-top:8px">
          <strong style="font-size:13px;color:var(--text-dim)">Zalaczniki:</strong>
          ${invoice.attachmentIds.map((aid, i) => `
            <button class="table-action-btn" type="button" data-action="open-attachment" data-attachment-id="${aid}" style="margin-left:8px;margin-top:4px">
              ${icon('file')} Zalacznik ${i + 1}
            </button>
          `).join('')}
        </div>
      ` : ''}
      ${invoice.notes ? `<div style="border-top:1px solid var(--border);padding-top:8px;font-size:13px;color:var(--text-dim)"><strong>Notatki:</strong> ${escapeHtml(invoice.notes)}</div>` : ''}
    </div>
  `;
  openModal('Szczegóły faktury — ' + (invoice.number || '-'), html, { wide: true });
}

// --- Event Handling ---
function handleClick(event) {
  // Klikniecie w backdrop nie zamyka kreatora
  if (event.target instanceof HTMLElement && event.target.classList.contains('modal-overlay')) {
    return;
  }

  const target = event.target.closest('[data-action]');
  if (!target) return;

  const { action } = target.dataset;

  if (action === 'close-modal') return closeModal();

  // Zamknij menu akcji po kliknieciu dowolnej akcji (oprocz toggle)
  if (action !== 'toggle-actions' && action !== 'toggle-global-actions' && action !== 'toggle-display-filter') {
    document.querySelectorAll('.actions-menu.open').forEach((m) => m.classList.remove('open'));
  }

  // Navigation
  if (action === 'nav-faktury') return; // already here
  if (action === 'nav-portfel') return navigateTo('portfel.html', state);

  if (action === 'issue-invoice') return openInvoiceModal();
  if (action === 'open-own-invoice') {
    closeModal();
    return setTimeout(() => openOwnInvoiceStep2(), 100);
  }
  if (action === 'open-external-invoice') {
    closeModal();
    return setTimeout(() => openExternalInvoiceStep2(), 100);
  }

  if (action === 'select-month-dropdown') {
    // handled by change event
    return;
  }

  if (action === 'mark-all-paid-me') {
    if (!firm) return;
    firm.invoices.forEach((inv) => {
      if (!inv.paidBy && inv.status !== 'cancelled') {
        syncInvoiceFinancialState(inv, 'me');
      }
    });
    firm.updatedAt = new Date().toISOString();
    persist();
    return render();
  }
  if (action === 'mark-all-paid-client') {
    if (!firm) return;
    firm.invoices.forEach((inv) => {
      if (!inv.paidBy && inv.status !== 'cancelled') {
        syncInvoiceFinancialState(inv, 'client');
      }
    });
    firm.updatedAt = new Date().toISOString();
    persist();
    return render();
  }
  if (action === 'mark-paid-me') {
    const invoice = findInvoice(target.dataset.id);
    if (!invoice) return;
    syncInvoiceFinancialState(invoice, 'me');
    firm.updatedAt = new Date().toISOString();
    persist();
    return render();
  }
  if (action === 'mark-paid-client') {
    const invoice = findInvoice(target.dataset.id);
    if (!invoice) return;
    syncInvoiceFinancialState(invoice, 'client');
    firm.updatedAt = new Date().toISOString();
    persist();
    return render();
  }
  if (action === 'unmark-paid') {
    const invoice = findInvoice(target.dataset.id);
    if (!invoice) return;
    syncInvoiceFinancialState(invoice, null);
    firm.updatedAt = new Date().toISOString();
    persist();
    return render();
  }
  if (action === 'preview-invoice') {
    const invoice = findInvoice(target.dataset.id);
    if (!invoice) return;
    // Dla faktury zewnetrznej otworz zalacznik zamiast podgladu wlasnego wydruku
    if (invoice.kind === 'external' && invoice.attachmentIds?.length) {
      for (const attachmentId of invoice.attachmentIds) {
        void openAttachmentById(attachmentId);
      }
      return;
    }
    openInvoicePreview({
      invoice,
      firm,
      issuer: state.settings.issuer,
      onCancel: () => {},
    });
    return;
  }
  if (action === 'download-attachment') {
    const invoice = findInvoice(target.dataset.id);
    if (!invoice) return;
    if (invoice.attachmentIds?.length) {
      for (const attachmentId of invoice.attachmentIds) {
        void downloadAttachmentById(attachmentId);
      }
    } else {
      // Brak załącznika - otwórz podgląd i automatycznie wywołaj druk
      openInvoicePreview({
        invoice,
        firm,
        issuer: state.settings.issuer,
        onCancel: () => {},
      });
      setTimeout(() => {
        const overlay = document.getElementById('invoicePreviewOverlay');
        if (!overlay) return;
        const iframe = overlay.querySelector('iframe');
        if (!iframe) return;
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        } catch (_) {
          window.print();
        }
      }, 800);
    }
    return;
  }
  if (action === 'view-invoice') {
    const invoice = findInvoice(target.dataset.id);
    if (!invoice) return;
    openInvoiceDetailModal(invoice);
    return;
  }
  if (action === 'toggle-actions') {
    const menu = document.querySelector(`[data-actions-menu="${target.dataset.id}"]`);
    if (!menu) return;
    // Zamknij wszystkie inne menu
    document.querySelectorAll('.actions-menu.open').forEach((m) => {
      if (m !== menu) m.classList.remove('open');
    });
    // Ustaw pozycje fixed wzgledem przycisku (menu nie jest ucinane przez overflow table-wrap)
    const isOpen = menu.classList.contains('open');
    if (!isOpen) {
      const btn = target.closest('.actions-toggle') || target;
      const rect = btn.getBoundingClientRect();
      menu.style.left = Math.max(8, rect.right - 180) + 'px';
      menu.style.top = (rect.bottom + 4) + 'px';
    }
    menu.classList.toggle('open');
    return;
  }
  if (action === 'toggle-global-actions') {
    const menu = document.querySelector(`[data-global-actions-menu="${target.dataset.inv}"]`);
    if (!menu) return;
    document.querySelectorAll('.actions-menu.open').forEach((m) => {
      if (m !== menu) m.classList.remove('open');
    });
    const isOpen = menu.classList.contains('open');
    if (!isOpen) {
      const btn = target.closest('.actions-toggle') || target;
      const rect = btn.getBoundingClientRect();
      menu.style.left = Math.max(8, rect.right - 180) + 'px';
      menu.style.top = (rect.bottom + 4) + 'px';
    }
    menu.classList.toggle('open');
    return;
  }
  if (action === 'preview-global-invoice') {
    const result = findInvoiceGlobal(target.dataset.inv, target.dataset.firm);
    if (!result) return;
    const { invoice, firm: invFirm } = result;
    // Dla faktury zewnetrznej otworz zalacznik
    if (invoice.kind === 'external' && invoice.attachmentIds?.length) {
      for (const attachmentId of invoice.attachmentIds) {
        void openAttachmentById(attachmentId);
      }
      return;
    }
    openInvoicePreview({
      invoice,
      firm: invFirm,
      issuer: state.settings.issuer,
      onCancel: () => {},
    });
    return;
  }
  if (action === 'view-global-invoice') {
    const result = findInvoiceGlobal(target.dataset.inv, target.dataset.firm);
    if (!result) return;
    openInvoiceDetailModal(result.invoice);
    return;
  }
  if (action === 'edit-global-invoice') {
    const result = findInvoiceGlobal(target.dataset.inv, target.dataset.firm);
    if (!result) return;
    closeModal();
    document.querySelectorAll('.actions-menu.open').forEach((m) => m.classList.remove('open'));
    // Tymczasowo przelacz na firme
    const prevFirmId = state.ui.selectedFirmId;
    state.ui.selectedFirmId = result.firm.id;
    firm = result.firm;
    openInvoiceEdit(result.invoice);
    // Przywroc poprzednie ustawienie po otwarciu modala
    state.ui.selectedFirmId = prevFirmId;
    return;
  }
  if (action === 'download-global-attachment') {
    const result = findInvoiceGlobal(target.dataset.inv, target.dataset.firm);
    if (!result?.invoice.attachmentIds?.length) return;
    for (const attachmentId of result.invoice.attachmentIds) {
      void downloadAttachmentById(attachmentId);
    }
    return;
  }
  if (action === 'toggle-display-filter') {
    const menu = document.querySelector('[data-display-menu]');
    if (!menu) return;
    // Zamknij wszystkie actions-menu
    document.querySelectorAll('.actions-menu.open').forEach((m) => m.classList.remove('open'));
    const isOpen = menu.classList.contains('open');
    if (!isOpen) {
      const btn = target.closest('button') || target;
      const rect = btn.getBoundingClientRect();
      menu.style.left = Math.max(8, rect.right - 200) + 'px';
      menu.style.top = (rect.bottom + 4) + 'px';
    }
    menu.classList.toggle('open');
    return;
  }
  if (action === 'show-filter-own') {
    closeModal();
    return setTimeout(() => openInvoicesKindModal('own'), 50);
  }
  if (action === 'show-filter-external') {
    closeModal();
    return setTimeout(() => openInvoicesKindModal('external'), 50);
  }
  if (action === 'show-filter-cancelled') {
    closeModal();
    return setTimeout(() => openInvoicesKindModal('cancelled'), 50);
  }
  if (action === 'cancel-invoice') {
    const invoice = findInvoice(target.dataset.id);
    if (!invoice) return;
    if (!window.confirm('Anulowac te fakture? Numer faktury zostanie zachowany, ale faktura zniknie z listy.')) return;
    invoice.status = 'cancelled';
    invoice.paidBy = null;
    persist();
    // Zamknij menu
    document.querySelectorAll('.actions-menu.open').forEach((m) => m.classList.remove('open'));
    return render();
  }
  if (action === 'edit-invoice') {
    const invoice = findInvoice(target.dataset.id);
    if (!invoice) return;
    closeModal();
    document.querySelectorAll('.actions-menu.open').forEach((m) => m.classList.remove('open'));
    return openInvoiceEdit(invoice);
  }
  if (action === 'delete-invoice') return void deleteInvoice(target.dataset.id);
  if (action === 'open-attachment') return void openAttachmentById(target.dataset.attachmentId);
  if (action === 'add-wallet-expense') return navigateTo('portfel.html', state);
  if (action === 'add-wallet-income') return navigateTo('portfel.html', state);
  if (action === 'add-expense') return navigateTo('przeglad.html', state);
  if (action === 'add-balance-plus') return navigateTo('przeglad.html', state);
  if (action === 'add-month') return navigateTo('przeglad.html', state);
  if (action === 'edit-month-from-picker') return navigateTo('przeglad.html', state);
}

// --- Render ---
function render() {
  firm = getSelectedFirm(state);
  if (!firm) {
    state.ui.selectedFirmId = null;
    try {
      root.innerHTML = renderAllOwnInvoicesView();
      // Minimalny topbar dla widoku globalnego
      const topbar = document.getElementById('topbarContent');
      if (topbar) {
        topbar.innerHTML = `
          <div class="topbar-grid">
            <div class="topbar-grid-left">
              <div class="tab-row">
                <a class="tab-button" href="przeglad.html">Klienci</a>
                <span class="tab-button is-active">Moje faktury</span>
              </div>
            </div>
            <div class="topbar-grid-center"></div>
            <div class="topbar-grid-right"></div>
          </div>
        `;
      }
    } catch (e) {
      root.innerHTML = `
        <div style="padding: 40px; color: #f44; font-family: monospace;">
          <h2>Blad renderowania</h2>
          <pre>${escapeHtml(e.message)}</pre>
        </div>
      `;
    }
    return;
  }

  // Zapewnij, że selectedMonth jest ustawiony, zanim wyrenderujemy faktury
  ensureSelectedMonth(firm, state);

  try {
    root.innerHTML = renderFirmSelector();
    updateTopbar(state, 'invoices');
  } catch (e) {
    root.innerHTML = `
      <div style="padding: 40px; color: #f44; font-family: monospace;">
        <h2>Blad renderowania</h2>
        <pre>${escapeHtml(e.message)}</pre>
      </div>
    `;
  }
}

// --- Init ---
document.body.addEventListener('click', handleClick);

// Zamknij dropdowny po kliknięciu poza menu
document.body.addEventListener('click', (event) => {
  if (!event.target.closest('.actions-dropdown')) {
    document.querySelectorAll('.actions-menu.open').forEach((m) => m.classList.remove('open'));
  }
  if (!event.target.closest('.display-dropdown')) {
    const dm = document.querySelector('[data-display-menu].open');
    if (dm) dm.classList.remove('open');
  }
});

document.body.addEventListener('change', (event) => {
  const target = event.target.closest('[data-action="select-month-dropdown"]');
  if (!target) return;
  if (!firm) return;

  state.ui.selectedMonth = target.value;
  persist();
  render();
});

if (sessionStorage.getItem('ijanicki_firma_loggedIn') !== 'true') {
  window.location.href = 'index.html';
} else {
  initSyncIndicator();
  syncFromCloud().then(() => {
    state = initializeState();
    restoreContext(state);
    render();
    // Przywróć podgląd faktury po odświeżeniu strony
  try {
    const raw = sessionStorage.getItem('ijanicki_firma_previewInvoice');
    if (raw) {
      sessionStorage.removeItem('ijanicki_firma_previewInvoice');
      const saved = JSON.parse(raw);
      if (saved.invoice && saved.issuer) {
        const restoredFirm = saved.firm?.id
          ? state.firms.find(f => f.id === saved.firm.id) || saved.firm
          : saved.firm;
        openInvoicePreview({
          invoice: saved.invoice,
          firm: restoredFirm,
          issuer: saved.issuer,
        });
      }
    }
  } catch (_) { /* ignoruj błędy parsowania */ }
  });
}
