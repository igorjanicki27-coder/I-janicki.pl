import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SITE_URL = 'https://i-janicki.pl';
const EMAIL = 'kontakt@i-janicki.pl';

const navigation = [
  ['oferta', 'Oferta'],
  ['oferta/wroclaw', 'Wrocław'],
  ['oferta/sroda-slaska', 'Środa Śląska'],
  ['oferta/miekinia-lutynia', 'Miękinia i Lutynia'],
  ['oferta/cennik', 'Cennik'],
  ['oferta/strony-www', 'Strony WWW'],
  ['oferta/aplikacje', 'Aplikacje'],
  ['blog', 'Blog']
];

const relatedServices = [
  ['oferta/sroda-slaska', 'Strony WWW — Środa Śląska'],
  ['oferta/miekinia-lutynia', 'Strony WWW — Miękinia i Lutynia'],
  ['oferta/wroclaw', 'Strony WWW — Wrocław'],
  ['oferta/cennik', 'Cennik'],
  ['oferta/strony-www', 'Strony internetowe na zamówienie'],
  ['oferta/aplikacje', 'Aplikacje'],
  ['oferta/opieka-it', 'Opieka IT'],
  ['oferta/sieci', 'Sieci LAN, Wi-Fi i VPN'],
  ['oferta/seo', 'Pozycjonowanie i SEO']
];

