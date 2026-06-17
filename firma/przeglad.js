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
} from './logic.js?v=17';
import {
  deleteAttachment,
  getAttachment,
  loadState,
  syncFromCloud,
} from './storage.js?v=17';
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
} from './core.js?v=17';
import { openInvoicePreview } from './invoice.js?v=17';

// --- State ---
let state = initializeState();
restoreContext(state);
state.ui.activeTab = 'overview';
// Gdy nie ma wybranej firmy, zawsze pokazuj liste firm (nigdy 'Moje faktury')
if (!state.ui.selectedFirmId) {
  state.ui.activeGlobalTab = 'firms';
} else {
  state.ui.activeGlobalTab ||= 'firms';
}

const root = document.getElementById('app');
const modalRoot = document.getElementById('modalRoot');
setModalRoot(modalRoot);

// Back button — clear firm context and reload to show firm list
document.querySelector('.back-to-company')?.addEventListener('click', () => {
  sessionStorage.removeItem('ijanicki_firma_activeFirm');
  sessionStorage.removeItem('ijanicki_firma_activeMonth');
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
      '</div>')
    '</div>';
}

// --- Rendering ---
function renderMonthList(ledger, selectedMonth) {
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Miesiąc</th>
            <th>Budżet</th>
            <th>Wynagrodzenie</th>
            <th>Dostępne na reklamę</th>
            <th>Rozrachunek</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${ledger.rows.map((row) => {
            const settlement = getSettlementMeta(row.settlementNetChange);
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
              <td>
                <div class="settlement-cell">
                  <strong class="${settlement.textClass}">${settlement.shortLabel}</strong>
                  <span class="table-subline">${formatCurrency(settlement.amount)}</span>
                </div>
              </td>
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
            <span class="overview-focus-note">Po odjęciu wpłat klienta i kosztów budżetowych, które opłacił bezpośrednio.</span>
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
          <span>Budżet klienta</span>
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

function renderBudgetFlowSection({ title, eyebrow, carryIn, compensation, adInjection, expenses, adBalance }) {
  const positiveCarry = Math.max(0, carryIn || 0);
  const carryDebt = Math.max(0, -(carryIn || 0));
  const availablePool = roundCurrency(positiveCarry + (adInjection || 0));
  const spent = roundCurrency(expenses || 0);
  const remaining = roundCurrency(Math.max(0, adBalance || 0));
  const overrun = roundCurrency(Math.max(0, -(adBalance || 0)));
  const baseForPercent = Math.max(availablePool, spent, 1);
  const spentPercent = availablePool > 0
    ? (Math.min(spent, availablePool) / availablePool) * 100
    : 0;
  const remainingPercent = availablePool > 0
    ? (remaining / availablePool) * 100
    : 0;
  const overrunPercent = spent > 0
    ? (overrun / Math.max(spent, 1)) * 100
    : 0;

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
          ${renderFlowBar('Pula reklamowa z tego miesiąca', adInjection || 0, availablePool > 0 ? ((adInjection || 0) / baseForPercent) * 100 : 0, 'cyan', 'Budżet po odjęciu Twojego wynagrodzenia')}
          ${positiveCarry > 0 ? renderFlowBar('Przeniesione z poprzednich miesięcy', positiveCarry, availablePool > 0 ? (positiveCarry / baseForPercent) * 100 : 0, 'slate', 'Dodatkowe środki dostępne od startu') : ''}
          ${carryDebt > 0 ? renderFlowBar('Minus z poprzednich miesięcy', carryDebt, availablePool > 0 ? (Math.min(carryDebt, availablePool) / baseForPercent) * 100 : 0, 'rose', 'Ta kwota zmniejszyła obecną pulę reklamową') : ''}
          ${renderFlowBar('Wydatki budżetowe', spent, spentPercent, 'amber', availablePool > 0 ? `Wykorzystano ${Math.round(spentPercent)}% dostępnej puli reklamowej.` : 'Brak aktywnej puli reklamowej w tym zakresie.')}
          ${renderFlowBar(remaining > 0 ? 'Zostało na reklamę' : 'Zostało na reklamę', remaining, remainingPercent, 'emerald', availablePool > 0 ? `Do wykorzystania zostało ${Math.round(remainingPercent)}% puli.` : 'Brak środków do wydania.')}
          ${overrun > 0 ? renderFlowBar('Przekroczenie budżetu', overrun, overrunPercent, 'rose', 'To jedyna pozycja alarmowa: wydatki wyszły ponad dostępną pulę.') : ''}
        </div>
        <div class="overview-compact-cards">
          ${statCard('Pula reklamowa razem', formatCurrency(availablePool), 'cyan', 'Bieżąca pula plus dodatnie przeniesienia')}
          ${statCard('Twoje wynagrodzenie', formatCurrency(compensation || 0), 'default', 'Ta kwota nie wchodzi do puli reklamowej')}
          ${statCard('Wydane', formatCurrency(spent), 'amber', availablePool > 0 ? `${Math.round(spentPercent)}% wykorzystania puli` : 'Brak puli do porównania')}
          ${statCard(overrun > 0 ? 'Do wyrównania' : 'Zostało', formatCurrency(overrun > 0 ? overrun : remaining), overrun > 0 ? 'rose' : 'emerald', overrun > 0 ? 'Budżet reklamowy jest już na minusie' : 'Środki dostępne na kolejne działania')}
        </div>
      </div>
    </section>
  `;
}

function renderSettlementDetails({ eyebrow, title, paymentsReceived, clientPaid, ownPaid, reserved, compensation }) {
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
    </section>
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
  const settlement = getSettlementMeta(monthRow.settlementNetChange);
  const adBalance = roundCurrency(monthRow.adEndingBalance || 0);
  const monthEntries = getMonthFinancialEntries(firm, selectedMonth);
  const expensePreview = [...monthEntries.expenses]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 5);

  return `
    <div class="overview-stack">
      ${renderOverviewHero({
        eyebrow: 'Najważniejsze teraz',
        title: monthLabel(selectedMonth),
        settlement,
        adBalance,
        budget: monthRow.budget,
        expenses: monthRow.expensesTotal || 0,
        payments: monthRow.paymentsReceived || 0,
      })}

      <div class="overview-main-grid">
        <div class="overview-main-column">
          ${renderBudgetFlowSection({
            title: 'Jak rozszedł się budżet tego miesiąca',
            eyebrow: 'Budżet i wykorzystanie',
            carryIn: monthRow.adCarryIn || 0,
            compensation: monthRow.compensation || 0,
            adInjection: monthRow.adInjection || 0,
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
          })}
        </div>
        <div class="overview-side-column">
          ${renderTrendChart(ledger, selectedMonth)}
        </div>
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
          <div class="table-wrap">
            <table class="data-table">
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
      </section>
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
  const doWydania = roundCurrency(budget - compensation);
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
          ${statCard('Twoje wynagrodzenie', formatCurrency(compensation), 'emerald', 'Laczna kwota wynagrodzenia z budzetow')}
          ${statCard('Pula reklamowa', formatCurrency(doWydania), 'amber', 'Budzet po odjeciu wynagrodzenia')}
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
      ${renderOverviewHero({
        eyebrow,
        title,
        settlement,
        adBalance,
        budget: scope.totalBudget,
        expenses: scope.totalExpenses,
        payments: scope.totalPaymentsReceived,
      })}

      <div class="overview-main-grid">
        <div class="overview-main-column">
          ${renderBudgetFlowSection({
            title: 'Jak wygląda wykorzystanie budżetu w tym zakresie',
            eyebrow: 'Budżet i wykorzystanie',
            carryIn: scope.adCarryIn || 0,
            compensation: scope.totalCompensation || 0,
            adInjection: scope.totalAdInjection || 0,
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
          })}
        </div>
        <div class="overview-side-column">
          ${renderTrendChart(ledger, null)}
        </div>
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
          <p>Ta firma nie ma jeszcze zadnego miesiaca. Dodaj pierwszy budzet i procent wynagrodzenia.</p>
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

  return `
    <div class="firm-detail-page">
      <section class="main-area">
        ${renderOverview(firm, ledger, selectedMonth, monthRow)}
        <section class="section-band overview-panel">
          <div class="panel-head space-between">
            <div>
              <p class="eyebrow">Historia miesięcy</p>
              <h3>Wszystkie okresy rozliczeniowe</h3>
            </div>
            <button class="primary-button" type="button" data-action="add-month">${icon('plus')}Dodaj miesiąc</button>
          </div>
          ${renderMonthList(ledger, selectedMonth)}
        </section>
      </section>
      ${renderFabMenu('add-month')}
    </div>
  `;
}

// --- Modals ---

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
      if (!window.confirm(`Usunac firme "${firmDisplayName(firm)}" razem z miesiacami, saldem, wydatkami i fakturami?`)) {
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

function openMonthModal(existing = null) {
  const firm = getSelectedFirm(state);
  if (!firm) return;

  openModal(
    existing ? 'Edytuj miesiac' : 'Dodaj miesiac',
    `
      <form id="monthForm" class="form-grid">
        ${monthYearFields('month', existing?.month || safeMonthValue(state))}
        ${labeledInput({ name: 'budget', label: 'Budzet miesiaca', type: 'number', value: existing?.budget ?? '', min: '0', required: true })}
        ${labeledInput({ name: 'compensationPercent', label: '% wynagrodzenia', type: 'number', value: existing?.compensationPercent ?? 50, min: '0', required: true })}
        ${existing ? `
        <div class="modal-actions is-split">
          <button class="ghost-button tone-danger" type="button" id="deleteMonthButton" data-action="delete-month-from-modal" data-month="${existing.month}">Usun miesiac</button>
          <div class="modal-actions-group">
            <button class="ghost-button" type="button" data-action="close-modal">Anuluj</button>
            <button class="primary-button" type="submit">Zapisz miesiac</button>
          </div>
        </div>` : modalActions('Dodaj miesiac')}
      </form>
    `
  );

  // Usun miesiac (inline listener)
  if (existing) {
    const delBtn = document.getElementById('deleteMonthButton');
    delBtn?.addEventListener('click', () => {
      const month = existing.month;
      if (!confirm(`Usunac miesiac ${monthLabel(month)}?`)) return;
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
      render();
    });
  }

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
        ${labeledInput({ name: 'budget', label: 'Budzet miesiaca', type: 'number', value: existing.budget ?? '', min: '0', required: true })}
        ${labeledInput({ name: 'compensationPercent', label: '% wynagrodzenia', type: 'number', value: existing.compensationPercent ?? 50, min: '0', required: true })}
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
    state.ui.selectedMonth = (firm.months || [])[0]?.month || currentMonthKey();
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
    persist();
    closeModal();
    render();
  });
}

// --- Event Handling ---
function handleClick(event) {
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
      state.ui.selectedMonth = state.firms[0] ? currentMonthKey() : null;
    }
    persist();
    return render();
  }
  if (action === 'select-firm') {
    state.ui.selectedFirmId = target.dataset.id;
    state.ui.selectedMonth = null;
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
    persist();
    return render();
  }
  if (action === 'delete-month-from-modal') {
    if (!firm || !window.confirm(`Usunac miesiac ${monthLabel(target.dataset.month)}?`)) return;
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
  if (action === 'add-balance-plus') return openBalanceEntryModal(null, 'plus');
  if (action === 'add-balance-minus') return openBalanceEntryModal(null, 'minus');
  if (action === 'edit-balance') return openBalanceEntryModal(findBalanceEntry(target.dataset.id));
  if (action === 'delete-balance') {
    if (!firm || !window.confirm('Usunac te zmiane salda?')) return;
    firm.balanceEntries = firm.balanceEntries.filter((item) => item.id !== target.dataset.id);
    firm.updatedAt = new Date().toISOString();
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
    firm.walletEntries = (firm.walletEntries || []).filter(function(item) { return item.id !== target.dataset.id; });
    firm.updatedAt = new Date().toISOString();
    persist();
    return render();
  }
  if (action === 'issue-invoice') {
    navigateTo('faktury.html', state);
    return;
  }
}

// --- Render ---
function render() {
  try {
    const firm = getSelectedFirm(state);
    if (firm && state.ui.selectedFirmId) {
      root.innerHTML = renderFirmDetail();
      updateTopbar(state, 'overview');
    } else if (state.ui.activeGlobalTab === 'my-invoices') {
      state.ui.selectedFirmId = null;
      root.innerHTML = renderAllOwnInvoices();
      // Globalny topbar: Klienci | Moje faktury
      const topbar = document.getElementById('topbarContent');
      if (topbar) {
        topbar.innerHTML = '<div class="topbar-grid">' +
          '<div class="topbar-grid-left">' +
            '<div class="tab-row">' +
              '<button class="tab-button" type="button" data-action="switch-global-tab" data-tab="firms">Klienci</button>' +
              '<button class="tab-button is-active" type="button">Moje faktury</button>' +
            '</div>' +
          '</div>' +
          '<div class="topbar-grid-center"></div>' +
          '<div class="topbar-grid-right"></div>' +
        '</div>';
      }
    } else {
      state.ui.selectedFirmId = null;
      root.innerHTML = renderFirmList(state);
      // Globalny topbar: Klienci | Moje faktury
      const topbar = document.getElementById('topbarContent');
      if (topbar) {
        topbar.innerHTML = '<div class="topbar-grid">' +
          '<div class="topbar-grid-left">' +
            '<div class="tab-row">' +
              '<button class="tab-button is-active" type="button">Klienci</button>' +
              '<button class="tab-button" type="button" data-action="switch-global-tab" data-tab="my-invoices">Moje faktury</button>' +
            '</div>' +
          '</div>' +
          '<div class="topbar-grid-center"></div>' +
          '<div class="topbar-grid-right"></div>' +
        '</div>';
      }
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
  const target = event.target.closest('[data-action="select-month-dropdown"]');
  if (!target) return;
  const firm = getSelectedFirm(state);
  if (!firm) return;

  state.ui.selectedMonth = target.value;
  state.ui.activeMonthTab = 'overview';
  persist();
  render();
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
    restoreContext(state);
    render();
  });
}
