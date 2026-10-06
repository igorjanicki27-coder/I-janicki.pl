# i-JANEK

Desktopowa aplikacja Electron + Vue 3 dla architektury Master/Slave i-JANICKI.

## Zakres w tym etapie

- osobny projekt w `./i-JANEK`, bez zmian w plikach strony
- UI Master/Slave w stylistyce glassmorphism opartej o tokeny z `i-janicki.pl`
- integracje Firebase, Google OAuth i Google Drive przez warstwę adapterów
- telemetria, inwentaryzacja, cichy terminal, DWService i backup jako usługi Electron
- instalator NSIS z hookami PowerShell pod certyfikat, autostart i clean uninstall

## Szybki start

1. Skopiuj `.env.example` do `.env`.
2. Uzupełnij konfigurację Firebase oraz desktopowego Google OAuth. Nie commituj sekretów do repo.
   - Firebase Auth nadal wymaga włączenia providera Google.
   - Dla aplikacji Electron utwórz w Google Cloud OAuth Client typu `Desktop app`.
   - Masz dwie darmowe opcje konfiguracji:
     - w `.env` wpisz `GOOGLE_DESKTOP_CLIENT_ID` i `GOOGLE_DESKTOP_CLIENT_SECRET`
     - albo dostarczony przez instalator plik JSON, który trafia do `%APPDATA%\i-JANEK\google-oauth-desktop.local.json`
   - Instalator kopiuje JSON automatycznie do profilu użytkownika, więc nie trzeba go dogrywać ręcznie.
   - Przy ręcznym uruchomieniu aplikacja pokazuje główne okno od razu; tryb `--tray` jest zarezerwowany dla autostartu.
3. Włącz w koncie DWService możliwość cichej instalacji agenta. Kod instalacyjny przypisuje Master podczas akceptacji urządzenia.
4. Dodaj ikony builda:
   - `build/icon.png`
   - `build/icon.ico`
5. Wydania produkcyjne podpisuj zaufanym certyfikatem producenta lub usługą podpisywania kodu. Instalator nie dodaje własnych certyfikatów do magazynu zaufania systemu.
6. Uruchom:

```bash
npm install
npm run dev
```

## Build z macOS (release)

Uruchamiaj z katalogu `i-JANEK`:

```bash
# prywatny instalator wdrożeniowy macOS .dmg (+ techniczny .zip dla auto-update)
npm run build:macos:installer

# tylko Windows installer .exe (cross-build z macOS)
npm run build:win:exe:from-macos

# oba prywatne instalatory wdrożeniowe (macOS .dmg + Windows .exe)
npm run build:installers:from-macos
```

Wymagania pod build Windows `.exe` na macOS:
- `wine` / `wine64`
- `mono`

Ikona builda:
- Skrypty automatycznie przygotowują ikonę z `./icons/icon.png`.
- Generowane pliki: `build/icon.png`, `build/icon.ico`, `build/icon.icns`.

## Automatyczne wydania test, beta i stable

Na macOS najprościej kliknąć dwukrotnie natywną aplikację `Nowa wersja.app` w głównym katalogu i-JANEK. Otworzy się kreator podobny do tego z repozytorium myAriba: numer bazowy, wybór `stable/test/beta`, osobne okno opisu zmian oraz publikacja z widocznym postępem. Aplikacja nie otwiera dodatkowego okna Terminala. Jej kod źródłowy znajduje się w `scripts/release-launcher.m`, a pakiet można ponownie zbudować poleceniem `./scripts/build-release-launcher-macos.sh`.

Wariant terminalowy również pozostaje dostępny. Po jednorazowym skonfigurowaniu repozytorium wydanie uruchamia się lokalnie, bez otwierania GitHuba. Podajesz bazową wersję i opis zmian, a następnie wybierasz z menu `stable`, `test` albo `beta`:

```bash
./release.sh 0.1.2 "Poprawki logowania i aktualizacji"
```

Skrypt wyświetli:

```text
1) stable — dla wszystkich klientów
2) test   — testy wewnętrzne
3) beta   — dla grupy beta
```

