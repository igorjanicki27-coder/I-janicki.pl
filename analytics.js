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
  const COOKIE_KEY = 'ijanek_cookie_analytics';
  const HOME_VISIT_KEY = 'ijanek_metric_home_visit_logged';
  const TUTORIAL_COMPLETE_KEY = 'ijanek_metric_tutorial_complete_logged';
  const HOME_PATHS = new Set(['/', '/index.html']);
  const sessionStartedAt = Date.now();
  let sessionDurationSent = false;
  let firebaseApp = null;
  let firebaseSDKPromise = null;

  // Dynamicznie załaduj Firebase SDK (102KB) dopiero gdy będzie potrzebny
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

  function hasAnalyticsConsent() {
    try {
      return localStorage.getItem(COOKIE_KEY) === 'true';
    } catch (_) {
      return false;
    }
  }

  function isHomePath() {
    return HOME_PATHS.has(window.location.pathname || '/');
  }

  function loadGA() {
    if (!hasAnalyticsConsent()) return false;
    if (window._gaLoaded) return true;

    window._gaLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() {
      window.dataLayer.push(arguments);
    };

    const gaScript = document.createElement('script');
    gaScript.async = true;
    gaScript.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
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
    } catch (_) {
      // Ignore storage issues and continue best-effort.
    }

    try {
      const result = await writer();
      try {
        sessionStorage.setItem(storageKey, 'true');
      } catch (_) {
        // Ignore storage issues.
      }
      return result;
    } catch (err) {
      try {
        sessionStorage.removeItem(storageKey);
      } catch (_) {
        // Ignore storage issues.
      }
      console.warn('Analytics event error:', err);
      return false;
    }
  }

  function maybeTrackHomeVisit() {
    if (!hasAnalyticsConsent() || !isHomePath()) return Promise.resolve(false);

    // Na mobile - nie wysyłaj home_visit eager, czekaj na user interaction
    // To oszczędza Firebase SDK ładowania na initial load
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) {
      // Wyślij event dopiero gdy user zacznie interakcjonować
      const trackOnInteraction = () => {
        oncePerSession(HOME_VISIT_KEY, () =>
          writeAnalyticsEvent('page_visit', {
            page: 'home',
            source: 'user_interaction',
          })
        );
        document.removeEventListener('click', trackOnInteraction);
        document.removeEventListener('scroll', trackOnInteraction);
      };
      document.addEventListener('click', trackOnInteraction, { once: true });
      document.addEventListener('scroll', trackOnInteraction, { once: true, passive: true });
      return Promise.resolve(false);
    }

    return oncePerSession(HOME_VISIT_KEY, () =>
      writeAnalyticsEvent('page_visit', {
        page: 'home',
        source: 'home_entry',
      })
    );
  }

  function trackTutorialComplete() {
    if (!hasAnalyticsConsent()) return Promise.resolve(false);

    loadGA();
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'tutorial_complete');
    }

    return oncePerSession(TUTORIAL_COMPLETE_KEY, () =>
      writeAnalyticsEvent('tutorial_complete', {
        page: 'home',
        source: 'finish_button',
      })
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

    writeAnalyticsEvent('session_duration', {
      page: 'home',
      source: 'session_end',
      durationSeconds,
    }).catch((err) => {
      console.warn('Analytics duration fallback error:', err);
    });

    return true;
  }

  window.IJanickiAnalytics = {
    config: {
      measurementId: MEASUREMENT_ID,
      firebaseConfig: FIREBASE_CONFIG,
    },
    hasAnalyticsConsent,
    loadGA,
    maybeTrackHomeVisit,
    trackTutorialComplete,
    trackAnalyticsEvent,
    maybeTrackSessionDuration,
  };

  window.hasAnalyticsConsent = hasAnalyticsConsent;
  window.loadGA = loadGA;
  window.maybeTrackHomeVisit = maybeTrackHomeVisit;
  window.trackTutorialComplete = trackTutorialComplete;
  window.trackAnalyticsEvent = trackAnalyticsEvent;
  window.maybeTrackSessionDuration = maybeTrackSessionDuration;

  if (hasAnalyticsConsent()) {
    // Załaduj Firebase SDK asynchronicznie w tle (nie blokuje initial load)
    ensureFirebaseApp().catch(err => {
      console.warn('Analytics initialization error:', err);
    });
    loadGA();
    maybeTrackHomeVisit();
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
