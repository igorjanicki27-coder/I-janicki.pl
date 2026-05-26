import {
  ADMIN_PIN,
  DEFAULT_MAX_ATTEMPTS,
  clearSession,
  ensureAnonymousAuth,
  getCurrentSession,
  listClients,
  saveClient,
  listPins,
  savePin,
  unlockPin,
  listPinLocks,
  getFirmySettings,
  saveFirmySettings,
  upsertMonthlySummary,
  getMonthlySummary,
  addExpense,
  deleteExpense,
  listExpenses,
  formatMoney,
  sanitizeSlug,
} from './firebase.js';

const state = {
  clients: [],
  pins: [],
  pinLocks: [],
  currentClientId: '',
  currentMonth: monthNow(),
  expenses: [],
};

const statusEl = document.getElementById('status');

function monthNow() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function setStatus(message, isError = false) {
  statusEl.textContent = message || '';
  statusEl.className = `status ${isError ? 'err' : 'ok'}`;
}

function ensureAdminSession(session) {
  if (!session || session.pin !== ADMIN_PIN) {
    window.location.href = './index.html';
    return false;
  }
  return true;
}

function clientById(clientId) {
  return state.clients.find((c) => c.id === clientId) || null;
}

function renderClientOptions() {
  const select = document.getElementById('expenseClientId');
  const pinClientSelect = document.getElementById('pinClientId');
  const html = ['<option value="">Wybierz klienta</option>']
    .concat(state.clients.map((c) => `<option value="${c.id}">${c.name}</option>`))
    .join('');

  select.innerHTML = html;
  pinClientSelect.innerHTML = html;

  if (!state.currentClientId && state.clients.length) {
    state.currentClientId = state.clients[0].id;
  }

  select.value = state.currentClientId;
}

function renderClientsTable() {
  const body = document.getElementById('clientsTableBody');
  body.innerHTML = state.clients
    .map(
      (c) => `
      <tr>
        <td>${c.name}</td>
        <td>${c.slug || '-'}</td>
        <td>${c.defaultBudget || 0}</td>
        <td>${c.defaultWorkFee || 0}</td>
      </tr>
    `,
    )
    .join('');
}

function renderPinsTable() {
  const body = document.getElementById('pinsTableBody');
  body.innerHTML = state.pins
    .map((p) => {
      const lock = state.pinLocks.find((lockItem) => lockItem.pin === p.pin);
      const isLocked = Boolean(lock?.isLocked);
      const assigned = p.role === 'admin' ? 'Administrator' : (clientById(p.clientId)?.name || '-');
      return `
        <tr>
          <td>${p.pin}</td>
          <td>${p.role}</td>
          <td>${assigned}</td>
          <td>${p.isActive === false ? 'Nieaktywny' : 'Aktywny'}</td>
          <td>${isLocked ? 'Zablokowany' : 'OK'}</td>
          <td>
            <button class="secondary" data-unlock-pin="${p.pin}">Odblokuj</button>
          </td>
        </tr>
      `;
    })
    .join('');
}

function calculateSummary() {
  const monthlyBudget = Number(document.getElementById('monthlyBudget').value || 0);
  const workFee = Number(document.getElementById('workFee').value || 0);

  let paidFromClient = 0;
  let ownerCovered = 0;

  for (const expense of state.expenses) {
    const amount = Number(expense.amount || 0);
    if (expense.payer === 'client') {
      paidFromClient += amount;
    } else {
      ownerCovered += amount;
    }
  }

  const totalCost = paidFromClient + ownerCovered + workFee;
  const amountDue = Math.max(totalCost - paidFromClient, 0);

  document.getElementById('kpiClientSpend').textContent = formatMoney(paidFromClient);
  document.getElementById('kpiOwnerSpend').textContent = formatMoney(ownerCovered);
  document.getElementById('kpiWorkFee').textContent = formatMoney(workFee);
  document.getElementById('kpiToPay').textContent = formatMoney(amountDue);
  document.getElementById('kpiBudgetLeft').textContent = formatMoney(monthlyBudget - paidFromClient);
}

