import { KALKULATOR_PIN_CONFIG } from '../generated/kalkulatorConfig';

const SESSION_KEY = 'kalkulator_pin_session';
const STATE_KEY = 'kalkulator_pin_state';

export type PinAccount = {
  id: string;
  label: string;
  pinHash: string;
  pinSalt: string;
  collectionName: string;
};

type PinSession = {
  unlockedUntil: number;
  accountId?: string;
  collectionName?: string;
};

type PinState = {
  failedAttempts: number;
  lockUntil: number;
};

function fnv1aHex(input: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    return safeParse(localStorage.getItem(key), fallback);
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures in private mode or strict browsers.
  }
}

export function getPinState() {
  return readStorage<PinState>(STATE_KEY, { failedAttempts: 0, lockUntil: 0 });
}

export function setPinState(state: PinState) {
  writeStorage(STATE_KEY, state);
}

export function resetPinState() {
  setPinState({ failedAttempts: 0, lockUntil: 0 });
}

export function getPinSession() {
  return readStorage<PinSession>(SESSION_KEY, { unlockedUntil: 0 });
}

export function getPrimaryPinAccount(): PinAccount {
  return KALKULATOR_PIN_CONFIG.accounts[0];
}

export function getPinAccounts(): PinAccount[] {
  return [...KALKULATOR_PIN_CONFIG.accounts];
}

export function getActivePinAccount(): PinAccount {
  const session = getPinSession();
  return (
    getPinAccounts().find((account) => account.id === session.accountId)
    || getPrimaryPinAccount()
  );
}

export function setPinSession(unlockedUntil: number, account: PinAccount) {
  writeStorage(SESSION_KEY, {
    unlockedUntil,
    accountId: account.id,
    collectionName: account.collectionName,
  });
}

export function clearPinSession() {
  writeStorage(SESSION_KEY, { unlockedUntil: 0 });
}

export function isPinUnlocked() {
  return getPinSession().unlockedUntil > Date.now();
}

export function getLockRemainingMs(now = Date.now()) {
  return Math.max(0, getPinState().lockUntil - now);
}

export function isPinLocked() {
  return getLockRemainingMs() > 0;
}

export function hashPin(pin: string, account: PinAccount) {
  return fnv1aHex(`${account.pinSalt}:${pin}`);
}

export function findPinAccount(pin: string) {
  return getPinAccounts().find((account) => hashPin(pin, account) === account.pinHash) || null;
}

export function verifyPin(pin: string) {
  return Boolean(findPinAccount(pin));
}

export function registerPinAttempt(pin: string) {
  const state = getPinState();
  const now = Date.now();

  if (state.lockUntil > now) {
    return {
      ok: false,
      locked: true,
      remainingMs: state.lockUntil - now,
      attemptsLeft: 0,
    };
  }

  const account = findPinAccount(pin);
  if (account) {
    resetPinState();
    setPinSession(now + KALKULATOR_PIN_CONFIG.unlockHours * 60 * 60 * 1000, account);
    return {
      ok: true,
      locked: false,
      remainingMs: 0,
      attemptsLeft: 5,
      account,
    };
  }

  const failedAttempts = state.failedAttempts + 1;
  if (failedAttempts >= 5) {
    const lockUntil = now + KALKULATOR_PIN_CONFIG.lockMinutes * 60 * 1000;
    setPinState({ failedAttempts: 0, lockUntil });
    return {
      ok: false,
      locked: true,
      remainingMs: lockUntil - now,
      attemptsLeft: 0,
    };
  }

  setPinState({ failedAttempts, lockUntil: 0 });
  return {
    ok: false,
    locked: false,
    remainingMs: 0,
    attemptsLeft: 5 - failedAttempts,
  };
}

export function formatRemainingTime(ms: number) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
