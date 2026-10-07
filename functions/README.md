# Opinie Google Business Profile

Funkcja `googleBusinessReviews` pobiera opinie zweryfikowanej lokalizacji przez
Google Business Profile API. Dane OAuth pozostają w Firebase Secret Manager i
nie trafiają do publicznego JavaScriptu strony.

Strona produkcyjna działa na GitHub Pages, dlatego frontend łączy się
bezpośrednio z funkcją w regionie `europe-west1`. Funkcja dopuszcza żądania
przeglądarkowe wyłącznie z `i-janicki.pl` i `www.i-janicki.pl`.

## Wymagania

1. Zweryfikowany Profil Firmy w Google aktywny od co najmniej 60 dni.
2. Zatwierdzony dostęp projektu `i-janicki` do Google Business Profile APIs.
3. Włączone interfejsy udostępnione po akceptacji, w szczególności Google My
   Business API, My Business Account Management API i My Business Business
   Information API.
4. Klient OAuth 2.0 oraz refresh token ze scope
   `https://www.googleapis.com/auth/business.manage`.
5. Projekt Firebase w planie Blaze, wymaganym przez Cloud Functions i Secret
   Manager. Samo Google Business Profile API jest bezpłatne.

## Konfiguracja Firebase

Sekrety ustaw interaktywnie — nigdy nie zapisuj ich w repozytorium:

```sh
firebase functions:secrets:set GOOGLE_BUSINESS_OAUTH_CLIENT_ID --project i-janicki
firebase functions:secrets:set GOOGLE_BUSINESS_OAUTH_CLIENT_SECRET --project i-janicki
firebase functions:secrets:set GOOGLE_BUSINESS_OAUTH_REFRESH_TOKEN --project i-janicki
```

Parametry publiczne funkcji:

```text
GOOGLE_BUSINESS_ACCOUNT_ID=...
GOOGLE_BUSINESS_LOCATION_ID=...
GOOGLE_BUSINESS_PROFILE_URL=https://...
GOOGLE_BUSINESS_REVIEW_URL=https://...
```

Przy pierwszym wdrożeniu Firebase CLI poprosi o wartości brakujących parametrów.
Identyfikatory można odczytać dopiero po zatwierdzeniu API, wywołując kolejno
`accounts.list` oraz `accounts.locations.list` z tym samym tokenem OAuth.

## Sprawdzenie

```sh
npm test --prefix functions
```

Po skonfigurowaniu dostępu:

```sh
firebase deploy --only functions:googleBusinessReviews,hosting --project i-janicki
```