function renderExpenses() {
  const body = document.getElementById('expensesTableBody');
  body.innerHTML = state.expenses
    .map(
      (e) => `
      <tr>
        <td>${e.date || '-'}</td>
        <td>${e.label || '-'}</td>
        <td>${e.category || '-'}</td>
        <td>${e.payer === 'client' ? 'Klient' : 'Właściciel'}</td>
        <td>${formatMoney(e.amount || 0)}</td>
        <td>${e.note || '-'}</td>
        <td><button class="danger" data-delete-expense="${e.id}">Usuń</button></td>
      </tr>
    `,
    )
    .join('');

  calculateSummary();
}

async function refreshClientsAndPins() {
  const [clients, pins, pinLocks] = await Promise.all([listClients(), listPins(), listPinLocks()]);
  state.clients = clients;
  state.pins = pins;
  state.pinLocks = pinLocks;
  renderClientOptions();
  renderClientsTable();
  renderPinsTable();
}

async function loadMonth() {
  if (!state.currentClientId || !state.currentMonth) return;

  const [summary, expenses] = await Promise.all([
    getMonthlySummary(state.currentClientId, state.currentMonth),
    listExpenses(state.currentClientId, state.currentMonth),
  ]);

  document.getElementById('monthlyBudget').value = summary?.budget || 0;
  document.getElementById('workFee').value = summary?.workFee || 0;
  document.getElementById('paymentStatus').value = summary?.paymentStatus || 'unpaid';
  document.getElementById('monthNote').value = summary?.note || '';

  state.expenses = expenses;
  renderExpenses();
}

async function onAddClient(event) {
  event.preventDefault();
  const name = document.getElementById('clientName').value.trim();
  const slugInput = document.getElementById('clientSlug').value.trim();
  const slug = sanitizeSlug(slugInput || name);
  const defaultBudget = Number(document.getElementById('defaultBudget').value || 0);
  const defaultWorkFee = Number(document.getElementById('defaultWorkFee').value || 0);

  if (!name || !slug) {
    setStatus('Podaj nazwę klienta.', true);
    return;
  }

  await saveClient(slug, {
    name,
    slug,
    defaultBudget,
    defaultWorkFee,
    currency: 'PLN',
  });

  document.getElementById('clientForm').reset();
  setStatus('Klient zapisany.');
  await refreshClientsAndPins();
}

async function onSavePin(event) {
  event.preventDefault();
  const pin = document.getElementById('pinCode').value.replace(/\D/g, '');
  const role = document.getElementById('pinRole').value;
  const clientId = document.getElementById('pinClientId').value;

  if (!/^\d{4,6}$/.test(pin)) {
    setStatus('PIN musi mieć 4-6 cyfr.', true);
    return;
  }

  if (role === 'client' && !clientId) {
    setStatus('Wybierz klienta dla PIN-u klienta.', true);
    return;
  }
  if (role === 'admin' && pin !== ADMIN_PIN) {
    setStatus(`Jedyny PIN administratora to ${ADMIN_PIN}.`, true);
    return;
  }

  const client = clientById(clientId);

  await savePin(pin, {
    role,
    clientId: role === 'client' ? clientId : null,
    clientSlug: role === 'client' ? (client?.slug || null) : null,
    isActive: true,
    isLocked: false,
    failedAttempts: 0,
  });

  setStatus('PIN zapisany.');
  document.getElementById('pinForm').reset();
  await refreshClientsAndPins();
}

async function onSaveMonth(event) {
  event.preventDefault();
  if (!state.currentClientId) {
    setStatus('Wybierz klienta.', true);
    return;
  }

  const payload = {
    budget: Number(document.getElementById('monthlyBudget').value || 0),
    workFee: Number(document.getElementById('workFee').value || 0),
    paymentStatus: document.getElementById('paymentStatus').value,
    note: document.getElementById('monthNote').value.trim(),
  };

  await upsertMonthlySummary(state.currentClientId, state.currentMonth, payload);
  setStatus('Podsumowanie miesiąca zapisane.');
  await loadMonth();
}

