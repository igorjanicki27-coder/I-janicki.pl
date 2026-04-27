
const FORM_ENDPOINT = "https://formsubmit.co/ajax/igor.janicki27@gmail.com";
const STORAGE_KEY = "ijanicki_terminal_session_v7";
const SESSION_MAX_AGE = 5 * 60 * 1000;

const translations = {
  pl: {
    title: "i-JANICKI — strony, aplikacje i opieka IT",
    description: "i-JANICKI tworzy strony internetowe, aplikacje i zapewnia opiekę IT dla małych biznesów.",
    headTitle: "interaktywna sesja",
    resumeTitle: "Wykryto poprzednią sesję",
    resumeText: "Czy chcesz kontynuować ostatnie miejsce, czy zacząć od początku?",
    resumeContinue: "Kontynuuj",
    resumeRestart: "Zacznij od początku",
    mobileNext: "Dalej",
    helpLabel: "Skróty:",
    helpEnter: "Enter / Spacja — dalej",
    helpScroll: "Kółko — zwykłe przewijanie terminala",
    helpCommands: "Komendy: pomoc, wyczyść, kontakt, cennik",
    themeLight: "jasny",
    themeDark: "ciemny",
    loading: [
      "init loading terminal shell...",
      "ui preparing interactive session...",
      "status ready"
    ],
    intro: [
      "Cześć! Jestem Igor, ale przyjaciele mówią na mnie Janek.",
      "Zajmuję się wszelako pojętą informatyką.",
      "{cyan}Tworzę{/cyan} strony internetowe, {green}aplikacje{/green} i zapewniam {amber}opiekę IT{/amber} dla małych biznesów.",
      "Wybierz interesujący Cię temat, aby przejść dalej."
    ],
    chooseAgain: "Wybierz kolejny temat.",
    allDone: "To już wszystkie główne sekcje. Możesz skorzystać z kontaktu albo wpisać komendę {cyan}pomoc{/cyan}.",
    sectionMenuLabel: "Dostępne sekcje",
    sections: {
      about: {
        label: "o mnie",
        command: "cat about.txt",
        lines: [
          "Buduję rozwiązania, które mają wyglądać profesjonalnie, działać stabilnie i być wygodne w codziennym użyciu.",
          "Łączę podejście techniczne z wyczuciem estetyki. Dla małego biznesu to oznacza mniej chaosu, lepszy wizerunek i konkretny efekt.",
          "Pracuję zdalnie, stawiam na prostą komunikację i rozsądne decyzje zamiast przerostu formy nad treścią."
        ]
      },
      services: {
        label: "usługi",
        command: "ls services/",
        lines: [
          "{green}• strony www{/green} — od 1000 zł, lekkie, szybkie i dopracowane wizualnie.",
          "{cyan}• aplikacje Python{/cyan} — narzędzia, automatyzacje i aplikacje pod konkretny proces.",
          "{purple}• aplikacje Swift{/purple} — rozwiązania pod środowisko Apple.",
          "{amber}• administracja sieci{/amber} — konfiguracja, porządkowanie i wsparcie techniczne.",
          "{green}• opieka informatyczna{/green} — od 300 zł / mies., spokojniejsze działanie małej firmy."
        ]
      },
      projects: {
        label: "projekty",
        command: "open projects.log",
        lines: [
          "Wybierz projekt, aby zobaczyć krótki opis:",
        ],
        projects: [
          {
            key: "strzelca",
            chip: "strzelca.pl",
            command: "open strzelca.pl",
            lines: [
              "{green}strzelca.pl{/green} — mój prywatny projekt poświęcony militariom.",
              "Grupa docelowa: strzelcy sportowi, kolekcjonerzy i osoby zainteresowane tematyką okołomilitarną.",
              "Zakres: pełnoprawny sklep, blog, marketplace z mikropłatnościami i kontami użytkowników."
            ]
          },
          {
            key: "getdog",
            chip: "get-dog.com",
            command: "open get-dog.com",
            lines: [
              "{cyan}get-dog.com{/cyan} — strona reklamująca aplikację dla użytkowników macOS.",
              "Założenie: prosta, tania i wizualnie atrakcyjna prezentacja produktu.",
              "Dodatkowo: czytelny układ i zasób plików do pobrania."
            ]
          },
          {
            key: "korona",
            chip: "sredzka-korona.pl",
            command: "open sredzka-korona.pl",
            lines: [
              "{amber}sredzka-korona.pl{/amber} — strona hotelu, restauracji i imprez okolicznościowych.",
              "Zakres: autorski system rezerwacyjny oraz panel administracyjny obsługujący stronę.",
              "Efekt: jeden spójny system zamiast rozdzielonych, prowizorycznych narzędzi."
            ]
          }
        ]
      },
      workflow: {
        label: "jak pracuję",
        command: "cat workflow.txt",
        lines: [
          "{cyan}1. analiza{/cyan} — najpierw ustalam, co naprawdę ma działać i dla kogo.",
          "{cyan}2. projekt{/cyan} — dobieram prosty, sensowny układ i zakres.",
          "{cyan}3. wdrożenie{/cyan} — buduję rozwiązanie i dopracowuję szczegóły.",
          "{cyan}4. wsparcie{/cyan} — po starcie nie znikam, tylko pomagam, gdy jest to potrzebne."
        ]
      },
      pricing: {
        label: "cennik",
        command: "cat pricing.txt",
        lines: [
          "{green}strony www{/green} — od 1000 zł",
          "{green}opieka IT{/green} — od 300 zł / mies.",
          "{muted}Pozostałe rzeczy wyceniam po krótkiej rozmowie, bo zakres bywa bardzo różny.{/muted}"
        ]
      },
      contact: {
        label: "kontakt",
        command: "./contact --init",
        lines: [
          "Masz dwie ścieżki kontaktu. Możesz od razu wysłać wiadomość albo zostawić numer telefonu, a oddzwonię w wolnym czasie."
        ],
        actions: [
          { key: "message", label: "wyślij wiadomość" },
          { key: "callback", label: "umów rozmowę" },
          { key: "copyPhone", label: "kopiuj telefon" },
          { key: "copyMail", label: "kopiuj e-mail" }
        ]
      }
    },
    commandsInfo: [
      "Dostępne komendy: {cyan}pomoc{/cyan}, {cyan}wyczyść{/cyan}, {cyan}kontakt{/cyan}, {cyan}cennik{/cyan}, {cyan}o mnie{/cyan}, {cyan}usługi{/cyan}, {cyan}projekty{/cyan}, {cyan}jak pracuję{/cyan}.",
      "Możesz też wpisać nazwę projektu: {green}strzelca.pl{/green}, {green}get-dog.com{/green}, {green}sredzka-korona.pl{/green}."
    ],
    copiedPhone: "Skopiowano numer telefonu: {strong}57 57 57 817{/strong}",
    copiedMail: "Skopiowano adres e-mail: {strong}igor.janicki27@gmail.com{/strong}",
    callbackIntro: "Zostaw numer telefonu i krótką notatkę. Oddzwonię, gdy będę wolny.",
    messageIntro: "Opisz krótko, czego potrzebujesz. Wiadomość trafi na {strong}igor.janicki27@gmail.com{/strong}.",
    sentOk: "{green}Wiadomość została wysłana pomyślnie.{/green}",
    callbackOk: "{green}Prośba o oddzwonienie została wysłana.{/green}",
    sentFail: "{red}Formularz niedostarczony.{/red} Proszę o kontakt: {strong}57 57 57 817{/strong} lub {strong}igor.janicki27@gmail.com{/strong}.",
    alreadyVisited: "Ta sekcja była już otwarta w tej sesji. Wybierz inny temat.",
    choiceHelp: "Kliknij kafelek, aby uruchomić kolejną sekcję.",
    shellStart: "./start-session",
    sectionEnd: "Sekcja zakończona.",
    projectBackPrompt: "Możesz wybrać kolejny projekt albo wrócić do głównego wyboru tematów."
  },
  en: {
    title: "i-JANICKI — websites, apps and IT support",
    description: "i-JANICKI builds websites, apps and provides IT support for small businesses.",
    headTitle: "interactive session",
    resumeTitle: "Previous session detected",
    resumeText: "Do you want to continue where you left off or start from the beginning?",
    resumeContinue: "Continue",
    resumeRestart: "Start over",
    mobileNext: "Next",
    helpLabel: "Shortcuts:",
    helpEnter: "Enter / Space — continue",
    helpScroll: "Wheel — standard terminal scrolling",
    helpCommands: "Commands: help, clear, contact, pricing",
    themeLight: "light",
    themeDark: "dark",
    loading: [
      "init loading terminal shell...",
      "ui preparing interactive session...",
      "status ready"
    ],
    intro: [
      "Hi! I'm Igor, but my friends call me Janek.",
      "I work across broadly understood IT.",
      "{cyan}I build{/cyan} websites, {green}apps{/green} and provide {amber}IT support{/amber} for small businesses.",
      "Choose the topic that interests you to continue."
    ],
    chooseAgain: "Choose another topic.",
    allDone: "These were all core sections. You can use contact options or type {cyan}help{/cyan}.",
    sectionMenuLabel: "Available sections",
    sections: {
      about: {
        label: "about me",
        command: "cat about.txt",
        lines: [
          "I build solutions that should look professional, work reliably and stay comfortable in daily use.",
          "I combine technical thinking with visual discipline. For a small business that means less chaos, better presentation and a concrete result.",
          "I work remotely and prefer direct communication and sensible decisions over unnecessary complexity."
        ]
      },
      services: {
        label: "services",
        command: "ls services/",
        lines: [
          "{green}• websites{/green} — from 1000 PLN, lightweight, fast and visually refined.",
          "{cyan}• Python apps{/cyan} — tools, automation and custom desktop solutions.",
          "{purple}• Swift apps{/purple} — solutions for the Apple ecosystem.",
          "{amber}• network administration{/amber} — setup, cleanup and technical support.",
          "{green}• IT care{/green} — from 300 PLN / month for small business support."
        ]
      },
      projects: {
        label: "projects",
        command: "open projects.log",
        lines: [
          "Choose a project to see a short description:",
        ],
        projects: [
          {
            key: "strzelca",
            chip: "strzelca.pl",
            command: "open strzelca.pl",
            lines: [
              "{green}strzelca.pl{/green} — my private project focused on military-related topics.",
              "Audience: sport shooters, collectors and users interested in this niche.",
              "Scope: full store, blog, marketplace with micropayments and user accounts."
            ]
          },
          {
            key: "getdog",
            chip: "get-dog.com",
            command: "open get-dog.com",
            lines: [
              "{cyan}get-dog.com{/cyan} — a landing page promoting an app for macOS users.",
              "Goal: simple, affordable and visually pleasing product presentation.",
              "Plus: clean structure and downloadable resources."
            ]
          },
          {
            key: "korona",
            chip: "sredzka-korona.pl",
            command: "open sredzka-korona.pl",
            lines: [
              "{amber}sredzka-korona.pl{/amber} — a website for a hotel, restaurant and event venue.",
              "Scope: custom booking system and admin panel powering the whole site.",
              "Result: one coherent system instead of fragmented tools."
            ]
          }
        ]
      },
      workflow: {
        label: "how I work",
        command: "cat workflow.txt",
        lines: [
          "{cyan}1. analysis{/cyan} — first I define what should actually work and for whom.",
          "{cyan}2. design{/cyan} — then I choose a simple and sensible structure.",
          "{cyan}3. implementation{/cyan} — I build the solution and refine the details.",
          "{cyan}4. support{/cyan} — after launch I remain available when needed."
        ]
      },
      pricing: {
        label: "pricing",
        command: "cat pricing.txt",
        lines: [
          "{green}websites{/green} — from 1000 PLN",
          "{green}IT support{/green} — from 300 PLN / month",
          "{muted}Other work is quoted after a short conversation because scope can vary a lot.{/muted}"
        ]
      },
      contact: {
        label: "contact",
        command: "./contact --init",
        lines: [
          "You have two contact paths. Send a message now or leave your phone number and I will call back when I am free."
        ],
        actions: [
          { key: "message", label: "send message" },
          { key: "callback", label: "schedule a call" },
          { key: "copyPhone", label: "copy phone" },
          { key: "copyMail", label: "copy e-mail" }
        ]
      }
    },
    commandsInfo: [
      "Available commands: {cyan}help{/cyan}, {cyan}clear{/cyan}, {cyan}contact{/cyan}, {cyan}pricing{/cyan}, {cyan}about{/cyan}, {cyan}services{/cyan}, {cyan}projects{/cyan}, {cyan}workflow{/cyan}.",
      "You can also type a project name: {green}strzelca.pl{/green}, {green}get-dog.com{/green}, {green}sredzka-korona.pl{/green}."
    ],
    copiedPhone: "Phone number copied: {strong}57 57 57 817{/strong}",
    copiedMail: "E-mail copied: {strong}igor.janicki27@gmail.com{/strong}",
    callbackIntro: "Leave your phone number and a short note. I will call you back when I am free.",
    messageIntro: "Describe briefly what you need. The message will go to {strong}igor.janicki27@gmail.com{/strong}.",
    sentOk: "{green}Message sent successfully.{/green}",
    callbackOk: "{green}Callback request sent successfully.{/green}",
    sentFail: "{red}Form was not delivered.{/red} Please contact me at {strong}57 57 57 817{/strong} or {strong}igor.janicki27@gmail.com{/strong}.",
    alreadyVisited: "This section has already been opened in this session. Choose another topic.",
    choiceHelp: "Click a tile to start the next section.",
    shellStart: "./start-session",
    sectionEnd: "Section finished.",
    projectBackPrompt: "You can choose another project or return to the main topic selection."
  }
};

