import {
  calculateFirmLedger,
  formatCurrency,
  formatDate,
  getMonthFinancialEntries,
  getScopeMonthKeys,
  monthLabel,
  roundCurrency,
  uid,
} from './logic.js?v=22';
import {
  getAttachment,
  syncFromCloud,
} from './storage.js?v=33';
import {
  icon,
  escapeHtml,
  firmDisplayName,
  initializeState,
  persistState,
  getSelectedFirm,
  ensureSelectedMonth,
  setModalRoot,
  closeModal,
  openModal,
  labeledInput,
  modalActions,
  updateTopbar,
  renderFabMenu,
  openEditMonthPicker,
  navigateTo,
  restoreContext,
  initSyncIndicator,
  appendFirmHistory,
} from './core.js?v=38';

let state = initializeState();
restoreContext(state);
state.ui.activeTab = 'balance';

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

function getMonthsForSelection(ledger, selectedMonth) {
  return getScopeMonthKeys(ledger, selectedMonth);
}

function collectPaymentEntries(ledger, selectedMonth) {
  return getMonthsForSelection(ledger, selectedMonth)
    .flatMap(function(month) {
      return getMonthFinancialEntries(firm, month).walletEntries
        .filter(function(entry) { return entry.type === 'income'; })
        .map(function(entry) {
          return {
            ...entry,
            period: entry.period || month,
            source: entry.source || 'manual',
          };
        });
    })
    .sort(function(a, b) { return (b.date || '').localeCompare(a.date || ''); });
}


function buildIncomeRow(entry, index) {
  const sourceLabel = entry.source === 'invoice' ? 'Faktura' : 'Ręcznie';
  return '<tr>'
    + '<td data-label="Lp.">' + (index + 1) + '</td>'
    + '<td data-label="Data">' + formatDate(entry.date) + '</td>'
    + '<td data-label="Opis">' + escapeHtml(entry.title || '-') + '</td>'
    + '<td data-label="Kwota" class="tone-mint">' + formatCurrency(entry.amount) + '</td>'
    + '<td data-label="Źródło">' + sourceLabel + '</td>'
    + '<td data-label="Akcje" class="table-actions">'
    + (entry.source === 'invoice'
      ? '<span class="table-subline">Z faktury</span>'
      : '<button class="table-action-btn tone-danger" type="button" data-action="delete-wallet-entry" data-id="' + entry.id + '">' + icon('trash') + '</button>')
    + '</td>'
    + '</tr>';
}


// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------

function renderBalance() {
  const { ledger, selectedMonth } = ensureSelectedMonth(firm, state);
  const incomes = collectPaymentEntries(ledger, selectedMonth);
  const incomeSum = roundCurrency(incomes.reduce(function(acc, e) { return acc + Number(e.amount || 0); }, 0));
  var periodLabel = 'Wszystkie okresy';
  if (selectedMonth === '__year__') {
    periodLabel = 'Ten rok';
  } else if (selectedMonth === '__quarter__') {
    periodLabel = 'Ten kwartał';
  } else if (selectedMonth && selectedMonth !== '__all__') {
    periodLabel = monthLabel(selectedMonth);
  }

  var incomeRows = '';
  if (incomes.length === 0) {
    incomeRows = '<div class="empty-block"><p>Brak wpłat klienta dla tego okresu.</p></div>';
  } else {
    var rows = '';
    for (var i = 0; i < incomes.length; i++) {
      rows += buildIncomeRow(incomes[i], i);
    }
    incomeRows = '<div class="table-wrap responsive-table-wrap"><table class="data-table responsive-table">'
      + '<thead><tr>'
      + '<th>Lp.</th><th>Data</th><th>Opis</th><th>Kwota</th><th>Źródło</th><th></th>'
      + '</tr></thead><tbody>'
      + rows
      + '</tbody></table>'
      + '<div class="table-footer"><span class="tone-mint">Suma wpłat: ' + formatCurrency(incomeSum) + '</span></div>'
      + '</div>';
  }
  return '<section class="section-band">'
    + '<div class="panel-head space-between">'
    + '<div><p class="eyebrow">Rozrachunek</p><h3>Wpłaty klienta</h3><p class="table-note">Zakres: ' + escapeHtml(periodLabel) + '</p></div>'
    + '<button class="primary-button" type="button" data-action="add-wallet-income">' + icon('plus') + 'Dodaj wpłatę</button>'
    + '</div>'
    + incomeRows
    + '</section>';
}

function renderFirmHeader() {
  const { ledger, selectedMonth } = ensureSelectedMonth(firm, state);

  var periodLabel = '';
  if (selectedMonth === '__year__') {
    periodLabel = 'Ten rok';
  } else if (selectedMonth === '__quarter__') {
    periodLabel = 'Ten kwartał';
  } else if (selectedMonth && selectedMonth !== '__all__') {
    periodLabel = monthLabel(selectedMonth);
  } else {
    periodLabel = 'Wszystkie';
  }

  return '<section class="section-band">'
    + '<div class="panel-head">'
    + '<div><p class="eyebrow">Firma</p><h3>' + escapeHtml(firmDisplayName(firm)) + '</h3></div>'
    + '<div><p class="eyebrow">Okres rozliczeniowy</p><h3>' + escapeHtml(periodLabel) + '</h3></div>'
    + '</div></section>';
}

