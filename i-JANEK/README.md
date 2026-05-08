# i-JANEK

Desktopowa aplikacja Electron + Vue 3 dla architektury Master/Slave i-JANICKI.

## Zakres w tym etapie

- osobny projekt w `./i-JANEK`, bez zmian w plikach strony
- UI Master/Slave w stylistyce glassmorphism opartej o tokeny z `i-janicki.pl`
- integracje Firebase, Google OAuth i Google Drive przez warstwę adapterów
- telemetry, inwentaryzacja, cichy terminal, RustDesk i backup jako usługi Electron
- instalator NSIS z hookami PowerShell pod certyfikat, autostart i clean uninstall

## Szybki start

1. Skopiuj `.env.example` do `.env`.
2. Uzupełnij konfigurację Firebase oraz lokalny `I_JANEK_AES_VAULT_KEY`. Nie commituj tego klucza do repo.
3. (RustDesk) Ustaw globalnie na Windows:
   - `RUSTDESK_CONFIG_STRING` (konfiguracja serwera eksportowana z RustDesk)
   - `RUSTDESK_LOCK_CONFIG=1` (wymuszenie blokady ręcznej edycji konfiguracji)
   - alternatywnie wpisz config string do `resources/rustdesk-config.local.txt` (plik lokalny, ignorowany przez git); wzór jest w `resources/rustdesk-config.example.txt`
4. Dodaj ikony builda:
   - `build/icon.png`
   - `build/icon.ico`
5. Certyfikat publiczny jest oczekiwany w `build/iJanekCert.cer`. Klucz prywatny `build/iJanekPriv.key` nigdy nie powinien trafić do repo.
6. Uruchom:

```bash
npm install
npm run dev
```

## Build z macOS (release)

Uruchamiaj z katalogu `i-JANEK`:

```bash
# tylko macOS .app
npm run build:macos:app

# tylko Windows installer .exe (cross-build z macOS)
npm run build:win:exe:from-macos

# oba artefakty (macOS .app + Windows .exe)
npm run build:release:from-macos
```

Wymagania pod build Windows `.exe` na macOS:
- `wine` / `wine64`
- `mono`

Ikona builda:
- Skrypty automatycznie przygotowują ikonę z `./icons/icon.png`.
- Generowane pliki: `build/icon.png`, `build/icon.ico`, `build/icon.icns`.

## Kluczowe założenia

- Masterem jest wyłącznie `igor.janicki27@gmail.com`.
- Nowe urządzenie jest zawsze oznaczone jako `pending`, dopóki Master nie zatwierdzi go w Firestore.
- Brak wymaganych zmiennych `VITE_FIREBASE_*` blokuje start aplikacji (tryb produkcyjny, bez fallbacku demo).
- Domyślne katalogi backupu dla Windows to `%USERPROFILE%\\Desktop`, `%USERPROFILE%\\Documents` i `%USERPROFILE%\\Pictures`.
- Auto-update jest przygotowany pod publiczne repo `igorjanicki27-coder/I-janicki.pl`.
- RustDesk jest zarządzany polityką: przy starcie wymuszany jest `--config`, ustawiane jest silne hasło unattended i nakładana jest blokada ACL na pliki konfiguracyjne.
- Instalator automatycznie generuje trwałe `RUSTDESK_IDENTITY`, ustawia losowe hasło unattended i blokuje ręczną edycję konfiguracji (ACL + read-only).
- Funkcje Windows-only są chronione fallbackami, więc projekt kompiluje się także na macOS, ale pełna diagnostyka i instalator wymagają Windowsa.
