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
const searchRow = document.getElementById("searchRow");
const searchInput = document.getElementById("searchInput");

const tabCards = document.getElementById("tabCards");
const tabInfo = document.getElementById("tabInfo");
const fabAdd = document.getElementById("fabAdd");

const btnCoffee = document.getElementById("btnCoffee");
btnCoffee.addEventListener("click", () => window.open(COFFEE_URL, "_blank", "noopener,noreferrer"));

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

function setActiveTab(tab) {
  tabCards.classList.toggle("tab--active", tab === "cards");
  tabInfo.classList.toggle("tab--active", tab === "info");
}

function showView(name) {
  Object.values(views).forEach((v) => v.classList.remove("view--active"));
  views[name].classList.add("view--active");
  setActiveTab(name === "info" ? "info" : "cards");
  fabAdd.style.display = name === "cards" ? "block" : "none";
}

tabCards.addEventListener("click", () => showView("cards"));
tabInfo.addEventListener("click", () => showView("info"));

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
      media.style.backgroundImage = `${th.bg2}, ${th.bg}`;
      const img = document.createElement("img");
      img.className = "carditem__img";
      img.alt = "";
      img.src = imgSrc;
      media.appendChild(img);
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
  // Preferred path: native BarcodeDetector (Chrome/Android).
  if ("BarcodeDetector" in window) {
    const bitmap = await createImageBitmap(file);
    const formats = ["qr_code", "code_128", "ean_13", "ean_8", "upc_a", "upc_e", "code_39"];
    // eslint-disable-next-line no-undef
    const detector = new BarcodeDetector({ formats });
    const results = await detector.detect(bitmap);
    const hit = results?.[0];
    return hit ? { code: hit.rawValue || "", format: hit.format || "" } : null;
  }

  // Fallback for iOS Safari: html5-qrcode (format may be unknown for still images).
  if (typeof window.Html5Qrcode !== "undefined") {
    const id = `scanfile_${Date.now()}`;
    const host = document.createElement("div");
    host.id = id;
    host.style.display = "none";
    document.body.appendChild(host);
    // eslint-disable-next-line no-undef
    const scanner = new Html5Qrcode(id);
    try {
      const decodedText = await scanner.scanFile(file, true);
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

  return null;
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

  const stop = () => {
    stopped = true;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    overlay.remove();
  };

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
    await video.play();
    markCameraPermissionGranted();
  } catch (e) {
    stop();
    alert("Permesso fotocamera negato o non disponibile.");
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
  };

  btnClose.addEventListener("click", () => void stop());

  const config = {
    fps: 10,
    // Comfortable scan window; works in portrait and landscape.
    qrbox: (vw, vh) => {
      const size = Math.floor(Math.min(vw, vh) * 0.72);
      return { width: size, height: size };
    },
    experimentalFeatures: {
      useBarCodeDetectorIfSupported: true
    }
  };

  return new Promise((resolve) => {
    const videoConstraints = {
      facingMode: "environment",
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30, max: 30 },
      advanced: [{ focusMode: "continuous" }, { zoom: 1.2 }]
    };

    scanner
      .start(
        videoConstraints,
        config,
        async (decodedText, decodedResult) => {
          if (!decodedText) return;
          const out = { code: String(decodedText), format: mapFormat(decodedResult) };
          resolve(out);
          await stop();
        },
        () => {}
      )
      .then(() => {
        markCameraPermissionGranted();
      })
      .catch(async () => {
        await stop();
        alert("Permesso fotocamera negato o non disponibile.");
        resolve(null);
      });

    // Best-effort iOS tuning: once the internal <video> appears, apply track constraints + slight zoom.
    (async () => {
      try {
        const host = overlay.querySelector("#scannerReader");
        const vid = await waitForSelector(host, "video", 3500);
        if (!vid) return;
        const s = vid.srcObject;
        const track = s?.getVideoTracks?.()[0] || null;
        if (track) {
          const opt = await optimizeVideoTrack(track, { fps: 30, zoom: 1.2, focusMode: "continuous" });
          if (!opt.zoomApplied) applyVideoCssZoom(vid, 1.2);
        } else {
          applyVideoCssZoom(vid, 1.2);
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
  // iOS Safari: prefer html5-qrcode for reliability (BarcodeDetector can be flaky across iOS versions).
  if (isIOS() && typeof window.Html5Qrcode !== "undefined") return openScannerHtml5Qrcode();
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

async function startScanner() {
  const perm = await queryCameraPermissionState();
  if (perm === "denied") {
    showCameraDeniedHelp();
    return null;
  }

  // If the browser says it's granted (or we have a previous successful start), start immediately.
  // Note: getUserMedia often still requires a user gesture on some platforms; in this app startScanner()
  // is invoked from a click flow, so it's safe.
  if (perm === "granted" || wasCameraPermissionGrantedBefore()) {
    return openScanner();
  }

  // "prompt"/unknown: try to start; browser will ask once if needed.
  return openScanner();
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

  const pickImage = async ({ outputMax, title, presetAspect }) => {
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
    return await openCropper({ dataUrl, outputMax, title, mime, presetAspect });
  };

  backdrop.querySelector("#pickLogo").onclick = async () => {
    const cropped = await pickImage({ presetAspect: "square", outputMax: 512, title: "Ritaglia logo" });
    if (cropped) {
      state.logoImage = cropped;
      refreshPvs();
    }
  };
  backdrop.querySelector("#pickBack").onclick = async () => {
    const cropped = await pickImage({ presetAspect: "85:55", outputMax: 1200, title: "Ritaglia retro" });
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

async function openCropper({ dataUrl, outputMax = 1200, title = "Ritaglia", mime = "image/jpeg", presetAspect = "free" }) {
  // Cropper.js integration (with EXIF orientation fix for iOS).
  // eslint-disable-next-line no-undef
  if (typeof Cropper === "undefined") {
    alert("Editor ritaglio non disponibile (Cropper.js non caricato).");
    return null;
  }

  const aspectRatio = (() => {
    if (presetAspect === "square") return 1;
    if (presetAspect === "85:55") return 85 / 55;
    if (presetAspect === "16:9") return 16 / 9;
    return NaN; // free
  })();

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

  // eslint-disable-next-line no-undef
  const cropper = new Cropper(imgEl, {
    aspectRatio,
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
    scalable: false
  });

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
    backdrop.querySelector("#cjRotateLeft").onclick = () => cropper.rotate(-90);
    backdrop.querySelector("#cjRotateRight").onclick = () => cropper.rotate(90);
    backdrop.querySelector("#cjReset").onclick = () => cropper.reset();
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

// Default landing
showView("cards");
loadCards();

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
