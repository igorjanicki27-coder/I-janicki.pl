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
const EMAILJS_SERVICE  = 'service_0m7ieum';
const EMAILJS_TEMPLATE = 'template_gd8aaq5';
const EMAILJS_KEY      = 'BugGXsqvUvMyP4buf';
const OWNER_EMAIL      = 'igor.janicki27@gmail.com';
const WEB3FORMS_KEY    = 'e1b3a82b-63d0-4f05-a808-676a7b22537a';

// ─────────────────────────────────────────────────────────────────
// STORAGE KEYS
// ─────────────────────────────────────────────────────────────────
const LS = {
  NAME:             'ijanek_name',
  COOKIE_DECISION:  'ijanek_cookie_decision',
  COOKIE_ANALYTICS: 'ijanek_cookie_analytics',
  TUTORIAL_DONE:    'ijanek_tutorial_done',
  THEME:            'ijanek_theme',
  LANG:             'ijanek_lang',
};
const SS = { SECTION: 'ijanek_active_section' };

// ─────────────────────────────────────────────────────────────────
// TUTORIAL STEPS
// 0:greeting(+lang+theme)  1:cookies  2:name  3-8:sections  9:reviews
// ─────────────────────────────────────────────────────────────────
const STEPS = [
  { id: 'greeting'                                            },  // 0 (lang+theme inside)
  { id: 'cookies'                                             },  // 1
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
  get cookieToggle()   { return $('cookieAnalyticsToggle'); },
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
  window.maybeTrackHomeVisit?.();

  if (tutDone) {
    showReturning();
  } else {
    startTutorial();
  }
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
    'greeting-title': 'i-JANEK',
    'greeting-text': '<p>Cześć! Jestem <strong>i-JANEK</strong> — Twój wirtualny asystent.</p><p>Skonfiguruj kilka preferencji, a potem wyruszamy w podróż po ofercie <strong>i-JANICKI</strong>!</p>',
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
    'send-btn': 'Wyślij →',
    'cookie-title': 'Pliki cookie 🍪',
    'cookie-decided': 'Twoje preferencje cookie zostały zapisane.',
    'cookie-ga-on': '✓ włączony',
    'cookie-ga-off': '✗ wyłączony',
    'cookie-change': 'Możesz je zmienić w każdej chwili — kliknij 🍪 w stopce.',
    'cookie-msg': 'Ta strona korzysta z plików cookie. <strong>Niezbędne</strong> (sesja, imię, preferencje) zawsze aktywne.',
    'cookie-ask': 'Czy wyrażasz zgodę na <strong>Google Analytics</strong>?',
    'cookie-essential': 'Tylko niezbędne',
    'cookie-all': 'Akceptuję wszystkie',
    'cookie-doc-privacy': 'Polityka prywatności i cookies →',
    'cookie-doc-rodo': 'Polityka RODO →',
    'cookie-doc-coop': 'Polityka współpracy →',
  },
  en: {

    'btn-about': 'About',
    'btn-services': 'Services',
    'btn-projects': 'Projects',
    'btn-process': 'Collaboration',
    'btn-pricing': 'Pricing',
    'btn-contact': 'Contact',
    'btn-reviews': 'Reviews',
    'greeting-title': 'i-JANEK',
    'greeting-text': '<p>Hello! I\'m <strong>i-JANEK</strong> — your virtual assistant.</p><p>I\'ll help you learn more about <strong>i-JANICKI</strong> services.</p>',
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
    'send-btn': 'Send →',
    'cookie-title': 'Cookies 🍪',
    'cookie-decided': 'Your cookie preferences have been saved.',
    'cookie-ga-on': '✓ enabled',
    'cookie-ga-off': '✗ disabled',
    'cookie-change': 'You can change them anytime — click 🍪 in the footer.',
    'cookie-msg': 'This site uses cookies. <strong>Essential</strong> (session, name, preferences) are always active.',
    'cookie-ask': 'Do you agree to <strong>Google Analytics</strong>?',
    'cookie-essential': 'Essential only',
    'cookie-all': 'Accept all',
    'cookie-doc-privacy': 'Privacy & cookies policy →',
    'cookie-doc-rodo': 'GDPR policy →',
    'cookie-doc-coop': 'Collaboration policy →',
  },

};

