# Podpis i aktualizacje macOS

i-JANEK korzysta z bezpłatnej, samopodpisanej tożsamości `i-JANEK Local Code Signing`. Wszystkie instalatory i aktualizacje macOS muszą być podpisane dokładnie tym samym certyfikatem. Automat wydania sprawdza odcisk certyfikatu przed zmianą wersji oraz ponownie sprawdza podpis gotowej aplikacji.

Pierwsze przejście z wcześniejszej, niepodpisanej aplikacji albo z podpisu `Apple Development` wymaga ręcznej instalacji DMG. macOS może pokazać komunikat o niezaufanym deweloperze; użytkownik może zatwierdzić aplikację przez `Ustawienia systemowe -> Prywatność i ochrona -> Otwórz mimo to`. Po zainstalowaniu wersji podpisanej stałym certyfikatem następne aktualizacje mogą być wykonywane automatycznie.

Zaszyfrowana kopia tożsamości znajduje się na Pulpicie jako `i-JANEK-podpis-macOS.p12`, a publiczny certyfikat jako `i-JANEK-podpis-macOS.cer`. Hasło pliku P12 jest zapisane w Pęku kluczy pod nazwą `i-JANEK macOS signing backup`. Kopię P12 oraz hasło należy dodatkowo zachować w dwóch oddzielnych, bezpiecznych miejscach. Utrata klucza prywatnego oznacza konieczność kolejnej ręcznej instalacji na wszystkich komputerach Mac.

Po aktualizacji opis z automatu wydania jest dostępny offline w dialogu aplikacji. Kliknięcie `OK` zapisuje potwierdzenie dla tej wersji; do tego czasu interfejs jest zablokowany, ale praca w tle trwa normalnie. Automatyczny restart po instalacji uruchamia aplikację w zasobniku bez przejmowania fokusu.

Kontrola lokalnego certyfikatu:

```bash
npm run signing:macos:check
```

Certyfikat samopodpisany zapewnia spójność kolejnych wersji, ale nie daje reputacji Gatekeepera ani notaryzacji Apple. Jeżeli w przyszłości zostanie wykupiony Apple Developer Program i użyty certyfikat `Developer ID Application`, przejście na niego będzie wymagało jeszcze jednej ręcznej instalacji.
