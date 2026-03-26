import { getAllCards, putCard, deleteCard, newId } from "./db.js";

const COFFEE_URL = "https://paa.ge/zerosbatti/en";

const views = {
  cards: document.getElementById("view-cards"),
  card: document.getElementById("view-card"),
  info: document.getElementById("view-info")
};

const cardsList = document.getElementById("cardsList");
const cardsEmpty = document.getElementById("cardsEmpty");

const btnSearch = document.getElementById("btnSearch");
const btnVoice = document.getElementById("btnVoice");
const btnInstall = document.getElementById("btnInstall");
const searchRow = document.getElementById("searchRow");
const searchInput = document.getElementById("searchInput");

const tabCards = document.getElementById("tabCards");
const tabInfo = document.getElementById("tabInfo");
const fabAdd = document.getElementById("fabAdd");

const btnCoffee = document.getElementById("btnCoffee");
btnCoffee.addEventListener("click", () => window.open(COFFEE_URL, "_blank", "noopener,noreferrer"));

const btnExport = document.getElementById("btnExport");
const btnImport = document.getElementById("btnImport");
const persistStatus = document.getElementById("persistStatus");

const btnBackToCards = document.getElementById("btnBackToCards");
btnBackToCards.addEventListener("click", () => showView("cards"));

const detailLogo = document.getElementById("detailLogo");
const detailName = document.getElementById("detailName");
const barcodeSvg = document.getElementById("barcodeSvg");
const codeText = document.getElementById("codeText");
const frontBackRow = document.getElementById("frontBackRow");
const detailFront = document.getElementById("detailFront");
const detailBack = document.getElementById("detailBack");
const btnEdit = document.getElementById("btnEdit");
const btnDelete = document.getElementById("btnDelete");

let allCards = [];
let activeCardId = null;

const splash = document.getElementById("splash");
function hideSplash() {
  if (!splash) return;
  splash.classList.add("splash--hidden");
  // Remove from DOM after fade out (avoid intercepting taps).
  window.setTimeout(() => splash.remove(), 400);
}

function setActiveTab(tab) {
  tabCards.classList.toggle("tab--active", tab === "cards");
  tabInfo.classList.toggle("tab--active", tab === "info");
}

function showView(name) {
  Object.values(views).forEach((v) => v.classList.remove("view--active"));
  views[name].classList.add("view--active");
  setActiveTab(name === "info" ? "info" : "cards");
  fabAdd.style.display = name === "cards" ? "block" : "none";
  if (name === "info") {
    void ensurePersistentStorage();
  }
}

tabCards.addEventListener("click", () => showView("cards"));
tabInfo.addEventListener("click", () => showView("info"));

let deferredInstallPrompt = null;
let lastInstallTapAt = 0;

// Resource killer: iOS can overheat if camera/video keeps running in background.
const activeCleanupFns = new Set();
function registerCleanup(fn) {
  if (typeof fn !== "function") return () => {};
  activeCleanupFns.add(fn);
  return () => activeCleanupFns.delete(fn);
}

async function killActiveResources(reason = "") {
  const fns = Array.from(activeCleanupFns);
  activeCleanupFns.clear();
  for (const fn of fns) {
    try {
      await fn();
    } catch {
      // ignore
    }
  }

  // Hard-stop any remaining <video> tracks just in case.
  try {
    document.querySelectorAll("video").forEach((v) => {
      const s = v.srcObject;
      try {
        s?.getTracks?.().forEach((t) => t.stop());
      } catch {
        // ignore
      }
      v.srcObject = null;
    });
  } catch {
    // ignore
  }

  // Remove scanner overlays if left behind.
  try {
    document.querySelectorAll(".scanner").forEach((el) => el.remove());
  } catch {
    // ignore
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) void killActiveResources("visibilitychange");
});
window.addEventListener("pagehide", () => void killActiveResources("pagehide"));

async function ensurePersistentStorage() {
  if (!persistStatus) return false;
  try {
    if (!navigator.storage || typeof navigator.storage.persisted !== "function") {
      persistStatus.textContent = "Protezione dati: non supportata su questo browser. Usa Esporta backup.";
      return false;
    }

    const already = await navigator.storage.persisted();
    if (already) {
      persistStatus.textContent = "Protezione dati: attiva (meno rischio di pulizia automatica).";
      return true;
    }

    if (typeof navigator.storage.persist !== "function") {
      persistStatus.textContent = "Protezione dati: non disponibile. Usa Esporta backup.";
      return false;
    }

    const granted = await navigator.storage.persist();
    persistStatus.textContent = granted
      ? "Protezione dati: attiva (meno rischio di pulizia automatica)."
      : "Protezione dati: non garantita. Usa Esporta backup.";
    return granted;
  } catch {
    persistStatus.textContent = "Protezione dati: non disponibile. Usa Esporta backup.";
    return false;
  }
}

function buildBackupPayload(cards) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    cards: Array.isArray(cards) ? cards : []
  };
}

function sanitizeImportedCard(raw) {
  const c = raw && typeof raw === "object" ? raw : {};
  return {
    id: typeof c.id === "string" && c.id ? c.id : newId(),
    name: typeof c.name === "string" ? c.name : "",
    code: typeof c.code === "string" ? c.code : "",
    format: typeof c.format === "string" ? c.format : "",
    logoImage: typeof c.logoImage === "string" ? c.logoImage : "",
    frontImage: typeof c.frontImage === "string" ? c.frontImage : "",
    backImage: typeof c.backImage === "string" ? c.backImage : ""
  };
}

if (btnExport) {
  btnExport.addEventListener("click", async () => {
    const cards = await getAllCards();
    const payload = buildBackupPayload(cards);
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `zerosbatti-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

if (btnImport) {
  btnImport.addEventListener("click", async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.click();
    const file = await new Promise((resolve) => {
      input.onchange = () => resolve(input.files?.[0] || null);
    });
    if (!file) return;

    let parsed = null;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      alert("File backup non valido (JSON).");
      return;
    }

    const cards = Array.isArray(parsed?.cards) ? parsed.cards : (Array.isArray(parsed) ? parsed : null);
    if (!cards) {
      alert("Backup non valido: manca la lista tessere.");
      return;
    }

    if (!confirm(`Importare ${cards.length} tessere? Se hanno lo stesso ID, verranno sovrascritte.`)) return;

    for (const raw of cards) {
      const c = sanitizeImportedCard(raw);
      if (!c.name || !c.code) continue;
      await putCard(c);
    }

    await loadCards();
    alert("Import completato.");
  });
}

function setInstallButtonVisible(visible) {
  if (!btnInstall) return;
  btnInstall.classList.toggle("hidden", !visible);
  btnInstall.disabled = !visible;
}

function openInstallHelpSheet() {
  const backdrop = document.createElement("div");
  backdrop.className = "sheet-backdrop";
  const ios = typeof isIOS === "function" ? isIOS() : /iphone|ipad|ipod/i.test(navigator.userAgent || "");
  backdrop.innerHTML = `
    <div class="sheet">
      <div class="sheet__title">Installa l'app</div>
      <div style="padding: 0 14px 14px; color: var(--muted); line-height: 1.4;">
        ${
          ios
            ? `Su iPhone/iPad non c'è un bottone "Installa" automatico.<br/><br/>
               1) Apri il link in <b>Safari</b><br/>
               2) Tocca <b>Condividi</b><br/>
               3) <b>Aggiungi alla schermata Home</b>`
            : `Su Android (Chrome):<br/><br/>
               1) Tocca il menu <b>⋮</b><br/>
               2) <b>Installa app</b> (o <b>Aggiungi a schermata Home</b>)`
        }
      </div>
      <button class="sheet__btn" data-action="close">Chiudi</button>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.remove();
  });
  backdrop.querySelector("[data-action='close']").onclick = () => backdrop.remove();
}

