# Retencja danych technicznych serwisu

## Zakres

Kod publicznej strony nie zapisuje IP, User-Agent ani systemu operacyjnego odwiedzającego. W Firestore zapisuje pojedyncze zdarzenia (`analytics_events`: typ, ścieżka, data, ewentualnie kanał kontaktu) oraz stan prób logowania i sesji panelu statystyk (`stats_pin_attempts`, `stats_sessions`). Skrypt `cleanup-technical-data.mjs` obejmuje wyłącznie dwie kolekcje bezpieczeństwa: `stats_pin_attempts` i `stats_sessions`, bez podkolekcji. Statystyki `analytics_events` mają osobny mechanizm minimalizacji pól, zachowujący historię `/stats`, i nie są usuwane przez ten skrypt.

Próby logowania i sesje są usuwane po 90 × 24 godzinach od ostatniego `updatedAt` nadanego przez serwer; dla starych rekordów bez tego pola używane jest `createTime`. Skrypt działa także dla dotychczasowych rekordów, nie wymaga migracji ani dodatkowych indeksów. Zmiana rekordu między odczytem a usunięciem chroni go przed usunięciem dzięki warunkowi `currentDocument.updateTime`.

Zgody cookies mają odrębny okres 12 miesięcy i własny workflow. Dane klientów, zamówienia, dokumenty rozliczeniowe, konta oraz dane aplikacji i-JANEK nie są objęte tym czyszczeniem. Blokady PIN-ów panelu firmowego stanowią konfigurację dostępu, a nie historię zdarzeń, i nie są automatycznie zdejmowane.

## Uruchomienie

Workflow `.github/workflows/cleanup-technical-data.yml` działa raz dziennie o 03:23 UTC. Musi znaleźć się na domyślnej gałęzi GitHub. Korzysta z istniejącego środowiska `firebase` i sekretu `FIREBASE_SERVICE_ACCOUNT_JSON` lub `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`. Konto usługi projektu `i-janicki` wymaga praw do odczytu i usuwania dokumentów Firestore (np. `roles/datastore.user`). Uprawnienia samego RTDB nie wystarczą. Nie należy udostępniać klucza w kodzie strony.

Najpierw uruchom ręcznie workflow z `dry_run=true`, sprawdź liczniki, następnie z `dry_run=false`. Harmonogram wykonuje usuwanie. Lokalnie, po wskazaniu bezpiecznie przechowywanego klucza przez `GOOGLE_APPLICATION_CREDENTIALS`:

```sh
npm run test:technical-retention
npm run cleanup:technical-data -- --dry-run
npm run cleanup:technical-data -- --delete
```

Bez argumentów skrypt wykonuje tylko podgląd. Wynik zawiera wyłącznie liczniki, bez treści rekordów, identyfikatorów, powodów incydentów i tokenów. Błędy uprawnień, brak wersji dokumentu albo nieprawidłowe daty/wyjątki powodują niepowodzenie zadania. Rekordy nieprawidłowe wymagają ręcznego przeglądu.

Usuwanie następuje w najbliższym udanym przebiegu po osiągnięciu wieku 90 dni, a nie dokładnie w sekundzie upływu terminu. [GitHub może opóźniać harmonogramy oraz wyłącza je w publicznych repozytoriach po 60 dniach bez aktywności](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule). Administrator powinien sprawdzać udane przebiegi i nie ignorować awarii.

Skrypt nie wymaga włączenia płatnego TTL ani nowej usługi. Każdy przebieg odczytuje objęte nim dokumenty stronami po 200 i usuwa przeterminowane. [Firestore ma darmowe limity 50 000 odczytów i 20 000 usunięć dziennie](https://firebase.google.com/docs/firestore/quotas), współdzielone z pozostałym ruchem projektu; większa baza lub duży pierwszy przebieg mogą wymagać płatnego planu. GitHub Actions także podlega limitom planu konta.

## Wyjątki dla incydentów i roszczeń

Uprawniony administrator może przez Admin API lub konsolę Firestore ustawić jednocześnie `retentionUntil` (Firestore Timestamp: konkretny koniec wydłużonego przechowywania) i `retentionReason` (niepusty opis celu). Dotychczasowe reguły zapisów strony/panelu nie pozwalają klientowi ustawiać tych pól. Po upływie `retentionUntil` rekord ponownie kwalifikuje się do usunięcia. Niekompletny wyjątek jest zgłaszany jako błąd do przeglądu. Nie ma bezterminowego przełącznika wyłączającego retencję.

## Dostawcy infrastruktury

To zadanie nie zmienia retencji logów przechowywanych przez Cloudflare, Firebase/Google Cloud, Google Analytics ani innych dostawców. W repozytorium nie znaleziono konfiguracji eksportowania logów HTTP/bezpieczeństwa Cloudflare ani własnego serwera rejestrującego IP. Konfigurację konta, ewentualne eksporty, kopie zapasowe i ich okresy przechowywania trzeba zweryfikować po stronie dostawców. [Retencja Cloudflare zależy od produktu i zbioru logów](https://developers.cloudflare.com/observability/logs/); kod strony nie może usuwać takich logów.