const state = {
  lang: "pl",
  theme: "dark",
  queue: [],
  typing: false,
  waitingAdvance: false,
  awaitingChoice: false,
  choicesContext: "main",
  visitedSections: [],
  visitedProjects: [],
  currentChoicesEl: null,
  sectionsOrder: ["about", "services", "projects", "workflow", "pricing", "contact"],
  commandAliases: {
    "pomoc": "help",
    "help": "help",
    "wyczyść": "clear",
    "wyczysc": "clear",
    "clear": "clear",
    "kontakt": "contact",
    "contact": "contact",
    "cennik": "pricing",
    "pricing": "pricing",
    "o mnie": "about",
    "about": "about",
    "usługi": "services",
    "uslugi": "services",
    "services": "services",
    "projekty": "projects",
    "projects": "projects",
    "jak pracuję": "workflow",
    "jak pracuje": "workflow",
    "workflow": "workflow",
    "strzelca.pl": "project:strzelca",
    "get-dog.com": "project:getdog",
    "sredzka-korona.pl": "project:korona"
  }
};

const els = {
  bootScreen: document.getElementById("bootScreen"),
  resumeOverlay: document.getElementById("resumeOverlay"),
  resumeYes: document.getElementById("resumeYes"),
  resumeNo: document.getElementById("resumeNo"),
  terminalBody: document.getElementById("terminalBody"),
  terminalOutput: document.getElementById("terminalOutput"),
  mobileNext: document.getElementById("mobileNext"),
  commandInput: document.getElementById("commandInput"),
  themeToggle: document.getElementById("themeToggle"),
  themeLabel: document.getElementById("themeLabel"),
  langButtons: [...document.querySelectorAll("[data-lang]")],
};