function updateInstallUi() {
  if (!btnInstall) return;
  if (typeof isStandaloneDisplayMode === "function" && isStandaloneDisplayMode()) {
    setInstallButtonVisible(false);
    return;
  }
  const ios = typeof isIOS === "function" ? isIOS() : /iphone|ipad|ipod/i.test(navigator.userAgent || "");
  // Android: show only if we actually have the prompt. iOS: show to display instructions.
  setInstallButtonVisible(ios || !!deferredInstallPrompt);
  if (ios && btnInstall) btnInstall.textContent = "Scarica";
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  updateInstallUi();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  updateInstallUi();
});

if (btnInstall) {
  const onInstallActivate = async (e) => {
    // Debounce (some mobile browsers fire both touch and click).
    const now = Date.now();
    if (now - lastInstallTapAt < 500) return;
    lastInstallTapAt = now;

    e?.preventDefault?.();
    e?.stopPropagation?.();

    if (typeof isStandaloneDisplayMode === "function" && isStandaloneDisplayMode()) return;
    if (deferredInstallPrompt) {
      try {
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
      } catch {
        // ignore
      } finally {
        deferredInstallPrompt = null;
        updateInstallUi();
      }
      return;
    }
    openInstallHelpSheet();
  };

  btnInstall.addEventListener("click", onInstallActivate);
  btnInstall.addEventListener("touchend", onInstallActivate, { passive: false });
}

btnSearch.addEventListener("click", () => {
  searchRow.classList.toggle("hidden");
  if (!searchRow.classList.contains("hidden")) {
    searchInput.focus();
  } else {
    searchInput.value = "";
    renderCards();
  }
});

searchInput.addEventListener("input", () => renderCards());

btnVoice.addEventListener("click", async () => {
  searchRow.classList.remove("hidden");
  const spoken = await tryVoiceSearch();
  if (spoken) {
    searchInput.value = spoken.trim();
    renderCards();
  } else {
    alert("Non ho capito il nome della tessera, riprova.");
  }
});

async function tryVoiceSearch() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  return new Promise((resolve) => {
    const rec = new SR();
    rec.lang = navigator.language || "it-IT";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => resolve(e.results?.[0]?.[0]?.transcript || null);
    rec.onerror = () => resolve(null);
    rec.onend = () => {};
    rec.start();
  });
}

function normalize(s) {
  return (s || "").toLowerCase().trim();
}