const pages = [
  {
    slug: 'oferta/sroda-slaska',
    navLabel: 'Środa Śląska',
    areaServed: ['Środa Śląska', 'powiat średzki'],
    metaTitle: 'Strony internetowe Środa Śląska | i-JANICKI',
    metaDescription: 'Nowoczesne strony internetowe dla firm ze Środy Śląskiej i okolic. Indywidualny projekt, responsywność, szybkie działanie i solidne podstawy SEO.',
    eyebrow: 'Strony internetowe • Środa Śląska i okolice',
    title: 'Strony internetowe dla firm ze Środy Śląskiej',
    lead: 'Projektuję szybkie, czytelne i dopasowane do firmy strony WWW, które budują zaufanie i prowadzą klienta od pierwszego wejścia do kontaktu. Bez przypadkowego szablonu i bez zbędnych funkcji.',
    facts: [
      ['Cena', 'od 49 zł/mies.'],
      ['Obsługa', 'lokalnie i zdalnie'],
      ['Standard', 'mobile + SEO'],
      ['Wycena', 'indywidualna']
    ],
    benefitsTitle: 'Strona, która pracuje na lokalną firmę',
    benefitsLead: 'Dobra witryna nie kończy się na atrakcyjnym wyglądzie. Powinna szybko wyjaśniać ofertę, usuwać wątpliwości i ułatwiać wykonanie kolejnego kroku.',
    benefits: [
      ['Projekt dopasowany do firmy', 'Układ, język i funkcje wynikają z Twojej oferty oraz sposobu, w jaki klienci szukają usług w Środzie Śląskiej i okolicy.'],
      ['Szybkość i wygoda na telefonie', 'Strona jest projektowana z myślą o urządzeniach mobilnych, prostym kontakcie i krótkiej drodze do najważniejszych informacji.'],
      ['Fundament pod widoczność', 'Poprawna struktura nagłówków, metadane, czytelne adresy i dane strukturalne przygotowują serwis do dalszych działań SEO.']
    ],
    scopeTitle: 'Co może obejmować realizacja strony',
    scopeLead: 'Zakres ustalamy przed rozpoczęciem pracy. Otrzymujesz wycenę dopasowaną do realnych potrzeb, zamiast płacić za moduły, których firma nie wykorzysta.',
    scope: [
      'Strona wizytówkowa lub rozbudowana strona firmowa',
      'Indywidualny układ i spójna oprawa wizualna',
      'Wersja na telefon, tablet i komputer',
      'Czytelne odnośniki do e-maila, telefonu i WhatsApp',
      'Sekcje usług, realizacji, opinii i FAQ',
      'Podstawowa optymalizacja techniczna SEO',
      'Konfiguracja analityki po uzgodnieniu zakresu',
      'Wdrożenie oraz możliwość dalszej opieki technicznej'
    ],
    processTitle: 'Jak powstaje strona internetowa',
    process: [
      ['Rozmowa i cel', 'Ustalamy, do kogo strona ma trafiać, co ma komunikować i jakie zapytania ma generować.'],
      ['Zakres i wycena', 'Opisuję funkcje, harmonogram i koszt. Przed startem wiesz, co dokładnie otrzymasz.'],
      ['Projekt i wdrożenie', 'Przygotowuję stronę etapami i konsultuję kluczowe decyzje, zanim przejdę dalej.'],
      ['Testy i publikacja', 'Sprawdzam działanie na różnych ekranach, nanoszę uzgodnione poprawki i wdrażam gotową stronę.']
    ],
    localTitle: 'Blisko, konkretnie i bez agencyjnego pośrednictwa',
    localText: ['Obsługuję firmy ze Środy Śląskiej oraz sąsiednich miejscowości. Możemy omówić projekt zdalnie, a gdy charakter współpracy tego wymaga — ustalić spotkanie lub działania na miejscu.', 'Lokalny kontekst wykorzystuję w treści tylko tam, gdzie ma znaczenie dla klienta. Nie tworzę sztucznych kopii tej samej strony dla każdej miejscowości.'],
    localPanelTitle: 'Obszar obsługi',
    localPanelText: 'Środa Śląska i powiat średzki, a projekty stron internetowych również zdalnie dla firm z całej Polski.',
    areas: ['Środa Śląska', 'Miękinia', 'Malczyce', 'Kostomłoty', 'Udanin', 'Dolny Śląsk'],
    priceTitle: 'Ile kosztuje strona internetowa?',
    priceLead: 'Abonament za prostą stronę firmową lub portfolio zaczyna się od 49 zł miesięcznie. Końcowa cena zależy przede wszystkim od liczby widoków, ilości treści, integracji i funkcji dodatkowych.',
    priceCards: [
      ['Strona wizytówkowa w abonamencie', 'od 49 zł/mies.', 'Zwarta prezentacja firmy, usług i kontaktu. Dobra na uporządkowany start w internecie.'],
      ['Rozbudowana strona firmowa', 'wycena indywidualna', 'Więcej podstron, rozbudowana oferta, realizacje, treści lokalne lub dodatkowe integracje.']
    ],
    faq: [
      ['Ile trwa przygotowanie strony?', 'Prosta strona jest zwykle gotowa w ciągu 1–2 tygodni. Większe realizacje wymagają więcej czasu, zależnie od liczby podstron, materiałów i integracji.'],
      ['Czy muszę mieć gotowe teksty i zdjęcia?', 'Nie. Możemy zacząć od materiałów, które już masz, a brakujące treści i grafiki określić podczas ustalania zakresu.'],
      ['Czy strona będzie widoczna w Google?', 'Strona otrzymuje poprawne podstawy techniczne SEO. Wysokie pozycje zależą jednak również od konkurencji, jakości treści, historii domeny, linków i dalszej pracy nad widocznością.'],
      ['Czy będę mógł później rozbudować stronę?', 'Tak. Strukturę można przygotować tak, aby później dodać kolejne usługi, realizacje, artykuły lub funkcje.'],
      ['Czy obsługujesz tylko Środę Śląską?', 'Nie. Lokalnie skupiam się na Środzie Śląskiej i powiecie średzkim, ale projekty internetowe realizuję również całkowicie zdalnie.']
    ]
  },
  {
    slug: 'oferta/cennik',
    navLabel: 'Cennik',
    areaServed: ['Środa Śląska', 'Miękinia', 'Wrocław', 'Dolny Śląsk'],
    metaTitle: 'Cennik stron internetowych i aplikacji | i-JANICKI',
    metaDescription: 'Sprawdź orientacyjny cennik usług i-JANICKI. Strony internetowe od 49 zł/mies., aplikacje od 99 zł/mies. Środa Śląska, Miękinia i Wrocław.',
    eyebrow: 'Przejrzyste widełki • indywidualna wycena',
    title: 'Cennik stron internetowych i usług IT',
    lead: 'Poznaj ceny początkowe, zanim opiszesz projekt. Każde zlecenie wyceniam indywidualnie, ale od początku wskazuję, co wpływa na budżet i gdzie można uprościć zakres.',
    facts: [
      ['Strony', 'od 49 zł/mies.'],
      ['Aplikacje', 'od 99 zł/mies.'],
      ['Sieci', 'od 150 zł/h'],
      ['Opieka IT', 'od 300 zł/mc']
    ],
    benefitsTitle: 'Od czego zależy cena strony?',
    benefitsLead: 'Dwie podobnie wyglądające strony mogą wymagać zupełnie innego nakładu pracy. Największe znaczenie mają zakres treści, funkcje oraz stopień indywidualnego dopasowania.',
    benefits: [
      ['Liczba podstron i treści', 'Strona główna z kilkoma sekcjami kosztuje mniej niż serwis z osobnymi usługami, realizacjami, poradnikami i wersjami językowymi.'],
      ['Funkcje oraz integracje', 'Formularze, panele, logowanie, płatności, zewnętrzne API lub automatyzacje zwiększają zakres projektu i czas testów.'],
      ['Materiały i projekt', 'Na cenę wpływa również gotowość tekstów, zdjęć, identyfikacji wizualnej oraz liczba przygotowywanych wariantów.']
    ],
    scopeTitle: 'Co ustalam przed podaniem końcowej ceny',
    scopeLead: 'Krótka rozmowa pozwala oddzielić funkcje potrzebne od tych, które można bezpiecznie odłożyć na kolejny etap.',
    scope: [
      'Cel strony i rodzaj odbiorcy',
      'Planowana liczba podstron',
      'Zakres dostarczonych materiałów',
      'Formularze, integracje i funkcje dodatkowe',
      'Wymagania dotyczące wyglądu i animacji',
      'Treści lokalne oraz zakres SEO',
      'Termin realizacji',
      'Zakres wsparcia po publikacji'
    ],
    processTitle: 'Jak wygląda wycena',
    process: [
      ['Opisujesz potrzebę', 'Wystarczy krótko napisać, czym zajmuje się firma i czego oczekujesz od strony lub usługi.'],
      ['Doprecyzowuję zakres', 'Zadaję pytania o funkcje, materiały, termin i elementy, które mają największe znaczenie.'],
      ['Otrzymujesz propozycję', 'Przedstawiam zakres oraz orientacyjny harmonogram i koszt realizacji.'],
      ['Podejmujesz decyzję', 'Wycena nie zobowiązuje do rozpoczęcia współpracy. Zakres możemy także podzielić na etapy.']
    ],
    localTitle: 'Wycena dla firm z Dolnego Śląska i całej Polski',
    localText: ['Lokalizacja nie podnosi ceny projektu internetowego. Firmy ze Środy Śląskiej, Miękini i Wrocławia obsługuję lokalnie, a większość ustaleń możemy przeprowadzić również zdalnie.', 'Najpierw dobieramy rozwiązanie do celu i budżetu. Jeżeli prostsza wersja wystarczy, powiem o tym wprost.'],
    localPanelTitle: 'Wycena bez zobowiązań',
    localPanelText: 'Napisz, jaki efekt chcesz osiągnąć. Otrzymasz propozycję zakresu dopasowaną do firmy, a nie automatyczny pakiet.',
    areas: ['Środa Śląska', 'Miękinia', 'Wrocław', 'Realizacja zdalna'],
    priceTitle: 'Orientacyjne ceny usług',
    priceLead: 'Podane kwoty są cenami początkowymi. Dokładna wycena powstaje po ustaleniu zakresu, dzięki czemu wiadomo, jakie prace obejmuje budżet.',
    priceCards: [
      ['Strona internetowa', 'od 49 zł/mies.', 'Strona wizytówkowa lub portfolio, responsywna i przygotowana pod podstawowe działania SEO.'],
      ['Aplikacja na zamówienie', 'od 99 zł/mies.', 'Aplikacja webowa, desktopowa lub mobilna z logiką biznesową, integracjami i bazą danych.'],
      ['Sieć i administracja', 'od 150 zł/h', 'Projekt, konfiguracja LAN/Wi-Fi, VPN, urządzeń sieciowych i zabezpieczeń.'],
      ['Opieka IT', 'od 300 zł/mc', 'Bieżące wsparcie, aktualizacje i monitoring w uzgodnionym zakresie.']
    ],
    faq: [
      ['Czy podane ceny są cenami końcowymi?', 'Nie. To ceny początkowe pokazujące skalę budżetu. Końcowa kwota zależy od zakresu funkcji, treści, integracji i terminu.'],
      ['Czy wycena jest płatna?', 'Wstępna rozmowa i przygotowanie standardowej propozycji zakresu nie zobowiązują do zakupu. Jeżeli projekt wymaga osobnego, rozbudowanego audytu, zostanie to ustalone wcześniej.'],
      ['Czy projekt można podzielić na etapy?', 'Tak. W wielu przypadkach warto najpierw uruchomić podstawową wersję, a kolejne funkcje rozwijać na podstawie realnych potrzeb użytkowników.'],
      ['Czy hosting i domena są w cenie?', 'Zakres zależy od projektu. Koszty usług zewnętrznych, takich jak domena, hosting lub płatne licencje, są zawsze wskazywane osobno przed rozpoczęciem prac.'],
      ['Czy wystawiasz dokument sprzedaży?', 'Warunki rozliczenia oraz dokumenty ustalamy przed rozpoczęciem realizacji i zapisujemy w zakresie współpracy.']
    ]
  },
  {
    slug: 'oferta/strony-www',
    navLabel: 'Strony WWW',
    areaServed: ['Polska'],
    metaTitle: 'Projektowanie stron WWW dla firm | i-JANICKI',
    metaDescription: 'Projektowanie i tworzenie stron WWW dla firm. Indywidualny układ, responsywność, szybkie działanie, bezpośredni kontakt i techniczne podstawy SEO.',
    eyebrow: 'Projektowanie i tworzenie stron WWW',
    title: 'Strony internetowe dopasowane do Twojej firmy',
    lead: 'Projektuję strony WWW, które jasno prezentują ofertę, dobrze działają na telefonie i prowadzą użytkownika do kontaktu. Zakres dobieram do celu firmy — od zwartej wizytówki po rozbudowany serwis.',
    facts: [
      ['Cena', 'od 49 zł/mies.'],
      ['Projekt', 'indywidualny'],
      ['Standard', 'mobile + SEO'],
      ['Realizacja', 'lokalnie lub zdalnie']
    ],
    benefitsTitle: 'Strona zaprojektowana wokół konkretnego celu',
    benefitsLead: 'Wygląd jest ważny, ale dobra strona musi przede wszystkim pomagać odbiorcy zrozumieć ofertę i wykonać kolejny krok.',
    benefits: [
      ['Czytelna komunikacja', 'Porządkuję ofertę, hierarchię treści i wezwania do działania, aby użytkownik szybko znalazł najważniejsze informacje.'],
      ['Wygoda na każdym ekranie', 'Układ powstaje z myślą o smartfonach, tabletach i komputerach, z naciskiem na czytelność oraz prostą nawigację.'],
      ['Solidna baza techniczna', 'Lekki kod, zoptymalizowane grafiki, metadane i dane strukturalne tworzą fundament pod szybkość, dostępność i dalsze działania SEO.']
    ],
    scopeTitle: 'Co może obejmować realizacja strony WWW',
    scopeLead: 'Zakres ustalamy przed rozpoczęciem prac. Nie dokładam modułów, które nie pomagają firmie osiągnąć celu.',
    scope: [
      'Analiza celu strony i potrzeb odbiorców',
      'Indywidualny projekt układu oraz oprawy wizualnej',
      'Strona wizytówkowa, firmowa, portfolio lub serwis usługowy',
      'Wersja responsywna na telefon, tablet i komputer',
      'Sekcje usług, realizacji, opinii, cennika i FAQ',
      'Bezpośrednie odnośniki do e-maila, telefonu i WhatsApp',
      'Optymalizacja grafik i szybkości ładowania',
      'Techniczne podstawy SEO i dane strukturalne',
      'Publikacja oraz możliwość dalszej opieki technicznej'
    ],
    processTitle: 'Od pomysłu do opublikowanej strony',
    process: [
      ['Cel i materiały', 'Ustalamy odbiorców, najważniejszą ofertę, potrzebne treści oraz działanie, które ma wykonać użytkownik.'],
      ['Struktura i wycena', 'Przygotowuję plan strony, zakres prac, harmonogram oraz koszt bez ukrytych, przypadkowych dodatków.'],
      ['Projekt i wdrożenie', 'Buduję stronę etapami, prezentuję postęp i konsultuję elementy ważne dla komunikacji oraz obsługi.'],
      ['Testy i publikacja', 'Sprawdzam stronę na różnych ekranach, poprawiam uzgodnione elementy i publikuję gotowy serwis.']
    ],
    localTitle: 'Współpraca stacjonarna lub całkowicie zdalna',
    localText: ['Projekt strony możemy przeprowadzić online niezależnie od siedziby firmy. Rozmowy, prezentacje kolejnych wersji i odbiory nie wymagają spotkań stacjonarnych.', 'Jeżeli zależy Ci na ofercie opisanej dla konkretnego rynku, wybierz odpowiednią stronę lokalną. Ta podstrona opisuje samą usługę tworzenia stron WWW i nie zastępuje treści przygotowanych dla poszczególnych miejscowości.'],
    localPanelTitle: 'Jedna usługa, różne rynki',
    localPanelText: 'Zakres techniczny i zasady realizacji pozostają wspólne. Osobne strony lokalne rozwijają wyłącznie kontekst danego obszaru działania.',
    areas: ['Realizacja zdalna', 'Cała Polska', 'Spotkanie po ustaleniu'],
    priceTitle: 'Ile kosztuje strona internetowa?',
    priceLead: 'Abonament za prostą stronę firmową lub portfolio zaczyna się od 49 zł miesięcznie. Końcowa cena zależy od liczby podstron, ilości treści, integracji i dodatkowych funkcji.',
    priceCards: [
      ['Strona firmowa w abonamencie', 'od 49 zł/mies.', 'Zwarta prezentacja firmy, usług i danych kontaktowych, przygotowana do wygodnego dalszego rozwoju.'],
      ['Rozbudowany serwis WWW', 'wycena indywidualna', 'Więcej podstron, treści, realizacji, wersji językowych albo integracji wymagających osobnego zakresu.']
    ],
    faq: [
      ['Jakie rodzaje stron internetowych tworzysz?', 'Realizuję strony wizytówkowe, strony firmowe, portfolio i rozbudowane serwisy usługowe. Zakres wynika z celu, treści i potrzeb odbiorców.'],
      ['Czy mogę korzystać z własnej domeny?', 'Tak. Strona może działać pod posiadaną domeną lub mogę pomóc w wyborze i poprawnej konfiguracji nowego adresu.'],
      ['Czy strona będzie działać na telefonie?', 'Tak. Każdy projekt przygotowuję responsywnie, aby treść i najważniejsze działania były wygodne na smartfonie, tablecie oraz komputerze.'],
      ['Czy strona będzie przygotowana pod SEO?', 'Tak. W ramach realizacji przygotowuję techniczne podstawy SEO. Dalsze pozycjonowanie zależy również od treści, konkurencji, historii domeny i regularnego rozwoju serwisu.'],
      ['Czy po publikacji można rozbudować stronę?', 'Tak. Strukturę można przygotować tak, aby później dodawać kolejne usługi, realizacje, artykuły, wersje językowe lub integracje.']
    ]
  },
  {
    slug: 'oferta/aplikacje',
    navLabel: 'Aplikacje',
    areaServed: ['Środa Śląska', 'Miękinia', 'Wrocław', 'Polska'],
    metaTitle: 'Aplikacje na zamówienie | web, desktop i mobile',
    metaDescription: 'Dedykowane aplikacje webowe, desktopowe i mobilne dla firm. Logika biznesowa, bazy danych, integracje API i rozwiązania wieloplatformowe.',
    eyebrow: 'Dedykowane narzędzia dla biznesu',
    title: 'Aplikacje na zamówienie',
    lead: 'Tworzę aplikacje webowe, desktopowe i mobilne, a także panele, kalkulatory oraz systemy dopasowane do konkretnego procesu w firmie. Dobieram platformę do użytkowników i problemu, który rozwiązujemy.',
    facts: [
      ['Cena', 'od 99 zł/mies.'],
      ['Realizacja', 'etapami'],
      ['Platformy', 'web • desktop • mobile'],
      ['Obszar', 'cała Polska']
    ],
    benefitsTitle: 'Kiedy dedykowana aplikacja ma sens',
    benefitsLead: 'Własny system jest dobrym wyborem, gdy arkusze, wiadomości i kilka osobnych narzędzi zaczynają spowalniać powtarzalny proces.',
    benefits: [
      ['Jeden uporządkowany proces', 'Dane, statusy i najważniejsze działania mogą znaleźć się w jednym miejscu zamiast w wielu plikach oraz skrzynkach pocztowych.'],
      ['Funkcje dopasowane do pracy', 'Interfejs i logika wynikają z rzeczywistych zadań zespołu, bez nadmiaru modułów charakterystycznego dla dużych systemów.'],
      ['Możliwość dalszego rozwoju', 'Pierwsza wersja może obejmować najważniejszy proces, a następne moduły można dodawać w kolejnych etapach.']
    ],
    scopeTitle: 'Przykładowy zakres aplikacji na zamówienie',
    scopeLead: 'Ostateczny zestaw funkcji wynika z analizy procesu. Najpierw określamy minimalną wersję, która przyniesie firmie realną wartość.',
    scope: [
      'Aplikacje webowe działające w przeglądarce',
      'Aplikacje desktopowe dla Windows, macOS lub Linux',
      'Aplikacje mobilne na Androida i iOS',
      'Panele administracyjne i pracownicze',
      'Kalkulatory, formularze i generowanie dokumentów',
      'Bazy klientów, zleceń lub zasobów',
      'Role użytkowników i kontrola dostępu',
      'Integracje z zewnętrznymi API',
      'Raporty, wyszukiwanie i filtrowanie danych',
      'Automatyzacja powtarzalnych czynności',
      'Rozwój, publikacja i opieka po uruchomieniu'
    ],
    processTitle: 'Od problemu do działającego systemu',
    process: [
      ['Analiza procesu', 'Opisujemy obecny sposób pracy, wąskie gardła, użytkowników oraz dane wykorzystywane w systemie.'],
      ['Zakres pierwszej wersji', 'Wybieramy funkcje potrzebne na start i oddzielamy je od pomysłów, które mogą poczekać.'],
      ['Budowa etapami', 'Kolejne fragmenty aplikacji są wdrażane i weryfikowane na podstawie uzgodnionych scenariuszy.'],
      ['Uruchomienie i rozwój', 'Po testach aplikacja trafia do użytkowników, a dalsze zmiany wynikają z faktycznego użycia.']
    ],
    localTitle: 'Dla firm lokalnych i zespołów pracujących zdalnie',
    localText: ['Firmy ze Środy Śląskiej, Miękini i Wrocławia mogą korzystać z lokalnego kontaktu, ale realizacja aplikacji webowych, desktopowych i mobilnych nie jest ograniczona geograficznie.', 'Analizę, prezentacje kolejnych wersji i odbiory możemy prowadzić online, dzięki czemu współpracuję również z klientami z całej Polski.'],
    localPanelTitle: 'Najpierw weryfikacja pomysłu',
    localPanelText: 'Nie każdy proces wymaga dedykowanego systemu. Przed wyceną sprawdzamy, czy prostsza integracja lub istniejące narzędzie nie rozwiąże problemu taniej.',
    areas: ['Środa Śląska', 'Miękinia', 'Wrocław', 'Cała Polska'],
    priceTitle: 'Koszt aplikacji na zamówienie',
    priceLead: 'Abonament za aplikację zaczyna się od 99 zł miesięcznie. Cena zależy od platformy, liczby ról, ekranów, integracji, rodzaju danych, wymagań bezpieczeństwa i zakresu automatyzacji.',
    priceCards: [
      ['Pierwsza wersja aplikacji', 'od 99 zł/mies.', 'Najważniejszy proces, podstawowe widoki i funkcje potrzebne do sprawdzenia rozwiązania w praktyce.'],
      ['Rozbudowany system', 'wycena indywidualna', 'Więcej ról, modułów, raportów, integracji oraz wymagań dotyczących utrzymania i bezpieczeństwa.']
    ],
    faq: [
      ['Jakie rodzaje aplikacji tworzysz?', 'Tworzę aplikacje webowe działające w przeglądarce, programy desktopowe oraz aplikacje mobilne. Platformę dobieram do sposobu pracy użytkowników, urządzeń i wymaganych integracji.'],
      ['Czy aplikację trzeba instalować?', 'To zależy od wybranej platformy. Aplikacja webowa działa w przeglądarce, natomiast aplikacja desktopowa lub mobilna może wymagać instalacji albo publikacji w odpowiednim sklepie.'],
      ['Czy można zacząć od małej wersji?', 'Tak. Najbezpieczniej rozpocząć od najważniejszego procesu i rozbudowywać system po sprawdzeniu go w codziennej pracy.'],
      ['Czy integrujesz aplikacje z innymi usługami?', 'Tak, jeżeli dana usługa udostępnia odpowiedni interfejs API i warunki techniczne pozwalają na bezpieczną integrację.'],
      ['Czy zapewniasz późniejsze utrzymanie?', 'Zakres opieki, aktualizacji i dalszego rozwoju można ustalić jako osobny etap lub stałą współpracę.']
    ]
  },
  {
    slug: 'oferta/opieka-it',
    navLabel: 'Opieka IT',
    areaServed: ['Środa Śląska', 'Miękinia', 'Wrocław', 'Dolny Śląsk'],
    metaTitle: 'Opieka IT dla małych firm | i-JANICKI',
    metaDescription: 'Bieżąca opieka IT dla małych firm. Wsparcie techniczne, aktualizacje, monitoring oraz pomoc zdalna i lokalna na Dolnym Śląsku.',
    eyebrow: 'Stałe wsparcie • lokalnie i zdalnie',
    title: 'Opieka IT dla małych firm',
    lead: 'Pomagam utrzymać firmowe narzędzia i strony w porządku, reaguję na bieżące problemy oraz planuję potrzebne aktualizacje. Zakres abonamentu dopasowuję do wielkości firmy i faktycznych potrzeb.',
    facts: [
      ['Abonament', 'od 300 zł/mc'],
      ['Wsparcie', 'zdalnie i lokalnie'],
      ['Zakres', 'ustalany przed startem'],
      ['Dla kogo', 'małe firmy']
    ],
    benefitsTitle: 'Mniej przestojów i mniej improwizacji',
    benefitsLead: 'Stała opieka pozwala wcześniej zauważać część problemów i daje firmie jedno miejsce kontaktu, gdy potrzebna jest pomoc techniczna.',
    benefits: [
      ['Przewidywalny zakres', 'Wiesz, jakie działania obejmuje abonament, w jakich sprawach możesz się zgłosić i które prace wymagają osobnej wyceny.'],
      ['Szybsza diagnoza', 'Znajomość środowiska firmy skraca zbieranie informacji i ułatwia znalezienie przyczyny powtarzających się problemów.'],
      ['Regularne porządki', 'Aktualizacje, przeglądy i podstawowa dokumentacja nie są odkładane do momentu wystąpienia awarii.']
    ],
    scopeTitle: 'Przykładowy zakres opieki IT',
    scopeLead: 'Lista jest punktem wyjścia. Ostateczny zakres i czas reakcji ustalamy przed rozpoczęciem współpracy.',
    scope: [
      'Zdalna pomoc w bieżących problemach',
      'Aktualizacje stron i uzgodnionych systemów',
      'Monitoring działania wybranych usług',
      'Podstawowa administracja kontami i dostępami',
      'Wsparcie przy konfiguracji urządzeń',
      'Kopie zapasowe w uzgodnionym zakresie',
      'Dokumentowanie najważniejszych ustawień',
      'Rekomendacje dotyczące dalszych zmian'
    ],
    processTitle: 'Rozpoczęcie stałej współpracy',
    process: [
      ['Rozpoznanie środowiska', 'Ustalamy, z jakich urządzeń, usług, stron i kont korzysta firma oraz gdzie pojawiają się problemy.'],
      ['Zakres i priorytety', 'Określamy, co obejmuje abonament, kanał kontaktu i sposób rozliczania prac wykraczających poza pakiet.'],
      ['Uporządkowanie startu', 'Porządkuję dostęp, podstawową dokumentację i najpilniejsze aktualizacje objęte ustaleniami.'],
      ['Bieżąca opieka', 'Realizuję zgłoszenia, monitoruję uzgodnione elementy i sygnalizuję potrzebne działania.']
    ],
    localTitle: 'Wsparcie IT w Środzie Śląskiej, Miękini i Wrocławiu',
    localText: ['Większość typowych problemów można rozwiązać zdalnie. Jeżeli potrzebna jest obecność na miejscu, termin i koszt dojazdu ustalamy przed wizytą.', 'Usługa jest skierowana przede wszystkim do mniejszych firm, które nie potrzebują pełnego wewnętrznego działu IT, ale chcą mieć stały kontakt do osoby znającej ich środowisko.'],
    localPanelTitle: 'Elastyczny model wsparcia',
    localPanelText: 'Abonament może objąć stałe działania, a jednorazowe lub większe prace są wyceniane oddzielnie po wcześniejszym uzgodnieniu.',
    areas: ['Środa Śląska', 'Miękinia', 'Wrocław', 'Powiat średzki', 'Wsparcie zdalne'],
    priceTitle: 'Ile kosztuje opieka IT?',
    priceLead: 'Podstawowy abonament zaczyna się od 300 zł miesięcznie. Cena zależy od liczby urządzeń i użytkowników, zakresu systemów, oczekiwanego czasu reakcji oraz potrzeby wizyt na miejscu.',
    priceCards: [
      ['Podstawowa opieka IT', 'od 300 zł/mc', 'Uzgodniony zakres bieżącego wsparcia, aktualizacji i monitoringu dla małej firmy.'],
      ['Rozszerzone wsparcie', 'wycena indywidualna', 'Większa liczba urządzeń, dodatkowe systemy, szerszy zakres odpowiedzialności lub częstsze wizyty.']
    ],
    faq: [
      ['Czy pomoc jest dostępna zdalnie?', 'Tak. Wiele zgłoszeń można rozwiązać zdalnie, co zwykle skraca czas potrzebny na rozpoczęcie diagnozy.'],
      ['Czy dojeżdżasz do firmy?', 'Wizyty na miejscu są możliwe po ustaleniu terminu, zakresu oraz ewentualnego kosztu dojazdu.'],
      ['Co obejmuje abonament?', 'Dokładna lista działań jest ustalana indywidualnie. Dzięki temu abonament odpowiada środowisku firmy i nie zawiera przypadkowych usług.'],
      ['Czy można zlecić jednorazową pomoc?', 'Tak. Jeżeli nie potrzebujesz stałej opieki, pojedyncze zadanie może zostać wycenione oddzielnie.'],
      ['Czy gwarantujesz konkretny czas reakcji?', 'Czas reakcji zależy od wybranego zakresu współpracy i musi być jasno zapisany w ustaleniach dotyczących abonamentu.']
    ]
  },
  {
    slug: 'oferta/sieci',
    navLabel: 'Sieci',
    areaServed: ['Środa Śląska', 'Miękinia', 'Wrocław', 'Dolny Śląsk'],
    metaTitle: 'Konfiguracja sieci LAN, Wi-Fi i VPN | i-JANICKI',
    metaDescription: 'Projektowanie i konfiguracja sieci LAN, Wi-Fi oraz VPN dla firm i domów. Środa Śląska, Miękinia, Wrocław i okolice.',
    eyebrow: 'LAN • Wi-Fi • VPN • Dolny Śląsk',
    title: 'Konfiguracja sieci dla firmy i domu',
    lead: 'Projektuję i konfiguruję sieci dopasowane do miejsca, liczby urządzeń oraz sposobu korzystania z internetu. Pomagam poprawić stabilność Wi-Fi, uporządkować urządzenia i bezpiecznie zestawić dostęp zdalny.',
    facts: [
      ['Stawka', 'od 150 zł/h'],
      ['Realizacja', 'po diagnozie'],
      ['Obszar', 'Środa Śląska • Miękinia • Wrocław'],
      ['Zakres', 'LAN, Wi-Fi, VPN']
    ],
    benefitsTitle: 'Stabilna sieć zaczyna się od diagnozy',
    benefitsLead: 'Wymiana routera nie zawsze rozwiązuje problem. Na jakość sieci wpływają między innymi układ pomieszczeń, zakłócenia, liczba urządzeń i sposób konfiguracji.',
    benefits: [
      ['Lepszy zasięg i stabilność', 'Dobór ustawień i rozmieszczenia punktów dostępowych ogranicza martwe strefy oraz niepotrzebne przełączanie urządzeń.'],
      ['Porządek w urządzeniach', 'Routery, przełączniki i punkty dostępowe otrzymują spójną konfigurację dopasowaną do rzeczywistego obciążenia.'],
      ['Bezpieczniejszy dostęp', 'Sieć gościnna, podział urządzeń, aktualne zabezpieczenia i właściwa konfiguracja VPN ograniczają niepotrzebne ryzyko.']
    ],
    scopeTitle: 'Zakres usług sieciowych',
    scopeLead: 'Mogę pomóc zarówno przy nowej sieci, jak i w diagnozie istniejącej instalacji, która działa wolno lub niestabilnie.',
    scope: [
      'Analiza potrzeb i obecnej konfiguracji',
      'Konfiguracja routerów i punktów dostępowych',
      'Dobór ustawień sieci Wi-Fi',
      'Konfiguracja przełączników i sieci LAN',
      'Sieć gościnna i logiczny podział urządzeń',
      'Konfiguracja bezpiecznego dostępu VPN',
      'Podstawowy audyt ustawień bezpieczeństwa',
      'Dokumentacja uzgodnionej konfiguracji'
    ],
    processTitle: 'Jak wygląda realizacja',
    process: [
      ['Opis problemu', 'Ustalamy liczbę pomieszczeń i urządzeń, obecny sprzęt oraz objawy: zasięg, prędkość lub zerwane połączenia.'],
      ['Diagnoza', 'Sprawdzam konfigurację i warunki, aby znaleźć przyczynę zamiast wymieniać sprzęt bez uzasadnienia.'],
      ['Propozycja rozwiązania', 'Przedstawiam potrzebne zmiany, ewentualny sprzęt i orientacyjny koszt prac.'],
      ['Konfiguracja i test', 'Wdrażam uzgodnione ustawienia i sprawdzam działanie sieci w typowych scenariuszach.']
    ],
    localTitle: 'Konfiguracja sieci w Środzie Śląskiej, Miękini i Wrocławiu',
    localText: ['Usługi wymagające dostępu do urządzeń realizuję lokalnie po ustaleniu terminu. Część konfiguracji i późniejszego wsparcia może być wykonana zdalnie.', 'Nie wykonuję prac elektrycznych ani budowlanych w ramach samej konfiguracji. Jeśli potrzebne jest nowe okablowanie, zakres techniczny ustalamy przed wyceną.'],
    localPanelTitle: 'Najpierw sprawdzamy przyczynę',
    localPanelText: 'Celem jest dobranie rozwiązania do budynku i sposobu pracy. Nowy sprzęt proponuję wtedy, gdy obecne urządzenia rzeczywiście ograniczają sieć.',
    areas: ['Środa Śląska', 'Miękinia', 'Wrocław', 'Powiat średzki', 'Dolny Śląsk'],
    priceTitle: 'Cena konfiguracji sieci',
    priceLead: 'Prace administracyjne zaczynają się od 150 zł za godzinę. Przy większych wdrożeniach możliwa jest wycena całego zakresu po diagnozie i poznaniu infrastruktury.',
    priceCards: [
      ['Konfiguracja i administracja', 'od 150 zł/h', 'Bieżąca konfiguracja urządzeń, diagnostyka oraz zmiany w istniejącej sieci.'],
      ['Projekt lub większe wdrożenie', 'wycena indywidualna', 'Więcej punktów dostępowych, podział sieci, VPN, dokumentacja lub prace wykonywane etapami.']
    ],
    faq: [
      ['Czy poprawisz zasięg Wi-Fi bez wymiany routera?', 'Czasem wystarczy poprawić ustawienia lub położenie urządzeń, ale zależy to od warunków i możliwości obecnego sprzętu. Decyzję warto podjąć po diagnozie.'],
      ['Czy konfigurujesz sieci dla domów?', 'Tak. Zakres może obejmować dom, małe biuro lub firmę, zależnie od liczby urządzeń i potrzeb użytkowników.'],
      ['Czy pomagasz dobrać sprzęt?', 'Tak. Dobór urządzeń może być częścią usługi, ale zakup i koszt sprzętu są rozliczane oddzielnie od konfiguracji.'],
      ['Czy konfigurujesz VPN?', 'Tak, jeżeli używane urządzenia i łącza pozwalają na wdrożenie bezpiecznego rozwiązania dopasowanego do sposobu dostępu.'],
      ['Czy wykonujesz okablowanie?', 'Podstawowa oferta dotyczy projektu i konfiguracji sieci. Ewentualne prace instalacyjne lub budowlane wymagają osobnego ustalenia.']
    ]
  },
  {
    slug: 'oferta/seo',
    navLabel: 'SEO',
    areaServed: ['Środa Śląska', 'Miękinia', 'Wrocław', 'Dolny Śląsk'],
    metaTitle: 'Pozycjonowanie stron i lokalne SEO | i-JANICKI',
    metaDescription: 'Pozycjonowanie i optymalizacja stron firm. Audyt techniczny, treści lokalne, Search Console i przejrzysty plan działań.',
    eyebrow: 'Lokalne SEO • Dolny Śląsk',
    title: 'Pozycjonowanie stron lokalnych firm',
    lead: 'Pomagam uporządkować stronę tak, aby wyszukiwarka mogła ją zrozumieć, a potencjalny klient szybko znalazł właściwą usługę. Działania dobieram do konkurencji, możliwości serwisu i realnego obszaru obsługi firmy.',
    facts: [
      ['Model', 'zakres indywidualny'],
      ['Obszar', 'Środa Śląska • Miękinia • Wrocław'],
      ['Punkt startu', 'audyt i dane'],
      ['Raportowanie', 'ustalane w ofercie']
    ],
    benefitsTitle: 'SEO oparte na stronie i potrzebach klienta',
    benefitsLead: 'Samo powtarzanie nazwy miasta nie daje trwałej przewagi. Potrzebna jest poprawna technika, kompletna oferta, wiarygodność firmy i treści odpowiadające na konkretne pytania.',
    benefits: [
      ['Czytelna architektura usług', 'Każda ważna usługa otrzymuje własny adres, temat i ścieżkę kontaktu, dzięki czemu nie konkuruje z przypadkowymi fragmentami strony głównej.'],
      ['Optymalizacja techniczna', 'Sprawdzam indeksowanie, metadane, linkowanie, wydajność i podstawowe błędy utrudniające wyszukiwarce pracę z serwisem.'],
      ['Treści z lokalnym kontekstem', 'Rozwijamy materiały przydatne dla klientów z realnego obszaru obsługi firmy, bez masowego kopiowania stron dla kolejnych miejscowości.']
    ],
    scopeTitle: 'Co mogą obejmować działania SEO',
    scopeLead: 'Zakres zależy od stanu strony i konkurencji. Najpierw ustalamy problemy, priorytety oraz sposób mierzenia efektów.',
    scope: [
      'Audyt techniczny i kontrola indeksowania',
      'Analiza struktury usług i intencji wyszukiwania',
      'Optymalizacja tytułów, opisów i nagłówków',
      'Rozbudowa podstron ofertowych',
      'Plan treści poradnikowych i lokalnych',
      'Linkowanie wewnętrzne między usługami',
      'Konfiguracja lub kontrola Search Console',
      'Rekomendacje dla Profilu Firmy Google'
    ],
    processTitle: 'Jak wygląda praca nad widocznością',
    process: [
      ['Diagnoza', 'Sprawdzam obecny serwis, indeksowanie, zapytania, konkurencję i elementy ograniczające widoczność.'],
      ['Plan priorytetów', 'Dzielę działania na poprawki techniczne, strony ofertowe, treści oraz elementy lokalnej wiarygodności.'],
      ['Wdrożenie', 'Realizujemy najważniejsze zmiany etapami, zaczynając od tych, które odblokowują dalszy rozwój serwisu.'],
      ['Pomiar i korekty', 'Obserwujemy wyświetlenia, kliknięcia i zapytania, a kolejne działania dobieramy do danych.']
    ],
    localTitle: 'Widoczność lokalna w Środzie Śląskiej, Miękini i Wrocławiu',
    localText: ['Dla lokalnej firmy ważne jest spójne pokazanie obszaru obsługi, danych kontaktowych, usług, realizacji i opinii. Podstrony powinny odpowiadać na realne zapytania, a nie być zestawem nazw miejscowości.', 'Pozycjonowanie jest procesem, nie jednorazowym przełącznikiem. Nie obiecuję konkretnej pozycji ani terminu, ponieważ wynik zależy także od konkurencji i zmian po stronie wyszukiwarki.'],
    localPanelTitle: 'Lokalne sygnały poza stroną',
    localPanelText: 'W zależności od rodzaju firmy znaczenie mogą mieć również kompletny Profil Firmy Google, aktualne dane, prawdziwe opinie klientów i linki z wiarygodnych lokalnych źródeł.',
    areas: ['Środa Śląska', 'Miękinia', 'Wrocław', 'Powiat średzki', 'Dolny Śląsk'],
    priceTitle: 'Koszt pozycjonowania',
    priceLead: 'Wycena jest indywidualna, ponieważ innego zakresu wymaga nowa strona usługowa, a innego rozbudowany serwis z błędami technicznymi i silną konkurencją.',
    priceCards: [
      ['Audyt i plan zmian', 'wycena indywidualna', 'Diagnoza techniczna, priorytety oraz propozycja struktury i treści dopasowanych do celów firmy.'],
      ['Stały rozwój widoczności', 'wycena indywidualna', 'Regularne wdrożenia, rozwój podstron i analiza efektów w uzgodnionym zakresie.']
    ],
    faq: [
      ['Po jakim czasie widać efekty SEO?', 'Pierwsze zmiany w indeksowaniu mogą pojawić się stosunkowo szybko, ale stabilny wzrost zwykle wymaga miesięcy. Tempo zależy od strony, konkurencji, historii domeny i zakresu prac.'],
      ['Czy gwarantujesz pierwszą pozycję?', 'Nie. Nikt nie kontroluje wyników Google, dlatego uczciwa usługa nie powinna gwarantować konkretnej pozycji. Można natomiast mierzyć wykonane działania, widoczność, ruch i zapytania.'],
      ['Czy potrzebuję bloga?', 'Nie zawsze. Najpierw warto mieć kompletne podstrony usługowe i realizacje. Poradniki mają sens wtedy, gdy odpowiadają na pytania potencjalnych klientów.'],
      ['Czy zajmujesz się lokalnym SEO?', 'Tak. Zakres może obejmować strukturę strony, treści dla obszaru obsługi i rekomendacje dotyczące Profilu Firmy Google.'],
      ['Czy pozycjonowanie jest jednorazowe?', 'Audyt i część poprawek mogą być jednorazowe, ale konkurencja, oferta i wyniki wyszukiwania zmieniają się, dlatego widoczność zwykle wymaga dalszej pracy.']
    ]
  }
];

