import {
  clearSession,
  ensureAnonymousAuth,
  getCurrentSession,
  getMonthlySummary,
  listExpenses,
  formatMoney,
  getClient,
} from './firebase.js';

const statusEl = document.getElementById('status');

function setStatus(message, isError = false) {
  statusEl.textContent = message || '';
  statusEl.className = `status ${isError ? 'err' : 'ok'}`;
}

function monthNow() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getClientTarget() {
  const explicitSlug = document.body.dataset.clientSlug || '';
  const queryClient = new URLSearchParams(window.location.search).get('client') || '';
  return { explicitSlug, queryClient };
}

async function resolveClient(session) {
  const { explicitSlug, queryClient } = getClientTarget();
  const clientId = queryClient || session.clientId;
  if (!clientId) return null;

  const client = await getClient(clientId);
  if (!client) return null;

  if (explicitSlug && client.slug !== explicitSlug) {
    return null;
  }
  return client;
}

function renderExpenseRows(expenses) {
  const body = document.getElementById('expensesTableBody');
  body.innerHTML = expenses
    .map(
      (e) => `
      <tr>
        <td>${e.date || '-'}</td>
        <td>${e.label || '-'}</td>
        <td>${e.category || '-'}</td>
        <td>${e.payer === 'client' ? 'Klient' : 'Właściciel'}</td>
        <td>${formatMoney(e.amount || 0)}</td>
        <td>${e.note || '-'}</td>
      </tr>
    `,
    )
    .join('');
}

function renderKpi(expenses, summary) {
  let paidFromClient = 0;
  let ownerCovered = 0;

  expenses.forEach((e) => {
    const amount = Number(e.amount || 0);
    if (e.payer === 'client') {
      paidFromClient += amount;
    } else {
      ownerCovered += amount;
    }
  });

  const workFee = Number(summary?.workFee || 0);
  const totalCost = paidFromClient + ownerCovered + workFee;
  const toPay = Math.max(totalCost - paidFromClient, 0);

  document.getElementById('kpiClientSpend').textContent = formatMoney(paidFromClient);
  document.getElementById('kpiOwnerSpend').textContent = formatMoney(ownerCovered);
  document.getElementById('kpiWorkFee').textContent = formatMoney(workFee);
  document.getElementById('kpiToPay').textContent = formatMoney(toPay);
  document.getElementById('kpiPaymentStatus').textContent =
    summary?.paymentStatus === 'paid'
      ? 'Zapłacone'
      : summary?.paymentStatus === 'partial'
        ? 'Częściowo'
        : 'Do zapłaty';
}

async function loadMonth(clientId, month) {
  const [summary, expenses] = await Promise.all([
    getMonthlySummary(clientId, month),
    listExpenses(clientId, month),
  ]);

  document.getElementById('monthNote').textContent = summary?.note || 'Brak uwag na ten miesiąc.';
  renderExpenseRows(expenses);
  renderKpi(expenses, summary);
}

async function init() {
  await ensureAnonymousAuth();
  const session = await getCurrentSession();

  if (!session || !session.pin) {
    window.location.href = './index.html';
    return;
  }

  if (session.role === 'admin') {
    window.location.href = './admin.html';
    return;
  }

  const client = await resolveClient(session);
  if (!client || !session.clientId || session.clientId !== client.id) {
    setStatus('Brak dostępu do danych tej firmy.', true);
    return;
  }

  document.getElementById('clientName').textContent = client.name;

  const monthPicker = document.getElementById('currentMonth');
  monthPicker.value = monthNow();
  await loadMonth(client.id, monthPicker.value);

  monthPicker.addEventListener('change', async () => {
    await loadMonth(client.id, monthPicker.value);
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await clearSession();
    window.location.href = './index.html';
  });
}

init().catch((err) => {
  console.error(err);
  setStatus('Nie udało się załadować panelu klienta.', true);
});
