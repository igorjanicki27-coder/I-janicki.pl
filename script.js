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
const WEB3FORMS_KEY    = 'e1b3a82b-63d0-4f05-a808-676a7b22537a';
const OWNER_EMAIL      = 'igor.janicki27@gmail.com';

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
// 0:greeting(+lang+theme)  1:cookies  2:name  3-8:sections  9:reviews  10:finish
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
  { id: 'finish'                                              },  // 10
];

const FIRST_SECTION = 3;
const LAST_SECTION  = 8;   // contact — next button shows "Wyślij →"
const REVIEWS_STEP  = 9;
const FINISH_STEP   = 10;

// ─────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────
let tutStep      = 0;
let userName     = localStorage.getItem(LS.NAME) || '';
let tutDone      = localStorage.getItem(LS.TUTORIAL_DONE) === 'true';
let reviewRating = 0;

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
    'greeting-text': '<p>Cześć! Jestem <strong>i-JANEK</strong> — Twój wirtualny asystent.</p><p>Będę Ci towarzyszył, abyś mógł lepiej poznać ofertę <strong>i-JANICKI</strong>.</p><p>Gotowy? Kliknij <em>Dalej</em>! 🚀</p>',
    'name-prompt': 'Jak mam się do Ciebie zwracać?',
    'name-placeholder': 'Wpisz swoje imię…',
    'next-btn': 'Dalej →',
    'send-btn': 'Wyślij →',
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
    'greeting-text': '<p>Hello! I\'m <strong>i-JANEK</strong> — your virtual assistant.</p><p>I\'ll help you learn more about <strong>i-JANICKI</strong> services.</p><p>Ready? Click <em>Next</em>! 🚀</p>',
    'name-prompt': 'What\'s your name?',
    'name-placeholder': 'Type your name…',
    'next-btn': 'Next →',
    'send-btn': 'Send →',
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
  if (STEPS[tutStep]?.id === 'greeting') {
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
    const isLastSec = tutStep === LAST_SECTION;
    dom.tutNext.textContent = isLastSec
      ? (lang === 'en' ? 'Send →' : 'Wyślij →')
      : (lang === 'en' ? 'Next →' : 'Dalej →');
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
    goStep(FINISH_STEP);
  });

  $('tutNext').addEventListener('click', () => {
    // Cookie step: must decide before continuing
    if (STEPS[tutStep].id === 'cookies' && !localStorage.getItem(LS.COOKIE_DECISION)) {
      dom.panelContent.animate(
        [{ transform: 'translateX(-7px)' }, { transform: 'translateX(7px)' },
         { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }],
        { duration: 320, easing: 'ease-out' }
      );
      return;
    }
    // Contact step: validate + submit the form first; form submit handler advances the step
    if (STEPS[tutStep].id === 'contact') {
      $('contactForm')?.requestSubmit();
      return;
    }
    // Name step: save before advancing
    if (STEPS[tutStep].id === 'name') captureName();

    if (tutStep < STEPS.length - 1) goStep(tutStep + 1);
  });
}

// ─────────────────────────────────────────────────────────────────
// TUTORIAL — STATE MACHINE
// ─────────────────────────────────────────────────────────────────
function startTutorial() {
  tutStep = 0;
  buildDots();
  dom.tutProgress.hidden = false;
  dom.tutNav.hidden      = false;
  goStep(0);
}

function buildDots() {
  dom.tutDots.innerHTML = '';
  for (let i = FIRST_SECTION; i <= LAST_SECTION; i++) {
    const d = document.createElement('div');
    d.className = 'tut-dot';
    dom.tutDots.appendChild(d);
  }
}

function refreshDots() {
  dom.tutDots.querySelectorAll('.tut-dot').forEach((d, i) => {
    const si = tutStep - FIRST_SECTION;  // section index (negative before section steps)
    d.classList.toggle('is-done',    i < si);
    d.classList.toggle('is-current', i === si);
  });
}

