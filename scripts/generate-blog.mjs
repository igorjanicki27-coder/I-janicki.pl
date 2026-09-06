import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUTPUT_ROOT = process.env.BLOG_OUTPUT_ROOT ? path.resolve(process.env.BLOG_OUTPUT_ROOT) : ROOT;
const SITE_URL = 'https://i-janicki.pl';
const EMAIL = 'kontakt@i-janicki.pl';

const posts = [
  {
    slug: 'ile-kosztuje-strona-internetowa-dla-malej-firmy',
    publishedAt: '2026-09-05',
    title: 'Ile kosztuje strona internetowa dla małej firmy w 2026 roku?',
    description: 'Od czego zależy koszt strony firmowej, co może obejmować abonament i które elementy warto zaplanować przed wyceną.',
    readingTime: '7 min',
    sections: [
      {
        heading: 'Najpierw ustal, za jaki efekt płacisz',
        paragraphs: [
          'Cena strony internetowej nie wynika wyłącznie z liczby ekranów. Największe znaczenie ma cel: prosta prezentacja firmy wymaga innego zakresu niż serwis, który ma pozyskiwać zapytania z kilku usług, obsługiwać wiele lokalizacji albo współpracować z zewnętrznym systemem.',
          'Przed porównaniem ofert warto więc zapisać, kto ma wejść na stronę, czego szuka i jakie działanie powinien wykonać. Dopiero wtedy można ocenić, czy wycena obejmuje potrzebną pracę, czy tylko efektowny szablon.'
        ]
      },
      {
        heading: 'Co najczęściej wpływa na budżet',
        paragraphs: ['Na koszt realizacji najmocniej wpływają elementy, które wymagają indywidualnego projektu, przygotowania treści, programowania oraz testów.'],
        list: [
          'liczba podstron i zakres materiałów do uporządkowania;',
          'indywidualny wygląd, animacje i niestandardowe komponenty;',
          'formularze, płatności, mapy, system rezerwacji lub inne integracje;',
          'wersje językowe, panel do edycji treści i uprawnienia użytkowników;',
          'przygotowanie treści, zdjęć, grafik i struktury pod SEO;',
          'opieka techniczna, hosting, kopie zapasowe oraz dalszy rozwój.'
        ]
      },
      {
        heading: 'Abonament czy jednorazowa realizacja?',
        paragraphs: [
          'Abonament może obniżyć koszt wejścia i połączyć wykonanie strony z jej utrzymaniem. Trzeba jednak dokładnie sprawdzić, co dzieje się po zakończeniu umowy, kto jest właścicielem domeny i treści oraz jakie zmiany obejmuje miesięczna opłata.',
          'Model jednorazowy daje czytelny koszt wdrożenia, ale hosting, domena, aktualizacje i większe zmiany nadal generują późniejsze wydatki. Żaden model nie jest automatycznie lepszy — powinien pasować do budżetu i sposobu rozwijania witryny.'
        ]
      },
      {
        heading: 'Jak nie przepłacić na starcie',
        paragraphs: [
          'Najbezpieczniej zacząć od minimalnego zakresu, który potrafi już zdobywać zapytania: jasna oferta, dowody wiarygodności, wygodny kontakt i poprawne działanie na telefonie. Funkcje, których potrzeby nie potwierdzili klienci, można dodać później.',
          'W ofercie i-JANICKI prosta strona firmowa lub portfolio zaczyna się od 49 zł miesięcznie. Dokładny zakres zależy od projektu — aktualne kwoty i zasady znajdziesz w cenniku.'
        ],
        links: [
          ['/oferta/cennik/', 'Sprawdź orientacyjny cennik'],
          ['/oferta/strony-www/', 'Zobacz usługę tworzenia stron WWW']
        ]
      }
    ]
  },
  {
    slug: 'strona-lokalnej-firmy-elementy-ktore-zamieniaja-wejscia-w-zapytania',
    publishedAt: '2026-10-01',
    title: 'Strona lokalnej firmy: 9 elementów, które zamieniają wejścia w zapytania',
    description: 'Praktyczna lista elementów, które pomagają lokalnej stronie firmowej budować zaufanie i prowadzić użytkownika do kontaktu.',
    readingTime: '8 min',
    sections: [
      {
        heading: 'Lokalny klient chce szybko potwierdzić trzy rzeczy',
        paragraphs: [
          'Osoba szukająca wykonawcy w okolicy zwykle sprawdza, czy firma realizuje konkretną usługę, obsługuje daną miejscowość i wygląda wiarygodnie. Jeżeli odpowiedzi są schowane, użytkownik wraca do wyników wyszukiwania i wybiera stronę, która podaje je od razu.',
          'Dlatego lokalna witryna nie powinna być tylko wizytówką z numerem telefonu. Ma skrócić drogę od problemu klienta do decyzji o kontakcie.'
        ]
      },
      {
        heading: 'Dziewięć elementów dobrej strony lokalnej',
        list: [
          'nagłówek, który jasno nazywa usługę i odbiorcę;',
          'prawdziwy obszar obsługi opisany bez listy przypadkowych miast;',
          'czytelne przyciski telefonu, WhatsApp i e-maila;',
          'konkretne opisy najważniejszych usług;',
          'realizacje, zdjęcia lub przykłady pokazujące sposób pracy;',
          'opinie klientów i informacje budujące wiarygodność;',
          'odpowiedzi na pytania o termin, cenę oraz przebieg współpracy;',
          'szybkie działanie i wygodny układ na telefonie;',
          'spójne dane kontaktowe na stronie i w Profilu Firmy Google.'
        ]
      },
      {
        heading: 'Jedna podstrona na jeden wyraźny zamiar',
        paragraphs: [
          'Osobna strona lokalna ma sens, kiedy firma rzeczywiście obsługuje dany rynek i potrafi opisać go w unikalny sposób. Kopiowanie tej samej treści oraz wymiana samej nazwy miasta osłabia użyteczność i utrudnia wyszukiwarce wybór właściwego adresu.',
          'Na tej stronie lokalizacje mają własny kontekst, a ogólny zakres tworzenia witryn pozostaje na jednej podstronie usługowej. Dzięki temu strony wzajemnie się uzupełniają.'
        ],
        links: [
          ['/oferta/wroclaw/', 'Oferta lokalna: Wrocław'],
          ['/oferta/sroda-slaska/', 'Oferta lokalna: Środa Śląska'],
          ['/oferta/miekinia-lutynia/', 'Oferta lokalna: Miękinia i Lutynia']
        ]
      }
    ]
  },
  {
    slug: 'seo-lokalne-krok-po-kroku',
    publishedAt: '2026-11-01',
    title: 'SEO lokalne krok po kroku: jak przygotować firmę na klientów z okolicy',
    description: 'Plan lokalnego SEO: od technicznej kontroli strony przez ofertę i Profil Firmy Google po pomiar zapytań.',
    readingTime: '9 min',
    sections: [
      {
        heading: 'Widoczność lokalna zaczyna się przed pisaniem tekstów',
        paragraphs: [
          'Pierwszym krokiem jest określenie usług, obszaru dojazdu i zapytań, które mogą kończyć się sprzedażą. Firma działająca tylko lokalnie nie potrzebuje treści dla całego kraju. Z kolei usługę realizowaną zdalnie warto opisać szerzej niż jedną miejscowość.',
          'Taki podział pomaga przygotować architekturę strony: osobne adresy otrzymują ważne usługi i uzasadnione rynki lokalne, a pozostałe informacje wspierają je przez linkowanie wewnętrzne.'
        ]
      },
      {
        heading: 'Plan działań w sześciu krokach',
        list: [
          'sprawdź indeksowanie, przekierowania, adresy kanoniczne i mapę witryny;',
          'uporządkuj ofertę oraz przypisz jednej podstronie jedną główną intencję;',
          'uzupełnij dane firmy, kanały kontaktu i faktyczny obszar obsługi;',
          'rozwiń treść o pytania, które klienci zadają przed zakupem;',
          'zadbaj o kompletny Profil Firmy Google i prawdziwe opinie;',
          'mierz wyświetlenia, wejścia i kliknięcia kontaktowe, a później poprawiaj słabsze miejsca.'
        ]
      },
      {
        heading: 'Co mierzyć zamiast samej pozycji',
        paragraphs: [
          'Pozycja pojedynczego hasła zmienia się zależnie od lokalizacji, urządzenia i historii wyszukiwania. Lepszy obraz dają zapytania oraz strony widoczne w Google Search Console, ruch na konkretnych landingach i liczba przejść do kontaktu.',
          'Warto też notować realne zapytania telefoniczne i wiadomości. SEO ma wspierać cel firmy, a nie tylko tworzyć wykres widoczności bez przełożenia na rozmowy z klientami.'
        ],
        links: [['/oferta/seo/', 'Zobacz zakres działań SEO']]
      }
    ]
  },
  {
    slug: 'strona-www-czy-aplikacja',
    publishedAt: '2026-12-01',
    title: 'Strona WWW czy aplikacja? Jak dobrać rozwiązanie do procesu w firmie',
    description: 'Różnice między stroną internetową a aplikacją i prosty sposób wyboru rozwiązania bez budowania zbyt dużego systemu.',
    readingTime: '7 min',
    sections: [
      {
        heading: 'Strona prezentuje, aplikacja pozwala wykonywać zadania',
        paragraphs: [
          'Strona internetowa najczęściej wyjaśnia ofertę, buduje wiarygodność i prowadzi odbiorcę do kontaktu lub zakupu. Aplikacja służy natomiast do wykonywania powtarzalnych czynności: pracy na danych, obsługi procesu, logowania użytkowników, raportowania albo integracji z innymi systemami.',
          'Granica nie zawsze jest ostra. Serwis może zawierać kalkulator lub panel, a aplikacja webowa może mieć publiczną część informacyjną. O wyborze powinien decydować najważniejszy problem, nie nazwa technologii.'
        ]
      },
      {
        heading: 'Kiedy wystarczy dobra strona',
        list: [
          'chcesz zaprezentować firmę, usługi, realizacje i dane kontaktowe;',
          'treść ma być dostępna publicznie bez logowania;',
          'najważniejszym celem są zapytania, rezerwacje lub sprzedaż;',
          'proces po kontakcie może być jeszcze obsługiwany obecnymi narzędziami.'
        ]
      },
      {
        heading: 'Kiedy rozważyć aplikację',
        list: [
          'użytkownicy pracują na kontach, rolach i wspólnych danych;',
          'arkusze oraz wiadomości powodują pomyłki lub podwójną pracę;',
          'proces wymaga statusów, raportów, automatyzacji albo integracji API;',
          'rozwiązanie ma wykorzystywać funkcje telefonu lub działać jako program desktopowy.'
        ]
      },
      {
        heading: 'Zacznij od najmniejszej użytecznej wersji',
        paragraphs: [
          'Przed budową systemu warto rozpisać użytkowników, dane i jeden proces, który przynosi największą korzyść. Pierwsza wersja nie musi odtwarzać każdego wyjątku z obecnej pracy. Powinna rozwiązać najważniejszy problem i dostarczyć informacji do kolejnych decyzji.',
          'Czasem najlepszym pierwszym etapem jest strona z prostym narzędziem. Innym razem potrzebna jest aplikacja webowa, mobilna lub desktopowa. Wstępna analiza pozwala uniknąć kosztu funkcji, których nikt później nie używa.'
        ],
        links: [
          ['/oferta/strony-www/', 'Sprawdź ofertę stron WWW'],
          ['/oferta/aplikacje/', 'Sprawdź aplikacje na zamówienie']
        ]
      }
    ]
  }
];

