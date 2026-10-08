# Aktualizacje Windows

Na Windows aplikacja sprawdza aktualizacje przy starcie procesu, przy ponownym otwarciu okna (najwyżej raz na pięć minut) oraz co 12 godzin podczas działania. Zadanie agenta działa również przy zasilaniu bateryjnym.

Instalator NSIS instaluje i-JANEK dla całego komputera w chronionym katalogu Program Files. Pierwsza instalacja wymaga administratora. Tworzy też zadanie `i-JANEK Update Agent`, działające jako SYSTEM co minutę i przy starcie Windows. Zadanie wykonuje uprzywilejowane operacje aktualizacji oraz instaluje lub rekonfiguruje agenta DWService po przypisaniu kodu przez Mastera. Aplikacja okienkowa działa z uprawnieniami użytkownika.

Po wykryciu nowej wersji `electron-updater` pobiera instalator do profilu użytkownika. Aplikacja zapisuje zgłoszenie w `ProgramData\i-JANEK\requests` i od razu uruchamia zadanie agenta. Zadanie pozwala zwykłym użytkownikom tylko na odczyt i uruchomienie; jego definicja pozostaje chroniona. Agent pobiera z wydania GitHub manifest i podpis, weryfikuje podpis publicznym kluczem zapisanym przy pierwszej instalacji, kopiuje instalator do chronionego katalogu i porównuje SHA-512.

Po weryfikacji agent przejmuje odpowiedzialność za restart: sprawdza ścieżkę procesu zgłaszającego aktualizację, pobiera zwykły token jego interaktywnej sesji Windows i przygotowuje środowisko użytkownika. Dopiero po tym zapisuje `ready` z `restartProtocol: 2` i `restartPrepared: true`. Aplikacja sprawdza identyfikator zgłoszenia i wersję, po czym kończy proces natychmiast. Nie uruchamia żadnego obserwatora PowerShell ani conhost.

Agent czeka na zakończenie procesów aplikacji, uruchamia NSIS z `/S` jako SYSTEM i sprawdza numer zainstalowanej wersji. Następnie uruchamia stały plik `i-JANEK.exe` przez `CreateProcessAsUser` na pulpicie `winsta0\default`, jako zwykły użytkownik z jego profilem. Stan `installed` jest zapisywany dopiero po potwierdzeniu startu interfejsu nowej wersji przez konkretny proces. Nie pojawia się instalator ani UAC. Po aktualizacji aplikacja wraca do zasobnika bez przejmowania fokusu. Inna aktywna sesja z i-JANEK blokuje instalację z czytelnym komunikatem. Przy błędzie instalatora agent próbuje ponownie uruchomić istniejącą aplikację, zachowując status błędu.

Istniejąca instalacja bez agenta wymaga jednej migracyjnej aktualizacji z UAC. Nowe instalacje od razu otrzymują agenta. Instalacja poza Program Files albo z możliwością zapisu dla zwykłych użytkowników jest odrzucana przez agenta; taką instalację trzeba przenieść przez odinstalowanie i nową instalację systemową.

## Opis zmian po aktualizacji

Opis wpisany w lokalnym automacie wydania jest zapisywany w `resources/release-notes.json` przed budowaniem i trafia do obu paczek. Po aktualizacji aplikacja uruchamia się w zasobniku bez przejmowania fokusu. Przy otwarciu użytkownik widzi dialog z wersją i opisem zmian, dostępny także bez internetu. Jedynym sposobem przejścia dalej jest kliknięcie `OK`; Escape i kliknięcie tła nie zamykają dialogu. Potwierdzenie jest zapisywane w profilu użytkownika dla tej wersji. Zamknięcie aplikacji bez potwierdzenia zachowuje dialog na następny start.

Logowanie, telemetria, komunikator, agent DWService i potwierdzenie restartu aktualizatora nie czekają na `OK`. Dialog ogranicza tylko obsługę interfejsu. Nowa instalacja nie pokazuje dialogu. Pierwsza aktualizacja starszej aplikacji jest rozpoznawana po `--updated` albo zapisanej rejestracji/zgodzie urządzenia. Wznowienie publikacji gotowych paczek nie pozwala zmienić opisu względem tego, który dołączono do paczek.

## Klucz wydania