async function onAddExpense(event) {
  event.preventDefault();
  if (!state.currentClientId) {
    setStatus('Wybierz klienta.', true);
    return;
  }

  const payload = {
    month: state.currentMonth,
    date: document.getElementById('expenseDate').value,
    label: document.getElementById('expenseLabel').value.trim(),
    category: document.getElementById('expenseCategory').value.trim(),
    payer: document.getElementById('expensePayer').value,
    amount: Number(document.getElementById('expenseAmount').value || 0),
    note: document.getElementById('expenseNote').value.trim(),
  };

  if (!payload.date || !payload.label || payload.amount <= 0) {
    setStatus('Uzupełnij datę, opis i kwotę > 0.', true);
    return;
  }

  await addExpense(state.currentClientId, payload);
  document.getElementById('expenseForm').reset();
  setStatus('Koszt dodany.');
  await loadMonth();
}

async function onExpensesTableClick(event) {
  const deleteBtn = event.target.closest('[data-delete-expense]');
  if (deleteBtn) {
    await deleteExpense(state.currentClientId, deleteBtn.dataset.deleteExpense);
    setStatus('Usunięto koszt.');
    await loadMonth();
    return;
  }

  const unlockBtn = event.target.closest('[data-unlock-pin]');
  if (unlockBtn) {
    const pin = unlockBtn.dataset.unlockPin;
    await unlockPin(pin);
    await savePin(pin, { isLocked: false, failedAttempts: 0 });
    setStatus(`PIN ${pin} odblokowany.`);
    await refreshClientsAndPins();
  }
}

async function init() {
  await ensureAnonymousAuth();
  const session = await getCurrentSession();
  if (!ensureAdminSession(session)) {
    return;
  }

  document.getElementById('currentMonth').value = state.currentMonth;

  await refreshClientsAndPins();
  const settings = await getFirmySettings();
  document.getElementById('pinLength').value = settings.pinLength;
  document.getElementById('maxAttempts').value = settings.maxAttempts;
  renderClientOptions();

  if (state.currentClientId) {
    await loadMonth();
  }

  document.getElementById('clientForm').addEventListener('submit', onAddClient);
  document.getElementById('settingsForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const pinLength = Math.min(Math.max(Number(document.getElementById('pinLength').value || 4), 4), 6);
    const maxAttempts = Math.min(Math.max(Number(document.getElementById('maxAttempts').value || 5), 1), 20);
    await saveFirmySettings({ pinLength, maxAttempts });
    setStatus('Ustawienia logowania zapisane.');
  });
  document.getElementById('pinForm').addEventListener('submit', onSavePin);
  document.getElementById('monthForm').addEventListener('submit', onSaveMonth);
  document.getElementById('expenseForm').addEventListener('submit', onAddExpense);
  document.getElementById('expensesTableBody').addEventListener('click', onExpensesTableClick);
  document.getElementById('pinsTableBody').addEventListener('click', onExpensesTableClick);

  document.getElementById('expenseClientId').addEventListener('change', async (event) => {
    state.currentClientId = event.target.value;
    await loadMonth();
  });

  document.getElementById('currentMonth').addEventListener('change', async (event) => {
    state.currentMonth = event.target.value;
    await loadMonth();
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await clearSession();
    window.location.href = './index.html';
  });

  document.getElementById('seedBtn').addEventListener('click', async () => {
    await saveFirmySettings({ pinLength: 4, maxAttempts: 5 });
    await savePin(ADMIN_PIN, {
      role: 'admin',
      clientId: null,
      clientSlug: null,
      isActive: true,
      isLocked: false,
      failedAttempts: 0,
    });

    await saveClient('elmet', {
      name: 'Elmet',
      slug: 'elmet',
      defaultBudget: 0,
      defaultWorkFee: 0,
      currency: 'PLN',
    });

    await saveClient('sredzka-korona', {
      name: 'Średzka Korona',
      slug: 'sredzka-korona',
      defaultBudget: 0,
      defaultWorkFee: 0,
      currency: 'PLN',
    });

    await savePin('1234', {
      role: 'client',
      clientId: 'elmet',
      clientSlug: 'elmet',
      isActive: true,
      isLocked: false,
      failedAttempts: 0,
    });

    setStatus('Dane startowe zapisane (admin + Elmet + Średzka Korona + PIN 1234).');
    await refreshClientsAndPins();
    await loadMonth();
  });

  calculateSummary();
}

init().catch((err) => {
  console.error(err);
  setStatus('Nie udało się załadować panelu admina.', true);
});
