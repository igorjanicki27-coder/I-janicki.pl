'use strict';

(function () {
  const MEASUREMENT_ID = 'G-XQDCV6ZK3S';
  const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyDnBGZh-HSHx2gqFm78S7p86coHk25u0xc',
    authDomain: 'i-janicki.firebaseapp.com',
    projectId: 'i-janicki',
    storageBucket: 'i-janicki.firebasestorage.app',
    messagingSenderId: '745361888690',
    appId: '1:745361888690:web:1af2df4ddf8fe7b4d600ab',
  };

  // Storage keys — jedna decyzja + osobne zgody per kategoria
  const KEY_DECISION   = 'ijanek_cookie_decision';   // 'all' | 'essential' | 'custom' | null (brak)
  const KEY_ANALYTICS  = 'ijanek_cookie_analytics';  // 'true' | 'false'
  const KEY_MARKETING  = 'ijanek_cookie_marketing';  // 'true' | 'false'
  const KEY_EXTERNAL   = 'ijanek_cookie_external';   // 'true' | 'false'

  const HOME_VISIT_KEY = 'ijanek_metric_home_visit_logged';
  const TUTORIAL_COMPLETE_KEY = 'ijanek_metric_tutorial_complete_logged';
  const HOME_PATHS = new Set(['/', '/index.html']);

  function isHomePath() {
    return HOME_PATHS.has(window.location.pathname || '/');
  }

  const sessionStartedAt = Date.now();
  let sessionDurationSent = false;
  let firebaseApp = null;
  let firebaseSDKPromise = null;

  // ════════════════════════════════════════════════════════════════
  // Consent helpers
  // ════════════════════════════════════════════════════════════════
  function hasDecision() {
    try { return localStorage.getItem(KEY_DECISION) !== null; } catch (_) { return false; }
  }

  function isConsentTrue(key) {
    try { return localStorage.getItem(key) === 'true'; } catch (_) { return false; }
  }

  function hasAnalyticsConsent() { return isConsentTrue(KEY_ANALYTICS); }
  function hasMarketingConsent()  { return isConsentTrue(KEY_MARKETING); }
  function hasExternalConsent()   { return isConsentTrue(KEY_EXTERNAL); }

  function buildConsentUpdate() {
    return {
      'ad_user_data':          hasMarketingConsent() ? 'granted' : 'denied',
      'ad_personalization':    hasMarketingConsent() ? 'granted' : 'denied',
      'ad_storage':            hasMarketingConsent() ? 'granted' : 'denied',
      'analytics_storage':     hasAnalyticsConsent() ? 'granted' : 'denied',
      'functionality_storage': hasExternalConsent()  ? 'granted' : 'denied',
      'personalization_storage': hasExternalConsent()  ? 'granted' : 'denied',
      'security_storage':      'granted', // zawsze — niezbędne
    };
  }

  // ════════════════════════════════════════════════════════════════
  // Consent Mode v2 — domyślna odmowa NATYCHMIAST (przed gtag.js)
  // ════════════════════════════════════════════════════════════════
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() {
    window.dataLayer.push(arguments);
  };

  window.gtag('consent', 'default', {
    'ad_user_data': 'denied',
    'ad_personalization': 'denied',
    'ad_storage': 'denied',
    'analytics_storage': 'denied',
    'functionality_storage': 'denied',
    'personalization_storage': 'denied',
    'security_storage': 'granted',
    'wait_for_update': 500,
  });

  // Jeśli zgoda już udzielona wcześniej — natychmiast zaktualizuj
  if (hasDecision()) {
    window.gtag('consent', 'update', buildConsentUpdate());
  }

  // ════════════════════════════════════════════════════════════════
  // Dynamiczne ładowanie Firebase SDK (tylko gdy potrzebne)
  // ════════════════════════════════════════════════════════════════
  function loadFirebaseSDK() {
    if (firebaseSDKPromise) return firebaseSDKPromise;
    if (window.firebase && typeof window.firebase.initializeApp === 'function') {
      return Promise.resolve();
    }

    firebaseSDKPromise = Promise.all([
      new Promise(resolve => {
        const s = document.createElement('script');
        s.src = 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app-compat.js';
        s.onload = resolve;
        document.head.appendChild(s);
      }),
      new Promise(resolve => {
        const s = document.createElement('script');
        s.src = 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore-compat.js';
        s.onload = resolve;
        document.head.appendChild(s);
      })
    ]);
    return firebaseSDKPromise;
  }

  async function ensureFirebaseApp() {
    await loadFirebaseSDK();
    if (!window.firebase || typeof window.firebase.initializeApp !== 'function') {
      throw new Error('Firebase SDK is not available.');
    }

    if (firebaseApp) return firebaseApp;
    firebaseApp = window.firebase.apps.length
      ? window.firebase.app()
      : window.firebase.initializeApp(FIREBASE_CONFIG);
    return firebaseApp;
  }

  // ════════════════════════════════════════════════════════════════
  // GA — ładuje się TYLKO gdy jest zgoda analityczna
  // ════════════════════════════════════════════════════════════════
  function loadGA() {
    if (!hasAnalyticsConsent()) return false;
    if (window._gaLoaded) return true;

    window._gaLoaded = true;

    const gaScript = document.createElement('script');
    gaScript.async = true;
    gaScript.src = 'https://www.googletagmanager.com/gtag/js?id=' + MEASUREMENT_ID;
    document.head.appendChild(gaScript);

    window.gtag('js', new Date());
    window.gtag('config', MEASUREMENT_ID);
    return true;
  }

  async function writeAnalyticsEvent(type, extraFields) {
    if (!hasAnalyticsConsent()) return false;
    try {
      const app = await ensureFirebaseApp();
      const firestore = window.firebase.firestore(app);
      const payload = {
        type,
        path: window.location.pathname || '/',
        timestamp: new Date(),
      };

      if (extraFields) {
        Object.entries(extraFields).forEach(([key, value]) => {
          if (value === undefined || value === null) return;
          payload[key] = value;
        });
      }

      await firestore.collection('analytics_events').add(payload);
      return true;
    } catch (err) {
      console.warn('Analytics event write failed:', err);
      return false;
    }
  }

  async function oncePerSession(storageKey, writer) {
    try {
      if (sessionStorage.getItem(storageKey) === 'true') return false;
      sessionStorage.setItem(storageKey, 'pending');
    } catch (_) { /* ignore */ }

    try {
      const result = await writer();
      try { sessionStorage.setItem(storageKey, 'true'); } catch (_) { /* ignore */ }
      return result;
    } catch (err) {
      try { sessionStorage.removeItem(storageKey); } catch (_) { /* ignore */ }
      console.warn('Analytics event error:', err);
      return false;
    }
  }

  function maybeTrackHomeVisit() {
    if (!hasAnalyticsConsent() || !isHomePath()) return Promise.resolve(false);

    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) {
      const trackOnInteraction = () => {
        oncePerSession(HOME_VISIT_KEY, () =>
          writeAnalyticsEvent('page_visit', { page: 'home', source: 'user_interaction' })
        );
        document.removeEventListener('click', trackOnInteraction);
        document.removeEventListener('scroll', trackOnInteraction);
      };
      document.addEventListener('click', trackOnInteraction, { once: true });
      document.addEventListener('scroll', trackOnInteraction, { once: true, passive: true });
      return Promise.resolve(false);
    }

    return oncePerSession(HOME_VISIT_KEY, () =>
      writeAnalyticsEvent('page_visit', { page: 'home', source: 'home_entry' })
    );
  }

  function trackTutorialComplete() {
    if (!hasAnalyticsConsent()) return Promise.resolve(false);

    loadGA();
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'tutorial_complete');
    }

    return oncePerSession(TUTORIAL_COMPLETE_KEY, () =>
      writeAnalyticsEvent('tutorial_complete', { page: 'home', source: 'finish_button' })
    );
  }

  function trackAnalyticsEvent(name, params) {
    if (!hasAnalyticsConsent()) return false;
    loadGA();
    if (typeof window.gtag === 'function') {
      window.gtag('event', name, params || {});
    }
    return true;
  }

  function maybeTrackSessionDuration() {
    if (!hasAnalyticsConsent() || !isHomePath() || sessionDurationSent) return false;

    const durationSeconds = Math.max(1, Math.round((Date.now() - sessionStartedAt) / 1000));
    sessionDurationSent = true;

    loadGA();
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'session_duration', { durationSeconds });
    }

    return true;
  }

  // ════════════════════════════════════════════════════════════════
  // Public API
  // ════════════════════════════════════════════════════════════════
  window.IJanickiAnalytics = {
    config: { measurementId: MEASUREMENT_ID, firebaseConfig: FIREBASE_CONFIG },
    hasDecision,
    hasAnalyticsConsent,
    hasMarketingConsent,
    hasExternalConsent,
    buildConsentUpdate,
    loadGA,
    maybeTrackHomeVisit,
    trackTutorialComplete,
    trackAnalyticsEvent,
    maybeTrackSessionDuration,
  };

  // Legacy exports
  window.hasAnalyticsConsent = hasAnalyticsConsent;
  window.loadGA = loadGA;
  window.maybeTrackHomeVisit = maybeTrackHomeVisit;
  window.trackTutorialComplete = trackTutorialComplete;
  window.trackAnalyticsEvent = trackAnalyticsEvent;
  window.maybeTrackSessionDuration = maybeTrackSessionDuration;

  // Jeśli zgoda już udzielona — załaduj GA (lekkie), Firebase dopiero na demand
  if (hasAnalyticsConsent()) {
    loadGA();
  }

  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      maybeTrackSessionDuration();
    }
  });

  window.addEventListener('pagehide', () => {
    maybeTrackSessionDuration();
  });
})();
