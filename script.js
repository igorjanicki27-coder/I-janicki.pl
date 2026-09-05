/* ══════════════════════════════════════════════════════════════════
   i-JANICKI — script.js  v2.0
   Tutorial · Eye-tracking · Firebase reviews · Cookie consent
   ══════════════════════════════════════════════════════════════════ */

'use strict';

// ─────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────
const FIREBASE_PROJECT = 'i-janicki';
const FIRESTORE_BASE   = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents`;
const FIREBASE_RTDB_BASE = 'https://i-janicki-default-rtdb.europe-west1.firebasedatabase.app';
const EMAILJS_SERVICE  = 'service_0m7ieum';
const EMAILJS_TEMPLATE = 'template_gd8aaq5';
const EMAILJS_KEY      = 'BugGXsqvUvMyP4buf';
const OWNER_EMAIL      = 'kontakt@i-janicki.pl';
const WEB3FORMS_KEY    = 'e1b3a82b-63d0-4f05-a808-676a7b22537a';
const COOKIE_POLICY_VERSION = '1.2';

// ─────────────────────────────────────────────────────────────────
// STORAGE KEYS
// ─────────────────────────────────────────────────────────────────
const LS = {
  NAME:             'ijanek_name',
  COOKIE_DECISION:  'ijanek_cookie_decision',
  COOKIE_ANALYTICS: 'ijanek_cookie_analytics',
  COOKIE_MARKETING: 'ijanek_cookie_marketing',
  COOKIE_EXTERNAL:  'ijanek_cookie_external',
  COOKIE_CONSENT_ID: 'ijanek_cookie_consent_id',
  COOKIE_CONSENT_CREATED_AT: 'ijanek_cookie_consent_created_at',
  COOKIE_CONSENT_UPDATED_AT: 'ijanek_cookie_consent_updated_at',
  ANONYMOUS_USER_ID: 'ijanek_anonymous_user_id',
  TUTORIAL_DONE:    'ijanek_tutorial_done',
  THEME:            'ijanek_theme',
  LANG:             'ijanek_lang',
};
const SS = { SECTION: 'ijanek_active_section' };

// ─────────────────────────────────────────────────────────────────
// TUTORIAL STEPS
// 0:cookies(only 1st-visit)  1:greeting  2:name  3-8:sections  9:reviews
// ─────────────────────────────────────────────────────────────────
const STEPS = [
  { id: 'cookies'                                             },  // 0 — pierwszy krok tylko przy pierwszej wizycie
  { id: 'greeting'                                            },  // 1 (lang+theme inside)
  { id: 'name'                                                },  // 2
  { id: 'about',    topic: 'about',    label: 'O mnie'       },  // 3
  { id: 'services', topic: 'services', label: 'Usługi'       },  // 4
  { id: 'projects', topic: 'projects', label: 'Projekty'     },  // 5
  { id: 'process',  topic: 'process',  label: 'Współpraca'   },  // 6
  { id: 'pricing',  topic: 'pricing',  label: 'Cennik'       },  // 7
  { id: 'contact',  topic: 'contact',  label: 'Kontakt'      },  // 8
  { id: 'reviews'                                             },  // 9
];

const FIRST_SECTION = 3;
const LAST_SECTION  = 8;
const REVIEWS_STEP  = 9;

// Helper function to get the effective steps array (filtered if cookies decided)
function getSteps() {
  return window.FILTERED_STEPS || STEPS;
}

// Helper function to find step index by ID
function getStepIndex(stepId) {
  const steps = getSteps();
  return steps.findIndex(s => s.id === stepId);
}

// ─────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────
let tutStep      = 0;
let userName     = localStorage.getItem(LS.NAME) || '';
let tutDone      = localStorage.getItem(LS.TUTORIAL_DONE) === 'true';
let reviewRating = 0;
let visitedSteps = new Set(); // Track which steps user has visited
let currentView = null;
let currentDocName = null;
let cookieTutorialView = 'banner'; // 'banner' | 'settings' — stan panelu cookies w tutorialu

// ─────────────────────────────────────────────────────────────────
// DOM REFS (lazy getters so we don't need to worry about order)
// ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const dom = {
  get bot()            { return $('bot');                   },
  get botSvg()         { return $('botSvg');                },
  get pupilL()         { return $('pupilL');                },
  get pupilR()         { return $('pupilR');                },
  get shineL()         { return $('shineL');                },
  get shineR()         { return $('shineR');                },
  get panelHeader()    { return $('panelHeader');           },
  get panelTitle()     { return $('panelTitle');            },
  get panelContent()   { return $('panelContent');          },
  get tutNav()         { return $('tutorialNav');           },
  get tutBack()        { return $('tutBack');               },
  get tutSkip()        { return $('tutSkip');               },
  get tutNext()        { return $('tutNext');               },
  get tutProgress()    { return $('tutorialProgress');      },
  get tutDots()        { return $('tutProgressSteps');      },
  get sectionNav()     { return $('sectionNav');            },
  get modalRoot()      { return $('modalRoot');             },
  get modalBody()      { return $('modalBody');             },
  get cookieOverlay()  { return $('cookieOverlay');         },
  get docOverlay()     { return $('docOverlay');            },
  get docContent()     { return $('docContent');            },
  get docTitle()       { return $('docTitle');              },
  get reviewForm()     { return $('modalReviewForm');       },
  get reviewStatus()   { return $('modalReviewStatus');     },
  get starPicker()     { return $('modalStarPicker');       },
  get themeToggle()    { return $('themeToggle');           },
  get year()           { return $('year');                  },
  get brandName()      { return document.querySelector('.brand-name'); },
};

// ─────────────────────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  dom.year.textContent = new Date().getFullYear();
  initTheme();
  initLang();
  initEyeTracking();
  initGlobalClick();
  initCookiePanel();
  initDocViewer();
  initCursor();
  registerSW();
  handleApproveReview();

  // Opóźnij tutorial do następnej klatki (requestAnimationFrame)
  // Tutorial zawiera 1000+ DOM mutacji - nie blokuj initial render
  requestAnimationFrame(() => {
    // Tutorial wymaga panelu — na podstronach bez panelu pomijamy
    if (!$('panel')) return;
    if (tutDone) {
      showReturning();
    } else {
      startTutorial();
    }
  });

  // Nie wysyłaj home_visit event - oszczędza 102KB Firebase SDK na initial load
  // Firebase załaduje się dopiero gdy user wyśle inny event (tutorial_complete, review, itp)
});

// ─────────────────────────────────────────────────────────────────
// THEME
// ─────────────────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem(LS.THEME);
  applyTheme(saved ? saved === 'dark' : true);
}

function applyTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

// ─────────────────────────────────────────────────────────────────
// LANG (PL default; EN translations)
// ─────────────────────────────────────────────────────────────────
const TRANSLATIONS = {
  pl: {
    'btn-about': 'O mnie',
    'btn-services': 'Usługi',
    'btn-projects': 'Projekty',
    'btn-process': 'Współpraca',
    'btn-pricing': 'Cennik',
    'btn-contact': 'Kontakt',
    'btn-reviews': 'Opinie',
    'btn-tutorial': 'Prezentacja',
    'greeting-title': 'i-JANEK',
    'greeting-text': '<h1 class="panel-seo-h1">Strony internetowe i aplikacje webowe na zamówienie</h1><p>Cześć! Jestem <strong>i-JANEK</strong> — Twój wirtualny asystent.</p><p>Skonfiguruj kilka preferencji, a potem wyruszamy w podróż po ofercie <strong>i-JANICKI</strong>!</p>',
    'greeting-ready': 'Gotowy? Kliknij <em>Dalej</em>! 🚀',
    'lang-label': '🌐 Język',
    'lang-pl': '🇵🇱 PL',
    'lang-en': '🇬🇧 EN',
    'theme-label': '🎨 Motyw',
    'theme-dark': '🌙 Ciemny',
    'theme-light': '☀ Jasny',
    'name-prompt': 'Jak mam się do Ciebie zwracać?',
    'name-placeholder': 'Wpisz swoje imię…',
    'next-btn': 'Dalej →',
    'finish-btn': 'Zakończ',
    'skip-btn': 'Pomiń',
    'send-btn': 'Wyślij →',
    'brand-home': 'Strona główna i-JANICKI',
    'assistant-panel': 'Asystent i-JANEK',
    'section-content': 'Treść sekcji',
    'cookie-settings-title': 'Ustawienia plików cookie',
    'cookie-settings-change': 'Zmień ustawienia cookies',
    'close': 'Zamknij',
    'close-doc': 'Zamknij dokument',
    'close-faq': 'Zamknij FAQ',
    'doc-overlay': 'Dokument',
    'doc-title-default': 'Dokument',
    'doc-loading': 'Ładowanie dokumentu…',
    'doc-load-error': 'Nie można załadować dokumentu.',
    'tutorial-step': 'Krok {number}',
    'cookie-title': 'Pliki cookie 🍪',
    'cookie-banner-text': 'Ta strona korzysta z plików cookies niezbędnych do prawidłowego działania oraz — za Twoją zgodą — z cookies analitycznych i marketingowych. Możesz zaakceptować wszystkie, odrzucić opcjonalne albo dostosować ustawienia. <span class="cookie-doc-link">Więcej informacji: <a href="./dokumenty/index.html" target="_blank" rel="noopener">Dokumenty</a></span>',
    'cookie-settings-title-panel': 'Ustawienia plików cookie',
    'cookie-accept-all': 'Akceptuję wszystkie',
    'cookie-reject-optional': 'Odrzucam opcjonalne',
    'cookie-settings-btn': 'Ustawienia',
    'cookie-save-settings': 'Zapisz ustawienia',
    'cookie-essential-title': 'Niezbędne',
    'cookie-essential-desc': 'Zawsze aktywne. Techniczne cookies potrzebne do działania strony, bezpieczeństwa, formularzy i zapamiętania zgód.',
    'cookie-analytics-title': 'Analityczne',
    'cookie-analytics-desc': 'Opcjonalne. Np. Google Analytics, statystyki odwiedzin, źródła wejść, zachowanie na stronie.',
    'cookie-marketing-title': 'Marketingowe',
    'cookie-marketing-desc': 'Opcjonalne. Np. Google Ads, remarketing, piksele reklamowe.',
    'cookie-external-title': 'Zewnętrzne / multimedialne',
    'cookie-external-desc': 'Opcjonalne. Np. YouTube, Google Maps, osadzone treści społecznościowe.',
    'cookie-always-on': 'Zawsze aktywne',
    'cookie-doc-regulamin': 'Regulamin witryny',
    'cookie-doc-privacy': 'Polityka prywatności',
    'cookie-doc-rodo': 'Polityka RODO',
    'cookie-doc-all-docs': 'Wszystkie dokumenty',
    'name-title': 'Jak mam się do Ciebie zwracać?',
    'about-photo-alt': 'Igor Janicki',
    'about-handle': '@i-janicki · Środa Śląska i okolice',
    'about-lead': 'Tworzę strony internetowe i aplikacje webowe na zamówienie, pomagam w konfiguracji sieci i oferuję bieżącą opiekę IT. Pracuję zarówno z klientami lokalnymi, jak i zdalnie.',
    'about-li-web': 'Strony internetowe na zamówienie',
    'about-li-apps': 'Aplikacje webowe i mobilne na zamówienie',
    'about-li-network': 'Konfiguracja sieci i administracja',
    'about-li-support': 'Wsparcie i opieka IT',
    'services-design-title': 'Projektowanie i Marketing',
    'services-design-desc': 'Projektuję logo, ikony i materiały firmowe. Przygotowuję między innymi banery i wizytówki, dbając o spójny wizerunek marki.',
    'services-web-title': 'Strony internetowe',
    'services-web-desc': 'Projektuję i wdrażam strony na zamówienie — od wizytówek po rozbudowane portale. Responsywne, szybkie, zoptymalizowane pod SEO.',
    'services-webapps-title': 'Aplikacje',
    'services-webapps-desc': 'Tworzę aplikacje webowe i mobilne. Integruję je ze stronami lub innymi aplikacjami.',
    'services-mobile-title': 'SEO',
    'services-mobile-desc': 'Optymalizuję strony i rozwijam treści, aby zwiększać ich widoczność na właściwe zapytania.',
    'services-network-title': 'Konfiguracja sieci',
    'services-network-desc': 'Projektuję i konfiguruję sieci LAN/WLAN, VPN i systemy bezpieczeństwa sieciowego.',
    'services-it-title': 'Opieka IT',
    'services-it-desc': 'Bieżące wsparcie techniczne, aktualizacje i monitoring systemów — abonamentowo.',
    'projects-web-title': 'Strony internetowe',
    'projects-strzelca-desc': 'Portal strzelecki — aktualności, wyniki zawodów i regulaminy.',
    'projects-dmg-desc': 'Serwis z aplikacjami i narzędziami dedykowanymi na macOS.',
    'projects-korona-desc': 'Strona dla lokalnej marki wina i restauracji.',
    'projects-elmet-desc': 'Strona firmowa dla ELMET — usługi ślusarskie, CNC i obróbka metali we Wrocławiu.',
    'projects-apps-title': 'Aplikacje',
    'projects-myip-desc': 'Aplikacja macOS — publiczny adres IP i informacje o sieci.',
    'process-step1-title': 'Wstępna rozmowa',
    'process-step1-desc': 'Omawiamy Twoje potrzeby, cel projektu i zakres prac. Możemy porozmawiać przez telefon, e-mail lub Zoom.',
    'process-step2-title': 'Wycena i umowa',
    'process-step2-desc': 'Przygotowuję wycenę i propozycję umowy. Ustalamy harmonogram i zakres — bez niespodzianek.',
    'process-step3-title': 'Realizacja',
    'process-step3-desc': 'Pracuję etapami, regularnie raportując postęp i konsultując kluczowe decyzje.',
    'process-step4-title': 'Testy i poprawki',
    'process-step4-desc': 'Testuję projekt na różnych urządzeniach i przeglądarkach. Wprowadzam poprawki według Twoich uwag.',
    'process-step5-title': 'Wdrożenie i wsparcie',
    'process-step5-desc': 'Przekazuję gotowy projekt i oferuję wsparcie po wdrożeniu oraz dalszą opiekę IT.',
    'pricing-lead': 'Orientacyjne ceny — każdy projekt wyceniam indywidualnie.',
    'pricing-from': 'od',
    'pricing-web-title': 'Strona internetowa',
    'pricing-web-desc': 'Strona wizytówkowa lub portfolio. Responsywna, szybka, zoptymalizowana pod SEO.',
    'pricing-app-title': 'Aplikacja',
    'pricing-app-desc': 'Panel, system, aplikacja z logiką biznesową i bazą danych.',
    'pricing-network-title': 'Sieć / Administracja',
    'pricing-network-desc': 'Projekt i konfiguracja sieci, VPN, bezpieczeństwo.',
    'pricing-it-title': 'Opieka IT (abonament)',
    'pricing-it-desc': 'Bieżące wsparcie, monitoring, aktualizacje.',
    'pricing-note': 'Podane ceny są orientacyjne — każdy projekt wyceniam indywidualnie po wstępnej rozmowie.',
    'contact-lead': 'Napisz do mnie — odpowiem możliwie szybko.',
    'contact-name-label': 'Nadawca',
    'contact-name-placeholder': 'Imię lub pseudonim',
    'contact-email-label': 'E-mail / nr tel',
    'contact-email-placeholder': 'e-mail lub numer telefonu',
    'contact-message-label': 'Wiadomość',
    'contact-message-placeholder': 'Opisz swój projekt lub zapytanie…',
    'contact-submit': 'WYŚLIJ',
    'contact-wait': '✗ Poczekaj jeszcze {seconds}s przed kolejnym wysłaniem.',
    'contact-invalid': '✗ Podaj poprawny adres e-mail lub numer telefonu.',
    'contact-sending': 'Wysyłanie…',
    'contact-sent': '✓ Wiadomość wysłana! Odpiszę możliwie szybko.',
    'contact-error': '✗ Coś poszło nie tak. Napisz bezpośrednio na kontakt@i-janicki.pl',
    'reviews-lead': 'Tu możesz przeczytać opinie dotychczasowych klientów.',
    'reviews-loading': 'Ładowanie opinii…',
    'reviews-empty': 'Brak opinii — bądź pierwszy! ⬆',
    'reviews-error': 'Nie udało się załadować opinii.',
    'reviews-anonymous': 'Anonimowy',
    'reviews-form-title': 'Zostaw opinię',
    'reviews-stars-label': 'Wybierz ocenę',
    'reviews-star-1': '1 gwiazdka',
    'reviews-star-2': '2 gwiazdki',
    'reviews-star-3': '3 gwiazdki',
    'reviews-star-4': '4 gwiazdki',
    'reviews-star-5': '5 gwiazdek',
    'reviews-name-placeholder': 'Twoje imię',
    'reviews-email-placeholder': 'E-mail (weryfikacja — nie będzie widoczny)',
    'reviews-comment-placeholder': 'Twoja opinia…',
    'reviews-submit': 'WYŚLIJ OPINIĘ',
    'reviews-choose-rating': 'Wybierz ocenę (1–5 gwiazdek).',
    'reviews-invalid-name': 'Imię musi mieć co najmniej 3 znaki.',
    'reviews-invalid-email': 'Podaj poprawny adres e-mail (potrzebny do weryfikacji).',
    'reviews-invalid-comment': 'Napisz krótką opinię (min. 5 znaków).',
    'reviews-checking': 'Sprawdzanie…',
    'reviews-sending': 'Wysyłanie…',
    'reviews-success': '✓ Dziękuję! Potwierdź link w e-mailu, aby opublikować opinię.',
    'reviews-submit-error': '✗ Coś poszło nie tak. Spróbuj ponownie.',
    'reviews-already-submitted': '✗ Już wysłałeś opinię. Każdy e-mail może wysłać tylko jedną opinię.',
    'reviews-wait-days': '✗ Czekaj {days} dni na następną próbę (poprzednia opinia czeka na weryfikację).',
    'reviews-wait-hours': '✗ Czekaj jeszcze {hours}h na następną opinię.',
    'returning-title': 'Witaj ponownie!',
    'returning-message': 'Witaj ponownie, <strong>{name}</strong>! Jak pewnie pamiętasz, jestem <strong>i-JANEK</strong>. W czym mogę Ci pomóc?',
    'returning-message-no-name': 'Witaj ponownie! Jak pewnie pamiętasz, jestem <strong>i-JANEK</strong>. W czym mogę Ci pomóc?',
    'tutorial-complete-title': 'To już jest koniec!',
    'tutorial-complete-message-with-name': 'Świetnie! Masz już ogólny pogląd na to, czym się zajmuję, <strong>{name}</strong>.',
    'tutorial-complete-message-no-name': 'Masz już ogólny pogląd na to, czym się zajmuję.',
    'tutorial-complete-next': 'Klikając w sekcje poniżej, możesz wrócić do interesujących Cię informacji albo jeszcze raz przejść samouczek.',
    'tutorial-summary-title': 'Witaj ponownie!',
    'tutorial-summary-message': '{name}, prowadziłem Cię po wszystkich zakładkach, jakie możesz znaleźć na tej stronie. Jeśli chcesz do czegoś wrócić, wybierz temat poniżej, a jeśli chcesz abym oprowadził Cię po stronie ponownie, kliknij Prezentacja!',
    'review-step-message': 'Mamy prawie koniec{name}! ⭐ Chcesz wystawić opinię lub zobaczyć, co piszą inni?',
    'faq-aria': 'FAQ — Często zadawane pytania',
    'faq-subtitle': 'Często zadawane pytania',
    'verify-success': '✓ Opinia potwierdzona! Dzięki za opinię 🎉',
    'verify-error': '✗ Nie udało się zweryfikować opinii.',
  },
  en: {
    'btn-about': 'About',
    'btn-services': 'Services',
    'btn-projects': 'Projects',
    'btn-process': 'Collaboration',
    'btn-pricing': 'Pricing',
    'btn-contact': 'Contact',
    'btn-reviews': 'Reviews',
    'btn-tutorial': 'Tutorial',
    'greeting-title': 'i-JANEK',
    'greeting-text': '<p>Hello! I\'m <strong>i-JANEK</strong> — your virtual assistant.</p><h1 class="panel-seo-h1">Custom websites and web applications</h1><p>I\'ll help you learn more about <strong>i-JANICKI</strong> services.</p>',
    'greeting-ready': 'Ready? Click <em>Next</em>! 🚀',
    'lang-label': '🌐 Language',
    'lang-pl': '🇵🇱 PL',
    'lang-en': '🇬🇧 EN',
    'theme-label': '🎨 Theme',
    'theme-dark': '🌙 Dark',
    'theme-light': '☀ Light',
    'name-prompt': 'What\'s your name?',
    'name-placeholder': 'Type your name…',
    'next-btn': 'Next →',
    'finish-btn': 'Finish',
    'skip-btn': 'Skip',
    'send-btn': 'Send →',
    'brand-home': 'i-JANICKI home page',
    'assistant-panel': 'i-JANEK assistant',
    'section-content': 'Section content',
    'cookie-settings-title': 'Cookie settings',
    'cookie-settings-change': 'Change cookie settings',
    'close': 'Close',
    'close-doc': 'Close document',
    'close-faq': 'Close FAQ',
    'doc-overlay': 'Document',
    'doc-title-default': 'Document',
    'doc-loading': 'Loading document…',
    'doc-load-error': 'Unable to load the document.',
    'tutorial-step': 'Step {number}',
    'cookie-title': 'Cookies 🍪',
    'cookie-banner-text': 'This site uses cookies essential for proper functioning and — with your consent — analytical and marketing cookies. You can accept all, reject optional ones, or customize settings. <span class="cookie-doc-link">More info: <a href="./dokumenty/index.html" target="_blank" rel="noopener">Documents</a></span>',
    'cookie-settings-title-panel': 'Cookie settings',
    'cookie-accept-all': 'Accept all',
    'cookie-reject-optional': 'Reject optional',
    'cookie-settings-btn': 'Settings',
    'cookie-save-settings': 'Save settings',
    'cookie-essential-title': 'Essential',
    'cookie-essential-desc': 'Always active. Technical cookies needed for site operation, security, forms and consent storage.',
    'cookie-analytics-title': 'Analytics',
    'cookie-analytics-desc': 'Optional. E.g. Google Analytics, visit statistics, traffic sources, on-site behavior.',
    'cookie-marketing-title': 'Marketing',
    'cookie-marketing-desc': 'Optional. E.g. Google Ads, remarketing, advertising pixels.',
    'cookie-external-title': 'External / media',
    'cookie-external-desc': 'Optional. E.g. YouTube, Google Maps, embedded social content.',
    'cookie-always-on': 'Always active',
    'cookie-doc-regulamin': 'Website rules',
    'cookie-doc-privacy': 'Privacy & cookies policy',
    'cookie-doc-rodo': 'GDPR policy',
    'cookie-doc-all-docs': 'All documents',
    'name-title': 'What should I call you?',
    'about-photo-alt': 'Igor Janicki',
    'about-handle': '@i-janicki · Sroda Slaska and nearby areas',
    'about-lead': 'I build custom websites and web apps, help with network setup, and provide ongoing IT support. I work with both local and remote clients.',
    'about-li-web': 'Custom websites',
    'about-li-apps': 'Custom web and mobile apps',
    'about-li-network': 'Network setup and administration',
    'about-li-support': 'IT support and ongoing care',
    'services-design-title': 'Design',
    'services-design-desc': 'I design and implement logos and icons.',
    'services-web-title': 'Websites',
    'services-web-desc': 'I design and deliver custom websites, from business cards to larger portals. Responsive, fast, and SEO-friendly.',
    'services-webapps-title': 'Apps',
    'services-webapps-desc': 'I build web and mobile apps. I integrate them with websites or other applications.',
    'services-mobile-title': 'SEO',
    'services-mobile-desc': 'I optimize websites for search engines to maximize traffic.',
    'services-network-title': 'Network setup',
    'services-network-desc': 'I design and configure LAN/WLAN networks, VPNs, and network security systems.',
    'services-it-title': 'IT support',
    'services-it-desc': 'Ongoing technical support, updates, and system monitoring on a subscription basis.',
    'projects-web-title': 'Websites',
    'projects-strzelca-desc': 'Shooting portal with news, competition results, and rules.',
    'projects-dmg-desc': 'A site with apps and tools dedicated to macOS.',
    'projects-korona-desc': 'A website for a local wine and restaurant brand.',
    'projects-elmet-desc': 'Company website for ELMET — locksmith services, CNC, and metalworking in Wroclaw.',
    'projects-apps-title': 'Apps',
    'projects-myip-desc': 'macOS app with public IP and network information.',
    'process-step1-title': 'Intro call',
    'process-step1-desc': 'We discuss your needs, project goal, and scope. We can talk by phone, email, or Zoom.',
    'process-step2-title': 'Quote and agreement',
    'process-step2-desc': 'I prepare a quote and agreement proposal. We align timeline and scope with no surprises.',
    'process-step3-title': 'Delivery',
    'process-step3-desc': 'I work in stages, regularly reporting progress and discussing key decisions.',
    'process-step4-title': 'Testing and fixes',
    'process-step4-desc': 'I test the project on different devices and browsers and make revisions based on your feedback.',
    'process-step5-title': 'Launch and support',
    'process-step5-desc': 'I hand over the finished project and provide post-launch support and further IT care.',
    'pricing-lead': 'Indicative pricing — every project is quoted individually.',
    'pricing-from': 'from',
    'pricing-web-title': 'Website',
    'pricing-web-desc': 'Business card website or portfolio. Responsive, fast, and SEO-optimized.',
    'pricing-app-title': 'Application',
    'pricing-app-desc': 'Panel, system, or app with business logic and a database.',
    'pricing-network-title': 'Network / Administration',
    'pricing-network-desc': 'Network design and setup, VPNs, security.',
    'pricing-it-title': 'IT support (subscription)',
    'pricing-it-desc': 'Ongoing support, monitoring, and updates.',
    'pricing-note': 'Prices are indicative — every project is quoted individually after an initial conversation.',
    'contact-lead': 'Send me a message — I\'ll reply as soon as possible.',
    'contact-name-label': 'Sender',
    'contact-name-placeholder': 'Name or nickname',
    'contact-email-label': 'E-mail / phone',
    'contact-email-placeholder': 'e-mail or phone number',
    'contact-message-label': 'Message',
    'contact-message-placeholder': 'Describe your project or question…',
    'contact-submit': 'SEND',
    'contact-wait': '✗ Please wait {seconds}s before sending another message.',
    'contact-invalid': '✗ Enter a valid e-mail address or phone number.',
    'contact-sending': 'Sending…',
    'contact-sent': '✓ Message sent! I\'ll get back to you as soon as possible.',
    'contact-error': '✗ Something went wrong. Please write directly to kontakt@i-janicki.pl',
    'reviews-lead': 'Here you can read reviews from previous clients.',
    'reviews-loading': 'Loading reviews…',
    'reviews-empty': 'No reviews yet — be the first! ⬆',
    'reviews-error': 'Unable to load reviews.',
    'reviews-anonymous': 'Anonymous',
    'reviews-form-title': 'Leave a review',
    'reviews-stars-label': 'Choose a rating',
    'reviews-star-1': '1 star',
    'reviews-star-2': '2 stars',
    'reviews-star-3': '3 stars',
    'reviews-star-4': '4 stars',
    'reviews-star-5': '5 stars',
    'reviews-name-placeholder': 'Your name',
    'reviews-email-placeholder': 'E-mail (for verification — not visible publicly)',
    'reviews-comment-placeholder': 'Your review…',
    'reviews-submit': 'SEND REVIEW',
    'reviews-choose-rating': 'Choose a rating (1–5 stars).',
    'reviews-invalid-name': 'Name must contain at least 3 characters.',
    'reviews-invalid-email': 'Enter a valid e-mail address (needed for verification).',
    'reviews-invalid-comment': 'Write a short review (minimum 5 characters).',
    'reviews-checking': 'Checking…',
    'reviews-sending': 'Sending…',
    'reviews-success': '✓ Thank you! Confirm the link in your e-mail to publish the review.',
    'reviews-submit-error': '✗ Something went wrong. Please try again.',
    'reviews-already-submitted': '✗ You have already submitted a review. Each e-mail can submit only one review.',
    'reviews-wait-days': '✗ Wait {days} more days before another attempt (your previous review is still pending verification).',
    'reviews-wait-hours': '✗ Please wait {hours} more hours before sending another review.',
    'returning-title': 'Welcome back!',
    'returning-message': 'Welcome back, <strong>{name}</strong>! As you probably remember, I\'m <strong>i-JANEK</strong>. How can I help you today?',
    'returning-message-no-name': 'Welcome back! As you probably remember, I\'m <strong>i-JANEK</strong>. How can I help you today?',
    'tutorial-complete-title': 'That\'s the end!',
    'tutorial-complete-message-with-name': 'Great! You already have a good overview of what I do, <strong>{name}</strong>.',
    'tutorial-complete-message-no-name': 'You already have a good overview of what I do.',
    'tutorial-complete-next': 'Use the sections below to return to the details you need or go through the tutorial again.',
    'tutorial-summary-title': 'Welcome back!',
    'tutorial-summary-message': '{name}, I\'ve walked you through every section on this site. If you want to return to anything, choose a topic below, and if you want another guided tour, click Tutorial!',
    'review-step-message': 'We\'re almost done{name}! ⭐ Would you like to leave a review or see what others wrote?',
    'faq-aria': 'FAQ — Frequently asked questions',
    'faq-subtitle': 'Frequently asked questions',
    'verify-success': '✓ Review confirmed! Thanks for your feedback 🎉',
    'verify-error': '✗ The review could not be verified.',
  },
};


let currentLang = 'pl';

function initLang() {
  const saved = localStorage.getItem(LS.LANG) || 'pl';
  currentLang = saved;
  document.documentElement.lang = saved;
  applyLanguage(saved, { rerender: false });
}

function changeLang(lang) {
  currentLang = lang;
  document.documentElement.lang = lang;
  localStorage.setItem(LS.LANG, lang);
  applyLanguage(lang);
}

function t(key) {
  return TRANSLATIONS[currentLang]?.[key] ?? TRANSLATIONS.pl[key] ?? key;
}

function tf(key, vars = {}) {
  return t(key).replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
}

function applyLanguage(_lang, { rerender = true } = {}) {
  localizeTemplates();
  localizeRoot(document);
  if (dom.tutBack) dom.tutBack.textContent = '←';
  refreshNavButtons();
  if (rerender) rerenderVisibleUi();
}

function localizeTemplates() {
  document.querySelectorAll('template').forEach(tpl => localizeRoot(tpl.content));
}

function localizeRoot(root) {
  root.querySelectorAll?.('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll?.('[data-i18n-html]').forEach(el => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  root.querySelectorAll?.('[data-i18n-placeholder]').forEach(el => {
    el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder));
  });
  root.querySelectorAll?.('[data-i18n-aria-label]').forEach(el => {
    el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel));
  });
  root.querySelectorAll?.('[data-i18n-title]').forEach(el => {
    el.setAttribute('title', t(el.dataset.i18nTitle));
  });
  root.querySelectorAll?.('[data-i18n-alt]').forEach(el => {
    el.setAttribute('alt', t(el.dataset.i18nAlt));
  });
}

function rerenderVisibleUi() {
  localizeRoot(document);

  if (dom.cookieOverlay && !dom.cookieOverlay.hidden) {
    const currentView = dom.cookieOverlay.querySelector('[data-cookie-view]')?.dataset.cookieView || 'banner';
    dom.cookieOverlay.innerHTML = renderCookiePanelHtml('overlay', currentView);
    dom.cookieOverlay.hidden = false;
    dom.cookieOverlay.setAttribute('aria-hidden', 'false');
  }

  if (dom.docOverlay && !dom.docOverlay.hidden && currentDocName) {
    openDoc(currentDocName);
  }

  if (document.querySelector('.faq-modal-overlay')) {
    openFaqModal();
  }

  if (!tutDone) {
    const step = getSteps()[tutStep];
    if (!step) return;
    switch (step.id) {
      case 'greeting': renderGreeting(); break;
      case 'name': renderNameInput(); break;
      case 'cookies': cookieTutorialView = 'banner'; renderCookieStep(); break;
      case 'reviews': renderReviewStep(); break;
      default: renderSectionStep(step); break;
    }
    refreshDots();
    refreshNavButtons();
    return;
  }

  if (dom.modalRoot && !dom.modalRoot.hidden) {
    const topic = sessionStorage.getItem(SS.SECTION);
    if (topic) openModal(topic);
  }

  if (currentView === 'finished') {
    finishTutorial();
  } else {
    showReturning();
  }
}

function getLangLabel(topic, lang) {
  return TRANSLATIONS[lang]?.[`btn-${topic}`] ?? TRANSLATIONS.pl[`btn-${topic}`] ?? topic;
}

const SECTION_MSG = {
  pl: {
    about: n => `Pozwól, że się przedstawię${n}! Tutaj dowiesz się, <strong>kim jestem</strong>, skąd pochodzę i czym się zajmuję.`,
    services: () => 'Tu znajdziesz moje <strong>Usługi</strong> — strony, aplikacje webowe, sieci LAN/WLAN i opieka IT.',
    projects: () => 'Moje <strong>Projekty</strong> — wybrane realizacje. Zerknij, co już stworzyłem.',
    process: () => 'Tak wygląda <strong>Proces współpracy</strong> — od pierwszej rozmowy do wdrożenia. Zero niespodzianek.',
    pricing: () => 'Orientacyjny <strong>Cennik</strong>. Każdy projekt wyceniam indywidualnie — tu znajdziesz punkt wyjścia.',
    contact: n => `Czas na <strong>Kontakt</strong>${n}! Masz pytanie lub projekt? Napisz — chętnie porozmawiam! 😊`,
  },
  en: {
    about: n => `Let me introduce myself${n}! Here you'll learn <strong>who I am</strong>, where I come from, and what I do.`,
    services: () => 'Here you can explore my <strong>services</strong> — websites, web apps, LAN/WLAN networks, and IT support.',
    projects: () => 'These are my <strong>projects</strong> — selected work I\'ve already delivered.',
    process: () => 'This is what the <strong>collaboration process</strong> looks like — from the first conversation to launch. No surprises.',
    pricing: () => 'Here is the <strong>pricing overview</strong>. Every project is quoted individually, and this gives you a solid starting point.',
    contact: n => `Time for <strong>contact</strong>${n}! Have a question or a project in mind? Send me a message — I\'d be happy to talk. 😊`,
  },
};