function t(path) {
  const parts = path.split(".");
  let current = translations[state.lang];
  for (const p of parts) current = current?.[p];
  return current ?? path;
}

function parseMarkup(text) {
  return text
    .replace(/\{green\}(.*?)\{\/green\}/g, '<span class="text-green">$1</span>')
    .replace(/\{cyan\}(.*?)\{\/cyan\}/g, '<span class="text-cyan">$1</span>')
    .replace(/\{amber\}(.*?)\{\/amber\}/g, '<span class="text-amber">$1</span>')
    .replace(/\{red\}(.*?)\{\/red\}/g, '<span class="text-red">$1</span>')
    .replace(/\{purple\}(.*?)\{\/purple\}/g, '<span class="text-purple">$1</span>')
    .replace(/\{muted\}(.*?)\{\/muted\}/g, '<span class="text-muted">$1</span>')
    .replace(/\{strong\}(.*?)\{\/strong\}/g, '<strong>$1</strong>');
}

function setMeta() {
  document.title = t("title");
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute("content", t("description"));
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.dataset.i18n;
    const value = t(key);
    if (typeof value === "string") el.textContent = value;
  });
  els.themeLabel.textContent = state.theme === "dark" ? t("themeLight") : t("themeDark");
  document.querySelector(".head-title").textContent = t("headTitle");
}