function refreshNavButtons() {
  const step         = STEPS[tutStep];
  const isFirst      = tutStep === 0;
  const isLastSec    = tutStep === LAST_SECTION;
  const cookieNeeded = step.id === 'cookies' && !localStorage.getItem(LS.COOKIE_DECISION);
  // Skippable from name step onward (not on greeting or cookies)
  const skippable    = tutStep >= 2 && tutStep < FINISH_STEP && step.id !== 'cookies';

  dom.tutBack.hidden              = isFirst;
  dom.tutBack.disabled            = isFirst;
  dom.tutNext.disabled            = cookieNeeded;
  dom.tutNext.textContent         = isLastSec ? 'Wyślij →' : 'Dalej →';
  dom.tutNext.classList.toggle('is-send', isLastSec);

  dom.tutSkip.disabled            = !skippable;
  dom.tutSkip.style.display       = skippable ? '' : 'none';

  dom.tutNav.classList.toggle('has-back', !isFirst);
}

function goStep(idx) {
  const prevStep = tutStep;
  tutStep = Math.max(0, Math.min(idx, STEPS.length - 1));
  const step     = STEPS[tutStep];
  const dir      = idx >= prevStep ? 1 : -1;

  // Auto-skip cookies step if already decided
  if (step.id === 'cookies' && localStorage.getItem(LS.COOKIE_DECISION)) {
    goStep(tutStep + dir);
    return;
  }

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
    case 'finish':   renderFinish();          break;
    default:         renderSectionStep(step); break;
  }
}

// ─── Step renders ─────────────────────────────────────────────────

