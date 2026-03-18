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
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    video.srcObject = stream;
    await video.play();
  } catch (e) {
    stop();
    alert("Permesso fotocamera negato o non disponibile.");
    return null;
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

  // eslint-disable-next-line no-undef
  const scanner = new Html5Qrcode("scannerReader");

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
    }
  };

  return new Promise((resolve) => {
    scanner
      .start(
        { facingMode: "environment" },
        config,
        async (decodedText, decodedResult) => {
          if (!decodedText) return;
          const out = { code: String(decodedText), format: mapFormat(decodedResult) };
          resolve(out);
          await stop();
        },
        () => {}
      )
      .catch(async () => {
        await stop();
        alert("Permesso fotocamera negato o non disponibile.");
        resolve(null);
      });
  });
}

async function openScanner() {
  // Chrome/Android
  if ("BarcodeDetector" in window) return openScannerBarcodeDetector();
  // iOS Safari fallback
  if (typeof window.Html5Qrcode !== "undefined") return openScannerHtml5Qrcode();
  alert("Scanner non supportato su questo browser.");
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
    detection = await openScanner();
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

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:14px;">
          <button class="btn" id="btnSetLogo">Logo</button>
          <button class="btn" id="btnSetFront">Fronte</button>
        </div>
        <div class="pvrow" style="margin-top:10px;">
          <div class="pv" id="pvLogoWrap">
            <img id="pvLogoImg" class="pv__img" alt="" />
            <div class="pv__ph">
              <div class="pv__init" id="pvLogoInit"></div>
              <div class="pv__name" id="pvLogoName"></div>
            </div>
          </div>
          <div class="pv" id="pvFrontWrap">
            <img id="pvFrontImg" class="pv__img" alt="" />
            <div class="pv__ph">
              <div class="pv__init" id="pvFrontInit"></div>
              <div class="pv__name" id="pvFrontName"></div>
            </div>
          </div>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:14px;">
          <button class="btn btn--cta" id="btnSave">Salva</button>
          <button class="btn" id="btnCancel">Annulla</button>
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
  const pvFrontWrap = backdrop.querySelector("#pvFrontWrap");
  const pvFrontImg = backdrop.querySelector("#pvFrontImg");
  const pvFrontInit = backdrop.querySelector("#pvFrontInit");
  const pvFrontName = backdrop.querySelector("#pvFrontName");

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
      wrap: pvFrontWrap,
      imgEl: pvFrontImg,
      initEl: pvFrontInit,
      nameEl: pvFrontName,
      imageData: state.frontImage,
      key: state.id + "_front",
      name: edName.value
    });
  };
  refreshPvs();
  edName.addEventListener("input", () => refreshPvs());

  const pickImage = async ({ outputMax, title, presetAspect }) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.click();
    const file = await new Promise((resolve) => (input.onchange = () => resolve(input.files?.[0] || null)));
    if (!file) return null;
    const dataUrl = await fileToDataUrl(file);
    const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
    return await openCropper({ dataUrl, outputMax, title, mime, presetAspect });
  };

  backdrop.querySelector("#btnSetLogo").onclick = async () => {
    const cropped = await pickImage({ presetAspect: "square", outputMax: 512, title: "Ritaglia logo" });
    if (cropped) {
      state.logoImage = cropped;
      refreshPvs();
    }
  };
  backdrop.querySelector("#btnSetFront").onclick = async () => {
    const cropped = await pickImage({ presetAspect: "free", outputMax: 1200, title: "Ritaglia foto" });
    if (cropped) {
      state.frontImage = cropped;
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
  let working = await loadImage(dataUrl);
  let aspectMode = presetAspect; // "free" | "square" | "16:9"

  const backdrop = document.createElement("div");
  backdrop.className = "cropper-backdrop";
  backdrop.innerHTML = `
    <div class="cropper">
      <div class="cropper__header">
        <div class="cropper__title"></div>
      </div>
      <div class="cropper__tools">
        <button class="cropper__toolbtn" id="cropRotateLeft" type="button">⟲</button>
        <button class="cropper__toolbtn" id="cropRotateRight" type="button">⟳</button>
        <select class="cropper__select" id="cropAspect">
          <option value="free">Libero</option>
          <option value="square">Quadrato</option>
          <option value="16:9">16:9</option>
        </select>
      </div>
      <div class="cropper__body">
        <div class="cropper__viewport">
          <img class="cropper__img" alt="" />
          <div class="cropper__crop" id="cropBox">
            <div class="cropper__handle cropper__handle--tl" data-h="tl"></div>
            <div class="cropper__handle cropper__handle--tr" data-h="tr"></div>
            <div class="cropper__handle cropper__handle--bl" data-h="bl"></div>
            <div class="cropper__handle cropper__handle--br" data-h="br"></div>
          </div>
        </div>
        <div class="cropper__hint">Trascina per spostare • Ridimensiona gli angoli • Ruota se serve</div>
        <input class="cropper__zoom" type="range" min="1" max="3" step="0.01" value="1" />
      </div>
      <div class="cropper__footer">
        <button class="btn" id="cropCancel">Annulla</button>
        <button class="btn btn--cta" id="cropOk">Usa</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  const viewport = backdrop.querySelector(".cropper__viewport");
  const imgEl = backdrop.querySelector(".cropper__img");
  const zoomEl = backdrop.querySelector(".cropper__zoom");
  const titleEl = backdrop.querySelector(".cropper__title");
  const cropBox = backdrop.querySelector("#cropBox");
  const aspectSel = backdrop.querySelector("#cropAspect");
  titleEl.textContent = title;
  imgEl.src = dataUrl;
  aspectSel.value = aspectMode;

  await new Promise((r) => requestAnimationFrame(r));
  const vb = viewport.getBoundingClientRect();
  const vw = vb.width;
  const vh = vb.height;

  const coverScale = () => Math.max(vw / working.naturalWidth, vh / working.naturalHeight);
  let scale = coverScale;
  let x = (vw - working.naturalWidth * scale) / 2;
  let y = (vh - working.naturalHeight * scale) / 2;

  const aspectValue = () => {
    if (aspectMode === "square") return 1;
    if (aspectMode === "16:9") return 16 / 9;
    return 0;
  };

  let crop = { x: vw * 0.07, y: vh * 0.14, w: vw * 0.86, h: vh * 0.72 };
  const normalizeCrop = () => {
    const a = aspectValue();
    if (a) {
      // Keep within viewport while enforcing aspect.
      const maxW = vw * 0.92;
      const maxH = vh * 0.78;
      let w = maxW;
      let h = w / a;
      if (h > maxH) {
        h = maxH;
        w = h * a;
      }
      crop.w = w;
      crop.h = h;
      crop.x = (vw - w) / 2;
      crop.y = (vh - h) / 2;
    } else {
      crop = { x: vw * 0.07, y: vh * 0.14, w: vw * 0.86, h: vh * 0.72 };
    }
  };
  normalizeCrop();

  const apply = () => {
    const rw = working.naturalWidth * scale;
    const rh = working.naturalHeight * scale;
    x = clamp(x, vw - rw, 0);
    y = clamp(y, vh - rh, 0);
    imgEl.style.width = `${rw}px`;
    imgEl.style.height = `${rh}px`;
    imgEl.style.transform = `translate(${x}px, ${y}px)`;
  };
  const applyCrop = () => {
    crop.x = clamp(crop.x, 0, vw - crop.w);
    crop.y = clamp(crop.y, 0, vh - crop.h);
    crop.w = clamp(crop.w, 60, vw - crop.x);
    crop.h = clamp(crop.h, 60, vh - crop.y);
    cropBox.style.left = `${crop.x}px`;
    cropBox.style.top = `${crop.y}px`;
    cropBox.style.width = `${crop.w}px`;
    cropBox.style.height = `${crop.h}px`;
  };
  apply();
  applyCrop();

  const zoomTo = (factor) => {
    const newScale = coverScale() * factor;
    const fx = crop.x + crop.w / 2;
    const fy = crop.y + crop.h / 2;
    const cx = (fx - x) / scale;
    const cy = (fy - y) / scale;
    scale = newScale;
    x = fx - cx * scale;
    y = fy - cy * scale;
    apply();
  };
  zoomEl.addEventListener("input", () => zoomTo(Number(zoomEl.value)));

  const hitTestCrop = (clientX, clientY) => {
    const rx = clientX - vb.left;
    const ry = clientY - vb.top;
    if (rx >= crop.x && rx <= crop.x + crop.w && ry >= crop.y && ry <= crop.y + crop.h) return { rx, ry, inside: true };
    return { rx, ry, inside: false };
  };

  let mode = null; // "pan" | "moveCrop" | "resizeCrop"
  let handle = "";
  let startX = 0;
  let startY = 0;
  let baseX = 0;
  let baseY = 0;
  let baseCrop = null;

  cropBox.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const t = e.target;
    const h = t?.getAttribute?.("data-h") || "";
    mode = h ? "resizeCrop" : "moveCrop";
    handle = h;
    cropBox.setPointerCapture(e.pointerId);
    startX = e.clientX;
    startY = e.clientY;
    baseCrop = { ...crop };
  });

  cropBox.addEventListener("pointermove", (e) => {
    if (!mode) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const a = aspectValue();

    if (mode === "moveCrop") {
      crop.x = baseCrop.x + dx;
      crop.y = baseCrop.y + dy;
      applyCrop();
      return;
    }

    if (mode === "resizeCrop") {
      let nx = baseCrop.x;
      let ny = baseCrop.y;
      let nw = baseCrop.w;
      let nh = baseCrop.h;

      if (handle.includes("r")) nw = baseCrop.w + dx;
      if (handle.includes("l")) {
        nw = baseCrop.w - dx;
        nx = baseCrop.x + dx;
      }
      if (handle.includes("b")) nh = baseCrop.h + dy;
      if (handle.includes("t")) {
        nh = baseCrop.h - dy;
        ny = baseCrop.y + dy;
      }

      const min = 70;
      nw = Math.max(min, nw);
      nh = Math.max(min, nh);

      if (a) {
        // lock ratio using dominant change
        const want = nw / nh;
        if (want > a) {
          nw = nh * a;
          if (handle.includes("l")) nx = baseCrop.x + (baseCrop.w - nw);
        } else {
          nh = nw / a;
          if (handle.includes("t")) ny = baseCrop.y + (baseCrop.h - nh);
        }
      }

      crop = { x: nx, y: ny, w: nw, h: nh };
      applyCrop();
    }
  });

  const endCropDrag = () => {
    mode = null;
    handle = "";
    baseCrop = null;
  };
  cropBox.addEventListener("pointerup", endCropDrag);
  cropBox.addEventListener("pointercancel", endCropDrag);

  viewport.addEventListener("pointerdown", (e) => {
    const hit = hitTestCrop(e.clientX, e.clientY);
    if (hit.inside) return;
    mode = "pan";
    viewport.setPointerCapture(e.pointerId);
    startX = e.clientX;
    startY = e.clientY;
    baseX = x;
    baseY = y;
  });
  viewport.addEventListener("pointermove", (e) => {
    if (mode !== "pan") return;
    x = baseX + (e.clientX - startX);
    y = baseY + (e.clientY - startY);
    apply();
  });
  viewport.addEventListener("pointerup", () => {
    if (mode === "pan") mode = null;
  });
  viewport.addEventListener("pointercancel", () => {
    if (mode === "pan") mode = null;
  });

  const rotateWorking = async (dir) => {
    // dir: -1 or +1  (90° steps)
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const w = working.naturalWidth;
    const h = working.naturalHeight;
    c.width = h;
    c.height = w;
    if (dir > 0) {
      ctx.translate(h, 0);
      ctx.rotate(Math.PI / 2);
    } else {
      ctx.translate(0, w);
      ctx.rotate(-Math.PI / 2);
    }
    ctx.drawImage(working, 0, 0);
    const nextUrl = c.toDataURL("image/png");
    working = await loadImage(nextUrl);
    imgEl.src = nextUrl;
    zoomEl.value = "1";
    scale = coverScale();
    x = (vw - working.naturalWidth * scale) / 2;
    y = (vh - working.naturalHeight * scale) / 2;
    normalizeCrop();
    apply();
    applyCrop();
  };

  backdrop.querySelector("#cropRotateLeft").onclick = () => void rotateWorking(-1);
  backdrop.querySelector("#cropRotateRight").onclick = () => void rotateWorking(1);
  aspectSel.onchange = () => {
    aspectMode = aspectSel.value;
    normalizeCrop();
    applyCrop();
  };

  const exportCropped = () => {
    const canvas = document.createElement("canvas");
    const a = crop.w / crop.h;
    let outW = outputMax;
    let outH = Math.round(outputMax / a);
    if (a < 1) {
      outH = outputMax;
      outW = Math.round(outputMax * a);
    }
    if (aspectMode === "square") {
      outW = outputMax;
      outH = outputMax;
    }
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const srcX = (crop.x - x) / scale;
    const srcY = (crop.y - y) / scale;
    const srcW = crop.w / scale;
    const srcH = crop.h / scale;

    // Clamp source area inside image bounds.
    const sx = clamp(srcX, 0, Math.max(0, working.naturalWidth - 1));
    const sy = clamp(srcY, 0, Math.max(0, working.naturalHeight - 1));
    const sw = clamp(srcW, 1, working.naturalWidth - sx);
    const sh = clamp(srcH, 1, working.naturalHeight - sy);

    ctx.drawImage(working, sx, sy, sw, sh, 0, 0, outW, outH);
    if (mime === "image/png") return canvas.toDataURL("image/png");
    return canvas.toDataURL("image/jpeg", 0.88);
  };

  return await new Promise((resolve) => {
    const cleanup = () => backdrop.remove();
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) {
        cleanup();
        resolve(null);
      }
    });
    backdrop.querySelector("#cropCancel").onclick = () => {
      cleanup();
      resolve(null);
    };
    backdrop.querySelector("#cropOk").onclick = () => {
      const out = exportCropped();
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
