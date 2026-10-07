# Opinie Google Business Profile bez planu Blaze

Strona nie wywołuje Google Business Profile API bezpośrednio. Raz dziennie
GitHub Actions pobiera pięć najnowszych opinii i zapisuje bezpieczny, publiczny
snapshot w Firebase Realtime Database. Strona odczytuje wyłącznie ten snapshot.

Google Business Profile API jest bezpłatne. Ten wariant nie korzysta z Cloud
Functions ani Secret Manager, więc projekt Firebase może pozostać w planie
Spark. Nadal obowiązują bezpłatne limity GitHub Actions i Firebase RTDB.

## Stan przed akceptacją Google

Workflow `Sync Google Business reviews` jest już zaplanowany, ale kończy się
poprawnie bez wykonywania synchronizacji, dopóki nie istnieje zmienna:

```text
GOOGLE_BUSINESS_SYNC_ENABLED=true
```

Nie ustawiaj jej przed uzyskaniem dostępu do API i dodaniem pozostałej
konfiguracji.

## Konfiguracja po akceptacji

1. W Google Cloud dla projektu `i-janicki` włącz interfejsy udostępnione przez
   Google dla Profilu Firmy.
2. Utwórz klienta OAuth 2.0 i refresh token z zakresem
   `https://www.googleapis.com/auth/business.manage` dla konta zarządzającego
   wizytówką.
3. W środowisku GitHub `firebase` dodaj sekrety:
   - `GOOGLE_BUSINESS_OAUTH_CLIENT_ID`
   - `GOOGLE_BUSINESS_OAUTH_CLIENT_SECRET`
   - `GOOGLE_BUSINESS_OAUTH_REFRESH_TOKEN`
4. Dodaj zmienne GitHub:
   - `GOOGLE_BUSINESS_ACCOUNT_ID`
   - `GOOGLE_BUSINESS_LOCATION_ID`
   - opcjonalnie `GOOGLE_BUSINESS_PROFILE_URL`
5. Upewnij się, że w tym samym środowisku nadal istnieje jeden z sekretów
   używanych do wdrażania Firebase:
   - `FIREBASE_SERVICE_ACCOUNT_JSON`
   - `FIREBASE_SERVICE_ACCOUNT_JSON_BASE64`
6. Ustaw `GOOGLE_BUSINESS_SYNC_ENABLED=true`.
7. Uruchom ręcznie workflow `Sync Google Business reviews`. Kolejne
   synchronizacje wykonają się codziennie o 03:17 UTC.

Identyfikatory konta i lokalizacji można ustalić po akceptacji, wywołując
odpowiednio `accounts.list` i `accounts.locations.list` z tym samym tokenem OAuth.
Nie zapisuj danych OAuth w repozytorium ani w kodzie strony.

## Dane publikowane do strony

Workflow zapisuje tylko średnią ocenę, całkowitą liczbę opinii, pięć najnowszych
opinii, adres profilu i czas synchronizacji w ścieżce:

```text
/publicGoogleReviews
```

Publiczne reguły zezwalają jedynie na odczyt tej ścieżki. Przeglądarka nie może
jej modyfikować; zapis wykonuje konto serwisowe używane przez GitHub Actions.