const baseWebsitePage = pages[0];

const miekiniaLutyniaPage = {
  ...structuredClone(baseWebsitePage),
  slug: 'oferta/miekinia-lutynia',
  navLabel: 'Miękinia i Lutynia',
  areaServed: ['Miękinia', 'Lutynia', 'gmina Miękinia', 'powiat średzki'],
  metaTitle: 'Strony internetowe Miękinia i Lutynia | i-JANICKI',
  metaDescription: 'Nowoczesne strony internetowe dla firm z Miękini, Lutyni i gminy Miękinia. Indywidualny projekt, szybkość, wersja mobilna i podstawy SEO.',
  eyebrow: 'Strony internetowe • Miękinia i Lutynia',
  title: 'Strony internetowe dla firm z Miękini i Lutyni',
  lead: 'Tworzę szybkie i czytelne strony WWW dla firm działających w Miękini, Lutyni oraz pozostałych miejscowościach między Środą Śląską a Wrocławiem. Oferta, dojazd i kontakt są pokazane tak, aby klient od razu wiedział, czy obsługujesz jego lokalizację.',
  benefitsTitle: 'Strona dopasowana do rozwijającego się lokalnego rynku',
  benefitsLead: 'W Miękini i Lutyni konkurują firmy lokalne, usługodawcy dojeżdżający oraz biznesy obsługujące Wrocław. Witryna powinna jasno komunikować przewagę i faktyczny obszar działania.',
  benefits: [
    ['Czytelny obszar obsługi', 'Treść wyjaśnia, czy działasz w Miękini i Lutyni, na terenie całej gminy, czy także we Wrocławiu i sąsiednich powiatach.'],
    ['Wygodny kontakt z telefonu', 'Najważniejsze usługi oraz bezpośrednie odnośniki do telefonu, e-maila i WhatsApp są łatwo dostępne dla osób szukających wykonawcy w drodze lub na miejscu.'],
    ['Fundament lokalnego SEO', 'Osobny adres, właściwe metadane, linkowanie i dane strukturalne przygotowują stronę do rozwoju widoczności w Miękini, Lutyni i całej gminie.']
  ],
  facts: [
    ['Cena', 'od 49 zł/mies.'],
    ['Obszar', 'Miękinia i Lutynia'],
    ['Priorytet', 'kontakt mobilny'],
    ['Współpraca', 'lokalnie lub online']
  ],
  scopeTitle: 'Zakres przygotowany dla firmy z gminy Miękinia',
  scopeLead: 'Najpierw wybieramy usługi i miejscowości, które rzeczywiście generują zapytania. Na tej podstawie powstaje czytelna struktura zamiast strony przeładowanej nazwami lokalizacji.',
  scope: [
    'Plan treści dopasowany do usług i obszaru dojazdu',
    'Wyraźne przedstawienie Miękini, Lutyni i pozostałych obsługiwanych miejscowości',
    'Projekt wygodny dla klientów korzystających ze smartfona',
    'Bezpośrednie przyciski telefonu, WhatsApp i e-maila',
    'Miejsce na realizacje, opinie oraz odpowiedzi na lokalne pytania',
    'Szybkie grafiki i techniczna optymalizacja kodu',
    'Metadane, dane strukturalne i linkowanie do wspólnej oferty',
    'Możliwość późniejszego rozwoju o nowe usługi lub poradniki'
  ],
  processTitle: 'Jak przygotowuję lokalną stronę dla Miękini i Lutyni',
  process: [
    ['Mapa oferty', 'Ustalamy, które usługi są najważniejsze i dokąd faktycznie dojeżdża firma.'],
    ['Treść lokalna', 'Porządkuję argumenty, obszar obsługi i pytania klientów bez mechanicznego powtarzania miejscowości.'],
    ['Projekt mobilny', 'Buduję widoki od telefonu, bo lokalne zapytania często powstają poza biurem.'],
    ['Kontrola i start', 'Sprawdzam linki kontaktowe, szybkość, indeksowanie i dopiero wtedy publikuję witrynę.']
  ],
  localTitle: 'Miękinia, Lutynia i zachodnia część aglomeracji wrocławskiej',
  localText: ['Projektuję strony dla firm, które pozyskują klientów w Miękini, Lutyni, Brzezince Średzkiej, Wilkszynie i pozostałych miejscowościach gminy. Treść porządkuję według realnego zasięgu usługi, bez sztucznego powielania nazw miejscowości.', 'Miękinia i Lutynia są na tej stronie równorzędnymi obszarami oferty. Ustalenia możemy prowadzić zdalnie, a jeśli charakter projektu tego wymaga — umówić spotkanie lub działania na miejscu.'],
  localPanelTitle: 'Obszar obsługi',
  localPanelText: 'Miękinia, Lutynia i gmina Miękinia, a projekty stron internetowych również dla firm obsługujących Wrocław oraz klientów z całej Polski.',
  areas: ['Miękinia', 'Lutynia', 'Wilkszyn', 'Brzezinka Średzka', 'Gmina Miękinia', 'Wrocław'],
  priceTitle: 'Koszt strony dla firmy z Miękini lub Lutyni',
  priceLead: 'Prosta strona w abonamencie zaczyna się od 49 zł miesięcznie. Budżet rośnie, gdy potrzebne są osobne opisy wielu usług, rozbudowane portfolio, integracje albo większa liczba widoków.',
  priceCards: [
    ['Lokalna strona na start', 'od 49 zł/mies.', 'Najważniejsza oferta, rzeczywisty obszar obsługi i szybki kontakt w układzie dopasowanym do telefonu.'],
    ['Serwis dla szerszego obszaru', 'wycena indywidualna', 'Więcej usług, realizacji i treści dla firmy obsługującej gminę Miękinia, Wrocław lub kolejne rynki.']
  ],
  faq: [
    ['Ile trwa przygotowanie strony?', 'Prosta strona jest zwykle gotowa w ciągu 1–2 tygodni. Większe realizacje wymagają więcej czasu, zależnie od liczby podstron, materiałów i integracji.'],
    ['Czy przygotujesz treści pod Miękinię, Lutynię i okoliczne miejscowości?', 'Tak. Najpierw ustalam realny obszar obsługi firmy, a następnie porządkuję treść tak, aby była użyteczna dla klienta i nie wyglądała jak sztuczna lista miejscowości.'],
    ['Czy strona będzie widoczna w Google?', 'Strona otrzymuje poprawne podstawy techniczne SEO. Pozycje zależą także od konkurencji, jakości treści, historii domeny, profilu firmy i dalszych działań.'],
    ['Czy możemy spotkać się na miejscu?', 'Tak, jeśli zakres projektu wymaga spotkania. Większość ustaleń możemy też sprawnie przeprowadzić zdalnie.'],
    ['Czy później można dodać kolejne usługi?', 'Tak. Strukturę można przygotować tak, aby rozwijać ofertę, realizacje, poradniki oraz kolejne funkcje bez przebudowy całej witryny.']
  ]
};