function hashString(s) {
  const str = String(s || "");
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function cardTheme(key) {
  const palettes = [
    [174, 214], // mint -> sky
    [196, 268], // mint -> lilac
    [18, 334], // peach -> pink
    [42, 194], // butter -> aqua
    [222, 282], // periwinkle -> lavender
    [155, 300], // seafoam -> orchid
    [30, 240] // sand -> blue
  ];
  const idx = hashString(key) % palettes.length;
  const [h1, h2] = palettes[idx];
  return {
    bg: `linear-gradient(135deg, hsl(${h1}, 70%, 86%), hsl(${h2}, 70%, 88%))`,
    bg2: `radial-gradient(160px 120px at 25% 25%, rgba(255,255,255,0.40), rgba(255,255,255,0) 60%),
          radial-gradient(180px 130px at 75% 75%, rgba(255,255,255,0.35), rgba(255,255,255,0) 60%)`
  };
}

function initialsFromName(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "";
  const first = parts[0][0] || "";
  const second = (parts[1]?.[0] || parts[0]?.[1] || "").trim();
  return (first + second).toUpperCase();
}

function renderCards() {
  const q = normalize(searchInput.value);
  const filtered = q ? allCards.filter((c) => normalize(c.name).includes(q)) : allCards;

  cardsEmpty.classList.toggle("hidden", filtered.length !== 0);
  cardsList.innerHTML = "";

  for (const card of filtered) {
    const name = String(card.name || "").trim() || "Tessera";
    const el = document.createElement("div");
    el.className = "carditem";
    el.innerHTML = `
      <div class="carditem__grid">
        <div class="carditem__media"></div>
        <div class="carditem__name">
          <div class="carditem__nameText"></div>
        </div>
      </div>
    `;
    const media = el.querySelector(".carditem__media");
    const imgSrc = card.logoImage || card.frontImage || "";
    if (imgSrc) {
      const th = cardTheme(card.id || name);
      // Use CSS background for consistent centering across browsers (some Android builds are flaky with object-fit).
      media.style.backgroundImage = `url("${imgSrc}"), ${th.bg2}, ${th.bg}`;
      media.style.backgroundRepeat = "no-repeat, no-repeat, no-repeat, no-repeat";
      media.style.backgroundPosition = "center, center, center, center";
      media.style.backgroundSize = "contain, auto, auto, auto";
    } else {
      const ph = document.createElement("div");
      ph.className = "carditem__ph";
      const th = cardTheme(card.id || name);
      ph.style.backgroundImage = `${th.bg2}, ${th.bg}`;
      ph.innerHTML = `
        <div class="carditem__phInit"></div>
        <div class="carditem__phName"></div>
      `;
      ph.querySelector(".carditem__phInit").textContent = initialsFromName(name);
      ph.querySelector(".carditem__phName").textContent = name;
      media.appendChild(ph);
    }

    el.querySelector(".carditem__nameText").textContent = name;
    el.addEventListener("click", () => openCard(card.id));
    cardsList.appendChild(el);
  }
}

function renderBarcode(card) {
  barcodeSvg.innerHTML = "";
  codeText.textContent = card.code || "";

  // Prefer QR if explicitly selected; otherwise render Code128 so it scans widely.
  const fmt = normalize(card.format || "");
  if (fmt === "qr") {
    if (typeof window.QRCode === "undefined") {
      barcodeSvg.innerHTML = "";
      return;
    }
    // qrcodejs renders into a DOM element; use a temporary container and then clone as an <img>.
    const tmp = document.createElement("div");
    tmp.style.display = "none";
    document.body.appendChild(tmp);
    tmp.innerHTML = "";
    // eslint-disable-next-line no-undef
    new QRCode(tmp, { text: card.code, width: 320, height: 320, correctLevel: QRCode.CorrectLevel.M });
    const canvas = tmp.querySelector("canvas");
    const img = tmp.querySelector("img");
    const dataUrl = canvas ? canvas.toDataURL("image/png") : (img ? img.src : "");
    if (dataUrl) {
      barcodeSvg.innerHTML = `<image href="${dataUrl}" width="100%" height="320" preserveAspectRatio="xMidYMid meet"></image>`;
    }
    tmp.remove();
    return;
  }

  try {
    if (typeof window.JsBarcode === "undefined") {
      return;
    }
    // eslint-disable-next-line no-undef
    JsBarcode(barcodeSvg, card.code, {
      format: "CODE128",
      displayValue: false,
      margin: 0,
      width: 2,
      height: 180
    });
  } catch {
    barcodeSvg.innerHTML = "";
  }
}

function openCard(id) {
  const card = allCards.find((c) => c.id === id);
  if (!card) return;

  activeCardId = id;
  detailName.textContent = card.name || "";

  if (card.logoImage) {
    detailLogo.src = card.logoImage;
    detailLogo.classList.remove("hidden");
  } else {
    detailLogo.classList.add("hidden");
  }

  renderBarcode(card);

  const hasFB = !!(card.frontImage || card.backImage);
  frontBackRow.classList.toggle("hidden", !hasFB);

  if (card.frontImage) {
    detailFront.src = card.frontImage;
    detailFront.classList.remove("hidden");
  } else {
    detailFront.classList.add("hidden");
  }

  if (card.backImage) {
    detailBack.src = card.backImage;
    detailBack.classList.remove("hidden");
  } else {
    detailBack.classList.add("hidden");
  }

  btnEdit.onclick = () => openManageSheet({ mode: "edit", card });
  btnDelete.onclick = async () => {
    if (!confirm(`Vuoi eliminare "${card.name}"?`)) return;
    await deleteCard(card.id);
    await loadCards();
    showView("cards");
  };

  showView("card");
}

function guessNameFromFilename(filename) {
  const base = normalize(filename || "");
  const brands = [
    "esselunga", "conad", "coop", "carrefour", "lidl", "penny", "eurospin", "bennet",
    "acqua", "sapone", "tigota", "sephora", "douglas", "kiko", "ikea", "leroy",
    "mediaworld", "unieuro", "euronics", "decathlon", "ovs", "h&m", "zara", "calzedonia",
    "intimissimi", "geox", "terranova", "italo", "trenitalia", "q8", "eni", "mcdonald"
  ];
  for (const b of brands) {
    if (base.includes(b)) return b.replace(/(^\\w)/, (m) => m.toUpperCase());
  }
  return "";
}

async function openManageSheet({ mode, card }) {
  const backdrop = document.createElement("div");
  backdrop.className = "sheet-backdrop";
  backdrop.innerHTML = `
    <div class="sheet">
      <div class="sheet__title">${mode === "edit" ? "Modifica tessera" : "Aggiungi tessera"}</div>
      <button class="sheet__btn" data-action="scan">Scansiona codice</button>
      <button class="sheet__btn" data-action="import">Importa da immagine</button>
      <button class="sheet__btn" data-action="manual">Inserisci manualmente</button>
      <button class="sheet__btn" data-action="cancel">Annulla</button>
    </div>
  `;
  document.body.appendChild(backdrop);

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.remove();
  });

  backdrop.querySelectorAll(".sheet__btn").forEach((b) => {
    b.addEventListener("click", async () => {
      const action = b.getAttribute("data-action");
      if (action === "cancel") {
        backdrop.remove();
        return;
      }
      backdrop.remove();
      await openManageFlow({ action, mode, card });
    });
  });
}

fabAdd.addEventListener("click", () => openManageSheet({ mode: "new", card: null }));

async function detectFromImageFile(file) {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent || "");

  const normalized = await normalizeImageFileForDecode(file);

  // Prefer ZXingBrowser via canvas decode for still images (more robust on iOS).
  if (typeof window.ZXingBrowser !== "undefined") {
    const url = URL.createObjectURL(normalized);
    // eslint-disable-next-line no-undef
    const reader = new ZXingBrowser.BrowserMultiFormatReader();
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("img_load_failed"));
      });

      const canvas = document.createElement("canvas");
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const max = 1400;
      const scale = Math.min(1, max / Math.max(w, h));
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const result = await reader.decodeFromCanvas(canvas);
      const text = result?.getText ? result.getText() : result?.text || "";
      const fmt = result?.getBarcodeFormat ? result.getBarcodeFormat() : null;
      const format = String(fmt || "").toLowerCase().includes("qr") ? "qr_code" : "";
      return text ? { code: String(text), format } : null;
    } catch {
      return null;
    } finally {
      try {
        reader.reset?.();
      } catch {
        // ignore
      }
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }
  }

  // iOS fallback: html5-qrcode scanFile.
  if (typeof window.Html5Qrcode !== "undefined") {
    const id = `scanfile_${Date.now()}`;
    const host = document.createElement("div");
    host.id = id;
    host.style.display = "none";
    document.body.appendChild(host);
    // eslint-disable-next-line no-undef
    const scanner = new Html5Qrcode(id);
    try {
      const decodedText = await scanner.scanFile(normalized, true);
      return decodedText ? { code: String(decodedText), format: "" } : null;
    } catch {
      return null;
    } finally {
      try {
        await scanner.clear();
      } catch {
        // ignore
      }
      host.remove();
    }
  }

  // Preferred path: native BarcodeDetector (Chrome/Android).
  if (!ios && "BarcodeDetector" in window) {
    const bitmap = await createImageBitmap(file);
    const formats = ["qr_code", "code_128", "ean_13", "ean_8", "upc_a", "upc_e", "code_39"];
    // eslint-disable-next-line no-undef
    const detector = new BarcodeDetector({ formats });
    const results = await detector.detect(bitmap);
    const hit = results?.[0];
    return hit ? { code: hit.rawValue || "", format: hit.format || "" } : null;
  }

  return null;
}

