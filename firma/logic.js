export const EXPENSE_CATEGORIES = [
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'backlinki', label: 'Backlinki' },
  { value: 'wizytowki', label: 'Wizytówki' },
  { value: 'banery', label: 'Banery' },
  { value: 'druk', label: 'Druk' },
  { value: 'meta_ads', label: 'Meta Ads' },
  { value: 'inne', label: 'Inne' },
];

export const PAYMENT_METHODS = [
  { value: 'przelew', label: 'Przelew' },
  { value: 'gotowka', label: 'Gotówka' },
  { value: 'blik', label: 'BLIK' },
  { value: 'karta', label: 'Karta' },
];

export const PAYER_OPTIONS = [
  { value: 'my_funds', label: 'Moje środki' },
  { value: 'client_card', label: 'Karta klienta' },
];

export const VAT_OPTIONS = [
  { value: 'zw', label: 'Faktura zwolniona z VAT' },
  { value: 'vat23', label: 'Faktura VAT 23%' },
];

const moneyFormatter = new Intl.NumberFormat('pl-PL', {
  style: 'currency',
  currency: 'PLN',
  maximumFractionDigits: 2,
});

const monthFormatter = new Intl.DateTimeFormat('pl-PL', {
  month: 'long',
  year: 'numeric',
});