`resources/update-signing-private.pem` jest ignorowany przez Git. Tożsamy klucz jest wymagany przy każdym następnym wydaniu. Należy przechować jego zaszyfrowaną kopię poza repozytorium. Utrata klucza oznacza, że już zainstalowane agenty nie zaakceptują nowych wydań bez migracji z uprawnieniami administratora. Publiczny klucz w `resources/scripts/update-signing-public.json` jest dołączany do instalatora.

Po zbudowaniu instalatora skrypt `scripts/sign-windows-update.mjs` tworzy `dist/update-windows.json` i `dist/update-windows.sig`; automat wydania publikuje oba pliki razem z instalatorem. Automat sprawdza zgodność kluczy przed zmianą wersji i utworzeniem tagu. Podpis Authenticode jest opcjonalnym, płatnym uzupełnieniem dla reputacji SmartScreen; nie jest wymagany do tego mechanizmu weryfikacji.

Ręczny workflow awaryjny na GitHub Actions wymaga osobnego sekretu `WINDOWS_UPDATE_SIGNING_KEY_PEM` z tym samym kluczem prywatnym. Bez sekretu kończy się błędem przed publikacją. Ustawienie go oznacza świadome umieszczenie klucza w sekretach repozytorium; lokalny automat wydania korzysta bezpośrednio z lokalnego pliku.

Kod DWService trafia do krótkotrwałego zgłoszenia w chronionym katalogu `ProgramData\\i-JANEK\\requests`; agent SYSTEM usuwa je po obsłużeniu i zapisuje wyłącznie skrót kodu oraz status konfiguracji.

## Test przed wydaniem

Test protokołu: `node --test tests/windows-update-protocol.test.mjs`. Sprawdza, że stare lub obce zgłoszenie, inna wersja oraz agent bez przygotowanej sesji nie mogą zamknąć aplikacji.

Test natywnego restartu na Windows: uruchom `scripts/test-windows-update-restart.ps1` w PowerShellu jako administrator. Skrypt tworzy chroniony katalog testowy i dwa tymczasowe zadania, uruchamia pomocniczą aplikację jako zalogowany użytkownik, a następnie kończy jej stary proces i uruchamia ją z agenta SYSTEM. Sprawdza konto, sesję, profil, środowisko, ukryty i widoczny start oraz potwierdzenie działania. Nie aktualizuje zainstalowanego i-JANEK. Po teście usuwa własne zadania, procesy i katalog. Wynik zapisuje do `dist/windows-update-smoke-result.json`. Ten test wymaga Windows i sprawdza prawdziwe API systemu, ale nie zastępuje testu aktualizacji pakietu.

Na rzeczywistym Windows należy następnie sprawdzić aktualizację z instalacji zawierającej protokół 2 do nowszego podpisanego wydania: pobranie, automatyczne zamknięcie, instalacja, wzrost wersji i potwierdzony start w sesji użytkownika bez UAC. Osobno trzeba podmienić bajt instalatora lub manifestu i potwierdzić odmowę instalacji. Sprawdzić oba tryby widoczności, Master i Slave. Stan `installed` musi pochodzić z zakończonego testu startu, nie tylko z kodu 0 NSIS.

Starsza instalacja z agentem bez `restartProtocol: 2` wymaga jednorazowej naprawy aktualnym instalatorem. Aplikacja wykrywa ten stan przed przekazaniem zgłoszenia i pokazuje instrukcję naprawy zamiast wykonywać dawną, nieskuteczną sekwencję restartu. Następne aktualizacje używają już agenta bez UAC.

Stan jest w `ProgramData\i-JANEK\update-status.json`, a log całego cyklu w `ProgramData\i-JANEK\logs\update-agent.log`. Log zapisuje weryfikację, przygotowanie sesji, instalację, PID nowego procesu i potwierdzenie startu interfejsu. Paczka z Pomocy technicznej obejmuje również te dane po usunięciu danych wrażliwych. Skrypt agenta, kod natywnego uruchomienia i klucz publiczny są w chronionym `ProgramData\i-JANEK\agent`. Żądanie zawiera wersję, kanał, ścieżkę instalatora, PID, flagę zasobnika i numer protokołu; żądanie nigdy nie wskazuje programu do uruchomienia ani dowolnych argumentów. Token sesji istnieje tylko w pamięci agenta i jest zwalniany po zakończeniu próby.