const wroclawPage = {
  ...structuredClone(baseWebsitePage),
  slug: 'oferta/wroclaw',
  navLabel: 'Wrocław',
  areaServed: ['Wrocław', 'aglomeracja wrocławska', 'Dolny Śląsk'],
  metaTitle: 'Strony internetowe Wrocław | i-JANICKI',
  metaDescription: 'Nowoczesne strony internetowe dla firm z Wrocławia. Indywidualny projekt, szybkie działanie, responsywność, konwersja i solidne podstawy SEO.',
  eyebrow: 'Strony internetowe • Wrocław',
  title: 'Strony internetowe dla firm z Wrocławia',
  lead: 'Projektuję strony WWW dla wrocławskich firm, które muszą szybko wyróżnić ofertę na konkurencyjnym rynku. Łączę wyrazisty projekt z czytelną strukturą, wydajnością i prostą drogą do zapytania.',
  benefitsTitle: 'Konkretny przekaz na konkurencyjnym rynku',
  benefitsLead: 'We Wrocławiu klient często porównuje kilka firm jednocześnie. Strona powinna w pierwszych sekundach pokazać specjalizację, wiarygodność oraz łatwy następny krok.',
  benefits: [
    ['Oferta bez zgadywania', 'Hierarchia treści prowadzi od problemu klienta do właściwej usługi, realizacji, ceny orientacyjnej i kontaktu.'],
    ['Szybkość na każdym ekranie', 'Wydajny kod i projekt mobile-first ograniczają frustrację użytkowników korzystających z telefonu oraz wspierają techniczne SEO.'],
    ['Struktura gotowa do rozwoju', 'Oddzielne usługi, lokalne konteksty i przemyślane linkowanie pozwalają później rozwijać widoczność bez przebudowy od zera.']
  ],
  facts: [
    ['Cena', 'od 49 zł/mies.'],
    ['Rynek', 'Wrocław'],
    ['Priorytet', 'szybkość + konwersja'],
    ['Współpraca', 'zdalnie lub na miejscu']
  ],
  scopeTitle: 'Elementy strony, która ma konkurować we Wrocławiu',
  scopeLead: 'Zakres wynika ze specjalizacji firmy i sposobu porównywania ofert przez jej klientów. Najważniejsze argumenty muszą być dostępne szybko, bez przedzierania się przez ogólniki.',
  scope: [
    'Architektura oparta na najważniejszych usługach i typach klientów',
    'Komunikat wyróżniający firmę na tle wrocławskiej konkurencji',
    'Projekt mobile-first z krótką drogą do zapytania',
    'Sekcje realizacji, opinii i dowodów doświadczenia',
    'Czytelne widełki cenowe lub sposób uzyskania wyceny',
    'Optymalizacja wydajności grafik, fontów i interakcji',
    'Techniczne SEO, dane strukturalne i logiczne linkowanie',
    'Struktura przygotowana na dalsze usługi lub wersje językowe'
  ],
  processTitle: 'Od wyróżnika firmy do gotowej witryny',
  process: [
    ['Analiza odbiorcy', 'Określamy, komu firma pomaga i z jakimi ofertami klient porównuje ją we Wrocławiu.'],
    ['Priorytety komunikacji', 'Wybieramy argumenty, realizacje i informacje, które powinny pojawić się przed kontaktem.'],
    ['Projekt oraz wdrożenie', 'Buduję kolejne widoki, sprawdzając czy użytkownik zawsze rozumie następny krok.'],
    ['Test rynku', 'Po kontroli urządzeń i technicznego SEO publikujemy stronę i obserwujemy odwiedzane podstrony oraz kliknięcia.']
  ],
  localTitle: 'Współpraca z firmami z Wrocławia i aglomeracji',
  localText: ['Realizuję strony dla usługodawców, małych firm i zespołów działających we Wrocławiu oraz w gminach sąsiadujących z miastem. W treści uwzględniam tylko te lokalizacje i dzielnice, które rzeczywiście wynikają z oferty.', 'Proces może przebiegać całkowicie zdalnie. Spotkanie na miejscu ustalamy wtedy, gdy pomaga ono zebrać materiały, poznać usługę lub sprawniej zaplanować serwis.'],
  localPanelTitle: 'Obszar obsługi',
  localPanelText: 'Wrocław i aglomeracja wrocławska, ze szczególnym uwzględnieniem zachodniej części miasta oraz kierunku Miękinia–Środa Śląska.',
  areas: ['Wrocław', 'Fabryczna', 'Leśnica', 'Aglomeracja wrocławska', 'Miękinia', 'Dolny Śląsk'],
  priceTitle: 'Budżet strony dla wrocławskiej firmy',
  priceLead: 'Abonament za prostą witrynę zaczyna się od 49 zł miesięcznie. Rozbudowana oferta, wiele specjalizacji, wersje językowe lub integracje wymagają osobnego zakresu i wyceny.',
  priceCards: [
    ['Czytelna strona usługowa', 'od 49 zł/mies.', 'Skupiona prezentacja specjalizacji, wiarygodności oraz kontaktu dla firmy rozpoczynającej rozwój widoczności.'],
    ['Serwis na konkurencyjny rynek', 'wycena indywidualna', 'Osobne usługi, rozbudowane realizacje, treści poradnikowe, języki lub funkcje dobierane do strategii firmy.']
  ],
  faq: [
    ['Ile trwa przygotowanie strony?', 'Prosta strona jest zwykle gotowa w ciągu 1–2 tygodni. Termin większego serwisu zależy od liczby podstron, materiałów, integracji i etapów akceptacji.'],
    ['Jak wyróżnić stronę firmy we Wrocławiu?', 'Najpierw trzeba jasno określić specjalizację i odbiorcę. Następnie warto pokazać konkretne realizacje, obszar obsługi, dowody wiarygodności i odpowiedzi na pytania klientów.'],
    ['Czy sama nowa strona wystarczy do wysokich pozycji?', 'Nie zawsze. Dobra strona tworzy fundament, ale widoczność zależy również od konkurencji, treści, historii domeny, Profilu Firmy Google, linków i regularnej pracy.'],
    ['Czy współpraca może być całkowicie zdalna?', 'Tak. Rozmowy, prezentacje projektu, poprawki i odbiór możemy przeprowadzić online.'],
    ['Czy stronę można później rozbudować?', 'Tak. Od początku można zaplanować miejsce na kolejne usługi, realizacje, treści poradnikowe, wersje językowe lub integracje.']
  ]
};

