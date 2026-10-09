'use strict';

(function (root) {
  const KEYS = [
    'ijanek_cookie_decision', 'ijanek_cookie_analytics', 'ijanek_cookie_marketing',
    'ijanek_cookie_external', 'ijanek_cookie_consent_id',
    'ijanek_cookie_consent_created_at', 'ijanek_cookie_consent_updated_at',
    'ijanek_cookie_consent_expires_at', 'ijanek_anonymous_user_id',
  ];
  const PREFERENCES = ['ijanek_name', 'ijanek_theme', 'ijanek_lang', 'ijanek_tutorial_done'];
  const SESSION_KEYS = ['ijanek_active_section', 'ijanek_tutorial_step', 'ijanek_tutorial_return'];
  const UPDATED_AT = 'ijanek_cookie_consent_updated_at';
  const CREATED_AT = 'ijanek_cookie_consent_created_at';
  const EXPIRES_AT = 'ijanek_cookie_consent_expires_at';

  // Twelve calendar months in UTC, clamping leap day to February 28.
  function expiresAfter12Months(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCFullYear(date.getUTCFullYear() + 1);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }

  // The cleanup worker uses the same date calculation as the browser.
  if (typeof module === 'object' && module.exports) {
    module.exports = { expiresAfter12Months };
    return;
  }

  function clearConsent() {
    [...KEYS, ...PREFERENCES].forEach(key => root.localStorage.removeItem(key));
    SESSION_KEYS.forEach(key => root.sessionStorage.removeItem(key));
    for (let index = root.sessionStorage.length - 1; index >= 0; index--) {
      const key = root.sessionStorage.key(index);
      if (key?.startsWith('ijanek_metric_')) root.sessionStorage.removeItem(key);
    }
    // Remove optional first-party Google cookies on the current host and parent domains.
    const domains = root.location.hostname.split('.');
    const cookieNames = root.document.cookie.split(';').map(cookie => cookie.split('=')[0].trim());
    for (const name of cookieNames) {
      if (!/^(_ga(?:_|$)|_gid$|_gat(?:_|$)|_gcl_|_gac_)/.test(name)) continue;
      const paths = root.location.pathname.split('/');
      const cookiePaths = new Set(['/']);
      while (paths.length > 1) { cookiePaths.add(paths.join('/') || '/'); paths.pop(); }
      for (const path of cookiePaths) {
        const expired = `${name}=; Max-Age=0; path=${path}; SameSite=Lax`;
        root.document.cookie = expired;
        for (let index = 0; index < domains.length - 1; index++) {
          root.document.cookie = `${expired}; domain=${domains.slice(index).join('.')}`;
        }
      }
    }
    root.dispatchEvent(new root.Event('ijanicki:consent-expired'));
  }

  function ensureCurrent(now = Date.now()) {
    try {
      const decision = root.localStorage.getItem(KEYS[0]);
      if (!decision) {
        if (KEYS.some(key => root.localStorage.getItem(key) !== null)) clearConsent();
        return false;
      }
      const savedAt = root.localStorage.getItem(UPDATED_AT) || root.localStorage.getItem(CREATED_AT);
      const expiresAt = expiresAfter12Months(savedAt);
      if (!['all', 'essential', 'custom'].includes(decision) || !expiresAt || Date.parse(savedAt) > now || Date.parse(expiresAt) <= now) {
        clearConsent();
        return false;
      }
      if (root.localStorage.getItem(EXPIRES_AT) !== expiresAt) {
        root.localStorage.setItem(EXPIRES_AT, expiresAt);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function markSaved(now = new Date().toISOString()) {
    const expiresAt = expiresAfter12Months(now);
    try {
      root.localStorage.setItem(UPDATED_AT, now);
      root.localStorage.setItem(EXPIRES_AT, expiresAt);
    } catch (_) { /* Storage may be disabled; optional analytics stays denied. */ }
    scheduleExpiry();
    return expiresAt;
  }

  function clearLegacyContactState() {
    try {
      const key = 'ijanek_form_last_submit';
      const stored = root.localStorage.getItem(key);
      if (stored === null) return;
      const timestamp = Number(stored);
      const date = new Date(timestamp);
      const expiresAt = Number.isFinite(timestamp) && Number.isFinite(date.getTime())
        ? expiresAfter12Months(date.toISOString()) : null;
      if (!expiresAt || timestamp > Date.now() || Date.parse(expiresAt) <= Date.now()) {
        root.localStorage.removeItem(key);
      }
    } catch (_) { /* Local storage may be disabled. */ }
  }

  let expiryTimer;
  function scheduleExpiry() {
    clearLegacyContactState();
    root.clearTimeout(expiryTimer);
    if (!ensureCurrent()) return;
    const remaining = Date.parse(root.localStorage.getItem(EXPIRES_AT)) - Date.now();
    expiryTimer = root.setTimeout(scheduleExpiry, Math.min(remaining, 86400000));
  }

  root.IJanickiCookieConsent = { ensureCurrent, markSaved, expiresAfter12Months };
  scheduleExpiry(); // Before analytics reads any saved categories.
  root.addEventListener('pageshow', scheduleExpiry);
  root.document.addEventListener('visibilitychange', scheduleExpiry);
  root.addEventListener('storage', event => {
    if (KEYS.includes(event.key) || event.key === null) scheduleExpiry();
  });
})(typeof window === 'object' ? window : globalThis);