Dla `stable` pozostawi wersję `0.1.2`. Dla `test` sam utworzy np. `0.1.2-alpha.1`, a dla `beta` np. `0.1.2-beta.1`. Jeśli dla tej wersji istnieją już wydania testowe lub beta, automatycznie wybierze kolejny numer. Podgląd bez wprowadzania zmian uruchamia się przez `./release.sh 0.1.2 "Opis zmian" --dry-run`.

Ten sam skrypt można uruchomić przez npm: `npm run release -- 0.1.2 "Opis zmian"`.

Jeżeli wersja ma być wyliczona automatycznie, nadal można użyć komend kanałowych:

```bash
# tylko pokaż następną wersję — bez zmian i bez publikacji
npm run release:test:preview
npm run release:beta:preview
npm run release:stable:preview

# utwórz wersję, lokalnie zbuduj paczki, wypchnij tag i opublikuj GitHub Release
npm run release:test
npm run release:beta
npm run release:stable
```

Skrypt wymaga gałęzi `main`, zalogowanego Git w systemowym magazynie poświadczeń oraz lokalnej tożsamości `i-JANEK Local Code Signing`. Przy publikowaniu sam dodaje do commita wszystkie zmiany z katalogu `i-JANEK`, aktualizuje numer wersji, tworzy tag i wysyła wydanie. Nie dołącza zmian z pozostałych katalogów repozytorium, plików `.DS_Store`, plików ignorowanych ani lokalnych konfiguracji prywatnych. Kanał test używa wersji `x.y.z-alpha.N`, beta `x.y.z-beta.N`, a stable `x.y.z`. W razie potrzeby można podać wersję ręcznie, np. `npm run release:test -- --version=0.2.0-alpha.1`.

Master przypisuje każdemu komputerowi jeden kanał w panelu urządzenia. Nowe urządzenie zawsze zaczyna na `stable`; urządzenia bez zapisanego kanału również są traktowane jako `stable`. Zalecana promocja wydania to kolejno test na jednym komputerze, beta na małej grupie i dopiero potem stable dla wszystkich klientów.

Lokalny automat buduje i publikuje:

- macOS: instalator `.dmg` oraz techniczny `.zip` i metadane auto-update,
- Windows: instalator NSIS `.exe`, plik `.blockmap` i metadane auto-update,
- po udanym buildzie tworzy GitHub Release; wersje test i beta są oznaczane jako prerelease.

Lokalny build jest celowy: aktualizacja macOS musi być podpisana tym samym certyfikatem co zainstalowana aplikacja. Certyfikat jest samopodpisany i bezpłatny, dlatego pierwsze uruchomienie może wymagać ręcznej zgody w ustawieniach bezpieczeństwa macOS. Szczegóły i kopia zapasowa są opisane w `docs/macos-updates.md`. GitHub Actions pozostaje awaryjnym wariantem CI dopiero po skonfigurowaniu tej samej tożsamości w sekretach repozytorium.

Jednorazowo w `Settings -> Secrets and variables -> Actions -> Variables` trzeba dodać publiczną konfigurację aplikacji:

- `I_JANEK_FIREBASE_API_KEY`
- `I_JANEK_FIREBASE_AUTH_DOMAIN`
- `I_JANEK_FIREBASE_PROJECT_ID`
- `I_JANEK_FIREBASE_MESSAGING_SENDER_ID`
- `I_JANEK_FIREBASE_APP_ID`
- `I_JANEK_FIREBASE_DATABASE_URL`
- `I_JANEK_MASTER_EMAIL`