let currentLang = 'pl';

function initLang() {
  const saved = localStorage.getItem(LS.LANG) || 'pl';
  currentLang = saved;
  document.documentElement.lang = saved;
  applyLanguage(saved);
}

function changeLang(lang) {
  currentLang = lang;
  document.documentElement.lang = lang;
  localStorage.setItem(LS.LANG, lang);
  applyLanguage(lang);
  // Jeśli jesteśmy na kroku powitalnym, przerysuj go żeby zmienić tekst
  const steps = getSteps();
  if (steps[tutStep]?.id === 'greeting') {
    renderGreeting();
  }
}

function t(key) {
  return TRANSLATIONS[currentLang]?.[key] ?? TRANSLATIONS.pl[key] ?? key;
}

function applyLanguage(lang) {
  document.querySelectorAll('[data-topic]').forEach(btn => {
    const topic = btn.dataset.topic;
    if (topic === 'tutorial') {
      btn.textContent = lang === 'en' ? '⟳ Tutorial' : '⟳ Samouczek';
    } else {
      btn.textContent = getLangLabel(topic, lang);
    }
  });

  if (dom.tutNext) {
    const steps = getSteps();
    const isLastSec = tutStep === (steps.length - 2); // Last section before finish
    dom.tutNext.textContent = lang === 'en' ? 'Next →' : 'Dalej →';
  }

  if (dom.tutBack) dom.tutBack.textContent = '←';
  if (dom.tutSkip) dom.tutSkip.textContent = lang === 'en' ? 'Skip' : 'Pomiń';
}

function getLangLabel(topic, lang) {
  const labels = {
    pl: { about: 'O mnie', services: 'Usługi', projects: 'Projekty', process: 'Współpraca', pricing: 'Cennik', contact: 'Kontakt', reviews: 'Opinie' },
    en: { about: 'About', services: 'Services', projects: 'Projects', process: 'Collaboration', pricing: 'Pricing', contact: 'Contact', reviews: 'Reviews' },
  };
  return labels[lang]?.[topic] ?? labels.pl[topic];
}

// ─────────────────────────────────────────────────────────────────
// EYE TRACKING
// ─────────────────────────────────────────────────────────────────
function initEyeTracking() {
  document.addEventListener('mousemove', trackEyes, { passive: true });
}

function trackEyes(e) {
  const svg = dom.botSvg;
  if (!svg) return;
  try {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const sp = pt.matrixTransform(svg.getScreenCTM().inverse());
    moveEye(dom.pupilL, dom.shineL,  88, 100, sp.x, sp.y, 5);
    moveEye(dom.pupilR, dom.shineR, 132, 100, sp.x, sp.y, 5);
  } catch (_) { /* SVG not yet painted */ }
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
    const docBtn   = e.target.closest('[data-doc]');
    const topicBtn = e.target.closest('[data-topic]');
    const closeBtn = e.target.closest('[data-close]');

    if (docBtn)   { openDoc(docBtn.dataset.doc);          return; }
    if (topicBtn) { handleTopic(topicBtn.dataset.topic);  return; }
    if (closeBtn) { closeModal();                          return; }
  });

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!dom.docOverlay.hidden)    { closeDoc();         return; }
    if (!dom.cookieOverlay.hidden) { closeCookiePanel(); return; }
    if (!dom.modalRoot.hidden)     { closeModal();       return; }
  });

  // Tutorial nav buttons
  $('tutBack').addEventListener('click', () => {
    if (tutStep > 0) goStep(tutStep - 1);
  });

  $('tutSkip').addEventListener('click', () => {
    const steps = getSteps();
    goStep(steps.length - 1);
  });

  $('tutNext').addEventListener('click', () => {
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
  dom.tutDots.innerHTML = '';
  const steps = getSteps();
  for (let i = 0; i < steps.length; i++) {
    const d = document.createElement('button');
    d.className = 'tut-dot';
    d.type = 'button';
    d.setAttribute('aria-label', `Krok ${i + 1}`);
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
    const canClick = i <= maxVisited + 1;
    d.disabled = !canClick;
  });
}