// ─────────────────────────────────────────────────────────────────
// EYE TRACKING
// ─────────────────────────────────────────────────────────────────
function initEyeTracking() {
  document.addEventListener('mousemove', trackEyes, { passive: true });
}

let _eyeRafId  = null;
let _eyeLastE  = null;

function trackEyes(e) {
  _eyeLastE = e;
  if (_eyeRafId) return;
  // Throttlowanie do 1 odczytu getScreenCTM() na klatkę — eliminuje nadmiarowe layouty
  _eyeRafId = requestAnimationFrame(() => {
    _eyeRafId = null;
    const svg = dom.botSvg;
    const ev  = _eyeLastE;
    if (!svg || !ev) return;
    try {
      const pt = svg.createSVGPoint();
      pt.x = ev.clientX;
      pt.y = ev.clientY;
      const sp = pt.matrixTransform(svg.getScreenCTM().inverse());
      moveEye(dom.pupilL, dom.shineL,  88, 100, sp.x, sp.y, 5);
      moveEye(dom.pupilR, dom.shineR, 132, 100, sp.x, sp.y, 5);
    } catch (_) { /* SVG not yet painted */ }
  });
}

// cx/cy = eye centre in SVG space; maxR = max pupil offset in SVG units
function moveEye(pupil, shine, cx, cy, mx, my, maxR) {
  const dx = mx - cx;
  const dy = my - cy;
  const r  = Math.min(Math.hypot(dx, dy) / 40, 1) * maxR;
  const a  = Math.atan2(dy, dx);
  const px = cx + r * Math.cos(a);
  const py = cy + r * Math.sin(a);
  pupil.setAttribute('cx', px.toFixed(2));
  pupil.setAttribute('cy', py.toFixed(2));
  shine.setAttribute('cx', (px + 2.5).toFixed(2));
  shine.setAttribute('cy', (py - 3.0).toFixed(2));
}