async function normalizeImageFileForDecode(file, maxSize = 1600) {
  // Some iOS camera images can be HEIC/very large; convert to a smaller JPEG for decoding.
  try {
    if (!file) return file;
    const type = (file.type || "").toLowerCase();
    const canKeep =
      type.includes("jpeg") || type.includes("jpg") || type.includes("png") || type.includes("webp") || type.includes("heic") || type.includes("heif");
    if (!canKeep) return file;

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("img_load_failed"));
    });
    URL.revokeObjectURL(url);

    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return file;

    const scale = Math.min(1, maxSize / Math.max(w, h));
    const outW = Math.max(1, Math.round(w * scale));
    const outH = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, outW, outH);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) return file;

    return new File([blob], "scan.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

async function openScannerBarcodeDetector() {
  const overlay = document.createElement("div");
  overlay.className = "scanner";
  overlay.innerHTML = `
    <div class="scanner__top">
      <div>Scansiona codice</div>
      <button class="btn" id="scannerClose">Chiudi</button>
    </div>
    <video class="scanner__video" playsinline></video>
    <div class="scanner__hint">Inquadra barcode o QR. La scansione è automatica.</div>
  `;
  document.body.appendChild(overlay);

  const video = overlay.querySelector("video");
  const btnClose = overlay.querySelector("#scannerClose");

  let stream = null;
  let stopped = false;
  let unregisterCleanup = null;

  const stop = () => {
    stopped = true;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    overlay.remove();
    if (unregisterCleanup) unregisterCleanup();
  };

  unregisterCleanup = registerCleanup(() => stop());
  btnClose.addEventListener("click", () => stop());

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        frameRate: { ideal: 30, max: 30 }
      },
      audio: false
    });
    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      // iOS can be picky; continue and let the tick loop wait for readyState.
    }
    markCameraPermissionGranted();
  } catch (e) {
    stop();
    showCameraStartError(e, { where: "openScannerBarcodeDetector.getUserMedia", constraints: { facingMode: "environment", frameRate: 30 } });
    return null;
  }

  try {
    const track = stream.getVideoTracks?.()[0] || null;
    if (track) {
      const opt = await optimizeVideoTrack(track, { fps: 30, zoom: 1.2, focusMode: "continuous" });
      if (!opt.zoomApplied) applyVideoCssZoom(video, 1.2);
    }
  } catch {
    // ignore
  }

  const formats = ["qr_code", "code_128", "ean_13", "ean_8", "upc_a", "upc_e", "code_39"];
  // eslint-disable-next-line no-undef
  const detector = new BarcodeDetector({ formats });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const tick = async () => {
    if (stopped) return;
    if (video.readyState >= 2) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      try {
        const results = await detector.detect(canvas);
        const hit = results?.[0];
        if (hit && hit.rawValue) {
          const out = { code: hit.rawValue, format: hit.format || "" };
          stop();
          return out;
        }
      } catch {
        // ignore
      }
    }
    return new Promise((r) => setTimeout(r, 120)).then(tick);
  };

  return tick();
}

async function openScannerZXingCanvasLoop() {
  // iOS-friendly live scanner: draw video frames to canvas and decode with ZXingBrowser
  // at a throttled interval (avoids html5-qrcode state machine issues on some iOS builds).
  // eslint-disable-next-line no-undef
  if (typeof ZXingBrowser === "undefined") return null;

  const overlay = document.createElement("div");
  overlay.className = "scanner";
  overlay.innerHTML = `
    <div class="scanner__top">
      <div>Scansiona codice</div>
      <button class="btn" id="scannerClose">Chiudi</button>
    </div>
    <video class="scanner__video" autoplay muted playsinline></video>
    <div class="scanner__hint">Inquadra barcode o QR. La scansione è automatica.</div>
  `;
  document.body.appendChild(overlay);

  const video = overlay.querySelector("video");
  const btnClose = overlay.querySelector("#scannerClose");

  let stream = null;
  let stopped = false;
  let unregisterCleanup = null;
  // eslint-disable-next-line no-undef
  const reader = new ZXingBrowser.BrowserMultiFormatReader();

  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      reader.reset?.();
    } catch {
      // ignore
    }
    if (stream) {
      try {
        stream.getTracks().forEach((t) => t.stop());
      } catch {
        // ignore
      }
    }
    try {
      video.srcObject = null;
    } catch {
      // ignore
    }
    overlay.remove();
    if (unregisterCleanup) unregisterCleanup();
  };

  unregisterCleanup = registerCleanup(() => stop());
  btnClose.addEventListener("click", () => stop());

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 }
      },
      audio: false
    });
    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      // ignore
    }
    markCameraPermissionGranted();
  } catch (e) {
    stop();
    showCameraStartError(e, { where: "openScannerZXingCanvasLoop.getUserMedia" });
    return null;
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const startedAt = Date.now();

  const tick = async () => {
    if (stopped) return null;
    if (Date.now() - startedAt > 20000) {
      stop();
      return null;
    }
    if (video.readyState >= 2) {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw && vh) {
        const maxW = 720;
        const scale = Math.min(1, maxW / vw);
        canvas.width = Math.max(1, Math.round(vw * scale));
        canvas.height = Math.max(1, Math.round(vh * scale));
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        try {
          const result = await reader.decodeFromCanvas(canvas);
          const text = result?.getText ? result.getText() : result?.text || "";
          const fmt = result?.getBarcodeFormat ? result.getBarcodeFormat() : "";
          if (text) {
            const out = { code: String(text), format: String(fmt).toLowerCase().includes("qr") ? "qr_code" : "" };
            stop();
            return out;
          }
        } catch {
          // Not found / decode error -> continue
        }
      }
    }
    await new Promise((r) => setTimeout(r, 250));
    return tick();
  };

  return tick();
}

async function openScannerPhotoCapture() {
  // Fallback: use native camera/photo picker (works even when getUserMedia is flaky on iOS),
  // then decode from the captured image.
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "sheet-backdrop";
    overlay.innerHTML = `
      <div class="sheet">
        <div class="sheet__title">Scansiona da foto</div>
        <div class="sheet__content">
          Se lo scanner live non funziona, puoi scattare una foto al codice e lo leggiamo da lì.
        </div>
        <div style="padding: 0 14px 14px;">
          <input id="scanPhotoInput" type="file" accept="image/*" capture="environment" style="width:100%;" />
        </div>
        <button class="sheet__btn" data-action="cancel">Annulla</button>
      </div>
    `;
    document.body.appendChild(overlay);

    const cleanup = () => overlay.remove();
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(null);
      }
    });
    overlay.querySelector("[data-action='cancel']").onclick = () => {
      cleanup();
      resolve(null);
    };

    const input = overlay.querySelector("#scanPhotoInput");
    input.addEventListener("change", async () => {
      const file = input.files?.[0] || null;
      if (!file) return;
      cleanup();
      try {
        const res = await detectFromImageFile(file);
        resolve(res);
      } catch {
        resolve(null);
      }
    });
  });
}

function applyVideoCssZoom(videoEl, scale) {
  if (!videoEl) return;
  const s = Number(scale) || 1;
  if (s <= 1) return;
  videoEl.style.transform = `scale(${s})`;
  videoEl.style.transformOrigin = "center center";
}