pages.splice(1, 0, miekiniaLutyniaPage, wroclawPage);

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderNavigation(currentSlug) {
  return navigation.map(function (item) {
    const current = item[0] === currentSlug ? ' aria-current="page"' : '';
    return '<a href="/' + item[0] + '/"' + current + '>' + item[1] + '</a>';
  }).join('\n          ');
}

function renderCards(items) {
  return items.map(function (item, index) {
    return '<article class="card"><span class="card-number">0' + (index + 1) + '</span><h3>' + escapeHtml(item[0]) + '</h3><p>' + escapeHtml(item[1]) + '</p></article>';
  }).join('\n          ');
}

function renderFacts(items) {
  return items.map(function (item) {
    return '<div class="fact"><dt>' + escapeHtml(item[0]) + '</dt><dd>' + escapeHtml(item[1]) + '</dd></div>';
  }).join('\n              ');
}

function renderProcess(items) {
  return items.map(function (item, index) {
    return '<li><span class="section-kicker">0' + (index + 1) + '</span><strong>' + escapeHtml(item[0]) + '</strong><p>' + escapeHtml(item[1]) + '</p></li>';
  }).join('\n          ');
}

function renderPriceCards(items) {
  return items.map(function (item) {
    return '<article class="price-card"><h3>' + escapeHtml(item[0]) + '</h3><p class="price">' + escapeHtml(item[1]) + '</p><p>' + escapeHtml(item[2]) + '</p></article>';
  }).join('\n          ');
}

