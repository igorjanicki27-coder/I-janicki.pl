/**
 * auth.js – weryfikacja PIN przez Firestore + kliencka blokada
 *
 * Flow:
 *  1. Anonimowe logowanie Firebase (firebase.js)
 *  2. Pobranie hash+ salt z Firestore (firmy_settings/auth, fallback do default)
 *  3. Klient haszuje wpisany PIN (SHA-256)
 *  4. Porównanie hashów
 *  5. Przy 3 błędnych próbach → blokada 10 min (sessionStorage)
 *
 * Ograniczenie: blokada działa po stronie klienta (sessionStorage).
 * PIN jest przechowywany w Firestore wyłącznie jako hash SHA-256 + sól.
 */

import { ensureAuth, ensureFirmyAdminSession, getSetting } from './firebase.js?v=20';

/* ── Stałe ──────────────────────────────────────────────────── */
const STORAGE_PREFIX = 'ijanicki_firma_';
const SETTINGS_DOC = 'firmy_settings/auth';
const OLD_SETTINGS_DOC = 'firmy_settings/default';

const DEFAULTS = {
  MAX_ATTEMPTS: 3,
  LOCK_MINUTES: 10
};

/* ── Hashowanie PIN (SHA-256) ──────────────────────────────── */
async function hashPin(pin, salt) {
  const msg = new TextEncoder().encode(pin + ':' + salt);
  const buf = await crypto.subtle.digest('SHA-256', msg);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/* ── Stan blokady (sessionStorage) ─────────────────────────── */
function getLockState() {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + 'lock');
    return raw ? JSON.parse(raw) : { attempts: 0, lockUntil: 0 };
  } catch {
    return { attempts: 0, lockUntil: 0 };
  }
}

function saveLockState(state) {
  sessionStorage.setItem(STORAGE_PREFIX + 'lock', JSON.stringify(state));
}

function clearLockState() {
  sessionStorage.removeItem(STORAGE_PREFIX + 'lock');
}

/** Sprawdza czy konto jest tymczasowo zablokowane. */
export function isLockedOut() {
  const state = getLockState();
  if (state.lockUntil && Date.now() < state.lockUntil) return true;
  // blokada wygasła – resetujemy próby
  if (state.lockUntil && Date.now() >= state.lockUntil) {
    clearLockState();
  }
  return false;
}

/** Pozostały czas blokady w sekundach (lub 0). */
export function lockRemainingSeconds() {
  const state = getLockState();
  if (!state.lockUntil) return 0;
  const remaining = Math.max(0, Math.ceil((state.lockUntil - Date.now()) / 1000));
  return remaining;
}

/* ── Weryfikacja PIN ───────────────────────────────────────── */
/**
 * Sprawdza PIN przeciwko Firestore.
 * @param {string} pin – PIN wpisany przez użytkownika
 * @returns {Promise<{success:boolean, error?:string, remainingAttempts?:number}>}
 */
export async function verifyPin(pin) {
  // 1. Sprawdź blokadę
  if (isLockedOut()) {
    const sec = lockRemainingSeconds();
    const min = Math.ceil(sec / 60);
    return {
      success: false,
      error: `Konto zablokowane. Spróbuj ponownie za ${min} min.`,
      remainingAttempts: 0
    };
  }

  // 2. Autoryzacja Firebase
  let user;
  try {
    user = await ensureAuth();
  } catch (err) {
    console.error('Firebase auth error:', err);
    return { success: false, error: 'Błąd połączenia z serwerem.' };
  }

  // 3. Pobierz ustawienia (hash + salt) z Firestore
  let settings;
  try {
    settings = await getSetting(SETTINGS_DOC);
  } catch (err) {
    console.error('Firestore read error:', err);
    return { success: false, error: 'Błąd odczytu danych.' };
  }

  // Fallback: jeśli nowa ścieżka nie istnieje, spróbuj starej (migracja)
  if (!settings || !settings.pinHash) {
    try {
      const oldSettings = await getSetting(OLD_SETTINGS_DOC);
      if (oldSettings && oldSettings.pinHash && oldSettings.pinSalt) {
        settings = oldSettings;
      }
    } catch (_) { /* ignoruj błędy odczytu starej ścieżki */ }
  }

  if (!settings || !settings.pinHash || !settings.pinSalt) {
    console.error('Brak firmy_settings/auth ani firmy_settings/default w Firestore');
    return { success: false, error: 'Błąd konfiguracji – skontaktuj się z administratorem.' };
  }

  const maxAttempts = settings.maxAttempts || DEFAULTS.MAX_ATTEMPTS;
  const lockMinutes = settings.lockMinutes || DEFAULTS.LOCK_MINUTES;

  // 4. Haszuj wpisany PIN
  const enteredHash = await hashPin(pin, settings.pinSalt);

  // 5. Porównaj
  if (enteredHash === settings.pinHash) {
    // Sukces – wyczyść licznik błędów
    clearLockState();
    sessionStorage.setItem(STORAGE_PREFIX + 'loggedIn', 'true');

    // Utwórz sesję admina (pin 151100 = hardcoded admin w regułach Firestore)
    // Dzięki temu użytkownik może zapisywać dane do Firestore.
    try {
      await ensureFirmyAdminSession();
    } catch (err) {
      console.warn('Nie udało się utworzyć sesji Firestore:', err);
      // Nie blokujemy logowania – zapis lokalny nadal działa
    }

    return { success: true };
  }

  // 6. Błędny PIN – inkrementuj licznik
  const state = getLockState();
  state.attempts = (state.attempts || 0) + 1;

  if (state.attempts >= maxAttempts) {
    state.lockUntil = Date.now() + lockMinutes * 60 * 1000;
    saveLockState(state);
    return {
      success: false,
      error: `Zablokowano na ${lockMinutes} min po ${maxAttempts} nieudanych próbach.`,
      remainingAttempts: 0
    };
  }

  saveLockState(state);
  const remaining = maxAttempts - state.attempts;
  return {
    success: false,
    error: `Nieprawidłowy PIN. Pozostało prób: ${remaining}.`,
    remainingAttempts: remaining
  };
}

/** Sprawdza czy użytkownik jest zalogowany (ważna sesja). */
export function isLoggedIn() {
  return sessionStorage.getItem(STORAGE_PREFIX + 'loggedIn') === 'true';
}

/** Wylogowuje użytkownika. */
export function logout() {
  clearLockState();
  sessionStorage.removeItem(STORAGE_PREFIX + 'loggedIn');
  sessionStorage.removeItem(STORAGE_PREFIX + 'activeFirm');
  sessionStorage.removeItem(STORAGE_PREFIX + 'activeMonth');
}