async function waitForSelector(rootEl, selector, timeoutMs = 2500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = rootEl.querySelector(selector);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

function clamp01(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

async function optimizeVideoTrack(track, { fps = 30, zoom = 1.2, focusMode = "continuous" } = {}) {
  const result = { focusApplied: false, zoomApplied: false, fpsApplied: false };
  if (!track || typeof track.applyConstraints !== "function") return result;

  const caps = typeof track.getCapabilities === "function" ? track.getCapabilities() : {};
  const adv = [];

  if (caps && caps.focusMode && Array.isArray(caps.focusMode) && caps.focusMode.includes(focusMode)) {
    adv.push({ focusMode });
  }

  if (caps && typeof caps.zoom === "object" && typeof zoom === "number") {
    const z = clamp01(zoom, caps.zoom.min ?? 1, caps.zoom.max ?? zoom);
    adv.push({ zoom: z });
  }

  const constraints = {};
  if (caps && caps.frameRate && typeof fps === "number") {
    constraints.frameRate = { ideal: fps, max: fps };
  } else if (typeof fps === "number") {
    constraints.frameRate = { ideal: fps, max: fps };
  }
  if (adv.length) constraints.advanced = adv;

  try {
    await track.applyConstraints(constraints);
  } catch {
    // Fallback: try only what we can, step-by-step.
    try {
      await track.applyConstraints({ frameRate: { ideal: fps, max: fps } });
    } catch {
      // ignore
    }
    try {
      await track.applyConstraints({ advanced: [{ focusMode }] });
    } catch {
      // ignore
    }
    try {
      await track.applyConstraints({ advanced: [{ zoom }] });
    } catch {
      // ignore
    }
  }

  // Re-read settings when possible.
  const settings = typeof track.getSettings === "function" ? track.getSettings() : {};
  result.fpsApplied = typeof settings.frameRate === "number" ? settings.frameRate <= fps + 0.5 : !!constraints.frameRate;
  result.zoomApplied = typeof settings.zoom === "number" ? settings.zoom >= 1.01 : adv.some((a) => "zoom" in a);
  result.focusApplied = typeof settings.focusMode === "string" ? settings.focusMode === focusMode : adv.some((a) => "focusMode" in a);
  return result;
}

async function openScannerHtml5Qrcode() {
  const overlay = document.createElement("div");
  overlay.className = "scanner";
  overlay.innerHTML = `
    <div class="scanner__top">
      <div>Scansiona codice</div>
      <button class="btn" id="scannerClose">Chiudi</button>
    </div>
    <div id="scannerReader" class="scanner__video"></div>
    <div class="scanner__hint">Inquadra barcode o QR. La scansione è automatica.</div>
  `;
  document.body.appendChild(overlay);

  const btnClose = overlay.querySelector("#scannerClose");
  let stopped = false;
  let finalize = null;
  let unregisterCleanup = null;

  const mapFormat = (decodedResult) => {
    const name =
      decodedResult?.result?.format?.formatName ||
      decodedResult?.result?.format?.format ||
      decodedResult?.result?.format ||
      decodedResult?.format?.formatName ||
      "";
    const s = String(name).toLowerCase();
    return s.includes("qr") ? "qr_code" : "code_128";
  };

  // Prefer explicit supported formats when available (helps 1D barcodes on some builds).
  let scanner = null;
  try {
    // eslint-disable-next-line no-undef
    const fmts =
      typeof Html5QrcodeSupportedFormats !== "undefined"
        ? [
            // eslint-disable-next-line no-undef
            Html5QrcodeSupportedFormats.QR_CODE,
            // eslint-disable-next-line no-undef
            Html5QrcodeSupportedFormats.CODE_128,
            // eslint-disable-next-line no-undef
            Html5QrcodeSupportedFormats.EAN_13,
            // eslint-disable-next-line no-undef
            Html5QrcodeSupportedFormats.EAN_8,
            // eslint-disable-next-line no-undef
            Html5QrcodeSupportedFormats.UPC_A,
            // eslint-disable-next-line no-undef
            Html5QrcodeSupportedFormats.UPC_E,
            // eslint-disable-next-line no-undef
            Html5QrcodeSupportedFormats.CODE_39,
            // eslint-disable-next-line no-undef
            Html5QrcodeSupportedFormats.ITF
          ]
        : null;
    // eslint-disable-next-line no-undef
    scanner = fmts ? new Html5Qrcode("scannerReader", { formatsToSupport: fmts }) : new Html5Qrcode("scannerReader");
  } catch {
    // eslint-disable-next-line no-undef
    scanner = new Html5Qrcode("scannerReader");
  }

  const stop = async () => {
    if (stopped) return;
    stopped = true;
    try {
      await scanner.stop();
    } catch {
      // ignore
    }
    try {
      await scanner.clear();
    } catch {
      // ignore
    }
    overlay.remove();
    if (unregisterCleanup) unregisterCleanup();
  };

  unregisterCleanup = registerCleanup(() => stop());
  btnClose.addEventListener("click", () => (finalize ? void finalize(null) : void stop()));

  const config = {
    fps: 6,
    // Comfortable scan window; works in portrait and landscape.
    qrbox: (vw, vh) => {
      const size = Math.floor(Math.min(vw, vh) * 0.62);
      return { width: size, height: size };
    },
    experimentalFeatures: {
      // On iOS this can increase CPU usage; keep decoding consistent.
      useBarCodeDetectorIfSupported: false
    }
  };

  return new Promise((resolve) => {
    let resolved = false;
    let timeoutId = null;
    const safeResolve = (val) => {
      if (resolved) return;
      resolved = true;
      if (timeoutId) clearTimeout(timeoutId);
      resolve(val);
    };

    finalize = async (val) => {
      safeResolve(val);
      await stop();
    };

    const onDecode = async (decodedText, decodedResult) => {
      if (!decodedText) return;
      await finalize({ code: String(decodedText), format: mapFormat(decodedResult) });
    };

    const resetScanner = async () => {
      try {
        await scanner.stop();
      } catch {
        // ignore
      }
      try {
        await scanner.clear();
      } catch {
        // ignore
      }
    };

    // iOS Safari can throw NotReadable/Overconstrained with "high" constraints.
    // Start with minimal constraints, then apply zoom/focus via applyConstraints once <video> exists.
    const attempts = [
      { facingMode: { ideal: "environment" }, frameRate: { ideal: 30, max: 30 } },
      { facingMode: "environment" },
      {}
    ];

    let attemptIndex = 0;
    const startAttempt = async () => {
      try {
        await scanner.start(attempts[attemptIndex], config, onDecode, () => {});
        markCameraPermissionGranted();
      } catch (e) {
        const name = e?.name || "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          await finalize(null);
          showCameraStartError(e, { where: "openScannerHtml5Qrcode.start", attemptIndex, constraints: attempts[attemptIndex] });
          return;
        }
        attemptIndex += 1;
        if (attemptIndex < attempts.length) {
          await resetScanner();
          await startAttempt();
          return;
        }
        await finalize(null);
        showCameraStartError(e, { where: "openScannerHtml5Qrcode.start", attemptIndex: attemptIndex - 1, constraints: attempts[attemptIndex - 1] });
      }
    };

    void startAttempt();

    // Hard timeout: avoid overheating if decoding never succeeds.
    timeoutId = setTimeout(() => {
      void finalize(null);
    }, 18000);

    // Best-effort iOS tuning: once the internal <video> appears, apply track constraints + slight zoom.
    (async () => {
      try {
        const host = overlay.querySelector("#scannerReader");
        const vid = await waitForSelector(host, "video", 3500);
        if (!vid) return;
        const s = vid.srcObject;
        const track = s?.getVideoTracks?.()[0] || null;
        if (track) {
          // Keep this light: iOS can heat up quickly with aggressive constraints.
          const opt = await optimizeVideoTrack(track, { fps: 30, zoom: 1.1, focusMode: "continuous" });
          // Avoid CSS zoom fallback on iOS (can increase GPU/CPU usage).
          if (!opt.zoomApplied) {
            // no-op
          }
        }
      } catch {
        // ignore
      }
    })();
  });
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent || "");
}