function saveSession() {
  const payload = {
    time: Date.now(),
    lang: state.lang,
    theme: state.theme,
    visitedSections: state.visitedSections,
    visitedProjects: state.visitedProjects,
    output: els.terminalOutput.innerHTML
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.time || Date.now() - parsed.time > SESSION_MAX_AGE) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

function appendNode(node) {
  els.terminalOutput.appendChild(node);
  scrollTerminalToBottom();
  saveSession();
}

function appendHTML(html, className = "line text-default") {
  const div = document.createElement("div");
  div.className = className;
  div.innerHTML = html;
  appendNode(div);
  return div;
}

function appendCommand(cmd) {
  appendHTML(
    `<span class="user">igor@i-janicki</span><span class="path">:~$</span> <span class="cmd">${cmd}</span>`,
    "command-line"
  );
}

function appendSystemLine(text) {
  appendHTML(parseMarkup(text), "system-line");
}

function appendTextLine(text) {
  appendHTML(parseMarkup(text), "line text-default");
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function scrollTerminalToBottom() {
  els.terminalBody.scrollTop = els.terminalBody.scrollHeight;
}

async function typeLine(text) {
  state.typing = true;
  toggleMobileNext();
  const div = document.createElement("div");
  div.className = "line text-default typing-line";
  els.terminalOutput.appendChild(div);
  scrollTerminalToBottom();

  let i = 0;
  const safe = parseMarkup(text);
  while (i < safe.length) {
    if (safe[i] === "<") {
      const end = safe.indexOf(">", i);
      div.innerHTML = safe.slice(0, end + 1);
      i = end + 1;
      continue;
    }
    div.innerHTML = safe.slice(0, i + 1);
    i += 1;
    scrollTerminalToBottom();
    await sleep(window.innerWidth < 640 ? 8 : 14);
  }
  div.classList.remove("typing-line");
  state.typing = false;
  toggleMobileNext();
  saveSession();
}

async function processQueue() {
  if (state.typing || state.awaitingChoice) return;
  while (state.queue.length) {
    const item = state.queue.shift();
    if (item.type === "command") {
      appendCommand(item.value);
      await sleep(120);
    } else if (item.type === "type") {
      await typeLine(item.value);
      state.waitingAdvance = true;
      toggleMobileNext();
      return;
    } else if (item.type === "line") {
      appendTextLine(item.value);
      await sleep(70);
    } else if (item.type === "system") {
      appendSystemLine(item.value);
      await sleep(70);
    } else if (item.type === "clear") {
      clearTerminalOutput();
      await sleep(60);
    } else if (item.type === "choices") {
      showChoices(item.choices, item.context);
      return;
    } else if (item.type === "contactActions") {
      showContactActions();
      return;
    } else if (item.type === "projectChoices") {
      showProjectChoices();
      return;
    }
  }
  state.waitingAdvance = false;
  toggleMobileNext();
}

function clearTerminalOutput() {
  els.terminalOutput.innerHTML = "";
  scrollTerminalToBottom();
  saveSession();
}

function queueIntro() {
  state.queue = [];
  state.queue.push({ type: "command", value: t("shellStart") });
  t("intro").forEach(line => state.queue.push({ type: "type", value: line }));
  state.queue.push({ type: "choices", choices: getMainChoices(), context: "main" });
  processQueue();
}

function getMainChoices() {
  return state.sectionsOrder.map(key => ({
    key,
    label: t(`sections.${key}.label`),
    disabled: state.visitedSections.includes(key)
  }));
}

function showChoices(choices, context) {
  state.awaitingChoice = true;
  state.waitingAdvance = false;
  state.choicesContext = context;
  toggleMobileNext();
  appendHTML(`<span class="text-muted">${t("sectionMenuLabel")}:</span>`, "choice-help");
  appendHTML(parseMarkup(t("choiceHelp")), "choice-help");
  const grid = document.createElement("div");
  grid.className = "choice-grid";
  choices.forEach(choice => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice-chip" + (choice.disabled ? " is-disabled" : "");
    btn.textContent = choice.label;
    btn.disabled = Boolean(choice.disabled);
    btn.addEventListener("click", () => handleChoice(choice.key));
    grid.appendChild(btn);
  });
  appendNode(grid);
  state.currentChoicesEl = grid;
}

function handleChoice(key) {
  if (state.choicesContext === "projects") {
    runProject(key);
    return;
  }
  const section = key;
  if (state.visitedSections.includes(section)) {
    appendSystemLine(t("alreadyVisited"));
    return;
  }
  runSection(section);
}

function removeCurrentChoices() {
  if (state.currentChoicesEl?.parentNode) {
    const parent = state.currentChoicesEl.parentNode;
    const prev = state.currentChoicesEl.previousSibling;
    const prev2 = prev?.previousSibling;
    state.currentChoicesEl.remove();
    if (prev && prev.classList?.contains("choice-help")) prev.remove();
    if (prev2 && prev2.classList?.contains("choice-help")) prev2.remove();
  }
  state.currentChoicesEl = null;
  state.awaitingChoice = false;
}

function runSection(sectionKey) {
  removeCurrentChoices();
  state.visitedSections.push(sectionKey);
  const section = t(`sections.${sectionKey}`);
  state.queue = [
    { type: "clear" },
    { type: "command", value: section.command },
    ...section.lines.map(line => ({ type: "type", value: line }))
  ];

  if (sectionKey === "projects") {
    state.queue.push({ type: "projectChoices" });
  } else if (sectionKey === "contact") {
    state.queue.push({ type: "contactActions" });
  } else {
    state.queue.push({ type: "type", value: t("sectionEnd") });
    state.queue.push({
      type: "choices",
      choices: getMainChoices(),
      context: "main"
    });
  }
  processQueue();
}

function showProjectChoices() {
  state.awaitingChoice = true;
  state.waitingAdvance = false;
  state.choicesContext = "projects";
  toggleMobileNext();
  appendHTML(parseMarkup(t("projectBackPrompt")), "choice-help");
  const grid = document.createElement("div");
  grid.className = "choice-grid";
  const projects = t("sections.projects.projects");
  projects.forEach(project => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice-chip" + (state.visitedProjects.includes(project.key) ? " is-disabled" : "");
    btn.textContent = project.chip;
    btn.disabled = state.visitedProjects.includes(project.key);
    btn.addEventListener("click", () => handleChoice(project.key));
    grid.appendChild(btn);
  });

  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "choice-chip";
  backBtn.textContent = state.lang === "pl" ? "wróć do tematów" : "back to topics";
  backBtn.addEventListener("click", () => {
    removeCurrentChoices();
    appendSystemLine(t("chooseAgain"));
    showChoices(getMainChoices(), "main");
  });
  grid.appendChild(backBtn);

  appendNode(grid);
  state.currentChoicesEl = grid;
}