const navigation = [
  ['/oferta/', 'Oferta'],
  ['/oferta/strony-www/', 'Strony WWW'],
  ['/oferta/aplikacje/', 'Aplikacje'],
  ['/oferta/cennik/', 'Cennik'],
  ['/blog/', 'Blog']
];

function warsawDate() {
  if (process.env.BLOG_PUBLICATION_DATE) return process.env.BLOG_PUBLICATION_DATE;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function polishDate(value) {
  return new Intl.DateTimeFormat('pl-PL', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Warsaw'
  }).format(new Date(`${value}T12:00:00+02:00`));
}

async function writeIfChanged(filePath, content) {
  try {
    if (await fs.readFile(filePath, 'utf8') === content) return false;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await fs.writeFile(filePath, content, 'utf8');
  return true;
}

function renderNavigation(currentPath) {
  return navigation.map(([href, label]) =>
    `<a href="${href}"${href === currentPath ? ' aria-current="page"' : ''}>${label}</a>`
  ).join('');
}

function renderFooter() {
  return `<footer class="foot">
    <span>© <span id="year" data-year></span> i-JANICKI</span>
    <span class="foot-sep">·</span>
    <a href="mailto:${EMAIL}" class="foot-mail">${EMAIL}</a>
    <span class="foot-sep">·</span>
    <a href="/dokumenty/" class="foot-docs">Dokumenty</a>
    <button class="cookie-foot-btn" id="cookieFootBtn" type="button" aria-label="Zmień ustawienia cookies" data-i18n-aria-label="cookie-settings-change">🍪</button>
  </footer>`;
}

function renderShellHead({ title, description, canonical, structuredData, type = 'website' }) {
  return `<meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#05060c">
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="${type}">
  <meta property="og:locale" content="pl_PL">
  <meta property="og:site_name" content="i-JANICKI">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${SITE_URL}/icons/icon.png">
  <meta name="twitter:card" content="summary">
  <title>${escapeHtml(title)} | i-JANICKI</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&amp;family=JetBrains+Mono:wght@700&amp;family=Orbitron:wght@700;800&amp;display=swap">
  <link rel="stylesheet" href="/oferta.css?v=5">
  <link rel="stylesheet" href="/blog.css?v=1">
  <script type="application/ld+json">${JSON.stringify(structuredData).replaceAll('<', '\\u003c')}</script>
  <script defer src="/analytics.js?v=10"></script>
  <script defer src="/oferta.js?v=4"></script>`;
}

function renderHeader(currentPath = '/blog/') {
  return `<a class="skip-link" href="#main">Przejdź do treści</a>
  <header class="site-header"><div class="nav-shell">
    <a class="brand" href="/" aria-label="i-JANICKI — strona główna"><img src="/icons/icon.png" width="34" height="34" alt=""><span>i-JANICKI</span></a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="service-navigation" data-nav-toggle>Menu</button>
    <nav class="nav-links" id="service-navigation" aria-label="Główna nawigacja" data-nav>${renderNavigation(currentPath)}<a class="nav-cta" href="/kontakt/">Kontakt</a></nav>
  </div></header>`;
}

function renderBlogIndex(visiblePosts) {
  const canonical = `${SITE_URL}/blog/`;
  const structuredData = {
    '@context': 'https://schema.org', '@type': 'Blog', name: 'Blog i-JANICKI', url: canonical,
    description: 'Praktyczne artykuły o stronach internetowych, aplikacjach i lokalnym SEO.',
    blogPost: visiblePosts.map((post) => ({
      '@type': 'BlogPosting', headline: post.title, datePublished: post.publishedAt,
      url: `${canonical}${post.slug}/`
    }))
  };
  const cards = [...visiblePosts].reverse().map((post) => `<article class="blog-card">
    <p class="section-kicker"><time datetime="${post.publishedAt}">${polishDate(post.publishedAt)}</time> · ${post.readingTime}</p>
    <h2><a href="/blog/${post.slug}/">${escapeHtml(post.title)}</a></h2>
    <p>${escapeHtml(post.description)}</p>
    <a class="text-link" href="/blog/${post.slug}/">Czytaj artykuł <span aria-hidden="true">→</span></a>
  </article>`).join('');

  return `<!doctype html>
<html lang="pl"><head>
  ${renderShellHead({ title: 'Blog o stronach WWW, aplikacjach i SEO', description: 'Praktyczne artykuły o stronach internetowych, aplikacjach i lokalnym SEO dla małych firm.', canonical, structuredData })}
</head><body>
  ${renderHeader('/blog/')}
  <main id="main">
    <div class="container breadcrumbs" aria-label="Okruszki"><ol><li><a href="/">Strona główna</a></li><li aria-current="page">Blog</li></ol></div>
    <section class="hero blog-hero"><div class="container"><p class="eyebrow">Wiedza bez technicznego nadęcia</p><h1 class="gradient-text">Blog o stronach WWW, aplikacjach i SEO</h1><p class="hero-lead">Praktyczne wskazówki dla firm, które chcą lepiej wykorzystać stronę internetową, lokalną widoczność i własne narzędzia. Nowy wpis raz w miesiącu.</p></div></section>
    <section class="section section-muted"><div class="container blog-list">${cards}</div></section>
    <section class="section"><div class="container cta"><p class="section-kicker">Masz konkretny cel?</p><h2>Porozmawiajmy o stronie lub aplikacji</h2><p>Krótko opisz firmę i problem. Pomogę dobrać zakres bez dokładania przypadkowych funkcji.</p><div class="actions"><a class="button button-primary" href="/kontakt/">Przejdź do kontaktu</a></div></div></section>
  </main>
  ${renderFooter()}
  <div class="cookie-overlay" id="cookieOverlay" role="dialog" aria-modal="true" aria-label="Ustawienia plików cookie" aria-hidden="true" hidden></div>
</body></html>
`;
}

function renderSection(section) {
  const paragraphs = (section.paragraphs || []).map((text) => `<p>${escapeHtml(text)}</p>`).join('');
  const list = section.list ? `<ul>${section.list.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '';
  const links = section.links ? `<div class="article-links">${section.links.map(([href, label]) => `<a href="${href}">${escapeHtml(label)} <span aria-hidden="true">→</span></a>`).join('')}</div>` : '';
  return `<section><h2>${escapeHtml(section.heading)}</h2>${paragraphs}${list}${links}</section>`;
}

function renderPost(post) {
  const canonical = `${SITE_URL}/blog/${post.slug}/`;
  const structuredData = [
    {
      '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title,
      description: post.description, datePublished: post.publishedAt, dateModified: post.publishedAt,
      mainEntityOfPage: canonical, image: `${SITE_URL}/icons/icon.png`,
      author: { '@type': 'Person', name: 'Igor Janicki', url: `${SITE_URL}/` },
      publisher: { '@id': `${SITE_URL}/#business` }
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Strona główna', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog/` },
        { '@type': 'ListItem', position: 3, name: post.title, item: canonical }
      ]
    }
  ];

  return `<!doctype html>
<html lang="pl"><head>
  ${renderShellHead({ title: post.title, description: post.description, canonical, structuredData, type: 'article' })}
  <meta property="article:published_time" content="${post.publishedAt}T08:00:00+02:00">
</head><body>
  ${renderHeader('/blog/')}
  <main id="main">
    <div class="container breadcrumbs" aria-label="Okruszki"><ol><li><a href="/">Strona główna</a></li><li><a href="/blog/">Blog</a></li><li aria-current="page">Artykuł</li></ol></div>
    <article class="article-shell">
      <header class="article-header"><p class="eyebrow"><time datetime="${post.publishedAt}">${polishDate(post.publishedAt)}</time> · ${post.readingTime} czytania</p><h1 class="gradient-text">${escapeHtml(post.title)}</h1><p class="hero-lead">${escapeHtml(post.description)}</p></header>
      <div class="article-content">${post.sections.map(renderSection).join('')}</div>
      <footer class="article-footer"><p>Autor: <strong>Igor Janicki</strong></p><a class="text-link" href="/blog/">← Wróć do wszystkich artykułów</a></footer>
    </article>
    <section class="section"><div class="container cta"><p class="section-kicker">Kolejny krok</p><h2>Chcesz przełożyć wskazówki na własną stronę?</h2><p>Opisz krótko cel, a pomogę ustalić najważniejszy zakres działania.</p><div class="actions"><a class="button button-primary" href="/kontakt/">Skontaktuj się</a></div></div></section>
  </main>
  ${renderFooter()}
  <div class="cookie-overlay" id="cookieOverlay" role="dialog" aria-modal="true" aria-label="Ustawienia plików cookie" aria-hidden="true" hidden></div>
</body></html>
`;
}

const today = warsawDate();
const visiblePosts = posts.filter((post) => post.publishedAt <= today);
const blogRoot = path.join(OUTPUT_ROOT, 'blog');
await fs.mkdir(blogRoot, { recursive: true });
await writeIfChanged(path.join(blogRoot, 'index.html'), renderBlogIndex(visiblePosts));

for (const post of visiblePosts) {
  const outputDirectory = path.join(blogRoot, post.slug);
  await fs.mkdir(outputDirectory, { recursive: true });
  await writeIfChanged(path.join(outputDirectory, 'index.html'), renderPost(post));
}

console.log(`Generated blog index and ${visiblePosts.length} published post(s) for ${today}.`);
