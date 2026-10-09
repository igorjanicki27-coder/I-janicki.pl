# Retencja zgód cookies

- Decyzja (akceptacja, odmowa albo własne ustawienia) oraz identyfikatory i metadane zgody wygasają po 12 miesiącach kalendarzowych od `updated_at`, a dla starszych wpisów bez tego pola — od `created_at`.
- Odwiedziny nie odnawiają terminu. Zapisanie nowego wyboru odnawia termin tej decyzji.
- `cookie-consent.js` sprawdza termin przed uruchomieniem analityki, po wznowieniu strony i podczas otwartej sesji. Wygasła decyzja, kategorie, daty i identyfikatory są usuwane. Strona ponownie pokazuje panel zgód.
- Przeglądarka nie może wykonać kodu, gdy strona jest zamknięta: lokalne dane są wtedy usuwane przy najbliższym otwarciu strony. Starsze decyzje bez poprawnej daty wymagają ponownego wyboru.
- Workflow `cleanup-cookie-consents.yml` codziennie usuwa wygasłe rekordy wyłącznie spod `/cookie_consents`. Harmonogram GitHub Actions może się opóźnić. Usuwanie odbywa się warunkowo z ETag, aby zachować zgodę odnowioną podczas czyszczenia.
- Po wygaśnięciu usuwane są także lokalne imię, motyw, język i stan samouczka. Dane statystyczne potrzebne do `/stats` pozostają: `type`, `path`, `timestamp`, `durationSeconds`, `channel`. Workflow usuwa pozostałe pola z historycznych zdarzeń `analytics_events`, zachowując starszy fallback `page` jako `path` i ewentualne administracyjne terminy przeglądu retencji. Dane aplikacji i-JANEK, kont i zleceń nie należą do danych cookies witryny.
- Google Analytics pozostaje włączony. Cookies Google mają `cookie_expires: 31536000` i `cookie_update: false`; lokalne czyszczenie dodatkowo usuwa je po wygaśnięciu wyboru. Retencja danych na koncie Google jest niezależna od usuwania cookies i rejestru zgód.

## Uruchomienie

Opublikuj pliki strony, a workflow i skrypty umieść na domyślnej gałęzi repozytorium z włączonym GitHub Actions. Workflow korzysta z istniejącego środowiska `firebase` i sekretu `FIREBASE_SERVICE_ACCOUNT_JSON` albo `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`. Konto usługi musi należeć do projektu `i-janicki` i mieć dostęp do odczytu/usuwania danych w RTDB oraz odczytu/aktualizacji kolekcji `analytics_events` w Firestore. Sekrety pozostają wyłącznie po stronie GitHub Actions.

Ręczne uruchomienie workflow domyślnie wykonuje tylko podliczenie (`dry_run: true`). Planowane uruchomienia usuwają wygasłe rekordy. Lokalnie skrypt domyślnie wykonuje tylko podgląd; usuwanie wymaga `npm run cleanup:cookie-consent -- --delete`. Nieprawidłowe daty są sygnalizowane błędem i wymagają sprawdzenia; nie powodują usunięcia nieznanych danych.

Lokalna weryfikacja: `npm run test:cookie-consent`. Testy korzystają z symulowanej przeglądarki i odpowiedzi RTDB, bez odczytu ani zmiany danych produkcyjnych.