function renderGreeting() {
  const isDark = document.documentElement.dataset.theme !== 'light';

  setPanel('i-JANEK', `
    <div class="tut-message">
      <p>Cześć! Jestem <strong>i-JANEK</strong> — Twój wirtualny asystent.</p>
      <p>Skonfiguruj kilka preferencji, a potem wyruszamy w podróż po ofercie <strong>i-JANICKI</strong>!</p>
    </div>
    <div class="greeting-prefs">
      <div class="pref-row">
        <span class="pref-label">🌐 Język</span>
        <div class="pref-btns">
          <button class="choice-btn ${currentLang === 'pl' ? 'is-active' : ''}" id="gLangPL">🇵🇱 PL</button>
          <button class="choice-btn ${currentLang === 'en' ? 'is-active' : ''}" id="gLangEN">🇬🇧 EN</button>
        </div>
      </div>
      <div class="pref-row">
        <span class="pref-label">🎨 Motyw</span>
        <div class="pref-btns">
          <button class="choice-btn ${isDark ? 'is-active' : ''}" id="gThemeDark">🌙 Ciemny</button>
          <button class="choice-btn ${!isDark ? 'is-active' : ''}" id="gThemeLight">☀ Jasny</button>
        </div>
      </div>
    </div>
    <div class="tut-message" style="margin-top:10px">
      <p>Gotowy? Kliknij <em>Dalej</em>! 🚀</p>
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
         <p>Twoje preferencje cookie zostały zapisane.</p>
         <p>Google Analytics: <strong>${analyticsOn ? '✓ włączony' : '✗ wyłączony'}</strong>.</p>
         <p>Możesz je zmienić w każdej chwili — kliknij 🍪 w stopce.</p>
       </div>`
    : `<div class="tut-message">
         <p>Ta strona korzysta z plików cookie. <strong>Niezbędne</strong> (sesja, imię, preferencje) zawsze aktywne.</p>
         <p>Czy wyrażasz zgodę na <strong>Google Analytics</strong>?</p>
         <div class="cookie-inline-btns">
           <button class="cookie-btn cookie-btn-essential" id="tutCookieNo">Tylko niezbędne</button>
           <button class="cookie-btn cookie-btn-all"       id="tutCookieYes">Akceptuję wszystkie</button>
         </div>
         <button class="cookie-doc-link" data-doc="polityka-rodo" style="margin-top:.75rem">Polityka RODO →</button>
       </div>`;

  setPanel('Pliki cookie 🍪', html);

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

  // Kontakt otwiera się zawsze w modalnym oknie
  if (step.topic === 'contact') {
    openModal('contact');
    return;
  }

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
}

function renderReviewStep() {
  const n = userName ? `, ${escHtml(userName)}` : '';
  setPanel('i-JANEK', `
    <div class="tut-message">
      <p>Mamy prawie koniec${n}! ⭐ Chcesz wystawić opinię lub zobaczyć, co piszą inni?</p>
      <p>Kliknij przycisk <em>Opinie</em> lub po prostu kliknij <em>Dalej</em>, by pominąć.</p>
    </div>
  `);

  openModal('reviews');
}

function renderFinish() {
  dom.bot.classList.remove('is-pointing');
  dom.tutProgress.hidden = true;
  dom.tutNav.hidden      = true;
  closeModal();
  $('panel')?.classList.remove('has-section');

  const nameHtml = userName ? `<strong>${escHtml(userName)}</strong>` : '';
  const comma    = nameHtml ? `, ${nameHtml}` : '';
  setPanel('i-JANEK', `
    <div class="tut-message">
      <p>To koniec naszej podróży${comma}. Mam nadzieję, że oferta Cię zainteresowała! 🎉</p>
      <p>Możesz teraz swobodnie przeglądać sekcje:</p>
    </div>
    <div class="tut-options">
      <button class="snav-item" data-topic="about">👤 O mnie</button>
      <button class="snav-item" data-topic="services">⚙ Usługi</button>
      <button class="snav-item" data-topic="projects">🗂 Projekty</button>
      <button class="snav-item" data-topic="process">🤝 Współpraca</button>
      <button class="snav-item" data-topic="pricing">💰 Cennik</button>
      <button class="snav-item" data-topic="contact">✉ Kontakt</button>
    </div>
    <button class="tut-restart-btn" id="tutRestartBtn">⟳ Wstęp od nowa</button>
  `);

  $('tutRestartBtn')?.addEventListener('click', restartTutorial);
  markTutorialDone();
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

  const n = userName ? escHtml(userName) : 'ponownie';
  setPanel('Witaj ponownie!', `
    <div class="tut-message">
      <p>Witaj ponownie, <strong>${n}</strong>!
         Jak pewnie pamiętasz, jestem <strong>i-JANEK</strong>. W czym mogę Ci pomóc?</p>
    </div>
    <div class="options">
      <button class="opt" data-topic="about">👤 O mnie</button>
      <button class="opt" data-topic="services"><span class="opt-icon">⚙</span> Usługi</button>
      <button class="opt" data-topic="projects">🗂 Projekty</button>
      <button class="opt" data-topic="process">🤝 Współpraca</button>
      <button class="opt" data-topic="pricing">💰 Cennik</button>
      <button class="opt" data-topic="contact"><span class="opt-icon">✉</span> Kontakt</button>
      <button class="opt" data-topic="reviews">⭐ Opinie</button>
      <button class="opt opt-tutorial" data-topic="tutorial"><span class="opt-icon">⟳</span> Samouczek</button>
    </div>
  `);

  // Reviews now accessible via modal only
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
    setupReviewForm();
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
        if (STEPS[tutStep]?.id === 'contact') {
          setTimeout(() => goStep(REVIEWS_STEP), 1500);
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
  if (!statusEl) return;
  const analyticsOn = localStorage.getItem(LS.COOKIE_ANALYTICS) === 'true';
  statusEl.textContent = analyticsOn ? '✓ włączony' : '✗ wyłączony';
  statusEl.style.color = analyticsOn ? 'var(--accent-4)' : 'var(--muted)';
}

function cookieDecide(analytics) {
  localStorage.setItem(LS.COOKIE_DECISION,  analytics ? 'all' : 'essential');
  localStorage.setItem(LS.COOKIE_ANALYTICS, analytics ? 'true' : 'false');
  updateCookieAnalyticsStatus();
  if (analytics) window.loadGA?.();
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
  if (STEPS[tutStep]?.id === 'cookies' && localStorage.getItem(LS.COOKIE_DECISION)) {
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

async function openDoc(name) {
  dom.docTitle.textContent = DOC_TITLES[name] || name;
  dom.docContent.innerHTML = '<div class="doc-loading">Ładowanie dokumentu…</div>';
  dom.docOverlay.hidden = false;
  dom.docOverlay.setAttribute('aria-hidden', 'false');

  try {
    const res = await fetch(`./dokumenty/${name}.html`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    dom.docContent.innerHTML = await res.text();
  } catch {
    dom.docContent.innerHTML =
      '<p style="padding:2rem;text-align:center;opacity:.5">Nie można załadować dokumentu.</p>';
  }
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
//   }
//
// For ordered queries, create a composite index in Firebase Console:
//   Collection: reviews | Fields: rating DESC, timestamp DESC
// ─────────────────────────────────────────────────────────────────
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
          limit: 50,
        },
      }),
    });

    const data = await res.json();

    let reviews = Array.isArray(data)
      ? data.filter(r => r.document).map(r => parseDoc(r.document))
      : [];

    // Sort: rating desc, then newest first
    reviews.sort((a, b) =>
      b.rating !== a.rating
        ? b.rating - a.rating
        : new Date(b.timestamp) - new Date(a.timestamp)
    );

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
  return div;
}

