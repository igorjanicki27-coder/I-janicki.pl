'use strict';

(function () {
  const MEASUREMENT_ID = 'G-XQDCV6ZK3S';
  const FIREBASE_PROJECT = 'i-janicki';
  const FIRESTORE_BASE =
    `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents`;
  const COOKIE_KEY = 'ijanek_cookie_analytics';
  const HOME_VISIT_KEY = 'ijanek_metric_home_visit_logged';
  const TUTORIAL_COMPLETE_KEY = 'ijanek_metric_tutorial_complete_logged';
  const HOME_PATHS = new Set(['/', '/index.html']);

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

    const fields = {
      type: { stringValue: type },
      path: { stringValue: window.location.pathname || '/' },
      timestamp: { timestampValue: new Date().toISOString() },
    };

    if (extraFields) {
      Object.entries(extraFields).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        fields[key] = { stringValue: String(value) };
      });
    }

    const res = await fetch(`${FIRESTORE_BASE}/analytics_events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });

    if (!res.ok) {
      throw new Error(`Firestore analytics write failed: ${res.status}`);
    }

    return true;
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

  window.IJanickiAnalytics = {
    config: {
      measurementId: MEASUREMENT_ID,
      firestoreBase: FIRESTORE_BASE,
    },
    hasAnalyticsConsent,
    loadGA,
    maybeTrackHomeVisit,
    trackTutorialComplete,
    trackAnalyticsEvent,
  };

  window.hasAnalyticsConsent = hasAnalyticsConsent;
  window.loadGA = loadGA;
  window.maybeTrackHomeVisit = maybeTrackHomeVisit;
  window.trackTutorialComplete = trackTutorialComplete;
  window.trackAnalyticsEvent = trackAnalyticsEvent;

  if (hasAnalyticsConsent()) {
    loadGA();
    maybeTrackHomeVisit();
  }
})();
