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
2. Uzupełnij konfigurację Firebase. Publiczna konfiguracja jest już wpisana do lokalnego `.env`, ale nadal potrzebny jest dokładny `VITE_FIREBASE_DATABASE_URL`, jeśli chcesz wyjść z trybu demo.
3. Dodaj ikony builda:
   - `build/icon.png`
   - `build/icon.ico`
4. Certyfikat publiczny jest oczekiwany w `build/iJanekCert.cer`. Klucz prywatny `build/iJanekPriv.key` nigdy nie powinien trafić do repo.
5. Uruchom:

```bash
npm install
npm run dev
```

## Kluczowe założenia

- Masterem jest wyłącznie `igor.janicki27@gmail.com`.
- Nowe urządzenie jest zawsze oznaczone jako `pending`, dopóki Master nie zatwierdzi go w Firestore.
- Przy braku `VITE_FIREBASE_DATABASE_URL` projekt pozostaje w trybie demo (`VITE_ENABLE_MOCK_BACKEND=true`), żeby nie zgadywać endpointu Realtime Database.
- Domyślne katalogi backupu dla Windows to `%USERPROFILE%\\Desktop`, `%USERPROFILE%\\Documents` i `%USERPROFILE%\\Pictures`.
- Auto-update jest przygotowany pod publiczne repo `igorjanicki27-coder/I-janicki.pl`.
- Funkcje Windows-only są chronione fallbackami, więc projekt kompiluje się także na macOS, ale pełna diagnostyka i instalator wymagają Windowsa.