Opcjonalne sekrety do podpisywania instalatorów w awaryjnym workflow: `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `WINDOWS_CSC_LINK`, `WINDOWS_CSC_KEY_PASSWORD`. macOS musi używać dokładnie kopii `i-JANEK-podpis-macOS.p12`; automat odrzuci inny odcisk. Płatny certyfikat Apple `Developer ID Application` nie jest wymagany w kontrolowanym wdrożeniu, ale bez niego system będzie pokazywał niezaufanego dewelopera i nie będzie możliwa notaryzacja.

Plik Google OAuth nie jest wstrzykiwany do publicznego GitHub Release. Publiczny instalator można rozpakować, więc umieszczenie w nim prywatnych danych udostępniłoby je każdemu. Lokalne skrypty używają osobnej konfiguracji `electron-builder.private.yml` i tworzą prywatny instalator wdrożeniowy, który należy przekazać klientowi bezpośrednio. Przy pierwszym uruchomieniu ustawienia są utrwalane w profilu użytkownika, dzięki czemu późniejsze publiczne aktualizacje ich nie usuwają.

## Niezawodność i testy bezpieczeństwa

- Telemetria, inwentaryzacja oraz zgłoszenia awarii są odkładane w trwałej kolejce lokalnej, gdy sieć jest niedostępna. Powrót połączenia uruchamia synchronizację automatycznie; można ją też wymusić w ustawieniach.
- Ustawienia zawierają test gotowości sprawdzający środowisko aplikacji, sieć, sesję i odczyt Firestore, zatwierdzenie urządzenia, DWService, kanał aktualizacji oraz kolejkę offline.
- Przycisk `Zapisz diagnostykę` tworzy lokalny plik `.json.gz`. Logi są rotowane i automatycznie usuwają tokeny, hasła, klucze, dane uwierzytelniające oraz adresy e-mail.
- Zgłoszenia serwisowe mają komentarze wewnętrzne dostępne wyłącznie dla Mastera; klient nie może ich odczytać ani utworzyć zgodnie z regułami Firestore.
- Historia obciążenia zapisuje dzienne agregaty czasu pracy oraz czasu CPU, GPU, RAM i dysku ponad 80%. Agregaty są buforowane lokalnie i wysyłane najwyżej raz na godzinę, aby ograniczyć wykorzystanie darmowych limitów Firestore.
- Reguły Firestore i RTDB mają testy emulatorowe. GitHub Actions uruchamia je dla pull requestów oraz przed dotychczasowym wdrożeniem reguł Firestore.

Lokalne uruchomienie testów reguł wymaga Javy 21:

```bash
npm run test:rules
```

## Kluczowe założenia

- Masterem jest wyłącznie `kontakt@i-janicki.pl`.
- Nowe urządzenie jest zawsze oznaczone jako `pending`, dopóki Master nie zatwierdzi go w Firestore.
- Brak wymaganych zmiennych `VITE_FIREBASE_*` blokuje start aplikacji (tryb produkcyjny, bez fallbacku demo).
- Aplikacja działa na darmowym planie Firebase Spark: nie korzysta z Firebase Storage ani Cloud Functions.
- Inwentaryzacja jest przechowywana w Firestore jako jeden aktualny raport na urządzenie. Duże listy aplikacji i aktualizacji są dzielone na dokumenty mniejsze niż limit 1 MiB.
- RTDB obsługuje czat, polecenia, obecność i telemetrię; plan Spark wystarcza do 100 jednoczesnych połączeń.
- Domyślnym katalogiem backupu dla Windows jest wyłącznie `%USERPROFILE%\\Desktop`. Użytkownik może później dodać inne foldery w ustawieniach backupu.
- Auto-update jest przygotowany pod publiczne repo `igorjanicki27-coder/I-janicki.pl`.
- Aplikacja sprawdza aktualizacje przy każdym uruchomieniu oraz co 12 godzin podczas ciągłej pracy.
- Po pobraniu aktualizacji aplikacja proponuje instalację od razu albo później; po odroczeniu przypomina ponownie po 4 godzinach.
- Build beta pobiera aktualizacje beta i późniejsze stable, natomiast build stable pozostaje wyłącznie na kanale stable.
- Dla użytkownika publikowane są instalatory `.dmg` (macOS) i `.exe` (Windows). Plik `.zip` dla macOS pozostaje wyłącznie technicznym zasobem wymaganym przez `electron-updater`.
- Po akceptacji urządzenia klient odbiera przypisany kod DWService i przekazuje go do systemowego instalatora agenta. Zmiana kodu w panelu powoduje ponowną konfigurację.
- Panel DWService działa w `WebContentsView` wewnątrz i-JANEK i używa trwałej partycji sesji `persist:dwservice`.
- Pełny agent działa na Windows i macOS, natomiast panel Mastera można również zbudować jako aplikację webową poleceniem `npm run build:web`.
- Na macOS instalacja agenta wymaga jednorazowej autoryzacji administratora, a system może poprosić o uprawnienia Dostępność i Nagrywanie ekranu.