async function openScanner() {
  // iOS: prefer html5-qrcode for reliability and lower CPU usage.
  if (isIOS()) {
    if (typeof window.ZXingBrowser !== "undefined") return openScannerZXingCanvasLoop();
    if (typeof window.Html5Qrcode !== "undefined") return openScannerHtml5Qrcode();
    if ("BarcodeDetector" in window) return openScannerBarcodeDetector();
  }
  // Chrome/Android
  if ("BarcodeDetector" in window) return openScannerBarcodeDetector();
  // iOS Safari fallback
  if (typeof window.Html5Qrcode !== "undefined") return openScannerHtml5Qrcode();
  alert("Scanner non supportato su questo browser.");
  return null;
}

function isStandaloneDisplayMode() {
  // iOS uses navigator.standalone; others use display-mode media query.
  // eslint-disable-next-line no-undef
  if (typeof navigator !== "undefined" && "standalone" in navigator) return !!navigator.standalone;
  return window.matchMedia?.("(display-mode: standalone)")?.matches || false;
}

async function queryCameraPermissionState() {
  try {
    if (!navigator.permissions || typeof navigator.permissions.query !== "function") return "unknown";
    // Spec name is "camera". Some browsers may throw; we handle that.
    const res = await navigator.permissions.query({ name: "camera" });
    return res?.state || "unknown"; // "granted" | "denied" | "prompt"
  } catch {
    return "unknown";
  }
}

function markCameraPermissionGranted() {
  try {
    localStorage.setItem("zerosbatti_cam_granted", "1");
  } catch {
    // ignore
  }
}

function wasCameraPermissionGrantedBefore() {
  try {
    return localStorage.getItem("zerosbatti_cam_granted") === "1";
  } catch {
    return false;
  }
}

function showCameraDeniedHelp() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent || "");
  if (ios && !isStandaloneDisplayMode()) {
    alert(
      "Permesso fotocamera negato.\n\nSu iPhone conviene installare la PWA (Aggiungi alla schermata Home): iOS tende a ricordare meglio i permessi rispetto a Safari.\n\nPoi abilita la fotocamera per questo sito in Impostazioni -> Safari -> Fotocamera (o Impostazioni -> Privacy -> Fotocamera)."
    );
    return;
  }
  alert(
    "Permesso fotocamera negato.\n\nAbilita la fotocamera per questo sito nelle impostazioni del browser (Permessi sito) e riprova."
  );
}

function collectCameraDebugInfo(context = {}) {
  const ua = navigator.userAgent || "";
  const info = {
    when: new Date().toISOString(),
    standalone: isStandaloneDisplayMode(),
    ios: /iphone|ipad|ipod/i.test(ua),
    ua,
    mediaDevices: !!navigator.mediaDevices,
    getUserMedia: typeof navigator.mediaDevices?.getUserMedia === "function",
    permissionsApi: !!navigator.permissions,
    context
  };
  return info;
}

