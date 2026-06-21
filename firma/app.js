import {
  EXPENSE_CATEGORIES,
  PAYER_OPTIONS,
  VAT_OPTIONS,
  addDays,
  calculateFirmLedger,
  categoryLabel,
  currentMonthKey,
  formatCurrency,
  formatDate,
  formatPercent,
  getInvoiceMonthKey,
  getMonthRow,
  getWalletEntryMonth,
  monthFromDate,
  monthLabel,
  payerLabel,
  roundCurrency,
  uid,
} from './logic.js?v=12';
import {
  createEmptyState,
  deleteAttachment,
  getAttachment,
  loadState,
  saveState,
  storeAttachment,
  MAX_ATTACHMENT_BYTES,
} from './storage.js?v=12';
import { openInvoicePreview } from './invoice.js?v=19';

const root = document.getElementById('app');
const modalRoot = document.getElementById('modalRoot');

let state = loadState();

function icon(name) {
  const icons = {
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>',
    wallet: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm0 0V6a2 2 0 0 1 2-2h11M16 13h4" /></svg>',
    file: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Zm0 0v5h5M9 13h6M9 17h6M9 9h1" /></svg>',
    chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5M10 19v-8M16 19V9M22 19H2" /></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /></svg>',
    trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M7 6l1 14h8l1-14M10 10v6M14 10v6" /></svg>',
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.5-1 9.5-9.5-3.5-3.5L5 15.5 4 20Zm10-12 3.5 3.5" /></svg>',
    upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M5 20h14" /></svg>',
    download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>',
  };
  return `<span class="icon">${icons[name] || icons.file}</span>`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function firmDisplayName(firm) {
  return (firm && (firm.displayName || firm.name)) || '';
}

function persist() {
  state = saveState(state);
}

function ensureState() {
  if (!state.ui) {
    state.ui = createEmptyState().ui;
  }
  state.ui.activeTab ||= 'overview';
  state.ui.activeMonthTab ||= 'overview';
  state.ui.activeInvoiceTab ||= 'own';
  state.ui.activeGlobalTab ||= 'firms';
}

function getSelectedFirm() {
  if (!state.ui.selectedFirmId) return null;
  const firm = state.firms.find((item) => item.id === state.ui.selectedFirmId);
  if (!firm) {
    // selectedFirmId wskazuje na nieistniejącą firmę – wyczyść
    state.ui.selectedFirmId = null;
    return null;
  }
  return firm;
}

function findInvoiceGlobal(invoiceId, firmId) {
  const firm = state.firms.find((f) => f.id === firmId);
  if (!firm) return null;
  const invoice = firm.invoices.find((inv) => inv.id === invoiceId);
  if (!invoice) return null;
  return { invoice, firm };
}

// Zwraca prawdziwy miesiąc (YYYY-MM) do użycia w formularzach,
// pomijając specjalne wartości agregujące.
function safeMonthValue() {
  const m = state.ui.selectedMonth;
  if (m === '__all__' || m === '__year__' || m === '__quarter__') return currentMonthKey();
  return m || currentMonthKey();
}

// Dwa osobne selecty: miesiąc (1-12) i rok (+/- 5 lat)
function monthYearFields(prefix, value) {
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
function readMonthYear(formData, prefix) {
  const month = String(formData.get(`${prefix}Month`)).padStart(2, '0');
  const year = String(formData.get(`${prefix}Year`));
  return `${year}-${month}`;
}

function ensureSelectedMonth(firm) {
  const ledger = calculateFirmLedger(firm);
  let selected = state.ui.selectedMonth;
  // Allow special aggregate values that are not in ledger.months
  if (selected !== '__all__' && selected !== '__year__' && selected !== '__quarter__') {
    if (!selected || !ledger.months.includes(selected)) {
      // Auto-select the latest (last) month
      selected = ledger.months.length > 0 ? ledger.months[0] : null;
      state.ui.selectedMonth = selected;
    }
  }
  return {
    ledger,
    selectedMonth: selected,
    monthRow: selected && !['__all__', '__year__', '__quarter__'].includes(selected) ? getMonthRow(ledger, selected) : null,
  };
}

function setSelectedFirm(firmId) {
  state.ui.selectedFirmId = firmId;
  state.ui.selectedMonth = null;
  state.ui.activeMonthTab = 'overview';
  const firm = getSelectedFirm();
  if (firm) {
    ensureSelectedMonth(firm);
  }
  persist();
  render();
}

function statCard(label, value, tone = 'default', note = '') {
  return `
    <article class="stat-card stat-${tone}">
      <span class="stat-label">${label}</span>
      <strong class="stat-value">${value}</strong>
      ${note ? `<span class="stat-note">${note}</span>` : ''}
    </article>
  `;
}

function getSettlementMeta(value) {
  const amount = roundCurrency(Math.abs(value || 0));
  if (value > 0) {
    return {
      label: 'Klient musi dopłacić',
      shortLabel: 'Do dopłaty',
      amount,
      tone: 'rose',
      badgeClass: 'is-negative',
      textClass: 'tone-rose',
    };
  }
  if (value < 0) {
    return {
      label: 'Nadpłata',
      shortLabel: 'Nadpłata',
      amount,
      tone: 'emerald',
      badgeClass: 'is-positive',
      textClass: 'tone-mint',
    };
  }
  return {
    label: 'Rozliczone',
    shortLabel: 'Rozliczone',
    amount: 0,
    tone: 'default',
    badgeClass: 'is-positive',
    textClass: '',
  };
}

function renderSettlementCell(value) {
  const meta = getSettlementMeta(value);
  return `
    <div class="settlement-cell">
      <strong class="${meta.textClass}">${meta.shortLabel}</strong>
      <span class="table-subline">${formatCurrency(meta.amount)}</span>
    </div>
  `;
}

function renderFirmList() {
  return `
    <div class="firm-list-page">
      <div class="list-page-head">
        <div>
          <p class="eyebrow">Firma</p>
          <h1>Klienci</h1>
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
            const settlement = getSettlementMeta(ledger.totals.walletBalance);
            return `
            <div class="firm-card tile-card" data-action="select-firm" data-id="${firm.id}" tabindex="0" role="button">
              <div class="tile-card-top">
                <span class="firm-title">${escapeHtml(firmDisplayName(firm))}</span>
                <span class="firm-card-actions">
                  <button class="icon-button" type="button" data-action="edit-firm-from-list" data-id="${firm.id}" aria-label="Edytuj">
                    ${icon('edit')}
                  </button>
                  <button class="icon-button tone-danger" type="button" data-action="delete-firm-from-list" data-id="${firm.id}" aria-label="Usuń">
                    ${icon('trash')}
                  </button>
                </span>
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

function renderAllOwnInvoices() {
  // Zbierz wszystkie faktury wlasne ze wszystkich firm
  const allOwn = [];
  for (const firm of state.firms) {
    for (const invoice of firm.invoices) {
      if (invoice.kind === 'own' && invoice.status !== 'cancelled') {
        allOwn.push({ invoice, firm });
      }
    }
  }
  allOwn.sort((a, b) => (b.invoice.issueDate || '').localeCompare(a.invoice.issueDate || ''));

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
                      <button class="mini-button actions-toggle" type="button" data-action="toggle-actions-global" data-inv="${invoice.id}" data-firm="${firm.id}" title="Akcje">⋯</button>
                      <div class="actions-menu" data-actions-global-menu="${invoice.id}">
                        <button class="table-action-btn" type="button" data-action="preview-global-invoice" data-inv="${invoice.id}" data-firm="${firm.id}" title="Podgląd faktury">${icon('eye')} Podgląd</button>
                        <button class="table-action-btn" type="button" data-action="view-global-invoice" data-inv="${invoice.id}" data-firm="${firm.id}" title="Szczegóły">${icon('file')} Szczegóły</button>
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

function getCategorySummary(expenses) {
  const map = new Map();
  for (const expense of expenses) {
    const key = expense.category || 'inne';
    map.set(key, roundCurrency((map.get(key) || 0) + Number(expense.amount || 0)));
  }
  return [...map.entries()]
    .map(([key, amount]) => ({ key, label: categoryLabel(key), amount }))
    .sort((a, b) => b.amount - a.amount);
}

function renderMonthList(ledger, selectedMonth) {
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Miesiąc</th>
            <th>Budżet</th>
            <th>Wynagrodzenie</th>
            <th>Do wydania</th>
            <th>Rozrachunek</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${ledger.rows.map((row) => {
            const settlement = renderSettlementCell(row.settlementEndingBalance);
            return `
            <tr class="${row.month === selectedMonth ? 'is-current-row' : ''}">
              <td>
                <button class="row-link strong-link" type="button" data-action="select-month" data-month="${row.month}">
                  ${row.label}
                </button>
              </td>
              <td>${formatCurrency(row.budget)}</td>
              <td>${formatCurrency(row.compensation)}</td>
              <td class="${row.adEndingBalance < 0 ? 'tone-amber' : 'tone-mint'}">${formatCurrency(row.adEndingBalance)}</td>
              <td>${settlement}</td>
              <td class="table-actions">
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

function renderMonthOverview(monthRow, monthExpenses) {
  const settlement = getSettlementMeta(monthRow.settlementEndingBalance);
  const budget = monthRow.budget;
  const compensation = monthRow.compensation;
  const doWydania = monthRow.adInjection;
  const wydano = monthRow.expensesTotal;
  const zPoprzedniego = monthRow.adCarryIn;
  const zostalo = monthRow.adEndingBalance;

  return `
    <div class="stats-grid" style="grid-template-columns: repeat(3, minmax(0, 1fr));">
      ${statCard('Budżet', formatCurrency(budget), 'cyan', 'Na dany okres rozliczeniowy')}
      ${statCard('Zarobek', formatCurrency(compensation), 'emerald', 'Moja wypłata z tego okresu')}
      ${statCard('Do wydania', formatCurrency(doWydania), 'amber', 'Z budżetu po odjęciu zarobku')}
      ${statCard('Z poprzedniego okresu', formatCurrency(zPoprzedniego), zPoprzedniego < 0 ? 'rose' : 'default', 'Przeniesione do tego miesiąca')}
      ${statCard('Wydano', formatCurrency(wydano), 'rose', 'Suma wydatków w tym okresie')}
      ${statCard('Zostało', formatCurrency(zostalo), zostalo < 0 ? 'rose' : 'emerald', 'Pozostało do wydania łącznie')}
      ${statCard('Klient opłacił sam', formatCurrency(monthRow.clientCoveredDirectly), 'default', 'Koszty zapłacone bezpośrednio przez klienta')}
      ${statCard('Wpłaty klienta', formatCurrency(monthRow.paymentsReceived), 'emerald', 'Realne wpłaty otrzymane od klienta')}
      ${statCard(settlement.label, formatCurrency(settlement.amount), settlement.tone, 'Stan po tym miesiącu')}
    </div>
  `;
}

function renderMonthExpenses(month, expenses) {
  return `
    <div class="panel-head space-between">
      <div>
        <p class="eyebrow">Wydatki</p>
        <h3>${monthLabel(month)}</h3>
      </div>
      <button class="primary-button" type="button" data-action="add-expense">${icon('plus')}Dodaj wydatek</button>
    </div>

    ${expenses.length === 0 ? `
      <div class="empty-block">
        <p>Brak wydatków w tym miesiącu.</p>
      </div>
    ` : `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Kategoria</th>
              <th>Opis</th>
              <th>Płatnik</th>
              <th>Kwota</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${expenses.map((expense) => `
              <tr>
                <td>${formatDate(expense.date)}</td>
                <td>${categoryLabel(expense.category)}</td>
                <td>
                  <strong>${escapeHtml(expense.vendor || 'Wydatek')}</strong>
                  <span class="table-subline">${escapeHtml(expense.description || '—')}</span>
                </td>
                <td>${payerLabel(expense.payer)}</td>
                <td>${formatCurrency(expense.amount)}</td>
                <td class="table-actions">
                  <button class="mini-button" type="button" data-action="edit-expense" data-id="${expense.id}">${icon('edit')}</button>
                  <button class="mini-button tone-danger" type="button" data-action="delete-expense" data-id="${expense.id}">${icon('trash')}</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `}
  `;
}

function renderTilesGrid(budget, compensation, carryIn, wydano) {
  const doWydania = roundCurrency(budget - compensation);
  const zostalo = roundCurrency(doWydania + carryIn - wydano);
  return `
    <div class="stats-grid" style="grid-template-columns: repeat(3, minmax(0, 1fr));">
      ${statCard('Budżet', formatCurrency(budget), 'cyan', 'Na dany okres rozliczeniowy')}
      ${statCard('Zarobek', formatCurrency(compensation), 'emerald', 'Moja wypłata z tego okresu')}
      ${statCard('Do wydania', formatCurrency(doWydania), 'amber', 'Z budżetu po odjęciu zarobku')}
      ${statCard('Z poprzedniego okresu', formatCurrency(carryIn), carryIn < 0 ? 'rose' : 'default', 'Przeniesione do tego okresu')}
      ${statCard('Wydano', formatCurrency(wydano), 'rose', 'Suma wydatków w tym okresie')}
      ${statCard('Zostało', formatCurrency(zostalo), zostalo < 0 ? 'rose' : 'emerald', 'Pozostało do wydania łącznie')}
    </div>
  `;
}

function renderOverview(firm, ledger, selectedMonth, monthRow) {
  // Brak miesięcy — stan pusty
  if (ledger.rows.length === 0) {
    return `
      <section class="section-band">
        <div class="panel-head space-between">
          <div>
            <p class="eyebrow">Przegląd</p>
            <h3>Miesiące i budżety</h3>
          </div>
          <button class="primary-button" type="button" data-action="add-month">${icon('plus')}Dodaj miesiąc</button>
        </div>
        <div class="empty-block">
          <p>Ta firma nie ma jeszcze żadnego miesiąca. Dodaj pierwszy budżet i procent wynagrodzenia.</p>
        </div>
      </section>
    `;
  }

  // Widok łączny „Razem” – wszystkie miesiące
  if (selectedMonth === '__all__') {
    const budget = roundCurrency(ledger.rows.reduce((acc, row) => acc + row.budget, 0));
    const compensation = roundCurrency(ledger.rows.reduce((acc, row) => acc + row.compensation, 0));
    const wydano = roundCurrency(ledger.rows.reduce((acc, row) => acc + row.expensesTotal, 0));
    return `
      <section class="section-band">
        <div class="panel-head space-between">
          <div>
            <p class="eyebrow eyebrow-center">${escapeHtml(firmDisplayName(firm))}</p>
            <h3>Razem – wszystkie miesiące</h3>
          </div>
          <button class="primary-button" type="button" data-action="add-month">${icon('plus')}Dodaj miesiąc</button>
        </div>
        ${renderTilesGrid(budget, compensation, 0, wydano)}
      </section>
    `;
  }

  // Helper – saldo końcowe miesiąca poprzedzającego dany
  const prevMonthBalance = (ledger, monthKey) => {
    const row = ledger.rows.find(r => r.month === monthKey);
    return row ? row.adEndingBalance : 0;
  };

  // Widok „Ten rok” – miesiące bieżącego roku
  if (selectedMonth === '__year__') {
    const currentYear = String(new Date().getFullYear());
    const yearRows = ledger.rows.filter((row) => row.month.startsWith(currentYear));
    if (yearRows.length === 0) {
      return `
        <section class="section-band">
          <div class="panel-head space-between">
            <div>
              <p class="eyebrow eyebrow-center">${escapeHtml(firmDisplayName(firm))}</p>
              <h3>Rok ${currentYear}</h3>
            </div>
          </div>
          <div class="empty-block">
            <p>Brak danych dla roku ${currentYear}.</p>
          </div>
        </section>
      `;
    }
    const budget = roundCurrency(yearRows.reduce((acc, row) => acc + row.budget, 0));
    const compensation = roundCurrency(yearRows.reduce((acc, row) => acc + row.compensation, 0));
    const wydano = roundCurrency(yearRows.reduce((acc, row) => acc + row.expensesTotal, 0));
    const carryIn = prevMonthBalance(ledger, `${Number(currentYear) - 1}-12`);
    return `
      <section class="section-band">
        <div class="panel-head space-between">
          <div>
            <p class="eyebrow eyebrow-center">${escapeHtml(firmDisplayName(firm))}</p>
            <h3>Rok ${currentYear}</h3>
          </div>
          <button class="primary-button" type="button" data-action="add-month">${icon('plus')}Dodaj miesiąc</button>
        </div>
        ${renderTilesGrid(budget, compensation, carryIn, wydano)}
      </section>
    `;
  }

  // Widok „Ten kwartał”
  if (selectedMonth === '__quarter__') {
    const now = new Date();
    const year = String(now.getFullYear());
    const q = Math.floor(now.getMonth() / 3);
    const qMonths = [
      `${year}-${String(q * 3 + 1).padStart(2, '0')}`,
      `${year}-${String(q * 3 + 2).padStart(2, '0')}`,
      `${year}-${String(q * 3 + 3).padStart(2, '0')}`
    ];
    const qRows = ledger.rows.filter(r => qMonths.includes(r.month));
    const quarterLabel = `Q${q + 1} ${year}`;
    if (qRows.length === 0) {
      return `
        <section class="section-band">
          <div class="panel-head space-between">
            <div>
              <p class="eyebrow eyebrow-center">${escapeHtml(firmDisplayName(firm))}</p>
              <h3>Kwartał ${quarterLabel}</h3>
            </div>
          </div>
          <div class="empty-block">
            <p>Brak danych dla kwartału ${quarterLabel}.</p>
          </div>
        </section>
      `;
    }
    const budget = roundCurrency(qRows.reduce((acc, row) => acc + row.budget, 0));
    const compensation = roundCurrency(qRows.reduce((acc, row) => acc + row.compensation, 0));
    const wydano = roundCurrency(qRows.reduce((acc, row) => acc + row.expensesTotal, 0));
    // Miesiąc przed rozpoczęciem kwartału
    const beforeQuarter = q === 0
      ? `${Number(year) - 1}-12`
      : `${year}-${String(q * 3).padStart(2, '0')}`;
    const carryIn = prevMonthBalance(ledger, beforeQuarter);
    return `
      <section class="section-band">
        <div class="panel-head space-between">
          <div>
            <p class="eyebrow eyebrow-center">${escapeHtml(firmDisplayName(firm))}</p>
            <h3>Kwartał ${quarterLabel}</h3>
          </div>
          <button class="primary-button" type="button" data-action="add-month">${icon('plus')}Dodaj miesiąc</button>
        </div>
        ${renderTilesGrid(budget, compensation, carryIn, wydano)}
      </section>
    `;
  }

  // Nie wybrano jeszcze miesiąca — podsumowanie firmy
  if (!monthRow) {
    const totalBudget = roundCurrency(ledger.rows.reduce((acc, row) => acc + row.budget, 0));
    return `
      <section class="section-band">
        <div class="panel-head space-between">
          <div>
            <p class="eyebrow">Przegląd</p>
            <h3>${escapeHtml(firmDisplayName(firm))}</h3>
          </div>
          <button class="primary-button" type="button" data-action="add-month">${icon('plus')}Dodaj miesiąc</button>
        </div>
        <div class="stats-grid" style="grid-template-columns: repeat(3, minmax(0, 1fr));">
          ${statCard('Liczba miesięcy', String(ledger.rows.length), 'default', 'Aktywne okresy rozliczeniowe')}
          ${statCard('Łączny budżet', formatCurrency(totalBudget), 'cyan', 'Suma budżetów ze wszystkich miesięcy')}
          ${(() => {
            const settlement = getSettlementMeta(ledger.totals.walletBalance);
            return statCard(settlement.label, formatCurrency(settlement.amount), settlement.tone, 'Aktualny stan rozrachunku');
          })()}
        </div>
        <p style="margin-top: 16px; color: var(--text-soft); font-size: 0.9rem;">
          Wybierz miesiąc z listy powyżej, aby zobaczyć szczegóły.
        </p>
      </section>
    `;
  }

  // Wybrano miesiąc — szczegóły miesiąca
  return `
    <section class="section-band">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Wybrany miesiąc</p>
          <h3>${monthLabel(selectedMonth)}</h3>
        </div>
      </div>

      ${renderMonthOverview(
        monthRow,
        [...firm.expenses].filter((expense) => (expense.month || monthFromDate(expense.date)) === selectedMonth)
      )}
    </section>
  `;
}

function renderAttachments(invoice) {
  if (!invoice.attachmentIds?.length) {
    return '<span class="table-subline">Bez pliku</span>';
  }
  return `
    <div class="attachment-list">
      ${invoice.attachmentIds.map((attachmentId) => `
        <button type="button" class="attachment-pill" data-action="open-attachment" data-attachment-id="${attachmentId}">
          ${icon('eye')}Otwórz plik
        </button>
      `).join('')}
    </div>
  `;
}

function renderInvoiceRow(invoice, index, firm, showActions = false) {
  const kindLabel = invoice.kind === 'own' ? 'W' : 'Z';
  const kindTitle = invoice.kind === 'own' ? 'Wewnętrzna (wystawiona dla klienta)' : 'Zewnętrzna (dokument kosztowy)';
  const hasAttachment = invoice.attachmentIds && invoice.attachmentIds.length > 0;
  return `
    <tr>
      <td class="col-lp">${index + 1}</td>
      <td class="col-date">${formatDate(invoice.issueDate)}</td>
      <td class="col-title">
        <strong>${escapeHtml(invoice.title || invoice.vendor || invoice.number || '—')}</strong>
        ${invoice.kind === 'external' && invoice.vendor ? `<span class="table-subline">${escapeHtml(invoice.vendor)}</span>` : ''}
      </td>
      <td class="col-number">${escapeHtml(invoice.number || '—')}</td>
      <td class="col-amount">${formatCurrency(invoice.amount)}</td>
      <td class="col-kind">
        <span class="kind-badge kind-${invoice.kind}" title="${escapeHtml(kindTitle)}">${kindLabel}</span>
      </td>
      ${showActions ? `
        <td class="col-actions">
          ${hasAttachment ? `<button class="mini-button" type="button" data-action="download-attachment" data-id="${invoice.id}" aria-label="Pobierz załącznik">${icon('download')}</button>` : ''}
          <button class="mini-button tone-me" type="button" data-action="mark-paid-me" data-id="${invoice.id}" title="Opłaciłem ja">Ja</button>
          <button class="mini-button tone-client" type="button" data-action="mark-paid-client" data-id="${invoice.id}" title="Opłacił klient">Klient</button>
          <button class="mini-button tone-danger" type="button" data-action="delete-invoice" data-id="${invoice.id}" title="Usuń">${icon('trash')}</button>
        </td>
      ` : `
        <td class="col-actions">
          ${hasAttachment ? `<button class="mini-button" type="button" data-action="download-attachment" data-id="${invoice.id}" aria-label="Pobierz załącznik">${icon('download')}</button>` : ''}
          <button class="mini-button tone-danger" type="button" data-action="unmark-paid" data-id="${invoice.id}" title="Cofnij opłacenie">Cofnij</button>
          <button class="mini-button tone-danger" type="button" data-action="delete-invoice" data-id="${invoice.id}" title="Usuń">${icon('trash')}</button>
        </td>
      `}
    </tr>
  `;
}

function renderInvoiceTable(invoices, firm, emptyMessage, showActions = false) {
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
            <th class="col-title">Tytuł</th>
            <th class="col-number">Nr FV</th>
            <th class="col-amount">Kwota</th>
            <th class="col-kind">Z/W</th>
            <th class="col-actions">Akcje</th>
          </tr>
        </thead>
        <tbody>
          ${invoices.map((invoice, index) => renderInvoiceRow(invoice, index, firm, showActions)).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderInvoices(firm, selectedMonth) {
  const allInvoices = [...firm.invoices].sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''));

  const unpaidInvoices = allInvoices.filter((inv) => !inv.paidBy);
  const paidByMe = allInvoices.filter((inv) => inv.paidBy === 'me');
  const paidByClient = allInvoices.filter((inv) => inv.paidBy === 'client');

  return `
    <section class="section-band">
      <div class="panel-head space-between">
        <div>
          <p class="eyebrow">Faktury</p>
          <h3>Dokumenty rozliczeniowe</h3>
        </div>
        <div class="toolbar-actions">
        </div>
      </div>

      <!-- SEKCJA 1: NIEOPŁACONE -->
      ${unpaidInvoices.length > 0 ? `
        <div class="invoices-section invoices-unpaid">
          <div class="invoices-section-head">
            <h4 class="invoices-section-title tone-rose">● NIEOPŁACONE</h4>
            <span class="invoices-section-count">${unpaidInvoices.length}</span>
          </div>
          ${renderInvoiceTable(unpaidInvoices, firm, 'Brak nieopłaconych faktur.', true)}
        </div>
      ` : ''}

      <!-- SEKCJA 2: OPŁACONE – 2 kolumny -->
      <div class="invoices-paid-grid">
        <div class="invoices-section invoices-paid-me">
          <div class="invoices-section-head">
            <h4 class="invoices-section-title tone-mint">● Opłaciłem ja</h4>
            <span class="invoices-section-count">${paidByMe.length}</span>
          </div>
          ${renderInvoiceTable(paidByMe, firm, 'Brak faktur opłaconych przeze mnie.')}
        </div>

        <div class="invoices-section invoices-paid-client">
          <div class="invoices-section-head">
            <h4 class="invoices-section-title tone-cyan">● Opłacił klient</h4>
            <span class="invoices-section-count">${paidByClient.length}</span>
          </div>
          ${renderInvoiceTable(paidByClient, firm, 'Brak faktur opłaconych przez klienta.')}
        </div>
      </div>
    </section>
  `;
}

function renderBalance(firm, ledger, selectedMonth, monthRow) {
  const settlement = getSettlementMeta(ledger.totals.walletBalance);
  const payments = [...(firm.walletEntries || [])]
    .filter((entry) => entry.type === 'income')
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const clientPaidExpenses = [...(firm.expenses || [])]
    .filter((expense) => expense.payer === 'client_card')
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const adjustments = [...(firm.balanceEntries || [])]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  return `
    <section class="section-band">
      <div class="stats-grid stats-grid-4">
        ${statCard(settlement.label, formatCurrency(settlement.amount), settlement.tone, 'Bieżący stan rozrachunku z klientem')}
        ${statCard('Suma budżetów', formatCurrency(ledger.totals.totalBudget), 'cyan', 'Wszystkie miesiące razem')}
        ${statCard('Klient opłacił sam', formatCurrency(ledger.totals.totalClientCardExpenses), 'default', 'Koszty zapłacone bezpośrednio przez klienta')}
        ${statCard('Wpłaty klienta', formatCurrency(ledger.totals.totalPaymentsReceived), 'emerald', 'Realne wpłaty, które już od niego dostałeś')}
      </div>
      <p class="table-note">
        Rozrachunek liczony jest narastająco: <strong>suma budżetów</strong> plus <strong>koszty opłacone przeze mnie</strong>
        minus <strong>wpłaty klienta</strong>, z uwzględnieniem ręcznych korekt. Koszty opłacone bezpośrednio przez klienta nie zmieniają salda.
      </p>
    </section>

    <section class="section-band">
      <div class="wallet-grid">
        <div class="wallet-column">
          <div class="panel-head space-between">
            <div>
              <p class="eyebrow">Rozrachunek</p>
              <h3>Wpłaty klienta</h3>
            </div>
            <button class="primary-button" type="button" data-action="add-wallet-income">${icon('plus')}Dodaj wpłatę</button>
          </div>

          ${payments.length === 0 ? `
            <div class="empty-block">
              <p>Brak wpłat klienta.</p>
            </div>
          ` : `
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Opis</th>
                    <th>Kwota</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${payments.map((entry) => `
                    <tr>
                      <td>${formatDate(entry.date)}</td>
                      <td>${escapeHtml(entry.title || 'Wpłata klienta')}</td>
                      <td class="tone-mint">${formatCurrency(entry.amount)}</td>
                      <td class="table-actions">
                        <button class="mini-button tone-danger" type="button" data-action="delete-wallet-entry" data-id="${entry.id}">${icon('trash')}</button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>

        <div class="wallet-column">
          <div class="panel-head space-between">
            <div>
              <p class="eyebrow">Rozrachunek</p>
              <h3>Koszty opłacone przez klienta</h3>
            </div>
          </div>

          ${clientPaidExpenses.length === 0 ? `
            <div class="empty-block">
              <p>Brak kosztów opłaconych bezpośrednio przez klienta.</p>
            </div>
          ` : `
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Kategoria</th>
                    <th>Opis</th>
                    <th>Kwota</th>
                  </tr>
                </thead>
                <tbody>
                  ${clientPaidExpenses.map((entry) => `
                    <tr>
                      <td>${formatDate(entry.date)}</td>
                      <td>${categoryLabel(entry.category)}</td>
                      <td>
                        <strong>${escapeHtml(entry.vendor || 'Wydatek')}</strong>
                        <span class="table-subline">${escapeHtml(entry.description || '—')}</span>
                      </td>
                      <td class="tone-cyan">${formatCurrency(entry.amount)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>

        <div class="wallet-column">
          <div class="panel-head space-between">
            <div>
              <p class="eyebrow">Rozrachunek</p>
              <h3>Korekty ręczne</h3>
            </div>
            <div class="toolbar-actions">
              <button class="ghost-button" type="button" data-action="add-balance-minus">Zmniejsz rozrachunek</button>
              <button class="primary-button" type="button" data-action="add-balance-plus">Zwiększ rozrachunek</button>
            </div>
          </div>

          ${adjustments.length === 0 ? `
            <div class="empty-block">
              <p>Brak korekt ręcznych.</p>
            </div>
          ` : `
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Opis</th>
                    <th>Zmiana</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${adjustments.map((entry) => `
                    <tr>
                      <td>${formatDate(entry.date)}</td>
                      <td>${escapeHtml(entry.description || 'Korekta')}</td>
                      <td class="${entry.amount > 0 ? 'tone-rose' : 'tone-mint'}">
                        ${entry.amount > 0 ? '+' : '-'}${formatCurrency(Math.abs(entry.amount))}
                      </td>
                      <td class="table-actions">
                        <button class="mini-button" type="button" data-action="edit-balance" data-id="${entry.id}">${icon('edit')}</button>
                        <button class="mini-button tone-danger" type="button" data-action="delete-balance" data-id="${entry.id}">${icon('trash')}</button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      </div>
    </section>
  `;
}

function renderFirmDetail() {
  const firm = getSelectedFirm();
  if (!firm) return renderFirmList();

  const { ledger, selectedMonth, monthRow } = ensureSelectedMonth(firm);
  const tab = state.ui.activeTab || 'overview';

  // Kwota „Do wydania” zależna od wybranego widoku
  const availableBalance = (() => {
    if (monthRow) return monthRow.adEndingBalance;
    if (selectedMonth === '__year__') {
      const year = String(new Date().getFullYear());
      const yearRows = ledger.rows.filter(r => r.month.startsWith(year));
      return yearRows[0]?.adEndingBalance || 0;
    }
    if (selectedMonth === '__quarter__') {
      const now = new Date();
      const year = String(now.getFullYear());
      const q = Math.floor(now.getMonth() / 3);
      const qMonths = [`${year}-${String(q * 3 + 1).padStart(2, '0')}`, `${year}-${String(q * 3 + 2).padStart(2, '0')}`, `${year}-${String(q * 3 + 3).padStart(2, '0')}`];
      const qRows = ledger.rows.filter(r => qMonths.includes(r.month));
      return qRows[0]?.adEndingBalance || 0;
    }
    return ledger.totals.adBalance;
  })();

  let body = '';
  if (tab === 'overview') body = renderOverview(firm, ledger, selectedMonth, monthRow);
  if (tab === 'invoices') body = renderInvoices(firm, selectedMonth);
  if (tab === 'balance') body = renderBalance(firm, ledger, selectedMonth, monthRow);

  return `
    <div class="firm-detail-page">
      <section class="main-area">
        ${body}
      </section>

      <div class="fab-container">
        <button class="fab-button" type="button" data-action="fab-action" aria-label="Dodaj">
          ${icon('plus')}
        </button>
      </div>
    </div>
  `;
}

function render() {
  ensureState();
  updateTopbar();
  try {
    const firm = getSelectedFirm();
    if (firm && state.ui.selectedFirmId) {
      root.innerHTML = renderFirmDetail();
    } else if (state.ui.activeGlobalTab === 'my-invoices') {
      root.innerHTML = renderAllOwnInvoices();
    } else {
      root.innerHTML = renderFirmList();
    }
  } catch (e) {
    root.innerHTML = `
      <div style="padding: 40px; color: #f44; font-family: monospace;">
        <h2>⚠️ Błąd renderowania</h2>
        <pre>${escapeHtml(e.message)}</pre>
        <pre style="font-size: 0.8rem; color: #888;">${escapeHtml(e.stack)}</pre>
      </div>
    `;
  }
}

function updateTopbar() {
  const container = document.getElementById('topbarContent');
  if (!container) return;

  const firm = getSelectedFirm();
  if (!firm || !state.ui.selectedFirmId) {
    // Globalne zakładki: Klienci | Moje faktury
    const globalTab = state.ui.activeGlobalTab || 'firms';
    container.innerHTML = `
      <div class="topbar-grid">
        <div class="topbar-grid-left">
          <div class="tab-row">
            <button class="tab-button ${globalTab === 'firms' ? 'is-active' : ''}" type="button" data-action="switch-global-tab" data-tab="firms">
              Klienci
            </button>
            <button class="tab-button ${globalTab === 'my-invoices' ? 'is-active' : ''}" type="button" data-action="switch-global-tab" data-tab="my-invoices">
              Moje faktury
            </button>
          </div>
        </div>
        <div class="topbar-grid-center"></div>
        <div class="topbar-grid-right"></div>
      </div>
    `;
    return;
  }

  const { ledger, selectedMonth, monthRow } = ensureSelectedMonth(firm);
  const tab = state.ui.activeTab || 'overview';

  // Kwota „Do wydania” zależna od wybranego widoku
  const availableBalance = (() => {
    if (monthRow) return monthRow.adEndingBalance;
    if (selectedMonth === '__year__') {
      const year = String(new Date().getFullYear());
      const yearRows = ledger.rows.filter(r => r.month.startsWith(year));
      return yearRows[0]?.adEndingBalance || 0;
    }
    if (selectedMonth === '__quarter__') {
      const now = new Date();
      const year = String(now.getFullYear());
      const q = Math.floor(now.getMonth() / 3);
      const qMonths = [`${year}-${String(q * 3 + 1).padStart(2, '0')}`, `${year}-${String(q * 3 + 2).padStart(2, '0')}`, `${year}-${String(q * 3 + 3).padStart(2, '0')}`];
      const qRows = ledger.rows.filter(r => qMonths.includes(r.month));
      return qRows[0]?.adEndingBalance || 0;
    }
    return ledger.totals.adBalance;
  })();

  container.innerHTML = `
    <div class="topbar-grid">
      <div class="topbar-grid-left">
        <div class="tab-row">
          ${[
            ['overview', 'Przegląd'],
            ['invoices', 'Faktury'],
            ['balance', 'Rozrachunek'],
          ].map(([value, label]) => `
            <button class="tab-button ${tab === value ? 'is-active' : ''}" type="button" data-action="switch-tab" data-tab="${value}">
              ${label}
            </button>
          `).join('')}
        </div>
      </div>
      <div class="topbar-grid-center">
        <div class="topbar-badges">
          ${(() => {
            const settlement = getSettlementMeta(ledger.totals.walletBalance);
            return `
              <div class="saldo-badge ${settlement.badgeClass}">
                <span class="saldo-label">${settlement.shortLabel}</span>
                <strong class="saldo-value">${formatCurrency(settlement.amount)}</strong>
              </div>
            `;
          })()}
          <div class="do-wydania-badge ${availableBalance < 0 ? 'is-negative' : 'is-positive'}">
            <span class="do-wydania-label">Do wydania</span>
            <strong class="do-wydania-value">${formatCurrency(availableBalance)}</strong>
          </div>
        </div>
      </div>
      <div class="topbar-grid-right">
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

function closeModal() {
  modalRoot.innerHTML = '';
}

function openModal(title, content, { wide = false } = {}) {
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

function labeledInput({ name, label, type = 'text', value = '', placeholder = '', required = false, step = 'any', min = '', options = null }) {
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
        ${min !== '' ? `min="${min}"` : ''}
        ${type === 'number' ? `step="${step}"` : ''}
      />
    </label>
  `;
}

function textareaField({ name, label, value = '', placeholder = '' }) {
  return `
    <label class="field">
      <span>${label}</span>
      <textarea name="${name}" rows="4" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value || '')}</textarea>
    </label>
  `;
}

function modalActions(primaryLabel, secondaryLabel = 'Anuluj') {
  return `
    <div class="modal-actions">
      <button class="ghost-button" type="button" data-action="close-modal">${secondaryLabel}</button>
      <button class="primary-button" type="submit">${primaryLabel}</button>
    </div>
  `;
}

function openFirmModal(firm = null) {
  openModal(
    firm ? 'Edytuj firmę' : 'Dodaj firmę',
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
          ${firm ? '<button class="ghost-button tone-danger" type="button" id="deleteFirmButton">Usuń firmę</button>' : '<span></span>'}
          <div class="modal-actions-group">
            <button class="ghost-button" type="button" data-action="close-modal">Anuluj</button>
            <button class="primary-button" type="submit">${firm ? 'Zapisz firmę' : 'Dodaj firmę'}</button>
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
      balanceEntries: firm?.balanceEntries || [],
      walletEntries: firm?.walletEntries || [],
      expenses: firm?.expenses || [],
      invoices: firm?.invoices || [],
      createdAt: firm?.createdAt || now,
      updatedAt: now,
    };

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
      if (!window.confirm(`Usunąć firmę "${firmDisplayName(firm)}" razem z miesiącami, saldem, wydatkami i fakturami?`)) {
        return;
      }
      state.firms = state.firms.filter((item) => item.id !== firm.id);
      state.ui.selectedFirmId = state.firms[0]?.id || null;
      state.ui.selectedMonth = state.firms[0] ? currentMonthKey() : null;
      persist();
      closeModal();
      render();
    });
  }
}

function findMonthConfig(month) {
  return getSelectedFirm()?.months.find((item) => item.month === month) || null;
}

function openMonthModal(existing = null) {
  const firm = getSelectedFirm();
  if (!firm) return;

  openModal(
    existing ? 'Edytuj miesiąc' : 'Dodaj miesiąc',
    `
      <form id="monthForm" class="form-grid">
        ${monthYearFields('month', existing?.month || safeMonthValue())}
        ${labeledInput({ name: 'budget', label: 'Budżet miesiąca', type: 'number', value: existing?.budget ?? '', min: '0', required: true })}
        ${labeledInput({ name: 'compensationPercent', label: '% wynagrodzenia', type: 'number', value: existing?.compensationPercent ?? 50, min: '0', required: true })}
        ${existing ? `
        <div class="modal-actions is-split">
          <button class="ghost-button tone-danger" type="button" data-action="delete-month-from-modal" data-month="${existing.month}">Usun miesiac</button>
          <div class="modal-actions-group">
            <button class="ghost-button" type="button" data-action="close-modal">Anuluj</button>
            <button class="primary-button" type="submit">Zapisz miesiąc</button>
          </div>
        </div>` : modalActions('Dodaj miesiąc')}
      </form>
    `
  );

  const form = document.getElementById('monthForm');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const month = readMonthYear(data, 'month');

    // Blokada duplikatow
    if (!existing && firm.months.some(m => m.month === month)) {
      alert('Ten miesiac juz istnieje. Wybierz inny.');
      return;
    }

    const monthEntry = {
      id: existing?.id || uid(),
      month,
      budget: roundCurrency(data.get('budget')),
      compensationPercent: roundCurrency(data.get('compensationPercent')),
      updatedAt: new Date().toISOString(),
    };

    firm.months = [
      ...firm.months.filter((item) => item.month !== month && item.id !== monthEntry.id),
      monthEntry,
    ].sort((a, b) => a.month.localeCompare(b.month));
    firm.updatedAt = new Date().toISOString();
    state.ui.selectedMonth = month;
    state.ui.activeMonthTab = 'overview';
    persist();
    closeModal();
    render();
  });
}

/**
 * 2-krokowy modal edycji miesiaca wywolywany z dropdowna ("Edytuj miesiac...").
 * Krok 1: wybor miesiaca z listy.
 * Krok 2: formularz edycji wybranego miesiaca.
 */
function openEditMonthPicker() {
  const firm = getSelectedFirm();
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

/** Krok 2 – formularz edycji wybranego miesiaca */
function showMonthEditStep2(month) {
  const firm = getSelectedFirm();
  if (!firm) return;
  const existing = findMonthConfig(month);
  if (!existing) return;

  const formContent = `
    <div class="edit-month-step2">
      <p class="eyebrow">Krok 2 z 2</p>
      <h3>Edytuj: ${monthLabel(month)}</h3>
      <form id="monthForm" class="form-grid">
        ${monthYearFields('month', existing.month)}
        ${labeledInput({ name: 'budget', label: 'Budzet miesiaca', type: 'number', value: existing.budget ?? '', min: '0', required: true })}
        ${labeledInput({ name: 'compensationPercent', label: '% wynagrodzenia', type: 'number', value: existing.compensationPercent ?? 50, min: '0', required: true })}
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
      compensationPercent: roundCurrency(data.get('compensationPercent')),
      updatedAt: new Date().toISOString(),
    };

    firm.months = [
      ...firm.months.filter((item) => item.month !== monthVal && item.id !== monthEntry.id),
      monthEntry,
    ].sort((a, b) => a.month.localeCompare(b.month));
    firm.updatedAt = new Date().toISOString();
    state.ui.selectedMonth = monthVal;
    state.ui.activeMonthTab = 'overview';
    persist();
    closeModal();
    render();
  });
}

function findBalanceEntry(id) {
  return getSelectedFirm()?.balanceEntries.find((item) => item.id === id) || null;
}

function openBalanceEntryModal(existing = null, defaultDirection = 'plus') {
  const firm = getSelectedFirm();
  if (!firm) return;
  const direction = existing ? (Number(existing.amount || 0) < 0 ? 'minus' : 'plus') : defaultDirection;

  openModal(
    existing ? 'Edytuj korektę rozrachunku' : (direction === 'minus' ? 'Zmniejsz rozrachunek' : 'Zwiększ rozrachunek'),
    `
      <form id="balanceForm" class="form-grid">
        ${labeledInput({ name: 'date', label: 'Data', type: 'date', value: existing?.date || new Date().toISOString().slice(0, 10), required: true })}
        ${labeledInput({
          name: 'direction',
          label: 'Typ zmiany',
          type: 'select',
          value: direction,
          options: [
            { value: 'plus', label: 'Zwiększ kwotę do dopłaty' },
            { value: 'minus', label: 'Zmniejsz kwotę do dopłaty' },
          ],
        })}
        ${labeledInput({ name: 'amount', label: 'Kwota', type: 'number', value: Math.abs(existing?.amount ?? ''), min: '0', required: true })}
        <div class="field field-span-2">
          <span>Opis</span>
          <input type="text" name="description" value="${escapeHtml(existing?.description || '')}" placeholder="Np. korekta ustaleń, rabat, zwrot" required />
        </div>
        ${modalActions(existing ? 'Zapisz zmianę' : 'Dodaj zmianę')}
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
    persist();
    closeModal();
    render();
  });
}

// ---- MODAL: Dodaj rozchód (podpinanie faktury) ----
function openWalletExpenseModal() {
  const firm = getSelectedFirm();
  if (!firm) return;

  const allInvoices = [...firm.invoices].sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || ''));
  // Filtrujemy faktury, które nie są jeszcze podpięte jako rozchód
  const linkedIds = new Set((firm.walletEntries || []).filter(e => e.type === 'expense').map(e => e.linkedInvoiceId));
  const availableInvoices = allInvoices.filter(inv => !linkedIds.has(inv.id));

  openModal(
    'Dodaj rozchód',
    `
      <form id="walletExpenseForm" class="form-grid">
        ${availableInvoices.length === 0 ? `
          <div class="empty-block" style="grid-column:1/-1">
            <p>Brak dostępnych faktur do podpięcia. Wszystkie faktury są już podpięte jako rozchody lub nie ma żadnych faktur.</p>
          </div>
        ` : `
          ${labeledInput({
            name: 'invoiceId',
            label: 'Wybierz fakturę',
            type: 'select',
            value: '',
            options: [
              { value: '', label: '— wybierz fakturę —' },
              ...availableInvoices.map(inv => ({
                value: inv.id,
                label: `${escapeHtml(inv.number || 'Brak nr')} – ${escapeHtml(inv.title || '')} (${formatCurrency(inv.amount)})`,
              })),
            ],
          })}
          <div class="field field-span-2" id="walletExpensePreview" style="display:none;">
            <div class="info-box">
              <p><strong>Podgląd:</strong></p>
              <p id="walletExpensePreviewText"></p>
            </div>
          </div>
        `}
        ${availableInvoices.length > 0 ? modalActions('Dodaj rozchód') : `
          <div class="modal-actions">
            <button class="ghost-button" type="button" data-action="close-modal">Anuluj</button>
          </div>
        `}
      </form>
    `,
    { wide: true }
  );

  if (availableInvoices.length === 0) return;

  const form = document.getElementById('walletExpenseForm');
  const selectEl = form.querySelector('[name="invoiceId"]');
  const previewDiv = document.getElementById('walletExpensePreview');
  const previewText = document.getElementById('walletExpensePreviewText');

  // Podgląd danych faktury przy wyborze
  selectEl.addEventListener('change', () => {
    const inv = firm.invoices.find(i => i.id === selectEl.value);
    if (inv) {
      const zwLabel = inv.kind === 'own' ? 'W (wewnętrzna)' : 'Z (zewnętrzna)';
      previewText.innerHTML = `
        <strong>Nr FV:</strong> ${escapeHtml(inv.number || '—')}<br>
        <strong>Tytuł:</strong> ${escapeHtml(inv.title || '—')}<br>
        <strong>Kwota:</strong> ${formatCurrency(inv.amount)}<br>
        <strong>Oznaczenie:</strong> ${zwLabel}<br>
        <strong>Załącznik:</strong> ${inv.attachmentIds?.length ? 'Tak' : 'Brak'}
      `;
      previewDiv.style.display = 'block';
    } else {
      previewDiv.style.display = 'none';
    }
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const invoiceId = String(data.get('invoiceId'));
    const inv = firm.invoices.find(i => i.id === invoiceId);
    if (!inv) {
      window.alert('Wybierz fakturę.');
      return;
    }

    const entry = {
      id: uid(),
      type: 'expense',
      date: inv.issueDate || new Date().toISOString().slice(0, 10),
      title: inv.title || '',
      linkedInvoiceId: inv.id,
      createdAt: new Date().toISOString(),
    };

    firm.walletEntries = [...(firm.walletEntries || []), entry];
    firm.updatedAt = new Date().toISOString();
    persist();
    closeModal();
    render();
  });
}

// ---- MODAL: Dodaj przychód ----
function openWalletIncomeModal(existing = null) {
  const firm = getSelectedFirm();
  if (!firm) return;

  openModal(
    existing ? 'Edytuj wpłatę klienta' : 'Dodaj wpłatę klienta',
    `
      <form id="walletIncomeForm" class="form-grid">
        ${labeledInput({ name: 'date', label: 'Data', type: 'date', value: existing?.date || new Date().toISOString().slice(0, 10), required: true })}
        ${labeledInput({ name: 'title', label: 'Opis', value: existing?.title || '', placeholder: 'Np. Wpłata klienta za dwa miesiące', required: true })}
        ${labeledInput({ name: 'amount', label: 'Kwota', type: 'number', value: existing?.amount ?? '', min: '0', required: true })}
        ${labeledInput({
          name: 'method',
          label: 'Metoda płatności',
          type: 'select',
          value: existing?.method || 'card',
          options: [
            { value: 'card', label: 'Karta (K)' },
            { value: 'cash', label: 'Gotówka (G)' },
          ],
        })}
        ${modalActions(existing ? 'Zapisz wpłatę' : 'Dodaj wpłatę')}
      </form>
    `
  );

  const form = document.getElementById('walletIncomeForm');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const entry = {
      id: existing?.id || uid(),
      type: 'income',
      date: String(data.get('date')),
      title: String(data.get('title') || '').trim(),
      amount: roundCurrency(data.get('amount')),
      method: String(data.get('method')),
      createdAt: existing?.createdAt || new Date().toISOString(),
    };

    firm.walletEntries = [
      ...(firm.walletEntries || []).filter(e => e.id !== entry.id),
      entry,
    ].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    firm.updatedAt = new Date().toISOString();
    persist();
    closeModal();
    render();
  });
}

function findExpense(id) {
  return getSelectedFirm()?.expenses.find((item) => item.id === id) || null;
}

function openExpenseModal(existing = null) {
  const firm = getSelectedFirm();
  if (!firm) return;
  const defaultDate = existing?.date || new Date().toISOString().slice(0, 10);

  openModal(
    existing ? 'Edytuj wydatek' : 'Dodaj wydatek',
    `
      <form id="expenseForm" class="form-grid">
        ${labeledInput({ name: 'date', label: 'Data', type: 'date', value: defaultDate, required: true })}
        ${monthYearFields('month', existing?.month || safeMonthValue())}
        ${labeledInput({ name: 'category', label: 'Kategoria', type: 'select', value: existing?.category || 'google_ads', options: EXPENSE_CATEGORIES })}
        ${labeledInput({ name: 'payer', label: 'Płatnik', type: 'select', value: existing?.payer || 'my_funds', options: PAYER_OPTIONS })}
        ${labeledInput({ name: 'vendor', label: 'Dostawca / wystawca', value: existing?.vendor || '' })}
        ${labeledInput({ name: 'amount', label: 'Kwota', type: 'number', value: existing?.amount ?? '', min: '0', required: true })}
        <div class="field field-span-2">
          <span>Opis</span>
          <textarea name="description" rows="4">${escapeHtml(existing?.description || '')}</textarea>
        </div>
        ${modalActions(existing ? 'Zapisz wydatek' : 'Dodaj wydatek')}
      </form>
    `
  );

  const form = document.getElementById('expenseForm');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const expense = {
      id: existing?.id || uid(),
      date: String(data.get('date')),
      month: readMonthYear(data, 'month'),
      category: String(data.get('category')),
      payer: String(data.get('payer')),
      vendor: String(data.get('vendor') || '').trim(),
      amount: roundCurrency(data.get('amount')),
      description: String(data.get('description') || '').trim(),
      linkedInvoiceId: existing?.linkedInvoiceId || null,
      attachmentIds: existing?.attachmentIds || [],
      createdAt: existing?.createdAt || new Date().toISOString(),
    };
    firm.expenses = [...firm.expenses.filter((item) => item.id !== expense.id), expense]
      .sort((a, b) => a.date.localeCompare(b.date));
    firm.updatedAt = new Date().toISOString();
    state.ui.selectedMonth = expense.month;
    state.ui.activeMonthTab = 'expenses';
    persist();
    closeModal();
    render();
  });
}

function nextInvoiceNumber(issueDate, commit = false) {
  const year = String(issueDate).slice(0, 4);
  const current = Number(state.invoiceCounters[year] || 0) + 1;
  if (commit) {
    state.invoiceCounters[year] = current;
  }
  return `${current}/i-JANICKI/${year}`;
}

function openInvoiceDetailModal(invoice, firm) {
  const items = invoice.items || [];
  const kindLabel = invoice.kind === 'own' ? 'Wlasna' : 'Zewnetrzna';
  const paidLabel = invoice.paidBy === 'me' ? 'Oplacilem ja' : invoice.paidBy === 'client' ? 'Oplacil klient' : 'Nieoplacona';
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
          ${formatDate(invoice.issueDate)} &middot; ${paidLabel} &middot; Firma: ${escapeHtml(firmDisplayName(firm))}
        </div>
      </div>
      ${itemsHtml}
      ${invoice.notes ? `<div style="border-top:1px solid var(--border);padding-top:8px;font-size:13px;color:var(--text-dim)"><strong>Notatki:</strong> ${escapeHtml(invoice.notes)}</div>` : ''}
    </div>
  `;
  openModal('Szczegóły faktury — ' + (invoice.number || '-'), html, { wide: true });
}

function openInvoiceModal() {
  const currentFirm = getSelectedFirm();
  if (!currentFirm) return;
  const issueDate = new Date().toISOString().slice(0, 10);

  openModal(
    'Wystaw fakturę',
    `
      <form id="invoiceForm" class="form-grid">
        ${labeledInput({
          name: 'firmId',
          label: 'Nazwa firmy',
          type: 'select',
          value: currentFirm.id,
          options: state.firms.map((item) => ({ value: item.id, label: item.name })),
        })}
        <label class="field">
          <span>Miesiąc</span>
          <select name="month" id="invoiceMonthSelect"></select>
        </label>
        ${labeledInput({ name: 'issueDate', label: 'Data wystawienia', type: 'date', value: issueDate, required: true })}
        ${labeledInput({ name: 'saleDate', label: 'Data sprzedaży', type: 'date', value: issueDate, required: true })}
        ${labeledInput({ name: 'paymentDays', label: 'Termin płatności (dni)', type: 'number', value: 7, min: '0', required: true })}
        ${labeledInput({ name: 'vatMode', label: 'Typ faktury', type: 'select', value: 'zw', options: VAT_OPTIONS })}
        ${labeledInput({ name: 'amount', label: 'Kwota', type: 'number', value: '', min: '0', required: true })}
        <div class="field field-span-2">
          <span>Pozycja na fakturze</span>
          <input type="text" name="description" value="" required />
        </div>
        <div class="field field-span-2">
          <span>Uwagi</span>
          <textarea name="notes" rows="4"></textarea>
        </div>
        <label class="field field-span-2">
          <span>Załącznik (PDF lub obraz, do 1 MB)</span>
          <input type="file" name="file" accept=".pdf,image/*" />
        </label>
        ${modalActions('Wystaw fakturę')}
      </form>
    `,
    { wide: true }
  );

  const form = document.getElementById('invoiceForm');
  const firmSelect = form.querySelector('[name="firmId"]');
  const monthSelect = form.querySelector('#invoiceMonthSelect');
  const amountInput = form.querySelector('[name="amount"]');
  const descriptionInput = form.querySelector('[name="description"]');

  function updateInvoiceDefaults() {
    const firm = state.firms.find((item) => item.id === firmSelect.value) || currentFirm;
    const ledger = calculateFirmLedger(firm);
    const options = ledger.months.length > 0 ? ledger.months : [state.ui.selectedMonth || currentMonthKey()];
    const monthValue = options.includes(monthSelect.value) ? monthSelect.value : (state.ui.selectedMonth && options.includes(state.ui.selectedMonth) ? state.ui.selectedMonth : options.at(-1));
    monthSelect.innerHTML = options.map((month) => `
      <option value="${month}" ${month === monthValue ? 'selected' : ''}>${monthLabel(month)}</option>
    `).join('');
    const row = getMonthRow(ledger, monthValue);
    amountInput.value = row?.compensation ?? '';
    descriptionInput.value = `Obsługa marketingowa — ${monthLabel(monthValue)}`;
  }

  updateInvoiceDefaults();
  firmSelect.addEventListener('change', updateInvoiceDefaults);
  monthSelect.addEventListener('change', updateInvoiceDefaults);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const targetFirm = state.firms.find((item) => item.id === String(data.get('firmId'))) || currentFirm;
    const issueDateValue = String(data.get('issueDate'));
    const amount = roundCurrency(data.get('amount'));
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

    const invoice = {
      id: uid(),
      kind: 'own',
      source: 'system',
      number: nextInvoiceNumber(issueDateValue),
      month: String(data.get('month')),
      issueDate: issueDateValue,
      saleDate: String(data.get('saleDate')),
      dueDate: addDays(issueDateValue, Number(data.get('paymentDays') || 0)),
      status: 'issued',
      paidBy: null,
      vatMode: String(data.get('vatMode')),
      title: String(data.get('vatMode')) === 'vat23' ? 'Faktura VAT' : 'Faktura zwolniona',
      buyerSnapshot: {
        name: targetFirm.name,
        nip: targetFirm.nip,
        address1: targetFirm.address1,
        address2: targetFirm.address2,
        phone: targetFirm.phone,
        email: targetFirm.email,
      },
      issuerSnapshot: { ...state.settings.issuer },
      notes: String(data.get('notes') || '').trim(),
      amount,
      items: [
        {
          description: String(data.get('description')),
          quantity: 1,
          unitPrice: amount,
        },
      ],
      attachmentIds,
      createdAt: new Date().toISOString(),
    };

    invoice.number = nextInvoiceNumber(invoice.issueDate, true);
    targetFirm.invoices.push(invoice);
    targetFirm.updatedAt = new Date().toISOString();
    state.ui.selectedFirmId = targetFirm.id;
    persist();
    closeModal();
    render();
    openInvoicePreview({ invoice, firm: targetFirm, issuer: state.settings.issuer });
  });
}

async function openExternalInvoiceModal() {
  const firm = getSelectedFirm();
  if (!firm) return;
  const today = new Date().toISOString().slice(0, 10);

  openModal(
    'Dodaj fakturę zewnętrzną',
    `
      <form id="externalInvoiceForm" class="form-grid">
        ${labeledInput({ name: 'issueDate', label: 'Data dokumentu', type: 'date', value: today, required: true })}
        ${monthYearFields('month', safeMonthValue())}
        ${labeledInput({ name: 'vendor', label: 'Wystawca', value: '', required: true })}
        ${labeledInput({ name: 'number', label: 'Numer dokumentu', value: '' })}
        ${labeledInput({ name: 'category', label: 'Kategoria', type: 'select', value: 'google_ads', options: EXPENSE_CATEGORIES })}
        ${labeledInput({ name: 'payer', label: 'Płatnik', type: 'select', value: 'my_funds', options: PAYER_OPTIONS })}
        ${labeledInput({ name: 'amount', label: 'Kwota', type: 'number', value: '', min: '0', required: true })}
        <label class="field field-span-2">
          <span>Plik dokumentu (PDF lub obraz, do 1 MB)</span>
          <input type="file" name="file" accept=".pdf,image/*" />
        </label>
        <label class="field checkbox-row field-span-2">
          <input type="checkbox" name="createExpense" checked />
          <span>Dodaj ten dokument od razu również jako wydatek</span>
        </label>
        <div class="field field-span-2">
          <span>Opis</span>
          <textarea name="description" rows="4"></textarea>
        </div>
        ${modalActions('Dodaj dokument')}
      </form>
    `,
    { wide: true }
  );

  const form = document.getElementById('externalInvoiceForm');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
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

    const invoiceId = uid();
    const amount = roundCurrency(data.get('amount'));
    const invoice = {
      id: invoiceId,
      kind: 'external',
      source: 'manual',
      number: String(data.get('number') || '').trim(),
      month: readMonthYear(data, 'month'),
      issueDate: String(data.get('issueDate')),
      saleDate: String(data.get('issueDate')),
      dueDate: null,
      status: 'issued',
      paidBy: null,
      vatMode: 'zw',
      title: String(data.get('description') || '').trim() || categoryLabel(String(data.get('category'))),
      vendor: String(data.get('vendor') || '').trim(),
      payer: String(data.get('payer')),
      category: String(data.get('category')),
      notes: '',
      amount,
      items: [],
      attachmentIds,
      createdAt: new Date().toISOString(),
    };
    firm.invoices.push(invoice);

    if (data.get('createExpense')) {
      firm.expenses.push({
        id: uid(),
        date: String(data.get('issueDate')),
        month: readMonthYear(data, 'month'),
        category: String(data.get('category')),
        amount,
        payer: String(data.get('payer')),
        vendor: String(data.get('vendor') || '').trim(),
        description: String(data.get('description') || '').trim(),
        linkedInvoiceId: invoiceId,
        attachmentIds,
        createdAt: new Date().toISOString(),
      });
    }

    firm.updatedAt = new Date().toISOString();
    state.ui.selectedMonth = readMonthYear(data, 'month');
    persist();
    closeModal();
    render();
  });
}


function findInvoice(id) {
  return getSelectedFirm()?.invoices.find((item) => item.id === id) || null;
}

async function openAttachmentById(id) {
  const attachment = await getAttachment(id);
  if (!attachment?.blob) {
    window.alert('Nie udało się odczytać pliku.');
    return;
  }
  const url = URL.createObjectURL(attachment.blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function deleteInvoice(id) {
  const firm = getSelectedFirm();
  const invoice = findInvoice(id);
  if (!firm || !invoice) return;
  if (!window.confirm('Usunąć ten dokument?')) return;
  for (const attachmentId of invoice.attachmentIds || []) {
    await deleteAttachment(attachmentId);
  }
  firm.invoices = firm.invoices.filter((item) => item.id !== id);
  firm.walletEntries = (firm.walletEntries || []).filter((item) => item.linkedInvoiceId !== id);
  firm.expenses = firm.expenses.filter((item) => item.linkedInvoiceId !== id);
  firm.updatedAt = new Date().toISOString();
  persist();
  render();
}

function handleClick(event) {
  if (event.target instanceof HTMLElement && event.target.classList.contains('modal-overlay')) {
    return;
  }

  const target = event.target.closest('[data-action]');
  if (!target) return;

  const { action } = target.dataset;
  const firm = getSelectedFirm();

  if (action === 'fab-action') {
    const tab = state.ui.activeTab || 'overview';
    if (tab === 'overview') return openMonthModal();
    if (tab === 'invoices') return openInvoiceModal();
    if (tab === 'balance') return openWalletIncomeModal();
    return;
  }

  if (action === 'close-modal') return closeModal();
  if (action === 'add-firm') return openFirmModal();
  if (action === 'edit-firm') return openFirmModal(firm);
  if (action === 'back-to-list') {
    state.ui.selectedFirmId = null;
    state.ui.selectedMonth = null;
    state.ui.activeTab = 'overview';
    persist();
    return render();
  }

  if (action === 'edit-firm-from-list') {
    const found = state.firms.find((item) => item.id === target.dataset.id);
    if (found) return openFirmModal(found);
    return;
  }
  if (action === 'delete-firm-from-list') {
    const found = state.firms.find((item) => item.id === target.dataset.id);
    if (!found) return;
    if (!window.confirm(`Usunąć firmę "${found.name}" razem z miesiącami, saldem, wydatkami i fakturami?`)) return;
    state.firms = state.firms.filter((item) => item.id !== found.id);
    if (state.ui.selectedFirmId === found.id) {
      state.ui.selectedFirmId = state.firms[0]?.id || null;
      state.ui.selectedMonth = state.firms[0] ? currentMonthKey() : null;
    }
    persist();
    return render();
  }
  if (action === 'select-firm') return setSelectedFirm(target.dataset.id);
  if (action === 'switch-tab') {
    state.ui.activeTab = target.dataset.tab;
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
    const inv = findInvoiceGlobal(target.dataset.inv, target.dataset.firm);
    if (inv) {
      openInvoicePreview({ invoice: inv.invoice, firm: inv.firm, issuer: state.settings.issuer });
    }
    return;
  }
  if (action === 'view-global-invoice') {
    const inv = findInvoiceGlobal(target.dataset.inv, target.dataset.firm);
    if (inv) {
      openInvoiceDetailModal(inv.invoice, inv.firm);
    }
    return;
  }
  if (action === 'download-global-attachment') {
    const inv = findInvoiceGlobal(target.dataset.inv, target.dataset.firm);
    if (inv?.invoice.attachmentIds?.length) {
      for (const attachmentId of inv.invoice.attachmentIds) {
        void openAttachmentById(attachmentId);
      }
    }
    return;
  }
  if (action === 'toggle-actions-global') {
    const menu = document.querySelector(`[data-actions-global-menu="${target.dataset.inv}"]`);
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
  if (action === 'switch-month-tab') {
    state.ui.activeMonthTab = target.dataset.tab;
    persist();
    return render();
  }
  if (action === 'mark-all-paid-me') {
    if (!firm) return;
    firm.invoices.forEach((inv) => { if (!inv.paidBy) { inv.paidBy = 'me'; inv.status = 'paid'; } });
    firm.updatedAt = new Date().toISOString();
    persist();
    return render();
  }
  if (action === 'mark-all-paid-client') {
    if (!firm) return;
    firm.invoices.forEach((inv) => { if (!inv.paidBy) { inv.paidBy = 'client'; inv.status = 'paid'; } });
    firm.updatedAt = new Date().toISOString();
    persist();
    return render();
  }
  if (action === 'select-month') {
    state.ui.selectedMonth = target.dataset.month;
    state.ui.activeMonthTab = 'overview';
    persist();
    return render();
  }
  if (action === 'add-month') return openMonthModal();
  if (action === 'edit-month') return openMonthModal(findMonthConfig(target.dataset.month));
  // edit-month-from-picker moved to select dropdown __('edit_month__')
  // Keep the handler for backward compatibility or remove entirely
  if (action === 'edit-month-from-picker') {
    const month = target.dataset.month;
    if (!month) return;
    const existing = findMonthConfig(month);
    if (!existing) return;
    return openMonthModal(existing);
  }
  if (action === 'delete-month') {
    if (!firm || !window.confirm(`Usunąć miesiąc ${monthLabel(target.dataset.month)}?`)) return;
    firm.months = firm.months.filter((item) => item.month !== target.dataset.month);
    firm.updatedAt = new Date().toISOString();
    persist();
    return render();
  }
  if (action === 'delete-month-from-modal') {
    if (!firm || !window.confirm(`Usunąć miesiąc ${monthLabel(target.dataset.month)}?`)) return;
    const month = target.dataset.month;
    firm.months = (firm.months || []).filter(m => m.month !== month);
    firm.expenses = (firm.expenses || []).filter(e => (e.month || monthFromDate(e.date)) !== month);
    firm.balanceEntries = (firm.balanceEntries || []).filter(e => monthFromDate(e.date) !== month);
    firm.walletEntries = (firm.walletEntries || []).filter(e => getWalletEntryMonth(e) !== month);
    firm.invoices = (firm.invoices || []).filter(inv => getInvoiceMonthKey(inv) !== month);
    firm.updatedAt = new Date().toISOString();
    state.ui.selectedMonth = (firm.months || [])[0]?.month || currentMonthKey();
    state.ui.activeMonthTab = 'overview';
    persist();
    closeModal();
    return render();
  }
  if (action === 'add-expense') return openExpenseModal();
  if (action === 'edit-expense') return openExpenseModal(findExpense(target.dataset.id));
  if (action === 'delete-expense') {
    if (!firm || !window.confirm('Usunąć ten wydatek?')) return;
    firm.expenses = firm.expenses.filter((item) => item.id !== target.dataset.id);
    firm.updatedAt = new Date().toISOString();
    persist();
    return render();
  }
  if (action === 'add-balance-plus') return openBalanceEntryModal(null, 'plus');
  if (action === 'add-balance-minus') return openBalanceEntryModal(null, 'minus');
  if (action === 'edit-balance') return openBalanceEntryModal(findBalanceEntry(target.dataset.id));
  if (action === 'delete-balance') {
    if (!firm || !window.confirm('Usunąć tę zmianę salda?')) return;
    firm.balanceEntries = firm.balanceEntries.filter((item) => item.id !== target.dataset.id);
    firm.updatedAt = new Date().toISOString();
    persist();
    return render();
  }
  if (action === 'add-wallet-expense') return openWalletExpenseModal();
  if (action === 'add-wallet-income') return openWalletIncomeModal();
  if (action === 'delete-wallet-entry') {
    if (!firm || !window.confirm('Usunąć tę wpłatę klienta?')) return;
    firm.walletEntries = (firm.walletEntries || []).filter((item) => item.id !== target.dataset.id);
    firm.updatedAt = new Date().toISOString();
    persist();
    return render();
  }
  if (action === 'download-wallet-attachment') {
    if (!firm) return;
    const walletEntry = (firm.walletEntries || []).find(e => e.id === target.dataset.id);
    if (!walletEntry?.linkedInvoiceId) return;
    const linkedInv = firm.invoices.find(inv => inv.id === walletEntry.linkedInvoiceId);
    if (!linkedInv?.attachmentIds?.length) return;
    for (const attachmentId of linkedInv.attachmentIds) {
      void openAttachmentById(attachmentId);
    }
    return;
  }
  if (action === 'issue-invoice') return openInvoiceModal();
  if (action === 'add-external-invoice') return void openExternalInvoiceModal();
  if (action === 'preview-invoice') {
    const invoice = findInvoice(target.dataset.id);
    if (firm && invoice) {
      openInvoicePreview({ invoice, firm, issuer: state.settings.issuer });
    }
    return;
  }
  if (action === 'mark-paid-me') {
    const invoice = findInvoice(target.dataset.id);
    if (!invoice) return;
    invoice.paidBy = 'me';
    invoice.status = 'paid';
    persist();
    return render();
  }
  if (action === 'mark-paid-client') {
    const invoice = findInvoice(target.dataset.id);
    if (!invoice) return;
    invoice.paidBy = 'client';
    invoice.status = 'paid';
    persist();
    return render();
  }
  if (action === 'unmark-paid') {
    const invoice = findInvoice(target.dataset.id);
    if (!invoice) return;
    invoice.paidBy = null;
    invoice.status = 'issued';
    persist();
    return render();
  }
  if (action === 'download-attachment') {
    const invoice = findInvoice(target.dataset.id);
    if (!invoice || !invoice.attachmentIds?.length) return;
    for (const attachmentId of invoice.attachmentIds) {
      void openAttachmentById(attachmentId);
    }
    return;
  }
  if (action === 'delete-invoice') return void deleteInvoice(target.dataset.id);
  if (action === 'open-attachment') return void openAttachmentById(target.dataset.attachmentId);
}

document.body.addEventListener('click', handleClick);

document.body.addEventListener('change', (event) => {
  const target = event.target.closest('[data-action="select-month-dropdown"]');
  if (!target) return;
  const firm = getSelectedFirm();
  if (!firm) return;

  state.ui.selectedMonth = target.value;
  state.ui.activeMonthTab = 'overview';
  persist();
  render();
});

render();
