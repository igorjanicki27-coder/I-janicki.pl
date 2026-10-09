# Formularze kontaktowe: 12 miesięcy

Codzienny workflow `cleanup-cookie-consents.yml` uruchamia także `cleanup-contact-forms.mjs`. Skrypt obejmuje wyłącznie kolekcję Firestore `contact_leads` projektu `i-janicki`. Usuwa całe wygasłe dokumenty, w tym treść, dane kontaktowe, daty zgód i identyfikator dokumentu (starszy formularz używał adresu e-mail w identyfikatorze).

Termin wynosi 12 miesięcy kalendarzowych od otrzymania zgłoszenia. Dla starszego formularza momenty kolejnych zgłoszeń są zapisane w `consentAcceptedDates`. Stare daty są usuwane także wtedy, gdy kontakt ma nowsze zgłoszenie; aktualne dane tego kontaktu pozostają do wygaśnięcia ostatniego zgłoszenia. Dla dokumentów bez tej listy używany jest serwerowy `createTime`. Sama zmiana statusu lub dokumentu nie przedłuża retencji. Nieprawidłowe daty wymagają przeglądu i są sygnalizowane błędem.

Usunięcie lub przycięcie wpisu oraz zwiększenie licznika odbywają się w jednym atomowym commit z warunkiem `updateTime`. Chroni to przed skasowaniem równoczesnej zmiany i podwójnym naliczeniem po ponowieniu zadania. Po przebiegu dokument `contact_form_stats/total` zawiera tylko liczby: `archivedCount` i `totalCount`. Nie pozostają identyfikatory nadawców, daty pojedynczych zgłoszeń, treść ani kopie danych po usunięciu ich z `contact_leads`. `/stats` odczytuje tylko zbiorczy `totalCount`; licznik jest aktualizowany raz dziennie.

Stary lokalny znacznik `ijanek_form_last_submit` jest także usuwany przez `cookie-consent.js` po 12 miesiącach od wysłania, niezależnie od daty zgody cookies.

Obecna strona `/kontakt` nie zawiera formularza. Mechanizm obsługuje historyczne dane `contact_leads`, nie przywraca formularza. Starszy formularz zapisywał w tej kolekcji imię, nazwisko, e-mail i daty zgód; treść wysyłał przez Web3Forms do poczty. Ten skrypt nie ma dostępu do skrzynki ani danych dostawcy Web3Forms i nie usuwa tamtych kopii. Ich usuwanie po 12 miesiącach wymaga odrębnej konfiguracji i dostępu do odpowiedniej usługi.

## Uruchomienie i sprawdzenie

- `npm run test:contact-retention` — testy na symulowanych danych, bez dostępu do produkcji.
- `npm run cleanup:contact-forms -- --dry-run` — podliczenie bez zapisu ani usuwania; także domyślne działanie bez flag.
- `npm run cleanup:contact-forms -- --delete` — usuwanie i aktualizacja licznika.

Wymagane jest konto usługi `i-janicki` wskazane przez `GOOGLE_APPLICATION_CREDENTIALS`, z odczytem/usuwaniem `contact_leads` i zapisem `contact_form_stats`. Workflow korzysta z dotychczasowych sekretów środowiska `firebase`. Publikacja strony i workflow oraz wdrożenie `firestore.rules` są konieczne, aby działało czyszczenie produkcji i odczyt licznika w `/stats`. Harmonogram może się opóźnić: usuwanie następuje podczas najbliższego udanego przebiegu po upływie 12 miesięcy.

Nie ma nowej usługi ani nowej biblioteki. Operacje Firestore i czas GitHub Actions wykorzystują limity istniejącego planu; odczyty i usuwanie dużej bazy mogą przekroczyć darmowe limity.