function renderFaq(items) {
  return items.map(function (item) {
    return '<details><summary>' + escapeHtml(item[0]) + '</summary><p>' + escapeHtml(item[1]) + '</p></details>';
  }).join('\n          ');
}

function renderRelated(currentSlug) {
  return relatedServices.filter(function (item) { return item[0] !== currentSlug; }).slice(0, 4).map(function (item) {
    return '<a href="/' + item[0] + '/">' + item[1] + ' <span aria-hidden="true">→</span></a>';
  }).join('\n          ');
}

function renderStructuredData(page) {
  const service = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': SITE_URL + '/' + page.slug + '/#service',
    name: page.title,
    description: page.metaDescription,
    url: SITE_URL + '/' + page.slug + '/',
    provider: { '@id': SITE_URL + '/#business' },
    areaServed: page.areaServed.map(function (name) {
      return { '@type': 'AdministrativeArea', name };
    })
  };
  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Strona główna', item: SITE_URL + '/' },
      { '@type': 'ListItem', position: 2, name: 'Oferta', item: SITE_URL + '/oferta/' },
      { '@type': 'ListItem', position: 3, name: page.navLabel, item: SITE_URL + '/' + page.slug + '/' }
    ]
  };
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: page.faq.map(function (item) {
      return { '@type': 'Question', name: item[0], acceptedAnswer: { '@type': 'Answer', text: item[1] } };
    })
  };
  return JSON.stringify([service, breadcrumbs, faq]).replaceAll('<', '\\u003c');
}