// ─────────────────────────────────────────────────────────────────
// GLOBAL CLICK DELEGATION
// Handles [data-topic], [data-doc] and [data-close] everywhere
// ─────────────────────────────────────────────────────────────────
function initGlobalClick() {
  document.addEventListener('click', e => {
    const cookieBtn = e.target.closest('[data-cookie-action]');
    const docBtn   = e.target.closest('[data-doc]');
    const topicBtn = e.target.closest('[data-topic]');
    const closeBtn = e.target.closest('[data-close]');

    if (cookieBtn) {
      const mode = cookieBtn.closest('[data-cookie-mode]')?.dataset.cookieMode || 'overlay';
      const action = cookieBtn.dataset.cookieAction;

      if (action === 'settings') {
        // Przejdź do widoku ustawień
        switchToCookieSettings(mode);
      } else if (action === 'reject') {
        // Odrzuć opcjonalne
        cookieDecideAll(false);
        afterCookieAction(mode);
      } else if (action === 'all') {
        // Akceptuj wszystkie
        cookieDecideAll(true);
        afterCookieAction(mode);
      } else if (action === 'save') {
        // Zapisz bieżące ustawienia z przełączników
        saveCookieSettings();
        afterCookieAction(mode);
      }
      return;
    }
    if (docBtn)   { openDoc(docBtn.dataset.doc);          return; }
    if (topicBtn) { handleTopic(topicBtn.dataset.topic);  return; }
    if (closeBtn) { closeModal();                          return; }
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (dom.docOverlay && !dom.docOverlay.hidden) { closeDoc(); return; }
    if (dom.cookieOverlay && !dom.cookieOverlay.hidden) { closeCookiePanel(); return; }
    if (dom.modalRoot && !dom.modalRoot.hidden)         { closeModal();       return; }
  });

  // Tutorial nav buttons
  const tutBackEl = $('tutBack');
  if (tutBackEl) tutBackEl.addEventListener('click', () => {
    if (tutStep > 0) goStep(tutStep - 1);
  });

  const tutSkipEl = $('tutSkip');
  if (tutSkipEl) tutSkipEl.addEventListener('click', () => {
    const steps = getSteps();
    goStep(steps.length - 1);
  });

  const tutNextEl = $('tutNext');
  if (tutNextEl) tutNextEl.addEventListener('click', () => {
    const steps = getSteps();
    const step = steps[tutStep];
    // Cookie step: must decide before continuing
    if (step.id === 'cookies' && !localStorage.getItem(LS.COOKIE_DECISION)) {
      dom.panelContent.animate(
        [{ transform: 'translateX(-7px)' }, { transform: 'translateX(7px)' },
         { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }],
        { duration: 320, easing: 'ease-out' }
      );
      return;
    }
    // Name step: save before advancing
    if (step.id === 'name') captureName();

    // Last step (reviews): finish tutorial
    if (tutStep === steps.length - 1) {
      window.trackTutorialComplete?.();
      finishTutorial();
      return;
    }

    if (tutStep < steps.length - 1) goStep(tutStep + 1);
  });
}