function renderFirmDetail() {
  return '<div class="firm-detail-page">'
    + '<section class="main-area">'
    + renderFirmHeader()
    + renderBalance()
    + '</section>'
    + renderFabMenu('add-wallet-income')
    + '</div>';
}

// ---------------------------------------------------------------------------
// modals
// ---------------------------------------------------------------------------

function openWalletIncomeModal(existing) {
  existing = existing || null;
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


async function openAttachmentById(id) {
  var attachment = await getAttachment(id);
  if (!attachment || !attachment.blob) {
    window.alert('Nie udalo sie odczytac pliku.');
    return;
  }
  var url = URL.createObjectURL(attachment.blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(function() { URL.revokeObjectURL(url); }, 60_000);
}

// ---------------------------------------------------------------------------
// events
// ---------------------------------------------------------------------------

function handleClick(event) {
  if (event.target instanceof HTMLElement && event.target.classList.contains('modal-overlay')) {
    return;
  }
  var target = event.target.closest('[data-action]');
  if (!target) return;
  var action = target.dataset.action;

  if (action === 'close-modal') return closeModal();
  if (action === 'switch-firm-tab') {
    state.ui.activeTab = target.dataset.tab || 'overview';
    persist();
    return navigateTo('przeglad.html', state);
  }
  if (action === 'finance-nav') {
    var value = target.dataset.tab || '';
    if (value === 'invoices') return navigateTo('faktury.html', state);
    if (value === 'balance') return;
    if (value === 'compensation') {
      state.ui.activeTab = 'compensation';
      persist();
      return navigateTo('przeglad.html', state);
    }
    return;
  }
  if (action === 'nav-portfel') return;
  if (action === 'nav-faktury') return navigateTo('faktury.html', state);

  if (action === 'issue-invoice') return navigateTo('faktury.html', state);
  if (action === 'add-wallet-income') {
    openWalletIncomeModal(null);
    return;
  }
  if (action === 'delete-wallet-entry') {
    if (!firm || !window.confirm('Usunac te wplate klienta?')) return;
    var removed = (firm.walletEntries || []).find(function(item) { return item.id === target.dataset.id; });
    firm.walletEntries = (firm.walletEntries || []).filter(function(item) { return item.id !== target.dataset.id; });
    firm.updatedAt = new Date().toISOString();
    appendFirmHistory(firm, {
      area: 'wallet',
      action: 'delete',
      title: 'Usunięto wpłatę klienta',
      amount: removed ? removed.amount : 0,
      meta: { period: removed && removed.period ? monthLabel(removed.period) : '' },
    });
    persist();
    return render();
  }
  if (action === 'download-wallet-attachment') {
    var walletEntry = (firm.walletEntries || []).find(function(e) { return e.id === target.dataset.id; });
    if (!walletEntry || !walletEntry.linkedInvoiceId) return;
    var linkedInv_ = firm.invoices.find(function(inv_) { return inv_.id === walletEntry.linkedInvoiceId; });
    if (!linkedInv_ || !linkedInv_.attachmentIds || !linkedInv_.attachmentIds.length) return;
    for (var i = 0; i < linkedInv_.attachmentIds.length; i++) {
      void openAttachmentById(linkedInv_.attachmentIds[i]);
    }
    return;
  }
}

// ---------------------------------------------------------------------------
// render / init
// ---------------------------------------------------------------------------

function render() {
  firm = getSelectedFirm(state);
  if (!firm) {
    state.ui.selectedFirmId = null;
    window.location.href = 'przeglad.html';
    return;
  }
  try {
    root.innerHTML = renderFirmDetail();
    updateTopbar(state, 'balance');
  } catch (e) {
    root.innerHTML = '<div style="padding:40px;color:#f44;font-family:monospace;">'
      + '<h2>Blad renderowania</h2>'
      + '<pre>' + escapeHtml(e.message) + '</pre></div>';
  }
}

document.body.addEventListener('click', handleClick);

document.body.addEventListener('change', function(event) {
  var firmTarget = event.target.closest('[data-action="select-firm-dropdown"]');
  if (firmTarget) {
    if (!state.firms.some(function(item) { return item.id === firmTarget.value; })) return;
    state.ui.selectedFirmId = firmTarget.value;
    state.ui.selectedMonth = '__all__';
    persist();
    return render();
  }

  var target = event.target.closest('[data-action="select-month-dropdown"]');
  if (!target) return;
  if (!firm) return;

  state.ui.selectedMonth = target.value;
  persist();
  render();
});

if (sessionStorage.getItem('ijanicki_firma_loggedIn') !== 'true') {
  window.location.href = 'index.html';
} else if (!firm) {
  window.location.href = 'przeglad.html';
} else {
  initSyncIndicator();
  syncFromCloud().then(() => {
    state = initializeState();
    restoreContext(state);
    render();
  });
}
