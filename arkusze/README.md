# Arkusze

Podstrona `/arkusze/`, bez osobnego budowania. Ekran PIN ma wygląd z `/kalkulator`. Kod `1234`, sesja do 12 godzin, blokada na 5 minut po 5 błędnych próbach. Firebase Authentication nadaje każdemu klientowi anonimową tożsamość. Reguły Firestore sprawdzają PIN i ważność jego sesji przed dostępem do wspólnych danych. Statyczne pliki strony, w tym dane początkowe, pozostają publiczne.

## Układ

Na komputerze i telefonie jest ta sama tabela: kolumny A–E, produkty w numerowanych wierszach. Domyślne kolumny to **Nazwa, Nr indeksu, Ilość, Zamiennik, Data**. W pionie przewija się cała strona, bez osobnego przewijania tabeli. Na telefonie kolumny przewijają się w poziomie; pierwsza kolumna z nazwą i numer wiersza pozostają widoczne. Wyszukiwarka jest nad zakładkami i pozostaje u góry podczas przewijania telefonu. Ikona edycji kolumn jest w pierwszym wierszu, obok nagłówków kolumn.

Kolumny dopasowują szerokość do nagłówków i zawartości widocznych wierszy. Puste oraz krótkie kolumny zajmują tylko potrzebne miejsce; tabela nie rozciąga ich do szerokości całej strony. Długie wartości zawijają się przy szerokości do 260 px, a nazwy produktów do 360 px. Na telefonie limit zależy od szerokości ekranu: pozostałe wartości od 96 do 160 px, nazwy od 112 do 220 px. Tabele w wynikach wyszukiwania dopasowują się do znalezionych pozycji. Nie ma stałych szerokości kolumn danych.

Pływający plus w prawym dolnym rogu otwiera „Dodaj zakładkę” i „Dodaj pozycję”. Tworzenie zakładki zaczyna się od wyboru układu kolumn: „Pusty” daje jedną nienazwaną kolumnę, a każda istniejąca zakładka może być źródłem układu. Kopia zachowuje nazwy, typy i kolejność widocznych kolumn oraz kolumnę sortowania; otrzymuje nowe identyfikatory i nie zawiera wierszy ani ukrytych kolumn źródła. Po „Dalej” można nadać nazwę i dopasować kolumny; „Wstecz” zachowuje edycję, dopóki nie wybrano innego układu. Zakładka ma nazwę, od 1 do 32 kolumn, rodzaje `name`, `price`, `date`, `other` i wybraną datę domyślnego sortowania. Nowa zakładka nie ma produktów. Dodanie pozycji automatycznie tworzy wiersz. Można edytować zakładkę, nazwy i rodzaje kolumn oraz produkty. Zmniejszenie liczby kolumn archiwizuje ich definicje i zachowuje wartości. Ponowne zwiększenie liczby przywraca kolumny.

## Dane początkowe

`initial-data.json` zawiera trzy tabele z zestawu plików wskazanego 11.10.2026:

- `tabela_produktow_finalna.xlsx`: 15 produktów w zakładce „Produkty i indeksy”;
- `tabela_produkty_partia_2.xlsx`: 17 produktów w zakładce „Tekstolity i HM”;
- `tabela_produkty_z_etykiet.xlsx`: 5 produktów w zakładce „Oringi i sznury gumowe”.

Łącznie 37 pozycji. Zestaw zapisano również w Firebase. Istniejącą zakładkę „Produkty i indeksy” zachowano bez zmian; usunięto zakładki pochodzące z plików spoza nowego zestawu. Nowe tabele mają kolumny Nazwa, Nr indeksu, Ilość, Zamiennik i Data. Brakujące wartości pozostają puste; pliki nowych tabel nie zawierają dat.

Uwagi z arkusza „Uwagi” pliku końcowego zachowano jako notatkę zakładki. Oddzielne partie produktów pozostają osobnymi pozycjami. Niepewne i nieczytelne odczyty etykiet zachowano zgodnie ze źródłem.

## Sortowanie i zapis

Domyślne sortowanie to rosnący termin ważności: przeterminowane produkty najpierw, potem najbliższe daty, a brak prawidłowej daty na końcu. Termin przypadający dzisiaj jest ważny do końca dnia. Dzień jest wyliczany dla `Europe/Warsaw`; krótki termin to do 30 dni. Sortowanie jest widokiem i nie przestawia danych źródłowych. Przy jednej kolumnie typu data jest automatyczne; wybór „Która data ustala kolejność wierszy?” pokazuje się dopiero przy kilku kolumnach z datą. Każda komórka typu data jest oceniana niezależnie: po terminie ma czerwony tekst, do 30 dni włącznie — pomarańczowy, a dalsze terminy pozostają w zwykłym kolorze. Wyszukiwanie obejmuje wszystkie widoczne kolumny we wszystkich zakładkach, bez rozróżniania wielkości liter i polskich znaków. Wyniki są grupowane według zakładki; edycja z wyników zapisuje do zakładki źródłowej, a kliknięcie jej nazwy otwiera cały arkusz.

Dane wszystkich urządzeń są wspólne w projekcie Firebase `i-janicki`, w dokumencie `arkusze_workbooks/shared`. Zmiany odbierane są na żywo. Zapis korzysta z transakcji i numeru wersji; edycja otwarta przed zmianą na innym urządzeniu zostaje odrzucona, aby nie nadpisać nowszych danych. Wybrana zakładka i wyszukiwanie są własnym widokiem każdego urządzenia. Logowanie i zapis wymagają internetu. Nie ma lokalnej kolejki zapisów ani komunikatu o zapisie w przeglądarce.

Przy tworzeniu pierwszego wspólnego zapisu dotychczasowy `localStorage` `ijanicki_arkusze_v2` ma pierwszeństwo przed tabelami początkowymi. Po utworzeniu dokumentu wszystkie kolejne urządzenia pobierają go z Firebase. Stare lokalne kopie pozostają nienaruszone i nie są dalej aktualizowane. Niepusty stary `ijanicki_arkusze_v1` jest migrowany do dodatkowej zakładki, jeśli nie ma zapisu v2. Zapis zachowuje również oryginalne wartości/formuły starego arkusza.

`firebase-sync.mjs` używa modularnego SDK Firebase 10.12.2, ładowanego z Google, w oddzielnej instancji aplikacji `arkusze`. Kolekcje `arkusze_sessions` i `arkusze_pin_attempts` są dostępne wyłącznie dla właściciela tożsamości. Reguły nie zmieniają dostępu innych paneli. Limit wspólnego zapisu wynosi 700 kB; odrzucenie zapisu nie zamyka formularza ani nie usuwa jego treści. Operacje korzystają z limitów i taryfy Firestore istniejącego projektu.

Nie ma przycisku eksportu ani wyboru sortowania. Daty nadal sortują się domyślnie od najstarszej. Widok nie pokazuje dodatkowego tytułu zakładki, liczników, podsumowania terminów ani uwag z plików.

Testy: `node --test scripts/arkusze.test.mjs scripts/arkusze-workbook.test.mjs scripts/arkusze-sync.test.mjs`.

Układ pięciu kolumn jest migrowany jednorazowo przed przeniesieniem istniejącego zapisu do Firebase (znacznik `layoutRevision: 1`). Dopasowanie zachowuje istniejące identyfikatory i wartości; brak indeksu, zamiennika lub daty pozostaje pusty. Usunięte z widoku kolumny są zachowane jako archiwalne, bez wyświetlania i przeszukiwania. Późniejszych zmian kolumn użytkownika nie nadpisuje kolejne otwarcie.