// ─────────────────────────────────────────────────────────────────
// TUTORIAL — STATE MACHINE
// ─────────────────────────────────────────────────────────────────
function startTutorial() {
  // Filter out cookies step if cookies decision has already been made
  if (localStorage.getItem(LS.COOKIE_DECISION) !== null) {
    window.FILTERED_STEPS = STEPS.filter(step => step.id !== 'cookies');
  } else {
    window.FILTERED_STEPS = STEPS;
  }

  tutStep = 0;
  visitedSteps.clear();
  buildDots();
  dom.tutProgress.hidden = false;
  dom.tutNav.hidden      = false;
  const brandName = document.querySelector('.brand-name');
  if (brandName) {
    brandName.style.display = 'none';
  }
  goStep(0);
}

function buildDots() {
  if (!dom.tutDots) return;
  dom.tutDots.innerHTML = '';
  const steps = getSteps();
  for (let i = 0; i < steps.length; i++) {
    const d = document.createElement('button');
    d.className = 'tut-dot';
    d.type = 'button';
    d.setAttribute('aria-label', tf('tutorial-step', { number: i + 1 }));
    const maxVisited = Math.max(...visitedSteps, 0);
    const canClick = i <= maxVisited + 1;
    d.disabled = !canClick;
    d.addEventListener('click', () => {
      if (canClick) goStep(i);
    });
    dom.tutDots.appendChild(d);
  }
}

function refreshDots() {
  const maxVisited = Math.max(...visitedSteps, 0);
  dom.tutDots.querySelectorAll('.tut-dot').forEach((d, i) => {
    d.classList.toggle('is-done',    i < tutStep);
    d.classList.toggle('is-current', i === tutStep);
    d.setAttribute('aria-label', tf('tutorial-step', { number: i + 1 }));
    const canClick = i <= maxVisited + 1;
    d.disabled = !canClick;
  });
}

function refreshNavButtons() {
  // Na podstronach bez tutoriala (np. dokumenty) elementy nawigacji nie istnieją
  if (!dom.tutBack || !dom.tutNext || !dom.tutSkip || !dom.tutNav) return;

  const steps = getSteps();
  const step         = steps[tutStep];
  const isFirst      = tutStep === 0;
  const isLast       = tutStep === steps.length - 1;
  const cookieNeeded = step.id === 'cookies' && !localStorage.getItem(LS.COOKIE_DECISION);

  // W kroku cookies ukrywamy przyciski nawigacji do czasu podjęcia decyzji
  dom.tutBack.hidden              = isFirst || cookieNeeded;
  dom.tutBack.disabled            = isFirst || cookieNeeded;
  dom.tutNext.hidden              = cookieNeeded;
  dom.tutNext.disabled            = cookieNeeded;
  dom.tutNext.textContent         = isLast ? t('finish-btn') : t('next-btn');
  dom.tutNext.classList.toggle('is-send', isLast);

  // Skip button disabled — can't skip to unvisited steps
  dom.tutSkip.disabled            = true;
  dom.tutSkip.style.display       = 'none';
  dom.tutSkip.textContent         = t('skip-btn');

  dom.tutNav.classList.toggle('has-back', !isFirst && !cookieNeeded);
}

function goStep(idx) {
  const steps = getSteps();
  const prevStep = tutStep;

  // Allow going back or to next unvisited step, but not skipping ahead
  const maxVisited = Math.max(...visitedSteps, 0);
  const targetIdx = Math.max(0, Math.min(idx, steps.length - 1));

  // Prevent skipping ahead more than one step forward
  if (targetIdx > maxVisited + 1) {
    return;
  }

  tutStep = targetIdx;
  const step = steps[tutStep];

  // Odroczone do następnej klatki — eliminuje wymuszone przeformatowanie
  // (zapis scrollTop przy oczekujących zmianach stylu powoduje flush layoutu)
  requestAnimationFrame(() => {
    const stage = document.getElementById('stage');
    if (stage) stage.scrollTop = 0;
    window.scrollTo({ top: 0 });
  });

  // Mark current step as visited
  visitedSteps.add(tutStep);

  refreshDots();
  refreshNavButtons();
  closeModal();
  hideStageContent();
  dom.bot.classList.remove('is-pointing');

  switch (step.id) {
    case 'greeting': renderGreeting();        break;
    case 'name':     renderNameInput();       break;
    case 'cookies':  cookieTutorialView = 'banner'; renderCookieStep(); break;
    case 'reviews':  renderReviewStep();      break;
    default:         renderSectionStep(step); break;
  }
}

// ─── Step renders ─────────────────────────────────────────────────

function renderGreeting() {
  currentView = 'greeting';
  const isDark = document.documentElement.dataset.theme !== 'light';

  setPanel(t('greeting-title'), `
    <div class="tut-message">
      ${t('greeting-text')}
    </div>
    <div class="greeting-prefs">
      <div class="pref-column">
        <span class="pref-label">${t('lang-label')}</span>
        <div class="pref-btns">
          <button class="choice-btn ${currentLang === 'pl' ? 'is-active' : ''}" id="gLangPL">${t('lang-pl')}</button>
          <button class="choice-btn ${currentLang === 'en' ? 'is-active' : ''}" id="gLangEN">${t('lang-en')}</button>
        </div>
      </div>
      <div class="pref-separator"></div>
      <div class="pref-column">
        <span class="pref-label">${t('theme-label')}</span>
        <div class="pref-btns">
          <button class="choice-btn ${isDark ? 'is-active' : ''}" id="gThemeDark">${t('theme-dark')}</button>
          <button class="choice-btn ${!isDark ? 'is-active' : ''}" id="gThemeLight">${t('theme-light')}</button>
        </div>
      </div>
    </div>
    <div class="tut-message" style="margin-top:10px">
      <p>${t('greeting-ready')}</p>
    </div>
  `);

  const setActive = (a, b) => { a?.classList.add('is-active'); b?.classList.remove('is-active'); };

  $('gLangPL')?.addEventListener('click', () => { changeLang('pl'); setActive($('gLangPL'), $('gLangEN')); });
  $('gLangEN')?.addEventListener('click', () => { changeLang('en'); setActive($('gLangEN'), $('gLangPL')); refreshNavButtons(); });

  $('gThemeDark')?.addEventListener('click',  () => { applyTheme(true);  localStorage.setItem(LS.THEME,'dark');  setActive($('gThemeDark'),$('gThemeLight')); });
  $('gThemeLight')?.addEventListener('click', () => { applyTheme(false); localStorage.setItem(LS.THEME,'light'); setActive($('gThemeLight'),$('gThemeDark')); });
}

function renderNameInput() {
  currentView = 'name';
  setPanel(t('name-title'), `
    <div class="tut-message">
      <div class="name-input-wrap">
        <input type="text" class="name-input" id="nameInput"
               placeholder="${t('name-placeholder')}"
               value="${escHtml(userName)}"
               maxlength="40" autocomplete="given-name" />
      </div>
    </div>
  `);

  const inp = $('nameInput');
  const advance = () => { captureName(); goStep(tutStep + 1); };
  inp?.addEventListener('keydown', e => { if (e.key === 'Enter') advance(); });
  requestAnimationFrame(() => inp?.focus());
}

function renderCookieStep() {
  currentView = 'cookies';
  setPanel('', renderCookiePanelHtml('tutorial', cookieTutorialView), false, false);
}

// Renderuje panel cookies: view = 'banner' (pierwszy baner) lub 'settings' (panel z kategoriami)
function renderCookiePanelHtml(mode, view) {
  const panelClass = mode === 'tutorial' ? 'cookie-panel cookie-panel--embedded' : 'cookie-panel';
  const actualView = view || 'banner';

  if (actualView === 'settings') {
    return renderCookieSettingsHtml(mode, panelClass);
  }
  return renderCookieBannerHtml(mode, panelClass);
}

// Baner — krótki tekst + 3 równorzędne przyciski
function renderCookieBannerHtml(mode, panelClass) {
  return `
    <div class="${panelClass}" data-cookie-mode="${mode}" data-cookie-view="banner">
      <div class="cookie-header">
        <span class="cookie-icon" aria-hidden="true">🍪</span>
        <h2>${t('cookie-title')}</h2>
      </div>
      <p class="cookie-banner-text">${t('cookie-banner-text')}</p>
      <div class="cookie-banner-actions">
        <button class="cookie-btn cookie-btn-settings" data-cookie-action="settings">${t('cookie-settings-btn')}</button>
        <button class="cookie-btn cookie-btn-reject" data-cookie-action="reject">${t('cookie-reject-optional')}</button>
        <button class="cookie-btn cookie-btn-accept-all" data-cookie-action="all">${t('cookie-accept-all')}</button>
      </div>
    </div>`;
}

// Panel ustawień — 4 kategorie z przełącznikami
function renderCookieSettingsHtml(mode, panelClass) {
  const analyticsOn = localStorage.getItem(LS.COOKIE_ANALYTICS) === 'true';
  const marketingOn = localStorage.getItem(LS.COOKIE_MARKETING) === 'true';
  const externalOn  = localStorage.getItem(LS.COOKIE_EXTERNAL) === 'true';

  const row = (id, title, desc, checked, disabled) => `
    <div class="cookie-category-row">
      <div class="cookie-category-info">
        <strong>${title}</strong>
        <p>${desc}</p>
      </div>
      <div class="cookie-category-control">
        ${disabled
          ? `<span class="cookie-always-badge">${t('cookie-always-on')}</span>`
          : `<label class="cookie-switch" for="${id}">
               <input type="checkbox" class="cookie-checkbox" id="${id}" data-cookie-category="${id}" ${checked ? 'checked' : ''}>
               <span class="cookie-switch-ui"></span>
             </label>`
        }
      </div>
    </div>`;

  return `
    <div class="${panelClass}" data-cookie-mode="${mode}" data-cookie-view="settings">
      <div class="cookie-header">
        <span class="cookie-icon" aria-hidden="true">🍪</span>
        <h2>${t('cookie-settings-title-panel')}</h2>
      </div>
      <div class="cookie-categories">
        ${row('essential', t('cookie-essential-title'), t('cookie-essential-desc'), true, true)}
        ${row('analytics', t('cookie-analytics-title'), t('cookie-analytics-desc'), analyticsOn, false)}
        ${row('marketing', t('cookie-marketing-title'), t('cookie-marketing-desc'), marketingOn, false)}
        ${row('external', t('cookie-external-title'), t('cookie-external-desc'), externalOn, false)}
      </div>
      <div class="cookie-docs-row">
        <button class="cookie-doc-link" data-doc="regulamin">${t('cookie-doc-regulamin')}</button>
        <button class="cookie-doc-link" data-doc="polityka-prywatnosci">${t('cookie-doc-privacy')}</button>
        <button class="cookie-doc-link" data-doc="polityka-rodo">${t('cookie-doc-rodo')}</button>
        <a class="cookie-doc-link" href="./dokumenty">${t('cookie-doc-all-docs')}</a>
      </div>
      <div class="cookie-settings-actions">
        <button class="cookie-btn cookie-btn-save" data-cookie-action="save">${t('cookie-save-settings')}</button>
        <button class="cookie-btn cookie-btn-reject" data-cookie-action="reject">${t('cookie-reject-optional')}</button>
        <button class="cookie-btn cookie-btn-accept-all" data-cookie-action="all">${t('cookie-accept-all')}</button>
      </div>
    </div>`;
}