// ─────────────────────────────────────────────────────────────────
// REVIEW FORM
// ─────────────────────────────────────────────────────────────────

async function checkReviewLimits(email) {
  try {
    const res = await fetch(`${FIRESTORE_BASE}:runQuery`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from:  [{ collectionId: 'reviews' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'email' },
              op:    'EQUAL',
              value: { stringValue: email },
            },
          },
          limit: 10,
        },
      }),
    });

    const data = await res.json();
    const reviews = Array.isArray(data)
      ? data.filter(r => r.document).map(r => parseDoc(r.document))
      : [];

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

    // 3 — Wyślij e-mail do AUTORA opinii z prośbą o potwierdzenie
    const verifyUrl = `https://i-janicki.pl?verify_review=${docId}&email=${encodeURIComponent(email)}`;
    fetch('https://api.web3forms.com/submit', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_key: WEB3FORMS_KEY,
        to_email:   email,
        subject:    'Potwierdź twoją opinię na stronie i-janicki.pl',
        from_name:  'i-JANICKI',
        message: [
          `Cześć ${name}!`,
          '',
          'Dziękujemy za wystawienie opinii. Aby ją opublikować, potwierdź ją jednym kliknięciem poniżej:',
          '',
          verifyUrl,
          '',
          'Jeśli to nie Ty, możesz zignorować tę wiadomość.',
          '',
          '—',
          'i-JANICKI',
        ].join('\n'),
        replyto: email,
      }),
    }).catch(() => {});

    setReviewStatus('ok', '✓ Dziękuję! Potwierdź link w e-mailu, aby opublikować opinię.');
    dom.reviewForm.reset();
    reviewRating = 0;
    renderStars(0);

  } catch (err) {
    console.warn(err);
    setReviewStatus('err', '✗ Coś poszło nie tak. Spróbuj ponownie.');
  } finally {
    submitBtn.disabled = false;
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
function setPanel(title, html) {
  dom.panelTitle.textContent = title;
  dom.panelContent.innerHTML = html;
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
  const INTERACTIVE = 'a, button, input, textarea, select, label, [role="button"], .card, .opt, .snav-item, .star, .tut-btn';
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
  document.addEventListener('mousedown', () => {
    dot.classList.add('is-click');
    ring.classList.add('is-click');
  });
  document.addEventListener('mouseup', () => {
    dot.classList.remove('is-click');
    ring.classList.remove('is-click');
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
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}