function renderPage(page) {
  const canonical = SITE_URL + '/' + page.slug + '/';
  const localParagraphs = page.localText.map(function (text) { return '<p>' + escapeHtml(text) + '</p>'; }).join('\n            ');
  const scopeItems = page.scope.map(function (item) { return '<li>' + escapeHtml(item) + '</li>'; }).join('\n              ');
  const areaTags = page.areas.map(function (item) { return '<span>' + escapeHtml(item) + '</span>'; }).join('');

  return [
    '<!doctype html>',
    '<html lang="pl">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    '  <meta name="theme-color" content="#05060c">',
    '  <meta name="description" content="' + escapeHtml(page.metaDescription) + '">',
    '  <meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large">',
    '  <link rel="canonical" href="' + canonical + '">',
    '  <meta property="og:type" content="website">',
    '  <meta property="og:locale" content="pl_PL">',
    '  <meta property="og:site_name" content="i-JANICKI">',
    '  <meta property="og:title" content="' + escapeHtml(page.metaTitle) + '">',
    '  <meta property="og:description" content="' + escapeHtml(page.metaDescription) + '">',
    '  <meta property="og:url" content="' + canonical + '">',
    '  <meta property="og:image" content="' + SITE_URL + '/icons/icon.png">',
    '  <meta property="og:image:alt" content="Logo i-JANICKI">',
    '  <meta name="twitter:card" content="summary">',
    '  <meta name="twitter:title" content="' + escapeHtml(page.metaTitle) + '">',
    '  <meta name="twitter:description" content="' + escapeHtml(page.metaDescription) + '">',
    '  <meta name="twitter:image" content="' + SITE_URL + '/icons/icon.png">',
    '  <title>' + escapeHtml(page.metaTitle) + '</title>',
    '  <link rel="icon" type="image/svg+xml" href="/favicon.svg">',
    '  <link rel="preconnect" href="https://fonts.googleapis.com">',
    '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&amp;family=JetBrains+Mono:wght@700&amp;family=Orbitron:wght@700;800&amp;display=swap">',
    '  <link rel="stylesheet" href="/oferta.css?v=5">',
    '  <script type="application/ld+json">' + renderStructuredData(page) + '</script>',
    '  <script defer src="/analytics.js?v=10"></script>',
    '  <script defer src="/oferta.js?v=4"></script>',
    '</head>',
    '<body>',
    '  <a class="skip-link" href="#main">Przejdź do treści</a>',
    '  <header class="site-header">',
    '    <div class="nav-shell">',
    '      <a class="brand" href="/" aria-label="i-JANICKI — strona główna"><img src="/icons/icon.png" width="34" height="34" alt=""><span>i-JANICKI</span></a>',
    '      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="service-navigation" data-nav-toggle>Oferta</button>',
    '      <nav class="nav-links" id="service-navigation" aria-label="Główna nawigacja" data-nav>',
    '          ' + renderNavigation(page.slug),
    '          <a class="nav-cta" href="/kontakt/">Kontakt</a>',
    '      </nav>',
    '    </div>',
    '  </header>',
    '  <main id="main">',
    '    <div class="container breadcrumbs" aria-label="Okruszki"><ol><li><a href="/">Strona główna</a></li><li><a href="/oferta/">Oferta</a></li><li aria-current="page">' + escapeHtml(page.navLabel) + '</li></ol></div>',
    '    <section class="hero">',
    '      <div class="container hero-grid">',
    '        <div>',
    '          <p class="eyebrow">' + escapeHtml(page.eyebrow) + '</p>',
    '          <h1 class="gradient-text">' + escapeHtml(page.title) + '</h1>',
    '          <p class="hero-lead">' + escapeHtml(page.lead) + '</p>',
    '          <div class="actions"><a class="button button-primary" href="/kontakt/">Zapytaj o wycenę</a><a class="button button-secondary" href="#zakres">Zobacz zakres</a></div>',
    '        </div>',
    '        <aside class="hero-card" aria-label="Najważniejsze informacje"><p class="hero-card-label">Najważniejsze informacje</p><dl class="facts">' + renderFacts(page.facts) + '</dl></aside>',
    '      </div>',
    '    </section>',
    '    <section class="section section-muted">',
    '      <div class="container">',
    '        <div class="section-heading"><p class="section-kicker">Dlaczego warto</p><h2>' + escapeHtml(page.benefitsTitle) + '</h2><p>' + escapeHtml(page.benefitsLead) + '</p></div>',
    '        <div class="cards">' + renderCards(page.benefits) + '</div>',
    '      </div>',
    '    </section>',
    '    <section class="section" id="zakres">',
    '      <div class="container scope-grid">',
    '        <div class="section-heading"><p class="section-kicker">Zakres</p><h2>' + escapeHtml(page.scopeTitle) + '</h2><p>' + escapeHtml(page.scopeLead) + '</p></div>',
    '        <div class="scope-panel"><ul class="check-list">' + scopeItems + '</ul></div>',
    '      </div>',
    '    </section>',
    '    <section class="section section-muted">',
    '      <div class="container">',
    '        <div class="section-heading"><p class="section-kicker">Proces</p><h2>' + escapeHtml(page.processTitle) + '</h2></div>',
    '        <ol class="process-list">' + renderProcess(page.process) + '</ol>',
    '      </div>',
    '    </section>',
    '    <section class="section">',
    '      <div class="container local-grid">',
    '        <div class="local-copy"><p class="section-kicker">Lokalnie</p><h2>' + escapeHtml(page.localTitle) + '</h2>' + localParagraphs + '</div>',
    '        <aside class="local-panel"><strong>' + escapeHtml(page.localPanelTitle) + '</strong><p>' + escapeHtml(page.localPanelText) + '</p><div class="area-tags">' + areaTags + '</div></aside>',
    '      </div>',
    '    </section>',
    '    <section class="section section-muted">',
    '      <div class="container">',
    '        <div class="section-heading"><p class="section-kicker">Koszt</p><h2>' + escapeHtml(page.priceTitle) + '</h2><p>' + escapeHtml(page.priceLead) + '</p></div>',
    '        <div class="price-grid">' + renderPriceCards(page.priceCards) + '</div>',
    '      </div>',
    '    </section>',
    '    <section class="section">',
    '      <div class="container">',
    '        <div class="section-heading"><p class="section-kicker">FAQ</p><h2>Najczęściej zadawane pytania</h2></div>',
    '        <div class="faq">' + renderFaq(page.faq) + '</div>',
    '      </div>',
    '    </section>',
    '    <section class="section">',
    '      <div class="container cta"><p class="section-kicker">Porozmawiajmy</p><h2>Opisz krótko, czego potrzebuje Twoja firma</h2><p>Odezwę się z pytaniami, które pozwolą ustalić sensowny zakres i przygotować wycenę bez dokładania przypadkowych elementów.</p><div class="actions"><a class="button button-primary" href="/kontakt/">Przejdź do kontaktu</a></div></div>',
    '    </section>',
    '    <section class="section section-muted">',
    '      <div class="container"><div class="section-heading"><p class="section-kicker">Powiązane usługi</p><h2>Sprawdź także</h2></div><nav class="related-links" aria-label="Powiązane usługi">' + renderRelated(page.slug) + '</nav></div>',
    '    </section>',
    '  </main>',
    '  <footer class="foot">',
    '    <span>© <span id="year" data-year></span> i-JANICKI</span>',
    '    <span class="foot-sep">·</span>',
    '    <a href="mailto:' + EMAIL + '" class="foot-mail">' + EMAIL + '</a>',
    '    <span class="foot-sep">·</span>',
    '    <a href="/dokumenty/" class="foot-docs">Dokumenty</a>',
    '    <button class="cookie-foot-btn" id="cookieFootBtn" type="button" aria-label="Zmień ustawienia cookies" data-i18n-aria-label="cookie-settings-change">🍪</button>',
    '  </footer>',
    '  <div class="cookie-overlay" id="cookieOverlay" role="dialog" aria-modal="true" aria-label="Ustawienia plików cookie" aria-hidden="true" hidden></div>',
    '</body>',
    '</html>',
    ''
  ].join('\n');
}