function renderSectionStep(step) {
  currentView = 'section';
  const n = userName ? `, ${escHtml(userName)}` : '';
  const msg = SECTION_MSG[currentLang]?.[step.id]?.(n) ?? step.label;

  // Treść sekcji wewnątrz panelu robota (nie osobny panel boczny)
  setPanel(t('greeting-title'), `
    <div class="tut-message"><p>${msg}</p></div>
    <div class="section-step-content" id="secContent"></div>
  `);

  const tpl = document.getElementById(`tpl-${step.topic}`);
  if (tpl) $('secContent').appendChild(tpl.content.cloneNode(true));

  // Dodaj klasę do panelu żeby był scrollable
  $('panel')?.classList.add('has-section');
  dom.bot.classList.add('is-pointing');

  // Setup form handlers jeśli to kontakt
  if (step.topic === 'contact') {
    setupContactForm();
    prefillContact();
  }
}

function renderReviewStep() {
  currentView = 'reviews';
  const n = userName ? `, ${escHtml(userName)}` : '';
  const msg = tf('review-step-message', { name: n });

  setPanel(t('greeting-title'), `
    <div class="tut-message"><p>${msg}</p></div>
    <div class="section-step-content" id="secContent"></div>
  `);

  const tpl = document.getElementById('tpl-reviews');
  if (tpl) $('secContent').appendChild(tpl.content.cloneNode(true));

  $('panel')?.classList.add('has-section');
  setupReviewForm();
  prefillReviewName();

  requestAnimationFrame(() => {
    const el = $('modalReviewsCarousel');
    if (el) loadReviews(el);
  });
}

function renderFinish() {
  currentView = 'finished';
  dom.bot.classList.remove('is-pointing');
  dom.tutProgress.hidden = true;
  dom.tutNav.hidden      = false;
  closeModal();
  $('panel')?.classList.remove('has-section');

  // Show full brand name after tutorial
  const brandName = document.querySelector('.brand-name');
  if (brandName) {
    brandName.textContent = 'i-JANICKI';
  }

  const n = userName ? escHtml(userName) : (currentLang === 'en' ? 'friend' : 'Przyjacielu');
  setPanel(t('tutorial-summary-title'), `
    <div class="tut-message">
      <p><strong>${t('tutorial-complete-title')}</strong></p>
      <p>${tf('tutorial-summary-message', { name: n })}</p>
    </div>
    <div class="tut-options">
      ${renderTopicButtons('snav-item')}
      ${renderTutorialButton('snav-item')}
    </div>
  `, true);

  markTutorialDone();
  injectFaqBtn();
}

// ─── Helpers ──────────────────────────────────────────────────────

function captureName() {
  const inp = $('nameInput');
  if (!inp) return;
  const val = inp.value.trim();
  if (!val) return;
  userName = val;
  localStorage.setItem(LS.NAME, userName);
  prefillContact();
}

function prefillContact() {
  const fn = $('f-name');
  if (fn && userName) fn.value = userName;
}

function prefillReviewName() {
  const fn = $('modalReviewName');
  if (fn && userName) fn.value = userName;
}

const TOPIC_ICONS = {
  about: '👤',
  services: '⚙️',
  projects: '🗂',
  process: '🤝',
  pricing: '💰',
  contact: '✉️',
  reviews: '⭐',
};

function renderTopicButtons(buttonClass) {
  return ['about', 'services', 'projects', 'process', 'pricing', 'contact', 'reviews']
    .map(topic => `<button class="${buttonClass}" data-topic="${topic}">${TOPIC_ICONS[topic]} ${t(`btn-${topic}`)}</button>`)
    .join('');
}

function renderTutorialButton(buttonClass) {
  return `<button class="${buttonClass}" data-topic="tutorial"><span class="opt-icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg></span> ${t('btn-tutorial')}</button>`;
}

function finishTutorial() {
  currentView = 'finished';
  markTutorialDone();
  dom.tutProgress.hidden = true;
  dom.tutNav.hidden      = true;
  const brandName = document.querySelector('.brand-name');
  if (brandName) {
    brandName.textContent = 'i-JANICKI';
    brandName.style.display = '';
  }
  const n = userName ? escHtml(userName) : '';
  const intro = n
    ? tf('tutorial-complete-message-with-name', { name: n })
    : t('tutorial-complete-message-no-name');
  setPanel(t('tutorial-complete-title'), `
    <div class="tut-message">
      <p>${intro} ${t('tutorial-complete-next')}</p>
    </div>
    <div class="options">
      ${renderTopicButtons('opt')}
      ${renderTutorialButton('opt')}
    </div>
  `, false);

  injectFaqBtn();
}

function markTutorialDone() {
  localStorage.setItem(LS.TUTORIAL_DONE, 'true');
  tutDone = true;
  // reviewsWrap was shown in step 9; finish step doesn't repeat it
  // sectionNav removed from topbar — section access via panel buttons
}

// ─────────────────────────────────────────────────────────────────
// STAGE CONTENT (panel obok robota podczas tutoriala)
// ─────────────────────────────────────────────────────────────────
function showStageContent(topic) {
  const tpl = document.getElementById(`tpl-${topic}`);
  if (!tpl) return;
  const inner = $('stageContentInner');
  inner.innerHTML = '';
  inner.appendChild(tpl.content.cloneNode(true));
  $('stageContent').hidden = false;

  // Powiąż przycisk zamknięcia (mobile)
  $('stageContentClose').onclick = hideStageContent;

  if (topic === 'contact') {
    setupContactForm();
    prefillContact();
  }
  // Pricing jump button
  inner.querySelectorAll('.btn-jump').forEach(btn => {
    btn.addEventListener('click', () => {
      hideStageContent();
      setTimeout(() => handleTopic(btn.dataset.topic), 150);
    });
  });
}

function hideStageContent() {
  const sc = $('stageContent');
  if (sc) sc.hidden = true;
  document.getElementById('stage').classList.remove('is-presenting');
}

// ─────────────────────────────────────────────────────────────────
// RETURNING USER
// ─────────────────────────────────────────────────────────────────
function showReturning() {
  currentView = 'returning';
  if (dom.tutProgress) dom.tutProgress.hidden = true;
  if (dom.tutNav) dom.tutNav.hidden = true;
  const brandName = document.querySelector('.brand-name');
  if (brandName) {
    brandName.textContent = 'i-JANICKI';
    brandName.style.display = '';
  }

  setPanel(t('returning-title'), `
    <div class="tut-message">
      <p>${userName ? tf('returning-message', { name: escHtml(userName) }) : t('returning-message-no-name')}</p>
    </div>
    <div class="options">
      ${renderTopicButtons('opt')}
      ${renderTutorialButton('opt opt-tutorial')}
    </div>
  `, false);

  injectFaqBtn();
}

// ─────────────────────────────────────────────────────────────────
// SECTION NAV
// ─────────────────────────────────────────────────────────────────
function handleTopic(topic) {
  if (topic === 'tutorial') { restartTutorial(); return; }

  openModal(topic);

  if (topic === 'reviews') {
    // Load into modal carousel after DOM is updated
    requestAnimationFrame(() => {
      const el = $('modalReviewsCarousel');
      if (el) loadReviews(el);
    });
  }

  sessionStorage.setItem(SS.SECTION, topic);
  setNavActive(topic);
}

function setNavActive(topic) {
  dom.sectionNav?.querySelectorAll('.snav-item').forEach(b => {
    b.classList.toggle('is-active', b.dataset.topic === topic);
  });
}

function restartTutorial() {
  tutDone = false;
  localStorage.removeItem(LS.TUTORIAL_DONE);
  localStorage.removeItem(LS.NAME);
  userName = '';
  if (dom.sectionNav) dom.sectionNav.hidden = true;
  closeModal();
  startTutorial();
}

// ─────────────────────────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────────────────────────
function openModal(topic) {
  const tpl = document.getElementById(`tpl-${topic}`);
  if (!tpl) return;
  dom.modalBody.innerHTML = '';
  dom.modalBody.appendChild(tpl.content.cloneNode(true));
  dom.modalRoot.hidden = false;
  dom.modalRoot.setAttribute('aria-hidden', 'false');

  if (topic === 'contact') {
    setupContactForm();
    prefillContact();
  }

  if (topic === 'reviews') {
    dom.modalRoot.querySelector('.modal').classList.add('modal--wide');
    setupReviewForm();
    prefillReviewName();
    requestAnimationFrame(() => {
      const el = $('modalReviewsCarousel');
      if (el) loadReviews(el);
    });
  }

  // Pricing "Skontaktuj się" jump button
  dom.modalBody.querySelectorAll('.btn-jump').forEach(btn => {
    btn.addEventListener('click', () => {
      closeModal();
      setTimeout(() => handleTopic(btn.dataset.topic), 150);
    });
  });
}

function closeModal() {
  dom.modalRoot.hidden = true;
  dom.modalRoot.setAttribute('aria-hidden', 'true');
  dom.modalRoot.querySelector('.modal')?.classList.remove('modal--wide');
}

// ─────────────────────────────────────────────────────────────────
// CONTACT FORM (web3forms)
// ─────────────────────────────────────────────────────────────────
const FORM_RATE_KEY     = 'ijanek_form_last_submit';
const FORM_RATE_LIMIT   = 60_000; // 1 minuta między wysłaniami

function isValidEmailOrPhone(val) {
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const phoneRe = /^[\d\s\+\-\(\)]{7,}$/;
  return emailRe.test(val) || phoneRe.test(val);
}

function isValidEmail(val) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val);
}

function splitContactName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { firstName: '', lastName: '' };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

function leadDocIdFromEmail(email) {
  return `lead_${encodeURIComponent(email.toLowerCase())}`;
}

function getConsentDatesFromDoc(doc) {
  const values = doc?.fields?.consentAcceptedDates?.arrayValue?.values || [];
  return values
    .map(v => v.timestampValue)
    .filter(Boolean);
}

async function upsertContactLead({ fullName, email, consentAcceptedAt }) {
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!isValidEmail(normalizedEmail)) return;

  const { firstName, lastName } = splitContactName(fullName);
  const docId = leadDocIdFromEmail(normalizedEmail);
  const docUrl = `${FIRESTORE_BASE}/contact_leads/${docId}`;
  let consentAcceptedDates = [consentAcceptedAt];
  let method = 'POST';
  let url = `${FIRESTORE_BASE}/contact_leads?documentId=${encodeURIComponent(docId)}`;

  const existingRes = await fetch(docUrl, { method: 'GET' });
  if (existingRes.ok) {
    const existingDoc = await existingRes.json();
    const existingDates = getConsentDatesFromDoc(existingDoc);
    consentAcceptedDates = [...existingDates, consentAcceptedAt];
    method = 'PATCH';
    url = `${docUrl}?updateMask.fieldPaths=firstName&updateMask.fieldPaths=lastName&updateMask.fieldPaths=email&updateMask.fieldPaths=consentAcceptedDates`;
  } else if (existingRes.status !== 404) {
    throw new Error(`Firestore read failed: ${existingRes.status}`);
  }

  const body = {
    fields: {
      firstName: { stringValue: firstName },
      lastName: { stringValue: lastName },
      email: { stringValue: normalizedEmail },
      consentAcceptedDates: {
        arrayValue: {
          values: consentAcceptedDates.map(ts => ({ timestampValue: ts })),
        },
      },
    },
  };

  const writeRes = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!writeRes.ok) {
    throw new Error(`Firestore write failed: ${writeRes.status}`);
  }
}

function setupContactForm() {
  const form = $('contactForm');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = '1';

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const status  = $('formStatus');

    // Sprawdź rate limit
    const lastSubmit = localStorage.getItem(FORM_RATE_KEY);
    if (lastSubmit && Date.now() - parseInt(lastSubmit, 10) < FORM_RATE_LIMIT) {
      const sek = Math.ceil((FORM_RATE_LIMIT - (Date.now() - parseInt(lastSubmit, 10))) / 1000);
      status.className   = 'form-status is-error';
      status.textContent = tf('contact-wait', { seconds: sek });
      return;
    }

    // Walidacja e-mail / telefon
    const contact = $('f-email')?.value.trim() || '';
    if (!isValidEmailOrPhone(contact)) {
      status.className   = 'form-status is-error';
      status.textContent = t('contact-invalid');
      return;
    }

    // Pokaż modal zgody RODO
    showConsentModal(() => {
      submitContactForm(form);
    });
  });

  setupConsentModal();
}

