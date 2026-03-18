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

function renderCards() {
  const q = normalize(searchInput.value);
  const filtered = q ? allCards.filter((c) => normalize(c.name).includes(q)) : allCards;

  cardsEmpty.classList.toggle("hidden", filtered.length !== 0);
  cardsList.innerHTML = "";

  for (const card of filtered) {
    const el = document.createElement("div");
    el.className = "carditem";
    el.innerHTML = `
      <div class="carditem__grid">
        <img class="carditem__img" alt="" />
        <div class="carditem__name"></div>
      </div>
    `;
    const img = el.querySelector(".carditem__img");
    img.src = card.logoImage || card.frontImage || "./icons/icon-192.png";
    el.querySelector(".carditem__name").textContent = card.name;
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
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:10px;">
          <img id="pvLogo" style="width:100%; height:90px; object-fit:contain; background:#fff; border-radius:12px; border:1px solid var(--stroke);" />
          <img id="pvFront" style="width:100%; height:90px; object-fit:contain; background:#fff; border-radius:12px; border:1px solid var(--stroke);" />
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
  const pvLogo = backdrop.querySelector("#pvLogo");
  const pvFront = backdrop.querySelector("#pvFront");

  edName.value = state.name || "";
  edCode.value = state.code || "";
  edFormat.value = state.format || "code128";

  pvLogo.src = state.logoImage || "./icons/icon-192.png";
  pvFront.src = state.frontImage || "./icons/icon-192.png";

  const pickImage = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.click();
    const file = await new Promise((resolve) => (input.onchange = () => resolve(input.files?.[0] || null)));
    if (!file) return "";
    return await fileToDataUrl(file);
  };

  backdrop.querySelector("#btnSetLogo").onclick = async () => {
    state.logoImage = await pickImage();
    pvLogo.src = state.logoImage || "./icons/icon-192.png";
  };
  backdrop.querySelector("#btnSetFront").onclick = async () => {
    state.frontImage = await pickImage();
    pvFront.src = state.frontImage || "./icons/icon-192.png";
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
