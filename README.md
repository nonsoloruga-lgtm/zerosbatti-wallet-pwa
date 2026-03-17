# ZeroSbatti Wallet (PWA)

Questa cartella contiene una versione **PWA** (web app installabile) ispirata all'app Android.

## Cosa serve per funzionare
- Serve un **URL HTTPS** (GitHub Pages va benissimo).
- Scanner barcode/QR:
  - Funziona al meglio su **Chrome Android** (usa `BarcodeDetector` + fotocamera).

## Avvio in locale (per test)
Da PowerShell, dentro `zerosbatti-pwa`:

```powershell
cd zerosbatti-pwa
python -m http.server 5173
```

Poi apri nel browser:
- `http://localhost:5173`

Nota: la PWA completa (installazione + fotocamera) e' piu affidabile in HTTPS.

## Pubblicazione su GitHub Pages (consigliato)
1. Crea un repo su GitHub, ad esempio `zerosbatti-wallet-pwa`.
2. Carica dentro il repo **il contenuto di questa cartella**.
3. GitHub: `Settings` -> `Pages` -> `Deploy from a branch`
4. Branch: `main`, folder: `/ (root)` -> `Save`
5. Aspetta 1-2 minuti: avrai un link tipo `https://TUONOME.github.io/zerosbatti-wallet-pwa/`

## Installazione sul telefono
1. Apri il link su Chrome.
2. Menu (tre puntini) -> **Aggiungi a schermata Home** / **Installa app**.

## Offline
Dopo il primo caricamento, la PWA salva i file principali in cache (Service Worker) e le tessere in IndexedDB.