// ─────────────────────────────────────────────────────────────────
// MODAL ZGODY RODO (przed wysłaniem formularza kontaktowego)
// ─────────────────────────────────────────────────────────────────

function showConsentModal(onAccept) {
  const overlay = $('consentOverlay');
  if (!overlay) return;
  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');
  overlay._onAccept = onAccept;
}

function hideConsentModal() {
  const overlay = $('consentOverlay');
  if (!overlay) return;
  overlay.hidden = true;
  overlay.setAttribute('aria-hidden', 'true');
  overlay._onAccept = null;
}

function setupConsentModal() {
  const overlay = $('consentOverlay');
  if (!overlay || overlay.dataset.bound) return;
  overlay.dataset.bound = '1';

  // Akceptuj — wyślij formularz
  const acceptBtn = $('consentAccept');
  if (acceptBtn) {
    acceptBtn.addEventListener('click', () => {
      const cb = overlay._onAccept;
      hideConsentModal();
      if (typeof cb === 'function') cb();
    });
  }

  // Anuluj — zamknij okno, nie czyść formularza
  const cancelBtn = $('consentCancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', hideConsentModal);
  }

  // Kliknięcie w backdrop / przycisk zamknięcia
  overlay.querySelectorAll('[data-consent-close]').forEach(el => {
    el.addEventListener('click', hideConsentModal);
  });

  // Escape
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape' && !overlay.hidden) {
      hideConsentModal();
    }
  });
}

async function submitContactForm(form) {
  const status  = $('formStatus');
  const btn     = form.querySelector('[type=submit]');
  const btnText = $('submitBtnText');
  const formData = Object.fromEntries(new FormData(form));
  const fullName = String(formData.name || formData.fullname || '').trim();
  const contactValue = String(formData.email || '').trim();
  const consentAcceptedAt = new Date().toISOString();

  btnText.textContent    = t('contact-sending');
  btn.disabled           = true;
  status.textContent     = '';
  status.className       = 'form-status';

  try {
    const res  = await fetch('https://api.web3forms.com/submit', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(formData),
    });
    const data = await res.json();
    if (data.success) {
      try {
        await upsertContactLead({
          fullName,
          email: contactValue,
          consentAcceptedAt,
        });
      } catch (err) {
        console.warn('Contact lead save error:', err);
      }

      localStorage.setItem(FORM_RATE_KEY, String(Date.now()));
      status.className   = 'form-status is-ok';
      status.textContent = t('contact-sent');
      form.reset();
      prefillContact();
      // Jeśli jesteśmy na kroku kontaktu w tutorialu, przejdź do następnego (Opinie)
      const steps = getSteps();
      if (steps[tutStep]?.id === 'contact') {
        const reviewIdx = getStepIndex('reviews');
        setTimeout(() => goStep(reviewIdx), 1500);
      }
    } else {
      throw new Error(data.message || 'Błąd serwera');
    }
  } catch {
    status.className   = 'form-status is-error';
    status.textContent = t('contact-error');
  } finally {
    btnText.textContent = t('contact-submit');
    btn.disabled        = false;
  }
}

// ─────────────────────────────────────────────────────────────────
// COOKIE PANEL
// ─────────────────────────────────────────────────────────────────
function initCookiePanel() {
  // Jeśli brak decyzji i tutorial już zakończony — pokaż baner
  // (jeśli tutorial się zaraz zacznie, to krok cookies w tutorialu przejmie obsługę)
  if (!localStorage.getItem(LS.COOKIE_DECISION) && tutDone) {
    showCookieBanner();
  }

  const footBtn = $('cookieFootBtn');
  if (footBtn) footBtn.addEventListener('click', openCookiePanel);
}

// Pokazuje pierwszy baner
function showCookieBanner() {
  dom.cookieOverlay.innerHTML = renderCookiePanelHtml('overlay', 'banner');
  dom.cookieOverlay.hidden = false;
  dom.cookieOverlay.setAttribute('aria-hidden', 'false');
}

// Przełącza z banera na widok ustawień
function switchToCookieSettings(mode) {
  if (mode === 'tutorial') {
    cookieTutorialView = 'settings';
  }
  const target = mode === 'tutorial' ? dom.panelContent : dom.cookieOverlay;
  target.innerHTML = renderCookiePanelHtml(mode, 'settings');
}

function createUuid() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => {
    const rnd = Math.random() * 16 | 0;
    const val = ch === 'x' ? rnd : (rnd & 0x3 | 0x8);
    return val.toString(16);
  });
}

function getOrCreateStoredValue(key, factory) {
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const value = factory();
  localStorage.setItem(key, value);
  return value;
}

function getCookieConsentCategories() {
  return {
    analytics: localStorage.getItem(LS.COOKIE_ANALYTICS) === 'true',
    marketing: localStorage.getItem(LS.COOKIE_MARKETING) === 'true',
    external_media: localStorage.getItem(LS.COOKIE_EXTERNAL) === 'true',
  };
}

function buildGoogleConsentMode(categories) {
  const analyticsValue = categories.analytics ? 'granted' : 'denied';
  const marketingValue = categories.marketing ? 'granted' : 'denied';

  return {
    analytics_storage: analyticsValue,
    ad_storage: marketingValue,
    ad_user_data: marketingValue,
    ad_personalization: marketingValue,
  };
}

function buildCookieConsentRecord(action) {
  const now = new Date().toISOString();
  const consentId = getOrCreateStoredValue(LS.COOKIE_CONSENT_ID, createUuid);
  const createdAt = getOrCreateStoredValue(LS.COOKIE_CONSENT_CREATED_AT, () => now);
  const anonymousUserId = getOrCreateStoredValue(LS.ANONYMOUS_USER_ID, () => `anon_${createUuid()}`);
  const categories = getCookieConsentCategories();
  const googleConsent = buildGoogleConsentMode(categories);

  localStorage.setItem(LS.COOKIE_CONSENT_UPDATED_AT, now);

  return {
    consent_id: consentId,
    created_at: createdAt,
    updated_at: now,
    policy_version: COOKIE_POLICY_VERSION,
    essential: true,
    analytics: categories.analytics,
    marketing: categories.marketing,
    external_media: categories.external_media,
    action,
    anonymous_user_id: anonymousUserId,
    ...googleConsent,
  };
}

function persistCookieConsent(action) {
  let record;
  try {
    record = buildCookieConsentRecord(action);
  } catch (err) {
    console.warn('Cookie consent local persistence failed:', err);
    return Promise.resolve(false);
  }

  const url = `${FIREBASE_RTDB_BASE}/cookie_consents/${record.anonymous_user_id}/${record.consent_id}.json`;
  return fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
    keepalive: true,
  })
    .then(response => {
      if (!response.ok) throw new Error(`RTDB write failed: ${response.status}`);
      return true;
    })
    .catch(err => {
      console.warn('Cookie consent RTDB write failed:', err);
      return false;
    });
}

// Akceptuje/odrzuca wszystkie opcjonalne kategorie
function cookieDecideAll(accept) {
  const val = accept ? 'true' : 'false';
  localStorage.setItem(LS.COOKIE_DECISION,  accept ? 'all' : 'essential');
  localStorage.setItem(LS.COOKIE_ANALYTICS, val);
  localStorage.setItem(LS.COOKIE_MARKETING, val);
  localStorage.setItem(LS.COOKIE_EXTERNAL,  val);

  applyConsentToGtag();
  persistCookieConsent(accept ? 'accept_all' : 'reject_all');

  if (accept) {
    window.loadGA?.();
    window.maybeTrackHomeVisit?.();
  }
}

// Zapisuje ustawienia z przełączników w panelu
function saveCookieSettings() {
  const getCheck = (id) => {
    const el = document.getElementById(id);
    return el ? el.checked : false;
  };

  const analytics = getCheck('analytics');
  const marketing = getCheck('marketing');
  const external  = getCheck('external');

  localStorage.setItem(LS.COOKIE_DECISION,  'custom');
  localStorage.setItem(LS.COOKIE_ANALYTICS, analytics ? 'true' : 'false');
  localStorage.setItem(LS.COOKIE_MARKETING, marketing ? 'true' : 'false');
  localStorage.setItem(LS.COOKIE_EXTERNAL,  external  ? 'true' : 'false');

  applyConsentToGtag();
  persistCookieConsent('save_preferences');

  if (analytics) {
    window.loadGA?.();
    window.maybeTrackHomeVisit?.();
  }
}

// Aplikuje Consent Mode v2 do Google
function applyConsentToGtag() {
  var update = window.IJanickiAnalytics?.buildConsentUpdate?.();
  if (!update) {
    // Fallback
    const categories = getCookieConsentCategories();
    const googleConsent = buildGoogleConsentMode(categories);
    update = {
      'ad_user_data':          googleConsent.ad_user_data,
      'ad_personalization':    googleConsent.ad_personalization,
      'ad_storage':            googleConsent.ad_storage,
      'analytics_storage':     googleConsent.analytics_storage,
      'functionality_storage': categories.external_media ? 'granted' : 'denied',
      'personalization_storage': categories.external_media ? 'granted' : 'denied',
      'security_storage':      'granted',
    };
  }
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
  window.gtag('consent', 'update', update);
}

// Akcja po podjęciu decyzji (zamknięcie panelu lub przejście tutoriala dalej)
function afterCookieAction(mode) {
  if (mode === 'tutorial') {
    goStep(tutStep + 1);
  } else {
    closeCookiePanel();
  }
}

function openCookiePanel() {
  dom.cookieOverlay.innerHTML = renderCookiePanelHtml('overlay', 'settings');
  dom.cookieOverlay.hidden = false;
  dom.cookieOverlay.setAttribute('aria-hidden', 'false');
}

function closeCookiePanel() {
  dom.cookieOverlay.hidden = true;
  dom.cookieOverlay.setAttribute('aria-hidden', 'true');
  // Jeśli jesteśmy w trakcie tutoriala, na kroku cookies i decyzja właśnie podjęta — przejdź dalej
  if (tutDone) return;
  const steps = getSteps();
  if (steps[tutStep]?.id === 'cookies' && localStorage.getItem(LS.COOKIE_DECISION)) {
    goStep(tutStep + 1);
  }
}

// ─────────────────────────────────────────────────────────────────
// DOCUMENT VIEWER
// ─────────────────────────────────────────────────────────────────
const DOC_TITLES = {
  pl: {
    'regulamin': 'Regulamin witryny',
    'polityka-prywatnosci': 'Polityka prywatności',
    'polityka-rodo': 'Polityka RODO',
    'polityka-wspolpracy': 'Polityka współpracy',
  },
  en: {
    'regulamin': 'Website rules',
    'polityka-prywatnosci': 'Privacy policy',
    'polityka-rodo': 'GDPR policy',
    'polityka-wspolpracy': 'Cooperation policy',
  },
};

function initDocViewer() {
  const docCloseEl = $('docClose');
  if (docCloseEl) docCloseEl.addEventListener('click', closeDoc);
}

function openDoc(name) {
  currentDocName = name;
  dom.docTitle.textContent = DOC_TITLES[currentLang]?.[name] || DOC_TITLES.pl[name] || name;
  dom.docContent.innerHTML = DOCUMENTS_CONTENT[name] ||
    `<p style="padding:2rem;text-align:center;opacity:.5">${t('doc-load-error')}</p>`;
  dom.docOverlay.hidden = false;
  dom.docOverlay.setAttribute('aria-hidden', 'false');
}

function closeDoc() {
  currentDocName = null;
  dom.docOverlay.hidden = true;
  dom.docOverlay.setAttribute('aria-hidden', 'true');
}

// ─────────────────────────────────────────────────────────────────
// FIREBASE FIRESTORE REVIEWS — REST API (no SDK needed)
//
// Required Firestore security rules:
//   match /reviews/{id} {
//     allow read:   if resource.data.approved == true;
//     allow create: if request.resource.data.approved == false;
//     allow update: if resource.data.approved == false
//                   && request.resource.data.approved == true;
//     allow list:   if true;  // needed by runQuery
//   }
//
// For ordered queries, create a composite index in Firebase Console:
//   Collection: reviews | Fields: rating DESC, timestamp DESC
// ─────────────────────────────────────────────────────────────────