function showCameraErrorSheet({ message, err, context }) {
  const debug = collectCameraDebugInfo(context);
  const name = err?.name || "";
  const detail = {
    ...debug,
    error: { name, message: err?.message || String(err || "") }
  };
  const detailText = JSON.stringify(detail, null, 2);

  const backdrop = document.createElement("div");
  backdrop.className = "sheet-backdrop";
  backdrop.innerHTML = `
    <div class="sheet">
      <div class="sheet__title">Fotocamera</div>
      <div class="sheet__content">
        ${message}
        <div style="margin-top:10px; font-size:12px; opacity:0.95;">
          Dettagli tecnici (copiali e mandameli):
        </div>
        <pre style="white-space:pre-wrap; word-break:break-word; background:rgba(0,0,0,0.04); padding:10px; border-radius:12px; border:1px solid rgba(0,0,0,0.06); max-height: 220px; overflow:auto; font-size:11px;">${detailText}</pre>
        <div style="display:flex; gap:10px; margin-top:10px;">
          <button class="btn" id="camCopy" type="button">Copia dettagli</button>
          <button class="btn btn--cta" id="camOk" type="button">OK</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.remove();
  });
  backdrop.querySelector("#camOk").onclick = () => backdrop.remove();
  backdrop.querySelector("#camCopy").onclick = async () => {
    try {
      await navigator.clipboard.writeText(detailText);
      backdrop.querySelector("#camCopy").textContent = "Copiato";
      setTimeout(() => (backdrop.querySelector("#camCopy").textContent = "Copia dettagli"), 1200);
    } catch {
      // Fallback: select text
      alert("Copia non disponibile. Fai uno screenshot dei dettagli.");
    }
  };
}

function showCameraStartError(err, context = {}) {
  const name = err?.name || "";
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent || "");
  try {
    // Always log for remote debugging via iOS Safari inspector.
    // eslint-disable-next-line no-console
    console.error("[camera] start error", { name, message: err?.message, context, err });
  } catch {
    // ignore
  }

  if (name === "NotAllowedError" || name === "SecurityError") {
    showCameraDeniedHelp();
    return;
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    const msg = "Fotocamera non trovata o non disponibile su questo dispositivo.";
    if (ios) showCameraErrorSheet({ message: msg, err, context });
    else alert(msg);
    return;
  }
  if (name === "NotReadableError" || name === "AbortError") {
    const msg =
      "Fotocamera non avviabile.\n\nChiudi altre app che usano la fotocamera (WhatsApp/Instagram ecc.), poi riprova. Se non va, riavvia l'iPhone.";
    if (ios) showCameraErrorSheet({ message: msg.replace(/\n/g, "<br/>"), err, context });
    else alert(msg);
    return;
  }
  const msg = "Fotocamera non disponibile.";
  if (ios) showCameraErrorSheet({ message: msg, err, context });
  else alert(msg);
}

async function startScanner() {
  const perm = await queryCameraPermissionState();
  if (perm === "denied") {
    showCameraDeniedHelp();
    return null;
  }

  // If the browser says it's granted (or we have a previous successful start), start immediately.
  // Note: getUserMedia often still requires a user gesture on some platforms; in this app startScanner()
  // is invoked from a click flow, so it's safe.
  const result = await openScanner();
  if (result) return result;

  // iOS fallback: allow scanning from a captured photo if live camera is not available
  // OR if live scanning timed out (to reduce overheating).
  if (isIOS()) {
    const ok = confirm(
      "Non riesco ad avviare/leggere dallo scanner live su questo iPhone.\n\nVuoi scansionare scattando una foto al barcode/QR?"
    );
    if (!ok) return null;
    return openScannerPhotoCapture();
  }

  return null;
}

async function openManageFlow({ action, mode, card }) {
  const id = mode === "edit" ? card.id : newId();
  const state = {
    id,
    name: mode === "edit" ? card.name : "",
    code: mode === "edit" ? card.code : "",
    format: mode === "edit" ? card.format : "",
    logoImage: mode === "edit" ? card.logoImage : "",
    frontImage: mode === "edit" ? card.frontImage : "",
    backImage: mode === "edit" ? card.backImage : ""
  };

  let detection = null;
  if (action === "scan") {
    detection = await startScanner();
  } else if (action === "import") {
    detection = await pickAndDetectImage(state);
  }

  if (detection && detection.code) {
    state.code = detection.code;
    state.format = detection.format === "qr_code" ? "qr" : "code128";
  }

  await openEditor(state);
}

async function pickAndDetectImage(state) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.click();

  const file = await new Promise((resolve) => {
    input.onchange = () => resolve(input.files?.[0] || null);
  });
  if (!file) return null;

  // Try to detect code from image.
  const det = await detectFromImageFile(file);
  if (det && det.code) {
    // Auto-name guess from file name.
    if (!state.name) state.name = guessNameFromFilename(file.name);
  }
  return det;
}

async function openEditor(state) {
  // Very simple editor modal (name + code + format + images).
  const backdrop = document.createElement("div");
  backdrop.className = "sheet-backdrop";
  backdrop.innerHTML = `
    <div class="sheet" style="max-height: 86vh; overflow:auto;">
      <div class="sheet__title">Dati tessera</div>
      <div style="padding: 0 14px 14px;">
        <label style="display:block; font-weight:800; margin:8px 0 6px;">Nome tessera</label>
        <input id="edName" class="search" type="text" placeholder="Nome tessera (es. Esselunga)" />

        <label style="display:block; font-weight:800; margin:12px 0 6px;">Codice</label>
        <input id="edCode" class="search" type="text" placeholder="Codice barcode / QR" />

        <label style="display:block; font-weight:800; margin:12px 0 6px;">Formato</label>
        <select id="edFormat" class="search">
          <option value="code128">Barcode (Code 128)</option>
          <option value="qr">QR Code</option>
        </select>

        <div class="pickrow" style="margin-top:14px;">
          <button type="button" class="pickcard pickcard--accent" id="pickLogo">
            <div class="pickcard__label">Logo</div>
            <div class="pv pickcard__pv pickcard__pv--square" id="pvLogoWrap">
              <img id="pvLogoImg" class="pv__img" alt="" />
              <div class="pv__ph">
                <div class="pv__init" id="pvLogoInit"></div>
                <div class="pv__name" id="pvLogoName"></div>
              </div>
            </div>
          </button>

          <button type="button" class="pickcard pickcard--accent" id="pickBack">
            <div class="pickcard__label">Retro</div>
            <div class="pv pickcard__pv" id="pvBackWrap">
              <img id="pvBackImg" class="pv__img" alt="" />
              <div class="pv__ph">
                <div class="pv__init" id="pvBackInit"></div>
                <div class="pv__name" id="pvBackName"></div>
              </div>
            </div>
          </button>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:14px;">
          <button class="btn" id="btnCancel">Annulla</button>
          <button class="btn btn--cta" id="btnSave">Salva</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const edName = backdrop.querySelector("#edName");
  const edCode = backdrop.querySelector("#edCode");
  const edFormat = backdrop.querySelector("#edFormat");
  const pvLogoWrap = backdrop.querySelector("#pvLogoWrap");
  const pvLogoImg = backdrop.querySelector("#pvLogoImg");
  const pvLogoInit = backdrop.querySelector("#pvLogoInit");
  const pvLogoName = backdrop.querySelector("#pvLogoName");
  const pvBackWrap = backdrop.querySelector("#pvBackWrap");
  const pvBackImg = backdrop.querySelector("#pvBackImg");
  const pvBackInit = backdrop.querySelector("#pvBackInit");
  const pvBackName = backdrop.querySelector("#pvBackName");

  edName.value = state.name || "";
  edCode.value = state.code || "";
  edFormat.value = state.format || "code128";

  const renderPv = ({ wrap, imgEl, initEl, nameEl, imageData, key, name }) => {
    const label = String(name || "").trim() || "Tessera";
    const th = cardTheme(key || label);
    wrap.style.backgroundImage = `${th.bg2}, ${th.bg}`;
    initEl.textContent = initialsFromName(label);
    nameEl.textContent = label;
    if (imageData) {
      imgEl.src = imageData;
      wrap.classList.add("pv--hasimg");
    } else {
      imgEl.removeAttribute("src");
      wrap.classList.remove("pv--hasimg");
    }
  };

  const refreshPvs = () => {
    renderPv({
      wrap: pvLogoWrap,
      imgEl: pvLogoImg,
      initEl: pvLogoInit,
      nameEl: pvLogoName,
      imageData: state.logoImage,
      key: state.id + "_logo",
      name: edName.value
    });
    renderPv({
      wrap: pvBackWrap,
      imgEl: pvBackImg,
      initEl: pvBackInit,
      nameEl: pvBackName,
      imageData: state.backImage,
      key: state.id + "_back",
      name: edName.value
    });
  };
  refreshPvs();
  edName.addEventListener("input", () => refreshPvs());

  const resizeImageDataUrlToMax = async ({ dataUrl, max = 1200, mime = "image/jpeg" }) => {
    const img = await loadImage(dataUrl);
    const w = img.naturalWidth || 1;
    const h = img.naturalHeight || 1;
    const scale = Math.min(1, max / Math.max(w, h));
    const outW = Math.max(1, Math.round(w * scale));
    const outH = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    if (mime !== "image/png") {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, outW, outH);
    }
    ctx.drawImage(img, 0, 0, outW, outH);
    return mime === "image/png" ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.9);
  };

  const openPhotoAcquiredSheet = async () => {
    const sheet = document.createElement("div");
    sheet.className = "sheet-backdrop";
    sheet.innerHTML = `
      <div class="sheet">
        <div class="sheet__title">Foto acquisita</div>
        <button class="sheet__btn" data-action="edit">Modifica foto (ritaglio)</button>
        <button class="sheet__btn sheet__btn--cta" data-action="use">Usa senza modifiche</button>
        <button class="sheet__btn" data-action="cancel">Annulla</button>
      </div>
    `;
    document.body.appendChild(sheet);

    sheet.addEventListener("click", (e) => {
      if (e.target === sheet) sheet.remove();
    });

    return await new Promise((resolve) => {
      sheet.querySelectorAll(".sheet__btn").forEach((b) => {
        b.addEventListener("click", () => {
          const action = b.getAttribute("data-action");
          sheet.remove();
          resolve(action === "edit" || action === "use" ? action : null);
        });
      });
    });
  };

  const pickImage = async ({ outputMax, title }) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.click();
    const file = await new Promise((resolve) => (input.onchange = () => resolve(input.files?.[0] || null)));
    if (!file) return null;
    const dataUrl = await fileToDataUrl(file);
    const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
    const choice = await openPhotoAcquiredSheet();
    if (!choice) return null;
    if (choice === "use") {
      return await resizeImageDataUrlToMax({ dataUrl, max: outputMax, mime });
    }
    return await openCropper({ dataUrl, outputMax, title, mime });
  };

  backdrop.querySelector("#pickLogo").onclick = async () => {
    const cropped = await pickImage({ outputMax: 512, title: "Ritaglia logo" });
    if (cropped) {
      state.logoImage = cropped;
      refreshPvs();
    }
  };
  backdrop.querySelector("#pickBack").onclick = async () => {
    const cropped = await pickImage({ outputMax: 1200, title: "Ritaglia retro" });
    if (cropped) {
      state.backImage = cropped;
      refreshPvs();
    }
  };

  backdrop.querySelector("#btnCancel").onclick = () => backdrop.remove();
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.remove();
  });

  backdrop.querySelector("#btnSave").onclick = async () => {
    const name = edName.value.trim();
    const code = edCode.value.trim();
    if (!name || !code) {
      alert("Inserisci nome tessera e codice barcode.");
      return;
    }
    state.name = name;
    state.code = code;
    state.format = edFormat.value;
    await putCard(state);
    backdrop.remove();
    await loadCards();
    showView("cards");
  };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = dataUrl;
  });
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