const dateFormatter = new Intl.DateTimeFormat('pl-PL', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function roundCurrency(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export function formatCurrency(value) {
  return moneyFormatter.format(roundCurrency(value));
}

export function formatPercent(value) {
  return `${roundCurrency(value)}%`;
}

export function formatDate(value) {
  if (!value) {
    return '—';
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) {
    return '—';
  }
  return dateFormatter.format(d);
}

export function monthFromDate(value) {
  if (!value) {
    return currentMonthKey();
  }
  return String(value).slice(0, 7);
}

export function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

export function monthLabel(value) {
  if (!value) {
    return '—';
  }
  const parts = value.split('-');
  if (parts.length < 2) return '—';
  const [year, month] = parts.map(Number);
  if (isNaN(year) || isNaN(month)) return '—';
  const d = new Date(year, month - 1, 1);
  if (isNaN(d.getTime())) return '—';
  return monthFormatter.format(d);
}

export function getInvoiceMonthKey(invoice) {
  if (!invoice) {
    return currentMonthKey();
  }
  return invoice.month || monthFromDate(invoice.issueDate);
}

export function getWalletEntryMonth(entry) {
  if (!entry) {
    return currentMonthKey();
  }
  return entry.period || monthFromDate(entry.date);
}

export function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function addDays(dateString, days) {
  const date = new Date(dateString);
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

export function categoryLabel(value) {
  return EXPENSE_CATEGORIES.find((item) => item.value === value)?.label || value;
}

export function payerLabel(value) {
  if (value === 'reserved') {
    return 'Rezerwacja budżetu';
  }
  return PAYER_OPTIONS.find((item) => item.value === value)?.label || value;
}

export function paymentMethodLabel(value) {
  return PAYMENT_METHODS.find((item) => item.value === value)?.label || value;
}

function sum(values) {
  return roundCurrency(values.reduce((acc, value) => acc + Number(value || 0), 0));
}

function getAdBudgetEntries(firm) {
  return (firm.adBudgetEntries || [])
    .map((entry) => ({
      id: entry.id,
      date: entry.date || currentMonthKey() + '-01',
      amount: roundCurrency(entry.amount || 0),
      description: entry.description || '',
      billClient: entry.billClient === true,
      createdAt: entry.createdAt || null,
    }))
    .filter((entry) => entry.amount > 0);
}

function getCompensationEntries(firm) {
  return (firm.compensationEntries || [])
    .map((entry) => ({
      id: entry.id,
      date: entry.date || currentMonthKey() + '-01',
      period: entry.period || monthFromDate(entry.date),
      title: entry.title || entry.description || 'Wynagrodzenie',
      amount: roundCurrency(entry.amount || 0),
      createdAt: entry.createdAt || null,
    }))
    .filter((entry) => entry.amount > 0);
}

function getMonthConfigMap(firm) {
  const map = new Map();
  for (const item of firm.months || []) {
    if (!item?.month) continue;
    map.set(item.month, {
      id: item.id,
      month: item.month,
      budget: roundCurrency(item.budget || 0),
      compensationPercent: roundCurrency(item.compensationPercent || 0),
      note: item.note || '',
      updatedAt: item.updatedAt || null,
    });
  }
  return map;
}

export function getOrderedMonths(firm) {
  const months = new Set();

  for (const item of firm.months || []) {
    if (item.month) months.add(item.month);
  }
  for (const item of firm.expenses || []) {
    months.add(item.month || monthFromDate(item.date));
  }
  for (const item of firm.balanceEntries || []) {
    months.add(monthFromDate(item.date));
  }
  for (const item of firm.walletEntries || []) {
    months.add(getWalletEntryMonth(item));
  }
  for (const item of firm.invoices || []) {
    months.add(getInvoiceMonthKey(item));
  }
  for (const item of firm.compensationEntries || []) {
    if (item.period && item.period !== '__out_of_period__') {
      months.add(item.period);
    } else if (item.date) {
      months.add(monthFromDate(item.date));
    }
  }

  return Array.from(months).sort().reverse();
}

export function getMonthFinancialEntries(firm, month) {
  const invoices = firm.invoices || [];
  const invoiceMap = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const ownInvoices = invoices.filter((invoice) =>
    invoice.kind === 'own'
    && !invoice.skipAccounting
    && getInvoiceMonthKey(invoice) === month
  );
  const externalInvoices = invoices.filter((invoice) =>
    invoice.kind === 'external'
    && !invoice.skipAccounting
    && getInvoiceMonthKey(invoice) === month
  );

  const expenses = [
    ...(firm.expenses || []).filter((expense) => {
      const expenseMonth = expense.month || monthFromDate(expense.date);
      const linkedInvoice = expense.linkedInvoiceId ? invoiceMap.get(expense.linkedInvoiceId) : null;
      return expenseMonth === month
        && !linkedInvoice?.skipAccounting
        && (!expense.linkedInvoiceId || !invoiceMap.has(expense.linkedInvoiceId));
    }),
    ...externalInvoices
      .filter((invoice) => {
        if (invoice.status === 'cancelled') return false;
        if (invoice.subtractFromBudget !== false) return true;
        return Boolean(invoice.paidBy);
      })
      .map((invoice) => ({
        id: `invoice-expense-${invoice.id}`,
        date: invoice.issueDate,
        month: getInvoiceMonthKey(invoice),
        category: invoice.category || 'inne',
        amount: roundCurrency(invoice.amount || 0),
        payer: invoice.paidBy === 'client'
          ? 'client_card'
          : invoice.paidBy === 'me'
            ? 'my_funds'
            : 'reserved',
        vendor: invoice.vendor || '',
        description: invoice.title || invoice.number || '',
        linkedInvoiceId: invoice.id,
        attachmentIds: invoice.attachmentIds || [],
        countsTowardBudget: invoice.subtractFromBudget !== false,
        source: 'invoice',
      })),
  ];

  const walletEntries = [
    ...(firm.walletEntries || []).filter((entry) => {
      const entryMonth = getWalletEntryMonth(entry);
      const linkedInvoice = entry.linkedInvoiceId ? invoiceMap.get(entry.linkedInvoiceId) : null;
      return entryMonth === month
        && !linkedInvoice?.skipAccounting
        && (!entry.linkedInvoiceId || !invoiceMap.has(entry.linkedInvoiceId));
    }),
    ...ownInvoices
      .filter((invoice) => invoice.status !== 'cancelled' && invoice.paidBy === 'client')
      .map((invoice) => ({
        id: `invoice-income-${invoice.id}`,
        type: 'income',
        date: invoice.issueDate,
        title: invoice.title || invoice.number || 'Wpłata klienta',
        amount: roundCurrency(invoice.amount || 0),
        period: getInvoiceMonthKey(invoice),
        linkedInvoiceId: invoice.id,
        source: 'invoice',
      })),
  ];

  const balanceEntries = (firm.balanceEntries || []).filter((entry) => monthFromDate(entry.date) === month);
  const compensationEntries = getCompensationEntries(firm).filter((entry) => {
    const entryMonth = entry.period && entry.period !== '__out_of_period__'
      ? entry.period
      : monthFromDate(entry.date);
    return entryMonth === month;
  });

  return {
    ownInvoices,
    externalInvoices,
    expenses,
    walletEntries,
    balanceEntries,
    compensationEntries,
  };
}

export function calculateFirmLedger(firm) {
  const months = getOrderedMonths(firm);
  const monthConfigMap = getMonthConfigMap(firm);
  const adBudgetEntries = getAdBudgetEntries(firm);
  const totalAdOnlyBudget = sum(adBudgetEntries.map((entry) => entry.amount));
  const totalChargeableAdBudget = sum(
    adBudgetEntries.filter((entry) => entry.billClient === true).map((entry) => entry.amount)
  );

  // Przetwarzaj w kolejności chronologicznej (od najstarszego),
  // aby carry-over (niewykorzystane środki) przenosił się poprawnie do przodu
  const chronologicalMonths = [...months].sort();
  let carryAd = 0;
  let settlement = 0;
  const rowsAsc = chronologicalMonths.map((month) => {
    const monthConfig = monthConfigMap.get(month) || {
      id: null,
      month,
      budget: 0,
      compensationPercent: 0,
      note: '',
      updatedAt: null,
    };
    const {
      expenses: monthExpenses,
      balanceEntries: monthBalanceEntries,
      walletEntries: monthWalletEntries,
      ownInvoices: monthOwnInvoices,
      externalInvoices: monthExternalInvoices,
      compensationEntries: monthCompensationEntries,
    } = getMonthFinancialEntries(firm, month);

    const budget = roundCurrency(monthConfig.budget || 0);
    const compensationPercent = roundCurrency(monthConfig.compensationPercent || 0);
    const suggestedCompensation = roundCurrency((budget * compensationPercent) / 100);
    const compensation = sum(monthCompensationEntries.map((entry) => entry.amount));
    const adInjection = budget;
    const adCarryIn = carryAd;
    const settlementCarryIn = settlement;

    const budgetedExpensesTotal = sum(
      monthExpenses.filter((expense) => expense.countsTowardBudget !== false).map((expense) => expense.amount)
    );
    const ownPaidExpenses = sum(
      monthExpenses.filter((expense) => expense.payer === 'my_funds').map((expense) => expense.amount)
    );
    const clientCardExpenses = sum(
      monthExpenses.filter((expense) => expense.payer === 'client_card').map((expense) => expense.amount)
    );
    const clientBudgetPaidExpenses = sum(
      monthExpenses
        .filter((expense) => expense.payer === 'client_card' && expense.countsTowardBudget !== false)
        .map((expense) => expense.amount)
    );
    const expensesTotal = budgetedExpensesTotal;
    const reservedBudgetExpenses = sum(
      monthExpenses
        .filter((expense) => expense.payer === 'reserved' && expense.countsTowardBudget !== false)
        .map((expense) => expense.amount)
    );

    const balanceAdded = sum(
      monthBalanceEntries.filter((entry) => Number(entry.amount || 0) > 0).map((entry) => entry.amount)
    );
    const balanceRemoved = sum(
      monthBalanceEntries.filter((entry) => Number(entry.amount || 0) < 0).map((entry) => Math.abs(Number(entry.amount || 0)))
    );
    const balanceNet = roundCurrency(balanceAdded - balanceRemoved);

    const walletIncome = sum(
      monthWalletEntries.filter((e) => e.type === 'income').map((e) => e.amount)
    );
    const walletExpenses = sum(
      monthWalletEntries.filter((e) => e.type === 'expense').map((e) => e.amount)
    );
    const walletNet = roundCurrency(walletIncome - walletExpenses);
    const paymentsReceived = sum(
      monthWalletEntries
        .filter((entry) => entry.type === 'income' && entry.source !== 'invoice')
        .map((entry) => entry.amount)
    );
    const clientCoveredDirectly = clientBudgetPaidExpenses;
    const unpaidOwnInvoices = sum(
      monthOwnInvoices
        .filter((invoice) => invoice.status !== 'cancelled' && !invoice.paidBy)
        .map((invoice) => invoice.amount)
    );
    const settlementNetChange = roundCurrency(
      unpaidOwnInvoices + ownPaidExpenses + compensation + balanceNet - paymentsReceived
    );

    // Logika: najpierw zaciąga z bieżącego okresu, potem z przeniesienia
    const expensesFromCurrent = Math.min(expensesTotal, adInjection);
    const expensesFromCarry = Math.max(0, roundCurrency(expensesTotal - adInjection));
    const adCurrentRemaining = Math.max(0, roundCurrency(adInjection - expensesTotal));
    const adCarryRemaining = roundCurrency(adCarryIn - expensesFromCarry);

    const adAvailable = roundCurrency(adCarryIn + adInjection);
    const adEndingBalance = roundCurrency(adAvailable - expensesTotal);
    const settlementEndingBalance = roundCurrency(
      settlementCarryIn
      + settlementNetChange
    );

    carryAd = adEndingBalance;
    settlement = settlementEndingBalance;

    return {
      month,
      label: monthLabel(month),
      monthConfig,
      budget,
      compensationPercent,
      compensation,
      suggestedCompensation,
      compensationEntries: monthCompensationEntries,
      adInjection,
      adCarryIn,
      adAvailable,
      expensesFromCurrent,
      expensesFromCarry,
      adCurrentRemaining,
      adCarryRemaining,
      budgetedExpensesTotal,
      ownPaidExpenses,
      clientCardExpenses,
      clientBudgetPaidExpenses,
      reservedBudgetExpenses,
      clientCoveredDirectly,
      expensesTotal,
      adEndingBalance,
      balanceEntries: monthBalanceEntries,
      balanceAdded,
      balanceRemoved,
      balanceNet,
      settlementNetChange,
      settlementCarryIn,
      settlementEndingBalance,
      walletCarryIn: settlementCarryIn,
      walletEndingBalance: settlementEndingBalance,
      walletIncome,
      walletExpenses,
      walletNet,
      paymentsReceived,
      unpaidOwnInvoices,
      amountDue: Math.max(0, settlementEndingBalance),
      walletSurplus: Math.max(0, roundCurrency(-settlementEndingBalance)),
      ownInvoiceCount: monthOwnInvoices.length,
      externalInvoiceCount: monthExternalInvoices.length,
      expenseCount: monthExpenses.length,
      note: monthConfig.note || '',
    };
  });

  // Zwróć wiersze w kolejności malejącej (najnowsze pierwsze)
  // tak jak oczekują pozostałe części UI (dropdown miesięcy itp.)
  const rows = rowsAsc.reverse();

  const monthlyBudgetTotal = sum(rows.map((row) => row.budget));
  const totalBudget = roundCurrency(monthlyBudgetTotal + totalAdOnlyBudget);
  const totalCompensation = sum(rows.map((row) => row.compensation));
  const totalSuggestedCompensation = sum(rows.map((row) => row.suggestedCompensation));
  const totalBalanceAdded = sum(rows.map((row) => row.balanceAdded));
  const totalBalanceRemoved = sum(rows.map((row) => row.balanceRemoved));
  const totalOwnPaidExpenses = sum(rows.map((row) => row.ownPaidExpenses));
  const totalClientCardExpenses = sum(rows.map((row) => row.clientCardExpenses));
  const totalClientBudgetPaidExpenses = sum(rows.map((row) => row.clientBudgetPaidExpenses || 0));
  const totalExpenses = sum(rows.map((row) => row.expensesTotal));
  const totalReservedBudgetExpenses = sum(rows.map((row) => row.reservedBudgetExpenses || 0));
  const totalWalletIncome = sum(rows.map((row) => row.walletIncome));
  const totalWalletExpenses = sum(rows.map((row) => row.walletExpenses));
  const totalWalletNet = sum(rows.map((row) => row.walletNet));
  const monthlySettlementNet = sum(rows.map((row) => row.settlementNetChange));
  const totalSettlementNet = roundCurrency(monthlySettlementNet + totalChargeableAdBudget);
  const totalPaymentsReceived = sum(rows.map((row) => row.paymentsReceived));
  const adBalance = roundCurrency((rows[0]?.adEndingBalance || 0) + totalAdOnlyBudget);
  const walletBalance = roundCurrency((rows[0]?.settlementEndingBalance || 0) + totalChargeableAdBudget);

  return {
    months,
    rows,
    adBudgetEntries,
    totals: {
      totalBudget,
      monthlyBudgetTotal,
      totalAdOnlyBudget,
      totalChargeableAdBudget,
      totalCompensation,
      totalSuggestedCompensation,
      totalBalanceAdded,
      totalBalanceRemoved,
      totalOwnPaidExpenses,
      totalClientCardExpenses,
      totalClientBudgetPaidExpenses,
      totalReservedBudgetExpenses,
      totalExpenses,
      adBalance,
      walletBalance,
      totalSettlementNet,
      totalPaymentsReceived,
      totalWalletIncome,
      totalWalletExpenses,
      totalWalletNet,
      amountDue: Math.max(0, walletBalance),
      walletSurplus: Math.max(0, roundCurrency(-walletBalance)),
    },
  };
}

export function getMonthRow(ledger, month) {
  return ledger.rows.find((row) => row.month === month) || ledger.rows.at(-1) || null;
}

export function getScopeMonthKeys(ledger, selectedMonth, referenceDate = new Date()) {
  if (!ledger?.months?.length) {
    return selectedMonth && !String(selectedMonth).startsWith('__') ? [selectedMonth] : [];
  }

  if (!selectedMonth || selectedMonth === '__all__') {
    return [...ledger.months];
  }

  if (selectedMonth === '__year__') {
    const year = String(referenceDate.getFullYear());
    return ledger.months.filter((month) => month.startsWith(year));
  }

  if (selectedMonth === '__quarter__') {
    const year = String(referenceDate.getFullYear());
    const quarter = Math.floor(referenceDate.getMonth() / 3);
    const quarterMonths = [
      `${year}-${String(quarter * 3 + 1).padStart(2, '0')}`,
      `${year}-${String(quarter * 3 + 2).padStart(2, '0')}`,
      `${year}-${String(quarter * 3 + 3).padStart(2, '0')}`,
    ];
    return ledger.months.filter((month) => quarterMonths.includes(month));
  }

  return ledger.months.includes(selectedMonth) ? [selectedMonth] : [];
}

export function summarizeLedgerScope(ledger, selectedMonth, referenceDate = new Date()) {
  const scopeMonths = getScopeMonthKeys(ledger, selectedMonth, referenceDate);
  const rows = (ledger?.rows || []).filter((row) => scopeMonths.includes(row.month));
  const newestRow = rows[0] || null;
  const oldestRow = rows.at(-1) || null;
  const latestMonth = ledger?.rows?.[0]?.month || null;
  const includeAdOnlyBudget = !selectedMonth
    || selectedMonth === '__all__'
    || selectedMonth === latestMonth;
  const adOnlyBudget = includeAdOnlyBudget ? (ledger?.totals?.totalAdOnlyBudget || 0) : 0;
  const includeOutsideSettlement = !selectedMonth || selectedMonth === '__all__';
  const chargeableAdBudget = includeOutsideSettlement ? (ledger?.totals?.totalChargeableAdBudget || 0) : 0;

  const totalBudget = roundCurrency(sum(rows.map((row) => row.budget)) + adOnlyBudget);
  const totalCompensation = sum(rows.map((row) => row.compensation));
  const totalSuggestedCompensation = sum(rows.map((row) => row.suggestedCompensation || 0));
  const totalAdInjection = sum(rows.map((row) => row.adInjection));
  const totalExpenses = sum(rows.map((row) => row.expensesTotal));
  const totalOwnPaidExpenses = sum(rows.map((row) => row.ownPaidExpenses));
  const totalClientCardExpenses = sum(rows.map((row) => row.clientCardExpenses || 0));
  const totalClientBudgetPaidExpenses = sum(rows.map((row) => row.clientBudgetPaidExpenses || 0));
  const totalPaymentsReceived = sum(rows.map((row) => row.paymentsReceived));
  const totalUnpaidOwnInvoices = sum(rows.map((row) => row.unpaidOwnInvoices || 0));
  const totalBalanceNet = sum(rows.map((row) => row.balanceNet));
  const totalSettlementNet = roundCurrency(sum(rows.map((row) => row.settlementNetChange)) + chargeableAdBudget);
  const adCarryIn = oldestRow?.adCarryIn || 0;
  const adBalance = roundCurrency(adCarryIn + totalAdInjection + adOnlyBudget - totalExpenses);
  const settlementBalance = roundCurrency(
    totalOwnPaidExpenses + totalCompensation + totalBalanceNet - totalPaymentsReceived
    + sum(rows.map((row) => row.unpaidOwnInvoices || 0))
    + chargeableAdBudget
  );

  return {
    months: scopeMonths,
    rows,
    rowCount: rows.length,
    newestRow,
    oldestRow,
    totalBudget,
    adOnlyBudget,
    chargeableAdBudget,
    totalCompensation,
    totalSuggestedCompensation,
    totalAdInjection,
    totalExpenses,
    totalOwnPaidExpenses,
    totalClientCardExpenses,
    totalClientBudgetPaidExpenses,
    totalPaymentsReceived,
    totalUnpaidOwnInvoices,
    totalBalanceNet,
    totalSettlementNet,
    adCarryIn,
    settlementCarryIn: oldestRow?.settlementCarryIn || 0,
    adBalance,
    settlementBalance,
  };
}