/**
 * Pobiera zatwierdzone opinie z Firestore używając runQuery z filtrem.
 * Filtrowanie po approved == true odbywa się po stronie serwera,
 * więc niezatwierdzone opinie nigdy nie opuszczają bazy danych.
 * Wymaga reguły 'allow list' w security rules Firestore.
 */
async function loadReviews(container) {
  if (!container) return;
  container.innerHTML = `<div class="reviews-loading"><span>${t('reviews-loading')}</span></div>`;

  try {
    const res = await fetch(`${FIRESTORE_BASE}:runQuery`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from:  [{ collectionId: 'reviews' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'approved' },
              op:    'EQUAL',
              value: { booleanValue: true },
            },
          },
        },
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    // runQuery zwraca tablicę { document: {...}, readTime: "..." }
    const docs = Array.isArray(data)
      ? data.filter(r => r.document).map(r => r.document)
      : [];

    const reviews = docs.map(d => parseDoc(d));

    if (!reviews.length) {
      container.innerHTML = `<p class="reviews-empty">${t('reviews-empty')}</p>`;
      return;
    }

    container.innerHTML = '';
    reviews.forEach(r => container.appendChild(buildCard(r)));

  } catch (err) {
    console.warn('Reviews load error:', err);
    container.innerHTML = `<p class="reviews-empty" style="opacity:.4">${t('reviews-error')}</p>`;
  }
}


function parseDoc(doc) {
  const f = doc.fields || {};
  return {
    name:      f.name?.stringValue                                      || t('reviews-anonymous'),
    email:     f.email?.stringValue                                     || '',
    comment:   f.comment?.stringValue                                   || '',
    rating:    +(f.rating?.integerValue    ?? f.rating?.doubleValue    ?? 0),
    timestamp: f.timestamp?.timestampValue                              || new Date().toISOString(),
    approved:  f.approved?.booleanValue                                 || false,
  };
}

function buildCard(r) {
  const div  = document.createElement('div');
  div.className = `review-card${r.rating >= 5 ? ' max-stars' : ''}`;
  const filled = '★'.repeat(Math.max(0, Math.min(5, r.rating)));
  const empty  = '☆'.repeat(5 - filled.length);
  const date   = new Date(r.timestamp).toLocaleDateString(currentLang === 'en' ? 'en-GB' : 'pl-PL', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  // Class names match styles.css: .review-card-stars / .review-card-name / .review-card-comment / .review-card-date
  div.innerHTML = `
    <div class="review-card-stars">${filled}${empty}</div>
    <p class="review-card-comment">${escHtml(r.comment)}</p>
    <div class="review-card-name">${escHtml(r.name)}</div>
    <div class="review-card-date">${date}</div>`;

  // Kliknięcie karty otwiera modal podglądu z pełnym tekstem
  div.addEventListener('click', (e) => {
    e.stopPropagation();
    openReviewPreview(r, filled, empty, date);
  });

  return div;
}

function openReviewPreview(r, filled, empty, date) {
  // Usuń istniejący overlay jeśli jest
  const existing = document.querySelector('.review-preview-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'review-preview-overlay';
  overlay.innerHTML = `
    <div class="review-preview-card">
      <button class="review-preview-close" aria-label="${t('close')}">✕</button>
      <div class="review-preview-stars">${filled}${empty}</div>
      <p class="review-preview-comment">${escHtml(r.comment)}</p>
      <div class="review-preview-name">${escHtml(r.name)}</div>
      <div class="review-preview-date">${date}</div>
    </div>`;

  document.body.appendChild(overlay);

  // Zamknięcie po kliknięciu w overlay (tło) lub przycisk X
  const close = () => overlay.remove();
  overlay.querySelector('.review-preview-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  // Zamknięcie po Escape
  const onKey = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
}

// ─────────────────────────────────────────────────────────────────
// REVIEW FORM
// ─────────────────────────────────────────────────────────────────

async function checkReviewLimits(email) {
  try {
    // Użyj listDocuments zamiast runQuery — unikamy błędu 403 (brak uprawnienia 'list')
    const res = await fetch(`${FIRESTORE_BASE}/reviews`, {
      method:  'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const docs = data.documents || [];

    // Filtruj po emailu po stronie klienta
    const reviews = docs.map(d => parseDoc(d))
      .filter(r => r.email === email);

    if (!reviews.length) {
      return { blocked: false };
    }

    const now = Date.now();
    const day24h = 24 * 60 * 60 * 1000;
    const day7 = 7 * 24 * 60 * 60 * 1000;

    // 1. Czy email ma już zatwierdzoną opinię?
    const approved = reviews.find(r => r.approved === true);
    if (approved) {
      return {
        blocked: true,
        message: t('reviews-already-submitted')
      };
    }

    // 2. Która opinia jest najnowsza?
    const newest = reviews.sort((a, b) =>
      new Date(b.timestamp) - new Date(a.timestamp)
    )[0];

    if (!newest) {
      return { blocked: false };
    }

    const lastTime = new Date(newest.timestamp).getTime();
    const timeSince = now - lastTime;

    // 3. Jeśli ostatnia nie zatwierdzona i < 7 dni
    if (!newest.approved && timeSince < day7) {
      const daysLeft = Math.ceil((day7 - timeSince) / (24 * 60 * 60 * 1000));
      return {
        blocked: true,
        message: tf('reviews-wait-days', { days: daysLeft })
      };
    }

    // 4. Jeśli jakkolwiek ostatnia < 24h
    if (timeSince < day24h) {
      const hoursLeft = Math.ceil((day24h - timeSince) / (60 * 60 * 1000));
      return {
        blocked: true,
        message: tf('reviews-wait-hours', { hours: hoursLeft })
      };
    }

    return { blocked: false };

  } catch (err) {
    console.warn('Review limit check error:', err);
    return { blocked: false }; // na wypadek błędu — nie blokuj
  }
}

function setupReviewForm() {
  const starPicker = $('modalStarPicker');
  const reviewForm = $('modalReviewForm');

  if (!starPicker || !reviewForm) return;

  starPicker.querySelectorAll('.star').forEach(star => {
    star.addEventListener('click', () => {
      reviewRating = +star.dataset.val;
      $('modalReviewRating').value = reviewRating;
      renderStars(reviewRating);
      starPicker.classList.toggle('is-max', reviewRating === 5);
    });
    star.addEventListener('mouseenter', () => renderStars(+star.dataset.val, true));
  });
  starPicker.addEventListener('mouseleave', () => renderStars(reviewRating));

  reviewForm.addEventListener('submit', submitReview);
}

function renderStars(n, hover = false) {
  dom.starPicker.querySelectorAll('.star').forEach((s, i) => {
    s.classList.toggle('is-active', i < n);
    s.classList.toggle('is-hover',  hover && i < n);
  });
}

async function submitReview(e) {
  e.preventDefault();

  if (!reviewRating) {
    setReviewStatus('err', t('reviews-choose-rating'));
    return;
  }

  const name    = $('modalReviewName').value.trim();
  const email   = $('modalReviewEmail').value.trim();
  const comment = $('modalReviewComment').value.trim();

  // Walidacja imienia (min. 3 znaki bez spacji)
  if (name.replace(/\s/g, '').length < 3) {
    setReviewStatus('err', t('reviews-invalid-name'));
    return;
  }

  // Walidacja e-mail
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    setReviewStatus('err', t('reviews-invalid-email'));
    return;
  }

  if (!comment || comment.length < 5) {
    setReviewStatus('err', t('reviews-invalid-comment'));
    return;
  }

  const submitBtn = dom.reviewForm.querySelector('.review-submit-btn');
  submitBtn.disabled = true;
  setReviewStatus('', t('reviews-checking'));

  // Sprawdź ograniczenia emaila
  const limitCheck = await checkReviewLimits(email);
  if (limitCheck.blocked) {
    submitBtn.disabled = false;
    setReviewStatus('err', limitCheck.message);
    return;
  }

  setReviewStatus('', t('reviews-sending'));

  try {
    // 1 — Zapisz do Firestore (approved:false — do zatwierdzenia przez właściciela e-mailem)
    const fsRes = await fetch(`${FIRESTORE_BASE}/reviews`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          name:      { stringValue:    name                     },
          email:     { stringValue:    email                    },
          comment:   { stringValue:    comment                  },
          rating:    { integerValue:   String(reviewRating)     },
          timestamp: { timestampValue: new Date().toISOString() },
          approved:  { booleanValue:   false                    },
        },
      }),
    });
    if (!fsRes.ok) throw new Error(`Firestore ${fsRes.status}`);

    // 2 — Pobierz ID nowo utworzonego dokumentu
    const fsData = await fsRes.json();
    const docId  = fsData.name?.split('/').pop() || '';

    // 3 — Wyślij e-mail do AUTORA opinii z prośbą o potwierdzenie (EmailJS)
    const verifyUrl = `https://i-janicki.pl?verify_review=${docId}&email=${encodeURIComponent(email)}`;
    try {
      const emailRes = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id:  EMAILJS_SERVICE,
          template_id: EMAILJS_TEMPLATE,
          user_id:     EMAILJS_KEY,
          template_params: {
            to_email:   email,
            name:       name,
            verify_url: verifyUrl,
          },
        }),
      });
      if (!emailRes.ok) {
        console.warn('EmailJS błąd:', emailRes.status, await emailRes.text());
      }
    } catch (emailErr) {
      console.warn('EmailJS fetch nieudany:', emailErr);
    }

    // Jeśli formularz jest w modalu — zamknij modal; jeśli w tutorialu — nie zamykaj
    const isInModal = dom.reviewForm.closest('.modal-root') !== null;
    if (isInModal) {
      const formContainer = dom.reviewForm.closest('.modal-review-form-container');
      formContainer.innerHTML = `
        <div class="review-success">
          <p class="review-success-msg">${t('reviews-success')}</p>
        </div>`;
      reviewRating = 0;
      setTimeout(() => { closeModal(); finishTutorial(); }, 3000);
    } else {
      // Jesteśmy w tutorialu — formularz jest w panelu, podmieniamy zawartość
      const formContainer = dom.reviewForm.closest('.modal-review-form-container');
      if (formContainer) {
        formContainer.innerHTML = `
          <div class="review-success">
            <p class="review-success-msg">${t('reviews-success')}</p>
          </div>`;
      }
      reviewRating = 0;
      // Od razu zakończ tutorial (bez closeModal, bo modal nie jest otwarty)
      setTimeout(() => finishTutorial(), 1500);
    }

  } catch (err) {
    console.warn(err);
    setReviewStatus('err', t('reviews-submit-error'));
  } finally {
    if (submitBtn && submitBtn.parentNode) {
      submitBtn.disabled = false;
    }
  }
}

function setReviewStatus(type, msg) {
  // Base class matches HTML: class="review-form-status"
  const cls = type === 'ok' ? 'review-form-status is-ok'
            : type === 'err' ? 'review-form-status is-error'
            : 'review-form-status';
  dom.reviewStatus.className   = cls;
  dom.reviewStatus.textContent = msg;
}

// ─────────────────────────────────────────────────────────────────
// PANEL HELPER
// ─────────────────────────────────────────────────────────────────
function setPanel(title, html, showLogo = false, showHeader = true) {
  removeFaqBtn();
  if (dom.panelTitle) dom.panelTitle.textContent = title;
  if (dom.panelHeader) dom.panelHeader.hidden = !showHeader;
  if (dom.panelContent) dom.panelContent.innerHTML = html;
  const logo = document.getElementById('panelLogo');
  if (logo) logo.hidden = !showLogo;
  // [data-doc] and [data-topic] are handled by global delegation in initGlobalClick()
}

// ─────────────────────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}

// ─────────────────────────────────────────────────────────────────
// WERYFIKACJA OPINII (link z e-maila autora)
// Firestore security rules should allow:
//   allow update: if resource.data.approved == false
//                 && request.resource.data.approved == true;
// ─────────────────────────────────────────────────────────────────
async function handleApproveReview() {
  const params   = new URLSearchParams(window.location.search);
  const reviewId = params.get('verify_review');
  const email    = params.get('email');
  if (!reviewId) return;

  // Usuń parametr z URL natychmiast
  history.replaceState({}, '', window.location.pathname);

  try {
    const res = await fetch(
      `${FIRESTORE_BASE}/reviews/${reviewId}?updateMask.fieldPaths=approved`,
      {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ fields: { approved: { booleanValue: true } } }),
      }
    );
    if (res.ok) {
      // Krótkie opóźnienie aby Firestore zdążył z propagacją zmiany approved=true
      await new Promise(r => setTimeout(r, 500));

      // Pobierz dane opinii aby wysłać powiadomienie do właściciela
      const getRes = await fetch(`${FIRESTORE_BASE}/reviews/${reviewId}`);
      if (getRes.ok) {
        const doc = await getRes.json();
        const review = parseDoc(doc);

        // Wyślij powiadomienie do WŁAŚCICIELA
        fetch('https://api.web3forms.com/submit', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_key: WEB3FORMS_KEY,
            to_email:   OWNER_EMAIL,
            subject:    `i-janicki.pl — nowa opinia (${review.rating}★) od ${review.name}`,
            from_name:  'i-JANICKI Opinie',
            message: [
              `Ocena:  ${review.rating}/5`,
              `Imię:   ${review.name}`,
              `E-mail: ${review.email || '(anonimowy)'}`,
              `Opinia: ${review.comment}`,
              '',
              'Opinia została zatwierdzona i opublikowana na stronie.',
            ].join('\n'),
          }),
        }).catch(() => {});
      }

      showToast(t('verify-success'), 'ok');
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn('Verify error:', err);
    showToast(t('verify-error'), 'err');
  }
}

