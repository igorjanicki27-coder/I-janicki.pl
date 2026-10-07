# Aktualizacje Windows

Na Windows aplikacja sprawdza aktualizacje przy starcie procesu, przy ponownym otwarciu okna (najwyżej raz na pięć minut) oraz co 12 godzin podczas działania. Zadanie agenta działa również przy zasilaniu bateryjnym.

Instalator NSIS instaluje i-JANEK dla całego komputera w chronionym katalogu Program Files. Pierwsza instalacja wymaga administratora. Tworzy też zadanie `i-JANEK Update Agent`, działające jako SYSTEM co minutę i przy starcie Windows. Zadanie wykonuje uprzywilejowane operacje aktualizacji oraz instaluje lub rekonfiguruje agenta DWService po przypisaniu kodu przez Mastera. Aplikacja okienkowa działa z uprawnieniami użytkownika.

Po wykryciu nowej wersji `electron-updater` pobiera instalator do profilu użytkownika. Aplikacja zapisuje zgłoszenie w `ProgramData\i-JANEK\requests` i od razu uruchamia zadanie agenta. Zadanie pozwala zwykłym użytkownikom tylko na odczyt i uruchomienie; jego definicja pozostaje chroniona. Agent pobiera z wydania GitHub manifest i podpis, weryfikuje podpis publicznym kluczem zapisanym przy pierwszej instalacji, kopiuje instalator do chronionego katalogu i porównuje SHA-512. Dopiero wtedy prosi aplikację o zamknięcie, uruchamia NSIS z `/S` jako SYSTEM, zapisuje wynik i pozwala uruchomić aplikację ponownie w sesji użytkownika. Nie pojawia się instalator ani UAC. Po aktualizacji wykonywanej w tle aplikacja wraca ukryta w zasobniku, bez otwierania głównego okna.

Istniejąca instalacja bez agenta wymaga jednej migracyjnej aktualizacji z UAC. Nowe instalacje od razu otrzymują agenta. Instalacja poza Program Files albo z możliwością zapisu dla zwykłych użytkowników jest odrzucana przez agenta; taką instalację trzeba przenieść przez odinstalowanie i nową instalację systemową.

## Klucz wydania

`resources/update-signing-private.pem` jest ignorowany przez Git. Tożsamy klucz jest wymagany przy każdym następnym wydaniu. Należy przechować jego zaszyfrowaną kopię poza repozytorium. Utrata klucza oznacza, że już zainstalowane agenty nie zaakceptują nowych wydań bez migracji z uprawnieniami administratora. Publiczny klucz w `resources/scripts/update-signing-public.json` jest dołączany do instalatora.

Po zbudowaniu instalatora skrypt `scripts/sign-windows-update.mjs` tworzy `dist/update-windows.json` i `dist/update-windows.sig`; automat wydania publikuje oba pliki razem z instalatorem. Automat sprawdza zgodność kluczy przed zmianą wersji i utworzeniem tagu. Podpis Authenticode jest opcjonalnym, płatnym uzupełnieniem dla reputacji SmartScreen; nie jest wymagany do tego mechanizmu weryfikacji.

Ręczny workflow awaryjny na GitHub Actions wymaga osobnego sekretu `WINDOWS_UPDATE_SIGNING_KEY_PEM` z tym samym kluczem prywatnym. Bez sekretu kończy się błędem przed publikacją. Ustawienie go oznacza świadome umieszczenie klucza w sekretach repozytorium; lokalny automat wydania korzysta bezpośrednio z lokalnego pliku.

Kod DWService trafia do krótkotrwałego zgłoszenia w chronionym katalogu `ProgramData\\i-JANEK\\requests`; agent SYSTEM usuwa je po obsłużeniu i zapisuje wyłącznie skrót kodu oraz status konfiguracji.

## Test przed wydaniem

Na rzeczywistym Windows należy sprawdzić instalację na koncie bez administratora, podając hasło administratora wyłącznie przy pierwszym instalatorze. Następnie opublikować podpisane wydanie testowe i potwierdzić, że po pobraniu aplikacja sama zamyka się, aktualizuje i wraca w sesji użytkownika bez UAC. Zadanie w Harmonogramie zadań powinno zakończyć się kodem 0, a wersja aplikacji powinna wzrosnąć. Osobno trzeba podmienić bajt w pobranym instalatorze lub manifeście i potwierdzić, że agent odmawia instalacji. Trzeba sprawdzić Master, Slave oraz instalację i zmianę kodu DWService po aktualizacji.

Stan agenta jest w `ProgramData\i-JANEK\update-status.json`. Błędy w tym pliku są pokazywane w oknie aplikacji. Przed zamknięciem aplikacja czeka do dwóch minut na jednoznaczne potwierdzenie startu konkretnej próby obserwatora w `%APPDATA%\i-JANEK\update-restart`. Starsza, opóźniona próba nie może anulować nowszej. Dopiero po tym potwierdzeniu aplikacja kończy proces natychmiast, aby obsługa cyklu zamykania okien Electron nie mogła zablokować instalacji. Obserwator zapisuje plik potwierdzający przed logiem i działa jako odłączony proces bez uchwytów konsoli aplikacji. Szczegóły trafiają do `restart-after-update.log`; jeśli obserwator nie wystartuje, aplikacja pozostaje otwarta i pokazuje błąd. Skrypty agenta i klucz publiczny są w `ProgramData\i-JANEK\agent`; zwykli użytkownicy mają do nich tylko odczyt. Zgłoszenia mogą zawierać wyłącznie wersję, kanał i ścieżkę pobranego pliku; agent ponownie weryfikuje wszystko przed instalacją.