async function openCropper({ dataUrl, outputMax = 1200, title = "Ritaglia", mime = "image/jpeg" }) {
  // Cropper.js integration (with EXIF orientation fix for iOS).
  // eslint-disable-next-line no-undef
  if (typeof Cropper === "undefined") {
    alert("Editor ritaglio non disponibile (Cropper.js non caricato).");
    return null;
  }

  const backdrop = document.createElement("div");
  backdrop.className = "cropjs-backdrop";
  backdrop.innerHTML = `
    <div class="cropjs">
      <div class="cropjs__top">
        <button class="cropjs__icon" id="cjClose" type="button">←</button>
        <div class="cropjs__title"></div>
        <div class="cropjs__spacer"></div>
      </div>

      <div class="cropjs__stage">
        <img id="cjImg" alt="" />
      </div>

      <div class="cropjs__bar">
        <button class="cropjs__btn" id="cjRotateLeft" type="button">⟲</button>
        <button class="cropjs__btn" id="cjRotateRight" type="button">⟳</button>
        <button class="cropjs__btn" id="cjReset" type="button">Reset</button>
        <input class="cropjs__zoom" id="cjZoom" type="range" min="1" max="3" step="0.01" value="1" />
      </div>

      <div class="cropjs__footer">
        <button class="btn" id="cjCancel" type="button">Annulla</button>
        <button class="btn btn--cta" id="cjOk" type="button">Conferma</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const titleEl = backdrop.querySelector(".cropjs__title");
  titleEl.textContent = title;

  const imgEl = backdrop.querySelector("#cjImg");
  imgEl.src = dataUrl;
  const zoomEl = backdrop.querySelector("#cjZoom");

  // eslint-disable-next-line no-undef
  const cropper = new Cropper(imgEl, {
    aspectRatio: NaN, // always free (no "Quadrato" option)
    viewMode: 1,
    dragMode: "move",
    autoCropArea: 0.92,
    responsive: true,
    background: false,
    guides: true,
    center: true,
    highlight: true,
    checkOrientation: true,
    zoomOnTouch: true,
    zoomOnWheel: false,
    movable: true,
    rotatable: true,
    scalable: false,
    toggleDragModeOnDblclick: false,
    ready() {
      computeBaseZoom();
      zoomEl.value = "1";
    }
  });

  let baseZoom = 1;
  const computeBaseZoom = () => {
    try {
      const imgData = cropper.getImageData();
      if (imgData?.naturalWidth && imgData?.width) {
        baseZoom = imgData.width / imgData.naturalWidth;
      } else {
        baseZoom = 1;
      }
    } catch {
      baseZoom = 1;
    }
  };
  const cleanup = () => {
    try {
      cropper.destroy();
    } catch {
      // ignore
    }
    backdrop.remove();
  };

  const toDataUrl = async () => {
    const canvas = cropper.getCroppedCanvas({
      maxWidth: outputMax,
      maxHeight: outputMax,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
      fillColor: mime === "image/png" ? "transparent" : "#ffffff"
    });
    if (!canvas) return null;
    const targetMime = "image/jpeg";
    return canvas.toDataURL(targetMime, 0.8);
  };

  return await new Promise((resolve) => {
    backdrop.querySelector("#cjClose").onclick = () => {
      cleanup();
      resolve(null);
    };
    backdrop.querySelector("#cjCancel").onclick = () => {
      cleanup();
      resolve(null);
    };
    backdrop.querySelector("#cjRotateLeft").onclick = () => {
      cropper.rotate(-90);
      computeBaseZoom();
      zoomEl.value = "1";
    };
    backdrop.querySelector("#cjRotateRight").onclick = () => {
      cropper.rotate(90);
      computeBaseZoom();
      zoomEl.value = "1";
    };
    backdrop.querySelector("#cjReset").onclick = () => {
      cropper.reset();
      computeBaseZoom();
      zoomEl.value = "1";
    };
    zoomEl.addEventListener("input", () => {
      const v = Number(zoomEl.value) || 1;
      try {
        cropper.zoomTo(baseZoom * v);
      } catch {
        // ignore
      }
    });
    backdrop.querySelector("#cjOk").onclick = async () => {
      const out = await toDataUrl();
      cleanup();
      resolve(out);
    };
  });
}

async function loadCards() {
  allCards = await getAllCards();
  allCards.sort((a, b) => (a.name || "").localeCompare(b.name || "", navigator.language, { sensitivity: "base" }));
  renderCards();
}

async function bootstrap() {
  showView("cards");
  try {
    await loadCards();
  } finally {
    hideSplash();
  }
  updateInstallUi();
}

bootstrap();

// PWA SW
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

// card deep link (kept simple)
window.addEventListener("popstate", () => {
  showView("cards");
});
