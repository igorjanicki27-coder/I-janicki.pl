(function () {
  'use strict';

  const FIREBASE_RTDB_BASE = 'https://i-janicki-default-rtdb.europe-west1.firebasedatabase.app';
  const COOKIE_POLICY_VERSION = '1.2';
  const STORAGE = {
    decision: 'ijanek_cookie_decision',
    analytics: 'ijanek_cookie_analytics',
    marketing: 'ijanek_cookie_marketing',
    external: 'ijanek_cookie_external',
    consentId: 'ijanek_cookie_consent_id',
    consentCreatedAt: 'ijanek_cookie_consent_created_at',
    consentUpdatedAt: 'ijanek_cookie_consent_updated_at',
    anonymousUserId: 'ijanek_anonymous_user_id',
  };

  const toggle = document.querySelector('[data-nav-toggle]');
  const nav = document.querySelector('[data-nav]');
  const cookieOverlay = document.getElementById('cookieOverlay');
  const cookieButton = document.getElementById('cookieFootBtn');

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      const isOpen = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(isOpen));
    });

    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  document.querySelectorAll('[data-year]').forEach(function (year) {
    year.textContent = String(new Date().getFullYear());
  });

  function readStorage(key) {
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (_) {
      return false;
    }
  }

  function getOrCreateStoredValue(key, factory) {
    const existing = readStorage(key);
    if (existing) return existing;
    const value = factory();
    writeStorage(key, value);
    return value;
  }

  function createUuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (character) {
      const random = Math.random() * 16 | 0;
      const value = character === 'x' ? random : (random & 0x3 | 0x8);
      return value.toString(16);
    });
  }

  function consentCategories() {
    return {
      analytics: readStorage(STORAGE.analytics) === 'true',
      marketing: readStorage(STORAGE.marketing) === 'true',
      external_media: readStorage(STORAGE.external) === 'true',
    };
  }

  function applyConsentToAnalytics() {
    let update = window.IJanickiAnalytics && window.IJanickiAnalytics.buildConsentUpdate
      ? window.IJanickiAnalytics.buildConsentUpdate()
      : null;

    if (!update) {
      const categories = consentCategories();
      update = {
        ad_user_data: categories.marketing ? 'granted' : 'denied',
        ad_personalization: categories.marketing ? 'granted' : 'denied',
        ad_storage: categories.marketing ? 'granted' : 'denied',
        analytics_storage: categories.analytics ? 'granted' : 'denied',
        functionality_storage: categories.external_media ? 'granted' : 'denied',
        personalization_storage: categories.external_media ? 'granted' : 'denied',
        security_storage: 'granted',
      };
    }

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () {
      window.dataLayer.push(arguments);
    };
    window.gtag('consent', 'update', update);
  }

  function buildConsentRecord(action) {
    const now = new Date().toISOString();
    const categories = consentCategories();
    const consentId = getOrCreateStoredValue(STORAGE.consentId, createUuid);
    const createdAt = getOrCreateStoredValue(STORAGE.consentCreatedAt, function () { return now; });
    const anonymousUserId = getOrCreateStoredValue(STORAGE.anonymousUserId, function () {
      return 'anon_' + createUuid();
    });

    writeStorage(STORAGE.consentUpdatedAt, now);

    return {
      consent_id: consentId,
      created_at: createdAt,
      updated_at: now,
      policy_version: COOKIE_POLICY_VERSION,
      essential: true,
      analytics: categories.analytics,
      marketing: categories.marketing,
      external_media: categories.external_media,
      action: action,
      anonymous_user_id: anonymousUserId,
      analytics_storage: categories.analytics ? 'granted' : 'denied',
      ad_storage: categories.marketing ? 'granted' : 'denied',
      ad_user_data: categories.marketing ? 'granted' : 'denied',
      ad_personalization: categories.marketing ? 'granted' : 'denied',
    };
  }

  function persistConsent(action) {
    const record = buildConsentRecord(action);
    const url = FIREBASE_RTDB_BASE + '/cookie_consents/' + record.anonymous_user_id + '/' + record.consent_id + '.json';

    fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
      keepalive: true,
    }).catch(function (error) {
      console.warn('Cookie consent RTDB write failed:', error);
    });
  }

  function categoryRow(id, title, description, checked, required) {
    const control = required
      ? '<span class="cookie-always-badge">Zawsze aktywne</span>'
      : '<label class="cookie-switch" aria-label="' + title + '">' +
          '<input class="cookie-checkbox" type="checkbox" id="' + id + '" ' + (checked ? 'checked' : '') + '>' +
          '<span class="cookie-switch-ui" aria-hidden="true"></span>' +
        '</label>';

    return '<div class="cookie-category-row">' +
      '<div class="cookie-category-info"><strong>' + title + '</strong><p>' + description + '</p></div>' +
      '<div>' + control + '</div>' +
    '</div>';
  }

  function renderBanner() {
    return '<div class="cookie-panel" data-cookie-view="banner">' +
      '<div class="cookie-header"><span class="cookie-icon" aria-hidden="true">🍪</span><h2>Pliki cookie</h2></div>' +
      '<p class="cookie-banner-text">Ta strona korzysta z niezbędnych plików cookies oraz — za Twoją zgodą — z cookies analitycznych, marketingowych i zewnętrznych. Możesz zaakceptować wszystkie, odrzucić opcjonalne albo dostosować ustawienia. <a href="/dokumenty/polityka-prywatnosci.html">Więcej informacji</a>.</p>' +
      '<div class="cookie-banner-actions">' +
        '<button class="cookie-btn" type="button" data-cookie-action="settings">Ustawienia</button>' +
        '<button class="cookie-btn" type="button" data-cookie-action="reject">Odrzucam opcjonalne</button>' +
        '<button class="cookie-btn cookie-btn-accept-all" type="button" data-cookie-action="all">Akceptuję wszystkie</button>' +
      '</div>' +
    '</div>';
  }

  function renderSettings() {
    return '<div class="cookie-panel" data-cookie-view="settings">' +
      '<div class="cookie-header"><span class="cookie-icon" aria-hidden="true">🍪</span><h2>Ustawienia plików cookie</h2></div>' +
      '<div class="cookie-categories">' +
        categoryRow('essential', 'Niezbędne', 'Techniczne cookies potrzebne do działania strony, bezpieczeństwa i zapamiętania zgód.', true, true) +
        categoryRow('analytics', 'Analityczne', 'Statystyki odwiedzin, źródła wejść i zachowanie na stronie.', readStorage(STORAGE.analytics) === 'true', false) +
        categoryRow('marketing', 'Marketingowe', 'Reklamy, remarketing i piksele reklamowe.', readStorage(STORAGE.marketing) === 'true', false) +
        categoryRow('external', 'Zewnętrzne / multimedialne', 'Osadzone filmy, mapy i treści społecznościowe.', readStorage(STORAGE.external) === 'true', false) +
      '</div>' +
      '<div class="cookie-docs-row">' +
        '<a class="cookie-doc-link" href="/dokumenty/regulamin.html">Regulamin witryny</a>' +
        '<a class="cookie-doc-link" href="/dokumenty/polityka-prywatnosci.html">Polityka prywatności</a>' +
        '<a class="cookie-doc-link" href="/dokumenty/polityka-rodo.html">Polityka RODO</a>' +
        '<a class="cookie-doc-link" href="/dokumenty/">Wszystkie dokumenty</a>' +
      '</div>' +
      '<div class="cookie-settings-actions">' +
        '<button class="cookie-btn" type="button" data-cookie-action="save">Zapisz ustawienia</button>' +
        '<button class="cookie-btn" type="button" data-cookie-action="reject">Odrzucam opcjonalne</button>' +
        '<button class="cookie-btn cookie-btn-accept-all" type="button" data-cookie-action="all">Akceptuję wszystkie</button>' +
      '</div>' +
    '</div>';
  }

  function showCookiePanel(view) {
    if (!cookieOverlay) return;
    cookieOverlay.innerHTML = view === 'settings' ? renderSettings() : renderBanner();
    cookieOverlay.hidden = false;
    cookieOverlay.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(function () {
      const firstButton = cookieOverlay.querySelector('button');
      if (firstButton) firstButton.focus();
    });
  }

  function closeCookiePanel() {
    if (!cookieOverlay) return;
    cookieOverlay.hidden = true;
    cookieOverlay.setAttribute('aria-hidden', 'true');
    cookieOverlay.innerHTML = '';
    if (cookieButton) cookieButton.focus();
  }

  function decideAll(accept) {
    const value = accept ? 'true' : 'false';
    writeStorage(STORAGE.decision, accept ? 'all' : 'essential');
    writeStorage(STORAGE.analytics, value);
    writeStorage(STORAGE.marketing, value);
    writeStorage(STORAGE.external, value);
    applyConsentToAnalytics();
    persistConsent(accept ? 'accept_all' : 'reject_all');
    if (accept && window.IJanickiAnalytics) window.IJanickiAnalytics.loadGA();
    closeCookiePanel();
  }

  function saveSettings() {
    const analytics = document.getElementById('analytics');
    const marketing = document.getElementById('marketing');
    const external = document.getElementById('external');
    writeStorage(STORAGE.decision, 'custom');
    writeStorage(STORAGE.analytics, analytics && analytics.checked ? 'true' : 'false');
    writeStorage(STORAGE.marketing, marketing && marketing.checked ? 'true' : 'false');
    writeStorage(STORAGE.external, external && external.checked ? 'true' : 'false');
    applyConsentToAnalytics();
    persistConsent('save_preferences');
    if (analytics && analytics.checked && window.IJanickiAnalytics) window.IJanickiAnalytics.loadGA();
    closeCookiePanel();
  }

  if (cookieButton) {
    cookieButton.addEventListener('click', function () {
      showCookiePanel('settings');
    });
  }

  if (cookieOverlay) {
    cookieOverlay.addEventListener('click', function (event) {
      const actionButton = event.target.closest('[data-cookie-action]');
      if (!actionButton) return;

      const action = actionButton.dataset.cookieAction;
      if (action === 'settings') showCookiePanel('settings');
      if (action === 'reject') decideAll(false);
      if (action === 'all') decideAll(true);
      if (action === 'save') saveSettings();
    });
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && cookieOverlay && !cookieOverlay.hidden && readStorage(STORAGE.decision)) {
      closeCookiePanel();
    }
  });

  if (!readStorage(STORAGE.decision)) {
    showCookiePanel('banner');
  }
})();