function refreshNavButtons() {
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
  dom.tutNext.textContent         = isLast ? 'Zakończ' : 'Dalej →';
  dom.tutNext.classList.toggle('is-send', isLast);

  // Skip button disabled — can't skip to unvisited steps
  dom.tutSkip.disabled            = true;
  dom.tutSkip.style.display       = 'none';

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

  const stage = document.getElementById('stage');
  if (stage) stage.scrollTop = 0;
  window.scrollTo({ top: 0 });

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
    case 'cookies':  renderCookieStep();      break;
    case 'reviews':  renderReviewStep();      break;
    default:         renderSectionStep(step); break;
  }
}

// ─── Step renders ─────────────────────────────────────────────────

function renderGreeting() {
  const isDark = document.documentElement.dataset.theme !== 'light';

  setPanel('i-JANEK', `
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
  setPanel('Jak mam się do Ciebie zwracać?', `
    <div class="tut-message">
      <div class="name-input-wrap">
        <input type="text" class="name-input" id="nameInput"
               placeholder="Wpisz swoje imię…"
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
  const decided     = !!localStorage.getItem(LS.COOKIE_DECISION);
  const analyticsOn = localStorage.getItem(LS.COOKIE_ANALYTICS) === 'true';

  const html = decided
    ? `<div class="tut-message">
         <p>${t('cookie-decided')}</p>
         <p>Google Analytics: <strong>${analyticsOn ? t('cookie-ga-on') : t('cookie-ga-off')}</strong>.</p>
         <p>${t('cookie-change')}</p>
       </div>`
    : `<div class="tut-message">
         <p>${t('cookie-msg')}</p>
         <p>${t('cookie-ask')}</p>
         <div class="cookie-inline-btns">
           <button class="cookie-btn cookie-btn-essential" id="tutCookieNo">${t('cookie-essential')}</button>
           <button class="cookie-btn cookie-btn-all"       id="tutCookieYes">${t('cookie-all')}</button>
         </div>
         <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:.75rem">
           <button class="cookie-doc-link" data-doc="polityka-prywatnosci">${t('cookie-doc-privacy')}</button>
           <button class="cookie-doc-link" data-doc="polityka-rodo">${t('cookie-doc-rodo')}</button>
           <button class="cookie-doc-link" data-doc="polityka-wspolpracy">${t('cookie-doc-coop')}</button>
         </div>
       </div>`;

  setPanel(t('cookie-title'), html);


  $('tutCookieNo')?.addEventListener('click',  () => { cookieDecide(false); goStep(tutStep + 1); });
  $('tutCookieYes')?.addEventListener('click', () => { cookieDecide(true);  goStep(tutStep + 1); });
}

const SECTION_MSG = {
  about:    n  => `Pozwól, że się przedstawię${n}! Tutaj dowiesz się, <strong>kim jestem</strong>, skąd pochodzę i czym się zajmuję.`,
  services: _n => `Tu znajdziesz moje <strong>Usługi</strong> — strony, aplikacje webowe, sieci LAN/WLAN i opieka IT.`,
  projects: _n => `Moje <strong>Projekty</strong> — wybrane realizacje. Zerknij, co już stworzyłem.`,
  process:  _n => `Tak wygląda <strong>Proces współpracy</strong> — od pierwszej rozmowy do wdrożenia. Zero niespodzianek.`,
  pricing:  _n => `Orientacyjny <strong>Cennik</strong>. Każdy projekt wyceniam indywidualnie — tu znajdziesz punkt wyjścia.`,
  contact:  n  => `Czas na <strong>Kontakt</strong>${n}! Masz pytanie lub projekt? Napisz — chętnie porozmawiam! 😊`,
};

function renderSectionStep(step) {
  const n   = userName ? `, ${escHtml(userName)}` : '';
  const msg = SECTION_MSG[step.id]?.(n) ?? step.label;

  // Treść sekcji wewnątrz panelu robota (nie osobny panel boczny)
  setPanel('i-JANEK', `
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
  const n = userName ? `, ${escHtml(userName)}` : '';
  const msg = `Mamy prawie koniec${n}! ⭐ Chcesz wystawić opinię lub zobaczyć, co piszą inni?`;

  setPanel('i-JANEK', `
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

  const n = userName ? escHtml(userName) : 'Przyjacielu';
  setPanel('Witaj ponownie!', `
    <div class="tut-message">
      <p><strong>To już jest koniec!</strong></p>
      <p>${n}, prowadziłem Cię po wszystkich zakładkach jakie możesz znaleźć na tej stronie. Jeżeli chciałbyś do czegoś wrócić - wybierz temat poniżej, a jeżeli chcesz abym oprowadził Cię po stronie ponownie - kliknij Prezentacja!</p>
    </div>
    <div class="tut-options">
      <button class="snav-item" data-topic="about">👤 O mnie</button>
      <button class="snav-item" data-topic="services">⚙ Usługi</button>
      <button class="snav-item" data-topic="projects">🗂 Projekty</button>
      <button class="snav-item" data-topic="process">🤝 Współpraca</button>
      <button class="snav-item" data-topic="pricing">💰 Cennik</button>
      <button class="snav-item" data-topic="contact">✉ Kontakt</button>
      <button class="snav-item" data-topic="tutorial"><span>⟳</span> Prezentacja</button>
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

function finishTutorial() {
  markTutorialDone();
  dom.tutProgress.hidden = true;
  dom.tutNav.hidden      = true;
  const brandName = document.querySelector('.brand-name');
  if (brandName) {
    brandName.textContent = 'i-JANICKI';
    brandName.style.display = '';
  }
  const n = userName ? escHtml(userName) : '';
  setPanel('To już jest koniec!', `
    <div class="tut-message">
      <p>Świetnie! ${n ? 'Masz już ogólny pogląd na to, czym się zajmuję, <strong>' + escHtml(n) + '</strong>.' : 'Masz już ogólny pogląd na to, czym się zajmuję.'}
        Klikając w sekcje poniżej, możesz wrócić do interesujących Cię informacji, albo jeszcze raz przejść samouczek.</p>
    </div>
    <div class="options">
      <button class="opt" data-topic="about">👤 O mnie</button>
      <button class="opt" data-topic="services">⚙️ Usługi</button>
      <button class="opt" data-topic="projects">🗂 Projekty</button>
      <button class="opt" data-topic="process">🤝 Współpraca</button>
      <button class="opt" data-topic="pricing">💰 Cennik</button>
      <button class="opt" data-topic="contact">✉️ Kontakt</button>
      <button class="opt" data-topic="reviews">⭐ Opinie</button>
      <button class="opt" data-topic="tutorial"><span class="opt-icon">⟳</span> Prezentacja</button>
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
  dom.tutProgress.hidden = true;
  dom.tutNav.hidden      = true;
  const brandName = document.querySelector('.brand-name');
  if (brandName) {
    brandName.textContent = 'i-JANICKI';
    brandName.style.display = '';
  }

  const n = userName ? escHtml(userName) : 'ponownie';
  setPanel('Witaj ponownie!', `
    <div class="tut-message">
      <p>Witaj ponownie, <strong>${n}</strong>!
         Jak pewnie pamiętasz, jestem <strong>i-JANEK</strong>. W czym mogę Ci pomóc?</p>
    </div>
    <div class="options">
      <button class="opt" data-topic="about">👤 O mnie</button>
      <button class="opt" data-topic="services">⚙️ Usługi</button>
      <button class="opt" data-topic="projects">🗂 Projekty</button>
      <button class="opt" data-topic="process">🤝 Współpraca</button>
      <button class="opt" data-topic="pricing">💰 Cennik</button>
      <button class="opt" data-topic="contact">✉️ Kontakt</button>
      <button class="opt" data-topic="reviews">⭐ Opinie</button>
      <button class="opt opt-tutorial" data-topic="tutorial"><span class="opt-icon">⟳</span> Prezentacja</button>
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

function setupContactForm() {
  const form = $('contactForm');
  if (!form || form.dataset.bound) return;
  form.dataset.bound = '1';

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const status  = $('formStatus');
    const btn     = form.querySelector('[type=submit]');
    const btnText = $('submitBtnText');

    // Sprawdź rate limit
    const lastSubmit = localStorage.getItem(FORM_RATE_KEY);
    if (lastSubmit && Date.now() - parseInt(lastSubmit, 10) < FORM_RATE_LIMIT) {
      const sek = Math.ceil((FORM_RATE_LIMIT - (Date.now() - parseInt(lastSubmit, 10))) / 1000);
      status.className   = 'form-status is-error';
      status.textContent = `✗ Poczekaj jeszcze ${sek}s przed kolejnym wysłaniem.`;
      return;
    }

    // Walidacja e-mail / telefon
    const contact = $('f-email')?.value.trim() || '';
    if (!isValidEmailOrPhone(contact)) {
      status.className   = 'form-status is-error';
      status.textContent = '✗ Podaj poprawny adres e-mail lub numer telefonu.';
      return;
    }

    btnText.textContent    = 'Wysyłanie…';
    btn.disabled           = true;
    status.textContent     = '';
    status.className       = 'form-status';

    try {
      const res  = await fetch('https://api.web3forms.com/submit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem(FORM_RATE_KEY, String(Date.now()));
        status.className   = 'form-status is-ok';
        status.textContent = '✓ Wiadomość wysłana! Odpiszę możliwie szybko.';
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
      status.textContent = '✗ Coś poszło nie tak. Napisz bezpośrednio na igor.janicki27@gmail.com';
    } finally {
      btnText.textContent = 'WYŚLIJ';
      btn.disabled        = false;
    }
  });
}

// ─────────────────────────────────────────────────────────────────
// COOKIE PANEL
// ─────────────────────────────────────────────────────────────────
function initCookiePanel() {
  updateCookieAnalyticsStatus();

  const essBtn = $('cookieEssential');
  const allBtn = $('cookieAcceptAll');
  if (essBtn) essBtn.addEventListener('click', () => { cookieDecide(false); closeCookiePanel(); });
  if (allBtn) allBtn.addEventListener('click', () => { cookieDecide(true);  closeCookiePanel(); });

  const footBtn = $('cookieFootBtn');
  if (footBtn) footBtn.addEventListener('click', openCookiePanel);
}

function updateCookieAnalyticsStatus() {
  const statusEl = $('cookieAnalyticsStatus');
  const badgeEl = document.querySelector('.cookie-badge-extra');
  if (!statusEl) return;
  const analyticsOn = localStorage.getItem(LS.COOKIE_ANALYTICS) === 'true';
  statusEl.textContent = analyticsOn ? '✓' : '✗';
  statusEl.style.color = analyticsOn ? 'var(--accent-4)' : 'var(--muted)';
  if (badgeEl) {
    if (analyticsOn) {
      badgeEl.classList.add('is-enabled');
    } else {
      badgeEl.classList.remove('is-enabled');
    }
  }
}

function cookieDecide(analytics) {
  localStorage.setItem(LS.COOKIE_DECISION,  analytics ? 'all' : 'essential');
  localStorage.setItem(LS.COOKIE_ANALYTICS, analytics ? 'true' : 'false');
  updateCookieAnalyticsStatus();
  if (analytics) {
    window.loadGA?.();
    window.maybeTrackHomeVisit?.();
  }
}

function openCookiePanel() {
  updateCookieAnalyticsStatus();
  dom.cookieOverlay.hidden = false;
  dom.cookieOverlay.setAttribute('aria-hidden', 'false');
}

function closeCookiePanel() {
  dom.cookieOverlay.hidden = true;
  dom.cookieOverlay.setAttribute('aria-hidden', 'true');
  // Jeśli jesteśmy na kroku cookies tutoriala i decyzja właśnie podjęta — przejdź dalej
  const steps = getSteps();
  if (steps[tutStep]?.id === 'cookies' && localStorage.getItem(LS.COOKIE_DECISION)) {
    goStep(tutStep + 1);
  }
}

// ─────────────────────────────────────────────────────────────────
// DOCUMENT VIEWER
// ─────────────────────────────────────────────────────────────────
const DOC_TITLES = {
  'regulamin':            'Regulamin witryny',
  'polityka-prywatnosci': 'Polityka prywatności',
  'polityka-rodo':        'Polityka RODO',
  'polityka-wspolpracy':  'Polityka współpracy',
};

function initDocViewer() {
  $('docClose').addEventListener('click', closeDoc);
}

function openDoc(name) {
  dom.docTitle.textContent = DOC_TITLES[name] || name;
  dom.docContent.innerHTML = DOCUMENTS_CONTENT[name] ||
    '<p style="padding:2rem;text-align:center;opacity:.5">Nie można załadować dokumentu.</p>';
  dom.docOverlay.hidden = false;
  dom.docOverlay.setAttribute('aria-hidden', 'false');
}

function closeDoc() {
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
  container.innerHTML = '<div class="reviews-loading"><span>Ładowanie opinii…</span></div>';

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
      container.innerHTML = '<p class="reviews-empty">Brak opinii — bądź pierwszy! ⬆</p>';
      return;
    }

    container.innerHTML = '';
    reviews.forEach(r => container.appendChild(buildCard(r)));

  } catch (err) {
    console.warn('Reviews load error:', err);
    container.innerHTML = '<p class="reviews-empty" style="opacity:.4">Nie udało się załadować opinii.</p>';
  }
}


function parseDoc(doc) {
  const f = doc.fields || {};
  return {
    name:      f.name?.stringValue                                      || 'Anonimowy',
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
  const date   = new Date(r.timestamp).toLocaleDateString('pl-PL', {
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
      <button class="review-preview-close" aria-label="Zamknij">✕</button>
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
        message: '✗ Już wysłałeś opinię. Każdy e-mail może wysłać tylko jedną opinię.'
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
        message: `✗ Czekaj ${daysLeft} dni na następną próbę (poprzednia opinia czeka na weryfikację).`
      };
    }

    // 4. Jeśli jakkolwiek ostatnia < 24h
    if (timeSince < day24h) {
      const hoursLeft = Math.ceil((day24h - timeSince) / (60 * 60 * 1000));
      return {
        blocked: true,
        message: `✗ Czekaj jeszcze ${hoursLeft}h na następną opinię.`
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
    setReviewStatus('err', 'Wybierz ocenę (1–5 gwiazdek).');
    return;
  }

  const name    = $('modalReviewName').value.trim();
  const email   = $('modalReviewEmail').value.trim();
  const comment = $('modalReviewComment').value.trim();

  // Walidacja imienia (min. 3 znaki bez spacji)
  if (name.replace(/\s/g, '').length < 3) {
    setReviewStatus('err', 'Imię musi mieć co najmniej 3 znaki.');
    return;
  }

  // Walidacja e-mail
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    setReviewStatus('err', 'Podaj poprawny adres e-mail (potrzebny do weryfikacji).');
    return;
  }

  if (!comment || comment.length < 5) {
    setReviewStatus('err', 'Napisz krótką opinię (min. 5 znaków).');
    return;
  }

  const submitBtn = dom.reviewForm.querySelector('.review-submit-btn');
  submitBtn.disabled = true;
  setReviewStatus('', 'Sprawdzanie…');

  // Sprawdź ograniczenia emaila
  const limitCheck = await checkReviewLimits(email);
  if (limitCheck.blocked) {
    submitBtn.disabled = false;
    setReviewStatus('err', limitCheck.message);
    return;
  }

  setReviewStatus('', 'Wysyłanie…');

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
          <p class="review-success-msg">✓ Dziękuję! Potwierdź link w e-mailu, aby opublikować opinię.</p>
        </div>`;
      reviewRating = 0;
      setTimeout(() => { closeModal(); finishTutorial(); }, 3000);
    } else {
      // Jesteśmy w tutorialu — formularz jest w panelu, podmieniamy zawartość
      const formContainer = dom.reviewForm.closest('.modal-review-form-container');
      if (formContainer) {
        formContainer.innerHTML = `
          <div class="review-success">
            <p class="review-success-msg">✓ Dziękuję! Potwierdź link w e-mailu, aby opublikować opinię.</p>
          </div>`;
      }
      reviewRating = 0;
      // Od razu zakończ tutorial (bez closeModal, bo modal nie jest otwarty)
      setTimeout(() => finishTutorial(), 1500);
    }

  } catch (err) {
    console.warn(err);
    setReviewStatus('err', '✗ Coś poszło nie tak. Spróbuj ponownie.');
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
function setPanel(title, html, showLogo = false) {
  dom.panelTitle.textContent = title;
  dom.panelContent.innerHTML = html;
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

      showToast('✓ Opinia potwierdzona! Dzięki za opinię 🎉', 'ok');
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn('Verify error:', err);
    showToast('✗ Nie udało się zweryfikować opinii.', 'err');
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
const FAQ_ITEMS = [
  {
    q: 'Jakie usługi oferuje i-JANICKI?',
    a: 'i-JANICKI to kompleksowe usługi IT: tworzenie stron internetowych i aplikacji webowych na zamówienie, projektowanie logo i identyfikacji wizualnej, konfiguracja sieci LAN/WLAN i VPN, a także bieżąca opieka IT w abonamencie. Obsługuję zarówno klientów lokalnych z Wrocławia, jak i zdalnie z całej Polski.',
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
    q: 'Czy tworzysz strony internetowe dla firm z Wrocławia i okolic?',
    a: 'Tak — specjalizuję się w tworzeniu stron internetowych dla firm z Wrocławia i Dolnego Śląska, ale realizuję projekty dla klientów z całej Polski. Pracuję zdalnie lub spotykam się osobiście — jak wolisz. Każda strona jest responsywna, szybka i zoptymalizowana pod wyszukiwarki.',
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
];

function injectFaqBtn() {
  const panel = $('panel');
  if (!panel) return;
  panel.querySelector('.panel-faq-btn')?.remove();
  const btn = document.createElement('button');
  btn.className = 'panel-faq-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'FAQ — Często zadawane pytania');
  btn.textContent = 'FAQ';
  btn.addEventListener('click', openFaqModal);
  panel.appendChild(btn);
}

function openFaqModal() {
  document.querySelector('.faq-modal-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'faq-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'FAQ — Często zadawane pytania');

  const itemsHtml = FAQ_ITEMS.map((item, i) => `
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
          <p class="faq-modal-sub">Często zadawane pytania</p>
        </div>
        <button class="faq-modal-close" type="button" aria-label="Zamknij FAQ">✕</button>
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