function showToast(msg, type = '') {
  const toast = document.createElement('div');
  toast.className = `verify-toast${type ? ' is-' + type : ''}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ─────────────────────────────────────────────────────────────────
// PERSONALIZOWANY KURSOR
// ─────────────────────────────────────────────────────────────────
function initCursor() {
  // Nie inicjalizuj na urządzeniach dotykowych
  if (window.matchMedia('(pointer: coarse)').matches) return;

  const dot  = $('cursorDot');
  const ring = $('cursorRing');
  if (!dot || !ring) return;

  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let ringX  = mouseX;
  let ringY  = mouseY;

  // Ustaw pozycję dot natychmiast (bez lagowania)
  document.addEventListener('mousemove', e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    dot.style.left = mouseX + 'px';
    dot.style.top  = mouseY + 'px';
  }, { passive: true });

  // Ring podąża z efektem sprężyny (lerp)
  (function animRing() {
    ringX += (mouseX - ringX) * 0.18;
    ringY += (mouseY - ringY) * 0.18;
    ring.style.left = ringX.toFixed(1) + 'px';
    ring.style.top  = ringY.toFixed(1) + 'px';
    requestAnimationFrame(animRing);
  })();

  // Efekt hover nad interaktywnymi elementami
  const INTERACTIVE = 'a, button, input, textarea, select, label, [role="button"], .card, .opt, .snav-item, .star, .tut-btn, .review-card';
  document.addEventListener('mouseover', e => {
    if (e.target.closest(INTERACTIVE)) {
      dot.classList.add('is-hover');
      ring.classList.add('is-hover');
    }
  });
  document.addEventListener('mouseout', e => {
    if (e.target.closest(INTERACTIVE)) {
      dot.classList.remove('is-hover');
      ring.classList.remove('is-hover');
    }
  });

  // Efekt kliknięcia
  const MOUTH_NORMAL = 'M94 128 Q110 136 126 128';
  const MOUTH_CLICK  = 'M100 126 a10,8 0 0,1 20,0 a10,8 0 0,1 -20,0';

  document.addEventListener('mousedown', () => {
    dot.classList.add('is-click');
    ring.classList.add('is-click');
    const m = document.getElementById('botMouth');
    if (m) { m.setAttribute('d', MOUTH_CLICK); m.setAttribute('fill', '#0f1320'); }
  });
  document.addEventListener('mouseup', () => {
    dot.classList.remove('is-click');
    ring.classList.remove('is-click');
    const m = document.getElementById('botMouth');
    if (m) { m.setAttribute('d', MOUTH_NORMAL); m.setAttribute('fill', 'none'); }
  });

  // Ukryj gdy kursor opuszcza okno
  document.addEventListener('mouseleave', () => {
    dot.style.opacity = '0';
    ring.style.opacity = '0';
  });
  document.addEventListener('mouseenter', () => {
    dot.style.opacity = '';
    ring.style.opacity = '';
  });
}

// ─────────────────────────────────────────────────────────────────
// SERVICE WORKER
// ─────────────────────────────────────────────────────────────────
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(r => r.unregister());
    });
  }
}

// ─────────────────────────────────────────────────────────────────
// FAQ — przycisk + modal z akordeonem
// ─────────────────────────────────────────────────────────────────
const FAQ_ITEMS = {
  pl: [
    {
      q: 'Jakie usługi oferuje i-JANICKI?',
      a: 'i-JANICKI to kompleksowe usługi IT: tworzenie stron internetowych i aplikacji webowych na zamówienie, projektowanie logo i identyfikacji wizualnej, konfiguracja sieci LAN/WLAN i VPN, a także bieżąca opieka IT w abonamencie. Obsługuję klientów ze Środy Śląskiej i okolic oraz zdalnie z całej Polski.',
    },
    {
      q: 'Ile kosztuje wykonanie strony internetowej na zamówienie?',
      a: 'Ceny stron internetowych na zamówienie zaczynają się od 1 500 zł za prostą stronę wizytówkową lub portfolio. Rozbudowane portale i sklepy internetowe wyceniam indywidualnie — po krótkiej rozmowie o zakresie i funkcjonalnościach. Zawsze otrzymujesz szczegółową wycenę przed podpisaniem umowy, bez ukrytych kosztów.',
    },
    {
      q: 'Jak długo trwa stworzenie strony internetowej?',
      a: 'Czas realizacji zależy od złożoności projektu. Prosta strona wizytówkowa jest gotowa zazwyczaj w 1–2 tygodnie, rozbudowany portal lub aplikacja webowa — w 4–12 tygodni. Na każdym etapie informuję o postępach i konsultuję kluczowe decyzje projektowe.',
    },
    {
      q: 'Czy tworzysz strony internetowe dla firm ze Środy Śląskiej i okolic?',
      a: 'Tak — tworzę strony internetowe dla firm ze Środy Śląskiej, powiatu średzkiego i całego Dolnego Śląska, a projekty realizuję również zdalnie dla klientów z całej Polski. Każda strona jest responsywna, szybka i przygotowana pod wyszukiwarki.',
    },
    {
      q: 'Czy strony internetowe tworzone przez i-JANICKI są responsywne i szybkie?',
      a: 'Tak. Każda strona, którą tworzę, działa poprawnie na smartfonach, tabletach i komputerach. Dbam o szybkie ładowanie, lekki kod i optymalizację grafik — co przekłada się na lepsze wyniki w Google PageSpeed i wyższe pozycje w wyszukiwarce.',
    },
    {
      q: 'Czy tworzysz aplikacje webowe i mobilne na zamówienie?',
      a: 'Tak. Projektuję i wdrażam aplikacje webowe z logiką biznesową, integracjami API i panelami administracyjnymi. Tworzę też aplikacje mobilne i integruję je ze stronami internetowymi lub innymi systemami. Każdy projekt jest dopasowany do indywidualnych potrzeb klienta.',
    },
    {
      q: 'Jak wygląda współpraca przy tworzeniu strony internetowej?',
      a: 'Proces przebiega w 5 krokach: (1) wstępna rozmowa o celach i zakresie, (2) wycena i podpisanie umowy, (3) realizacja etapami z regularnym raportowaniem, (4) testy na różnych urządzeniach i przeglądarkach z poprawkami, (5) wdrożenie i wsparcie po starcie. Zero niespodzianek.',
    },
    {
      q: 'Czy oferujesz opiekę IT i wsparcie po oddaniu strony?',
      a: 'Tak — w ramach abonamentu IT oferuję bieżące wsparcie techniczne, aktualizacje, monitoring bezpieczeństwa i drobne modyfikacje strony. To idealne rozwiązanie dla firm, które chcą mieć pewność, że ich strona internetowa zawsze działa sprawnie i bezpiecznie.',
    },
  ],
  en: [
    {
      q: 'What services does i-JANICKI offer?',
      a: 'i-JANICKI provides end-to-end IT services: custom websites and web apps, logo and visual identity design, LAN/WLAN and VPN network setup, and ongoing IT support on a subscription basis. I work with local clients in Sroda Slaska and nearby areas as well as remote clients across Poland.',
    },
    {
      q: 'How much does a custom website cost?',
      a: 'Custom website projects start from PLN 1,500 for a simple business-card site or portfolio. Larger portals and e-commerce projects are quoted individually after a short conversation about scope and features. You always receive a detailed quote before any agreement is signed.',
    },
    {
      q: 'How long does it take to build a website?',
      a: 'Delivery time depends on the project scope. A simple business-card website is usually ready in 1 to 2 weeks, while a larger portal or web application may take 4 to 12 weeks. I keep you updated at every stage and discuss key decisions along the way.',
    },
    {
      q: 'Do you build websites for companies in Sroda Slaska and nearby areas?',
      a: 'Yes. I build websites for companies in Sroda Slaska, Sroda County, and across Lower Silesia, and I also deliver projects remotely for clients throughout Poland. Every website is responsive, fast, and search-engine friendly.',
    },
    {
      q: 'Are websites built by i-JANICKI responsive and fast?',
      a: 'Yes. Every website I build works well on phones, tablets, and desktops. I focus on fast loading, lightweight code, and optimized images, which helps achieve better Google PageSpeed results and stronger visibility in search.',
    },
    {
      q: 'Do you build custom web and mobile applications?',
      a: 'Yes. I design and implement web applications with business logic, API integrations, and admin panels. I also create mobile apps and connect them with websites or other systems. Every project is tailored to the client\'s needs.',
    },
    {
      q: 'What does collaboration look like when building a website?',
      a: 'The process follows 5 steps: (1) an initial conversation about goals and scope, (2) quote and agreement, (3) staged implementation with regular updates, (4) testing on different devices and browsers with revisions, and (5) launch and post-launch support. No surprises.',
    },
    {
      q: 'Do you offer IT support after launch?',
      a: 'Yes. As part of the IT support subscription, I provide ongoing technical support, updates, security monitoring, and small website adjustments. It is a good fit for companies that want confidence that their site keeps working smoothly and securely.',
    },
  ],
};

function injectFaqBtn() {
  const panel = $('panel');
  if (!panel) return;
  removeFaqBtn();
  const btn = document.createElement('button');
  btn.className = 'panel-faq-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', t('faq-aria'));
  btn.textContent = 'FAQ';
  btn.addEventListener('click', openFaqModal);
  panel.appendChild(btn);
}

function removeFaqBtn() {
  $('panel')?.querySelector('.panel-faq-btn')?.remove();
}

function openFaqModal() {
  document.querySelector('.faq-modal-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'faq-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', t('faq-aria'));

  const itemsHtml = (FAQ_ITEMS[currentLang] || FAQ_ITEMS.pl).map((item, i) => `
    <div class="faq-item">
      <button class="faq-question" type="button" aria-expanded="false" aria-controls="faq-ans-${i}">
        <span>${escHtml(item.q)}</span>
        <span class="faq-chevron" aria-hidden="true">▾</span>
      </button>
      <div class="faq-answer" id="faq-ans-${i}" hidden>
        <p>${escHtml(item.a)}</p>
      </div>
    </div>
  `).join('');

  overlay.innerHTML = `
    <div class="faq-modal">
      <div class="faq-modal-header">
        <div>
          <h2 class="faq-modal-title">FAQ</h2>
          <p class="faq-modal-sub">${t('faq-subtitle')}</p>
        </div>
        <button class="faq-modal-close" type="button" aria-label="${t('close-faq')}">✕</button>
      </div>
      <div class="faq-list">${itemsHtml}</div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => { if (e.target === overlay) closeFaqModal(); });
  overlay.querySelector('.faq-modal-close').addEventListener('click', closeFaqModal);

  overlay.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const isOpen  = btn.getAttribute('aria-expanded') === 'true';
      const answerId = btn.getAttribute('aria-controls');
      overlay.querySelectorAll('.faq-question').forEach(b => {
        b.setAttribute('aria-expanded', 'false');
        b.closest('.faq-item').classList.remove('is-open');
        const a = document.getElementById(b.getAttribute('aria-controls'));
        if (a) a.hidden = true;
      });
      if (!isOpen) {
        btn.setAttribute('aria-expanded', 'true');
        btn.closest('.faq-item').classList.add('is-open');
        const ans = document.getElementById(answerId);
        if (ans) ans.hidden = false;
      }
    });
  });

  const onKey = e => {
    if (e.key === 'Escape') { closeFaqModal(); document.removeEventListener('keydown', onKey); }
  };
  document.addEventListener('keydown', onKey);

  requestAnimationFrame(() => overlay.classList.add('is-visible'));
}

function closeFaqModal() {
  const overlay = document.querySelector('.faq-modal-overlay');
  if (!overlay) return;
  overlay.classList.remove('is-visible');
  setTimeout(() => overlay.remove(), 280);
}