function runProject(projectKey) {
  removeCurrentChoices();
  const project = t("sections.projects.projects").find(item => item.key === projectKey);
  if (!project) return;
  if (!state.visitedProjects.includes(projectKey)) {
    state.visitedProjects.push(projectKey);
  }
  state.queue = [
    { type: "command", value: project.command },
    ...project.lines.map(line => ({ type: "type", value: line })),
    { type: "projectChoices" }
  ];
  processQueue();
}

function showContactActions() {
  state.awaitingChoice = true;
  state.waitingAdvance = false;
  toggleMobileNext();
  const wrap = document.createElement("div");
  wrap.className = "inline-actions";
  t("sections.contact.actions").forEach(action => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "inline-chip";
    btn.textContent = action.label;
    btn.addEventListener("click", () => handleContactAction(action.key));
    wrap.appendChild(btn);
  });
  appendNode(wrap);
  state.currentChoicesEl = wrap;
}

function handleContactAction(actionKey) {
  removeCurrentChoices();
  if (actionKey === "copyPhone") {
    navigator.clipboard.writeText("57 57 57 817").then(() => appendSystemLine(t("copiedPhone")));
    showChoices(getMainChoices(), "main");
    return;
  }
  if (actionKey === "copyMail") {
    navigator.clipboard.writeText("igor.janicki27@gmail.com").then(() => appendSystemLine(t("copiedMail")));
    showChoices(getMainChoices(), "main");
    return;
  }
  if (actionKey === "message") {
    appendSystemLine(t("messageIntro"));
    mountContactForm("message");
    return;
  }
  if (actionKey === "callback") {
    appendSystemLine(t("callbackIntro"));
    mountContactForm("callback");
    return;
  }
}

