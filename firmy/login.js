import {
  ADMIN_PIN,
  DEFAULT_LOGIN_PIN_LENGTH,
  DEFAULT_MAX_ATTEMPTS,
  createSessionWithPin,
  ensureAnonymousAuth,
  getCurrentSession,
  addFailedAttempt,
  getPinLock,
  getFirmySettings,
} from './firebase.js';

const slotsEl = document.getElementById('pinSlots');
const statusEl = document.getElementById('status');

let expectedPinLength = DEFAULT_LOGIN_PIN_LENGTH;
let maxAttempts = DEFAULT_MAX_ATTEMPTS;
let isSubmitting = false;
let slotInputs = [];

function setStatus(message, isError = false) {
  statusEl.textContent = message || '';
  statusEl.className = `status ${isError ? 'err' : 'ok'}`;
}

function routeBySession(session) {
  if (!session || !session.pin) return;

  if (session.pin === ADMIN_PIN) {
    window.location.href = './admin.html';
    return;
  }

  if (session.clientSlug === 'elmet') {
    window.location.href = './elmet.html';
    return;
  }

  if (session.clientSlug === 'sredzka-korona') {
    window.location.href = './sredzka-korona.html';
    return;
  }

  if (session.clientId) {
    window.location.href = `./client.html?client=${encodeURIComponent(session.clientId)}`;
    return;
  }

  setStatus('PIN nie ma przypisania.', true);
}

function getPinFromSlots() {
  return slotInputs.map((input) => input.value).join('');
}

function isCompletePin() {
  return slotInputs.every((input) => input.value && /^\d$/.test(input.value));
}

function clearSlots() {
  slotInputs.forEach((input) => {
    input.value = '';
    input.classList.remove('filled');
  });
  slotInputs[0]?.focus();
}

async function submitPin(pin) {
  if (isSubmitting) return;
  if (!new RegExp(`^\\d{${expectedPinLength}}$`).test(pin)) {
    setStatus(`PIN musi mieć ${expectedPinLength} cyfr.`, true);
    return;
  }

  const lock = await getPinLock(pin);
  if (lock?.isLocked) {
    setStatus('Ten PIN jest zablokowany.', true);
    return;
  }

  isSubmitting = true;
  setStatus('Weryfikacja...');

  try {
    const session = await createSessionWithPin(pin);
    routeBySession(session);
  } catch {
    const res = await addFailedAttempt(pin, maxAttempts);
    if (res.isLocked) {
      setStatus(`PIN zablokowany po ${maxAttempts} próbach.`, true);
    } else {
      setStatus(`Niepoprawny PIN. Pozostało: ${Math.max(maxAttempts - res.failedAttempts, 0)}.`, true);
    }
    clearSlots();
  } finally {
    isSubmitting = false;
  }
}

function onSlotInput(index, event) {
  const digit = event.target.value.replace(/\D/g, '').slice(-1);
  event.target.value = digit;
  event.target.classList.toggle('filled', Boolean(digit));

  if (digit && index < slotInputs.length - 1) {
    slotInputs[index + 1].focus();
  }

  const pin = getPinFromSlots();
  if (pin.length === expectedPinLength && isCompletePin()) {
    submitPin(pin);
  }
}

function onSlotKeydown(index, event) {
  if (event.key === 'Backspace' && !event.currentTarget.value && index > 0) {
    slotInputs[index - 1].focus();
  }

  if (event.key === 'ArrowLeft' && index > 0) {
    event.preventDefault();
    slotInputs[index - 1].focus();
  }

  if (event.key === 'ArrowRight' && index < slotInputs.length - 1) {
    event.preventDefault();
    slotInputs[index + 1].focus();
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    submitPin(getPinFromSlots());
  }
}

function onSlotsPaste(event) {
  const data = event.clipboardData?.getData('text')?.replace(/\D/g, '') || '';
  if (!data) return;

  event.preventDefault();
  const digits = data.slice(0, expectedPinLength).split('');

  slotInputs.forEach((input, i) => {
    input.value = digits[i] || '';
    input.classList.toggle('filled', Boolean(input.value));
  });

  const pin = getPinFromSlots();
  if (pin.length === expectedPinLength && isCompletePin()) {
    submitPin(pin);
  } else {
    slotInputs[Math.min(digits.length, slotInputs.length - 1)]?.focus();
  }
}

function renderSlots() {
  slotsEl.style.setProperty('--slot-count', String(expectedPinLength));
  slotInputs = Array.from(slotsEl.querySelectorAll('.pin-slot')).slice(0, expectedPinLength);
  slotInputs.forEach((input, i) => {
    input.setAttribute('maxlength', '1');
    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('autocomplete', i === 0 ? 'one-time-code' : 'off');
    input.addEventListener('input', (event) => onSlotInput(i, event));
    input.addEventListener('keydown', (event) => onSlotKeydown(i, event));
    input.addEventListener('paste', onSlotsPaste);
  });
  slotInputs[0]?.focus();
}

async function init() {
  expectedPinLength = 6;
  maxAttempts = DEFAULT_MAX_ATTEMPTS;

  renderSlots();

  try {
    await ensureAnonymousAuth();
    const settings = await getFirmySettings();
    maxAttempts = Math.min(Math.max(settings.maxAttempts || DEFAULT_MAX_ATTEMPTS, 1), 20);
    const existing = await getCurrentSession();
    if (existing) {
      routeBySession(existing);
      return;
    }
  } catch {
    setStatus('Brak połączenia z backendem logowania.', true);
  }

  document.getElementById('loginBtn').addEventListener('click', () => {
    submitPin(getPinFromSlots());
  });
}

init().catch(() => {
  setStatus('Błąd uruchamiania logowania.', true);
});