function renderHubCard(item) {
  return '<a class="offer-card" href="/' + item.slug + '/"><span class="section-kicker">' + escapeHtml(item.kicker) + '</span><h2>' + escapeHtml(item.title) + '</h2><p>' + escapeHtml(item.description) + '</p><strong>Sprawdź ofertę <span aria-hidden="true">→</span></strong></a>';
}

function renderOfferHub() {
  const locations = [
    { slug: 'oferta/wroclaw', kicker: 'Lokalnie', title: 'Wrocław', description: 'Strony internetowe dla firm działających na konkurencyjnym rynku Wrocławia.' },
    { slug: 'oferta/sroda-slaska', kicker: 'Lokalnie', title: 'Środa Śląska', description: 'Strony internetowe dla firm ze Środy Śląskiej i powiatu średzkiego.' },
    { slug: 'oferta/miekinia-lutynia', kicker: 'Lokalnie', title: 'Miękinia i Lutynia', description: 'Jedna mocna strona WWW dla firm obsługujących Miękinię, Lutynię i pozostałe miejscowości gminy.' }
  ];
  const services = [
    { slug: 'oferta/cennik', kicker: 'Wspólna oferta', title: 'Cennik', description: 'Strony od 49 zł/mies., aplikacje od 99 zł/mies. i pozostałe ceny orientacyjne.' },
    { slug: 'oferta/strony-www', kicker: 'Wspólna oferta', title: 'Strony WWW', description: 'Projektowanie i tworzenie responsywnych stron internetowych dopasowanych do celu firmy.' },
    { slug: 'oferta/aplikacje', kicker: 'Wspólna oferta', title: 'Aplikacje', description: 'Aplikacje webowe, desktopowe i mobilne dopasowane do procesu w firmie.' },
    { slug: 'oferta/opieka-it', kicker: 'Wspólna oferta', title: 'Opieka IT', description: 'Bieżące wsparcie, aktualizacje, monitoring i pomoc techniczna.' },
    { slug: 'oferta/sieci', kicker: 'Wspólna oferta', title: 'Sieci LAN, Wi-Fi i VPN', description: 'Projektowanie, konfiguracja i diagnoza sieci dla firm oraz domów.' },
    { slug: 'oferta/seo', kicker: 'Wspólna oferta', title: 'Pozycjonowanie i SEO', description: 'Techniczne SEO, rozwój treści i widoczność na właściwe zapytania.' }
  ];
  const canonical = SITE_URL + '/oferta/';
  const structuredData = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Oferta i-JANICKI',
    description: 'Strony internetowe, aplikacje, SEO, sieci i opieka IT dla firm ze Środy Śląskiej, Miękini, Lutyni, Wrocławia i okolic.',
    url: canonical,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: [...locations, ...services].map(function (item, index) {
        return { '@type': 'ListItem', position: index + 1, name: item.title, url: SITE_URL + '/' + item.slug + '/' };
      })
    }
  }).replaceAll('<', '\\u003c');

  return [
    '<!doctype html>',
    '<html lang="pl">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    '  <meta name="theme-color" content="#05060c">',
    '  <meta name="description" content="Strony internetowe, aplikacje, SEO, sieci i opieka IT dla firm ze Środy Śląskiej, Miękini, Lutyni, Wrocławia i okolic.">',
    '  <meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large">',
    '  <link rel="canonical" href="' + canonical + '">',
    '  <meta property="og:type" content="website">',
    '  <meta property="og:locale" content="pl_PL">',
    '  <meta property="og:site_name" content="i-JANICKI">',
    '  <meta property="og:title" content="Oferta | strony, aplikacje i IT | i-JANICKI">',
    '  <meta property="og:description" content="Oferta dla Środy Śląskiej, Miękini, Lutyni, Wrocławia i klientów zdalnych.">',
    '  <meta property="og:url" content="' + canonical + '">',
    '  <meta property="og:image" content="' + SITE_URL + '/icons/icon.png">',
    '  <meta name="twitter:card" content="summary">',
    '  <title>Oferta | strony, aplikacje i IT | i-JANICKI</title>',
    '  <link rel="icon" type="image/svg+xml" href="/favicon.svg">',
    '  <link rel="preconnect" href="https://fonts.googleapis.com">',
    '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&amp;family=JetBrains+Mono:wght@700&amp;family=Orbitron:wght@700;800&amp;display=swap">',
    '  <link rel="stylesheet" href="/oferta.css?v=5">',
    '  <script type="application/ld+json">' + structuredData + '</script>',
    '  <script defer src="/analytics.js?v=10"></script>',
    '  <script defer src="/oferta.js?v=4"></script>',
    '</head>',
    '<body>',
    '  <a class="skip-link" href="#main">Przejdź do treści</a>',
    '  <header class="site-header"><div class="nav-shell">',
    '    <a class="brand" href="/" aria-label="i-JANICKI — strona główna"><img src="/icons/icon.png" width="34" height="34" alt=""><span>i-JANICKI</span></a>',
    '    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="service-navigation" data-nav-toggle>Oferta</button>',
    '    <nav class="nav-links" id="service-navigation" aria-label="Główna nawigacja" data-nav>' + renderNavigation('oferta') + '<a class="nav-cta" href="/kontakt/">Kontakt</a></nav>',
    '  </div></header>',
    '  <main id="main">',
    '    <div class="container breadcrumbs" aria-label="Okruszki"><ol><li><a href="/">Strona główna</a></li><li aria-current="page">Oferta</li></ol></div>',
    '    <section class="hero offer-hero"><div class="container"><p class="eyebrow">Oferta i obszar działania</p><h1 class="gradient-text">Rozwiązania internetowe i IT dla Twojej firmy</h1><p class="hero-lead">Wybierz lokalną stronę dla Środy Śląskiej, Miękini i Lutyni albo Wrocławia — lub przejdź bezpośrednio do wspólnej usługi. Cennik i zasady współpracy są takie same niezależnie od miasta.</p><div class="actions"><a class="button button-primary" href="/kontakt/">Zapytaj o wycenę</a><a class="button button-secondary" href="#lokalnie">Wybierz lokalizację</a></div></div></section>',
    '    <section class="section section-muted" id="lokalnie"><div class="container"><div class="section-heading"><p class="section-kicker">Strony lokalne</p><h2>Wybierz rynek, na którym działasz</h2><p>Każda strona ma własny kontekst i treść, ale prowadzi do jednej wspólnej oferty oraz kontaktu.</p></div><div class="offer-grid offer-grid-locations">' + locations.map(renderHubCard).join('') + '</div></div></section>',
    '    <section class="section"><div class="container"><div class="section-heading"><p class="section-kicker">Usługi wspólne</p><h2>Jedna oferta dla wszystkich lokalizacji</h2><p>Nie powielam cennika ani tych samych opisów usług dla każdego miasta. Dzięki temu struktura jest czytelna dla klientów i wyszukiwarki.</p></div><div class="offer-grid">' + services.map(renderHubCard).join('') + '</div></div></section>',
    '    <section class="section"><div class="container cta"><p class="section-kicker">Porozmawiajmy</p><h2>Nie wiesz, od której strony zacząć?</h2><p>Opisz cel, obszar działania i najważniejszą usługę. Pomogę dobrać sensowny zakres.</p><div class="actions"><a class="button button-primary" href="/kontakt/">Przejdź do kontaktu</a></div></div></section>',
    '  </main>',
    '  <footer class="foot">',
    '    <span>© <span id="year" data-year></span> i-JANICKI</span>',
    '    <span class="foot-sep">·</span>',
    '    <a href="mailto:' + EMAIL + '" class="foot-mail">' + EMAIL + '</a>',
    '    <span class="foot-sep">·</span>',
    '    <a href="/dokumenty/" class="foot-docs">Dokumenty</a>',
    '    <button class="cookie-foot-btn" id="cookieFootBtn" type="button" aria-label="Zmień ustawienia cookies" data-i18n-aria-label="cookie-settings-change">🍪</button>',
    '  </footer>',
    '  <div class="cookie-overlay" id="cookieOverlay" role="dialog" aria-modal="true" aria-label="Ustawienia plików cookie" aria-hidden="true" hidden></div>',
    '</body>',
    '</html>',
    ''
  ].join('\n');
}

for (const page of pages) {
  const outputDirectory = path.join(ROOT, page.slug);
  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.writeFile(path.join(outputDirectory, 'index.html'), renderPage(page), 'utf8');
}

await fs.mkdir(path.join(ROOT, 'oferta'), { recursive: true });
await fs.writeFile(path.join(ROOT, 'oferta', 'index.html'), renderOfferHub(), 'utf8');

console.log('Generated offer hub and ' + pages.length + ' service pages.');