function mountContactForm(type) {
  const templateId = type === "callback" ? "callbackFormTemplate" : "contactFormTemplate";
  const template = document.getElementById(templateId);
  const node = template.content.firstElementChild.cloneNode(true);
  appendNode(node);
  const form = node.querySelector("form");
  form.addEventListener("submit", (event) => submitForm(event, form, type));
  const firstInput = form.querySelector("input:not([type=hidden])");
  if (firstInput) firstInput.focus();
  state.awaitingChoice = false;
  state.currentChoicesEl = null;
}

async function submitForm(event, form, type) {
  event.preventDefault();
  const submitButton = form.querySelector("button[type=submit]");
  submitButton.disabled = true;

  const data = new FormData(form);
  try {
    const response = await fetch(FORM_ENDPOINT, {
      method: "POST",
      headers: { "Accept": "application/json" },
      body: data
    });
    if (!response.ok) throw new Error("submit_failed");
    appendSystemLine(type === "callback" ? t("callbackOk") : t("sentOk"));
    form.remove();
  } catch (error) {
    appendSystemLine(t("sentFail"));
  } finally {
    submitButton.disabled = false;
    showChoices(getMainChoices(), "main");
  }
}

function normalizeCommand(value) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function handleCommandInput(event) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  const raw = els.commandInput.value;
  els.commandInput.value = "";
  const normalized = normalizeCommand(raw);
  if (!normalized) return;
  appendCommand(raw);
  const target = state.commandAliases[normalized];
  if (!target) {
    appendSystemLine(state.lang === "pl" ? "Nieznana komenda. Wpisz {cyan}pomoc{/cyan}." : "Unknown command. Type {cyan}help{/cyan}.");
    return;
  }

  if (target === "help") {
    t("commandsInfo").forEach(line => appendSystemLine(line));
    return;
  }
  if (target === "clear") {
    clearTerminalOutput();
    return;
  }
  if (target === "contact") {
    if (!state.visitedSections.includes("contact")) state.visitedSections.push("contact");
    runSection("contact");
    return;
  }
  if (target === "pricing") {
    if (!state.visitedSections.includes("pricing")) state.visitedSections.push("pricing");
    runSection("pricing");
    return;
  }
  if (target.startsWith("project:")) {
    const projectKey = target.split(":")[1];
    runProject(projectKey);
    return;
  }
  if (["about", "services", "projects", "workflow"].includes(target)) {
    if (!state.visitedSections.includes(target)) {
      runSection(target);
    } else {
      appendSystemLine(t("alreadyVisited"));
    }
  }
}

function toggleMobileNext() {
  const isMobile = window.innerWidth <= 920;
  const show = isMobile && (state.waitingAdvance || state.typing);
  els.mobileNext.classList.toggle("hidden", !show);
}

function continueFlow() {
  if (state.typing || state.awaitingChoice) return;
  if (state.waitingAdvance) {
    state.waitingAdvance = false;
    toggleMobileNext();
    processQueue();
  }
}

function bindGlobalKeys(event) {
  if (document.activeElement === els.commandInput || document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "INPUT") {
    return;
  }
  if ((event.key === "Enter" || event.key === " ") && state.waitingAdvance) {
    event.preventDefault();
    continueFlow();
  }
}

function setLanguage(lang) {
  state.lang = lang;
  document.documentElement.lang = lang;
  els.langButtons.forEach(btn => btn.classList.toggle("is-active", btn.dataset.lang === lang));
  setMeta();
  saveSession();
}

function setTheme(theme) {
  state.theme = theme;
  document.body.classList.toggle("light", theme === "light");
  setMeta();
  saveSession();
}

function startBoot() {
  setMeta();
  setTheme("dark");
  const maybeSession = loadSession();
  setTimeout(() => {
    els.bootScreen.classList.add("hidden");
    if (maybeSession) {
      els.resumeOverlay.classList.remove("hidden");
      els.resumeYes.onclick = () => {
        els.resumeOverlay.classList.add("hidden");
        restoreSession(maybeSession);
      };
      els.resumeNo.onclick = () => {
        els.resumeOverlay.classList.add("hidden");
        clearSession();
        freshStart();
      };
    } else {
      freshStart();
    }
  }, 1600);
}

function restoreSession(saved) {
  state.lang = saved.lang || "pl";
  state.theme = saved.theme || "dark";
  state.visitedSections = saved.visitedSections || [];
  state.visitedProjects = saved.visitedProjects || [];
  setLanguage(state.lang);
  setTheme(state.theme);
  els.terminalOutput.innerHTML = saved.output || "";
  scrollTerminalToBottom();
}

function freshStart() {
  state.visitedSections = [];
  state.visitedProjects = [];
  state.queue = [];
  state.typing = false;
  state.waitingAdvance = false;
  state.awaitingChoice = false;
  state.currentChoicesEl = null;
  clearTerminalOutput();
  queueIntro();
}

els.commandInput.addEventListener("keydown", handleCommandInput);
els.mobileNext.addEventListener("click", continueFlow);
document.addEventListener("keydown", bindGlobalKeys);
els.themeToggle.addEventListener("click", () => setTheme(state.theme === "dark" ? "light" : "dark"));
els.langButtons.forEach(btn => btn.addEventListener("click", () => setLanguage(btn.dataset.lang)));
window.addEventListener("resize", toggleMobileNext);
window.addEventListener("beforeunload", saveSession);

startBoot();
