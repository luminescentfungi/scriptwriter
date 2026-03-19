import { 
  createRoom, 
  getRoom, 
  updateRoomMetadata,
  subscribeToMetadataLock,
  tryAcquireMetadataLock,
  releaseMetadataLock,
  saveScriptState,
  getScriptStates,
  deleteScriptState,
  loadScriptState,
  notifyStateChange,
  updateScript
} from "./firebase.js";
import {
  getStoredLanguage,
  setStoredLanguage,
  getStoredUserName,
  setStoredUserName,
  getStoredRoomCode,
  setStoredRoomCode
} from "./storage.js";
import { applyStaticTranslations, getText, languageOptions } from "./i18n.js";

const languageSelect = document.getElementById("languageSelect");
const homePanel = document.getElementById("homePanel");
const joinPanel = document.getElementById("joinPanel");
const wizardPanel = document.getElementById("wizardPanel");
const goWizardButton = document.getElementById("goWizard");
const backHomeButton = document.getElementById("backHome");
const backToEditorButton = document.getElementById("backToEditor");
const wizardSubmit = document.getElementById("wizardSubmit");
const wizardHeading = document.getElementById("wizardHeading");
const wizardSubtitle = document.getElementById("wizardSubtitle");
const wizardHeaderActions = document.getElementById("wizardHeaderActions");
const joinForm = document.getElementById("joinForm");
const wizardForm = document.getElementById("wizardForm");
const exportPdfButton = document.getElementById("exportPdf");
const exportDocxButton = document.getElementById("exportDocx");
const seeNotesButton = document.getElementById("seeNotesBtn");
const seePreviewButton = document.getElementById("seePreviewBtn");
const notesModal = document.getElementById("notesModal");
const previewModal = document.getElementById("previewModal");
const previewCanvas = document.getElementById("previewCanvas");
const closePreviewButton = document.getElementById("closePreview");
const scriptNotesInput = document.getElementById("scriptNotesInput");
const saveNotesButton = document.getElementById("saveNotes");
const cancelNotesButton = document.getElementById("cancelNotes");
const metadataLockInfo = document.getElementById("metadataLockInfo");

// Export Mobile Elements
const previewExportMobileBtn = document.getElementById("previewExportMobile");
const exportPopup = document.getElementById("exportPopup");
const closeExportPopupBtn = document.getElementById("closeExportPopup");
const exportPdfMobileBtn = document.getElementById("exportPdfMobile");
const seePreviewMobileBtn = document.getElementById("seePreviewMobile");
const exportDocxMobileBtn = document.getElementById("exportDocxMobile");

const characterModal = document.getElementById("characterModal");
const characterForm = document.getElementById("characterForm");
const modalCharName = document.getElementById("modalCharName");
const modalCharDesc = document.getElementById("modalCharDesc");
const cancelCharButton = document.getElementById("cancelChar");

const manageStatesBtn = document.getElementById("manageStatesBtn");
const statesModal = document.getElementById("statesModal");
const closeStatesBtn = document.getElementById("closeStates");
const saveStateBtn = document.getElementById("saveStateBtn");
const statesList = document.getElementById("statesList");

document.getElementById("addCharacterBtn").addEventListener("click", () => openCharacterModal());

const state = {
  language: getStoredLanguage(),
  userName: getStoredUserName(),
  roomCode: getStoredRoomCode(),
  editRoomCode: "",
  characters: [],
  editingCharIndex: -1,
  metadataLock: null
};

let lockSubscription = null;

function openCharacterModal(index = -1) {
  if (state.editRoomCode && state.metadataLock && state.metadataLock.holder !== state.userName) {
    return;
  }
  state.editingCharIndex = index;
  if (index >= 0) {
    const char = state.characters[index];
    modalCharName.value = char.name || "";
    modalCharDesc.value = char.description || "";
  } else {
    modalCharName.value = "";
    modalCharDesc.value = "";
  }
  characterModal.classList.remove("hidden");
  modalCharName.focus();
}

function closeCharacterModal() {
  characterModal.classList.add("hidden");
  state.editingCharIndex = -1;
}

characterForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (state.editRoomCode && state.metadataLock && state.metadataLock.holder !== state.userName) {
    return;
  }
  const name = modalCharName.value.trim();
  const description = modalCharDesc.value.trim();
  
  if (!name) return;

  if (state.editingCharIndex >= 0) {
    state.characters[state.editingCharIndex] = { name, description };
  } else {
    state.characters.push({ name, description });
  }
  
  closeCharacterModal();
  renderCharacterList();
});

cancelCharButton.addEventListener("click", closeCharacterModal);

function renderCharacterList() {
  const isLockedByOther = state.editRoomCode && state.metadataLock && state.metadataLock.holder !== state.userName;

  const list = document.getElementById("characterList");
  list.innerHTML = "";
  state.characters.forEach((char, idx) => {
    const wrapper = document.createElement("div");
    wrapper.className = "char-btn-wrapper";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "secondary char-edit-btn";
    editBtn.textContent = char.name || "Untitled";
    editBtn.title = char.description || "";
    editBtn.disabled = isLockedByOther;
    editBtn.addEventListener("click", () => openCharacterModal(idx));

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "secondary char-del-btn";
    delBtn.textContent = "✕";
    delBtn.disabled = isLockedByOther;
    delBtn.addEventListener("click", (e) => {
      if (isLockedByOther) return;
      e.stopPropagation();
      state.characters.splice(idx, 1);
      renderCharacterList();
    });

    wrapper.appendChild(editBtn);
    wrapper.appendChild(delBtn);
    list.appendChild(wrapper);
  });
  
  const addBtn = document.getElementById("addCharacterBtn");
  if (addBtn) addBtn.disabled = isLockedByOther;
}

function buildEditorUrl(roomCode) {
  return `./editor.html?room=${roomCode}`;
}

function init() {
  if (!languageOptions.includes(state.language)) {
    state.language = "en";
  }

  languageSelect.value = state.language;
  bindEvents();
  hydrateDefaults();
  applyStaticTranslations(state.language);
  openInitialPanel();
}

function bindEvents() {
  languageSelect.addEventListener("change", () => {
    state.language = languageSelect.value;
    setStoredLanguage(state.language);
    applyStaticTranslations(state.language);
    updateLockUI();
  });

  goWizardButton.addEventListener("click", () => {
    showWizard();
    updateUrl("wizard", "");
  });

  seeNotesButton.addEventListener("click", () => {
    state.tempNotes = scriptNotesInput.value;
    notesModal.classList.remove("hidden");
    const isLockedByOther = state.editRoomCode && state.metadataLock && state.metadataLock.holder !== state.userName;
    saveNotesButton.disabled = isLockedByOther;
    scriptNotesInput.disabled = isLockedByOther;
  });

  saveNotesButton.addEventListener("click", () => {
    if (state.editRoomCode && state.metadataLock && state.metadataLock.holder !== state.userName) {
      return;
    }
    notesModal.classList.add("hidden");
    if (state.editRoomCode) {
      updateRoomMetadata(state.editRoomCode, { notes: scriptNotesInput.value });
    }
  });

  cancelNotesButton.addEventListener("click", () => {
    scriptNotesInput.value = state.tempNotes || "";
    notesModal.classList.add("hidden");
  });

  backHomeButton.addEventListener("click", async () => {
    if (state.editRoomCode && state.metadataLock && state.metadataLock.holder === state.userName) {
      await releaseMetadataLock(state.editRoomCode, state.userName);
    }
    showHome();
    updateUrl("home", "");
  });

  backToEditorButton.addEventListener("click", async () => {
    if (!state.editRoomCode) {
      return;
    }
    if (state.metadataLock && state.metadataLock.holder === state.userName) {
      await releaseMetadataLock(state.editRoomCode, state.userName);
    }
    window.location.href = buildEditorUrl(state.editRoomCode);
  });

  exportPdfButton.addEventListener("click", handleExportPdf);
  seePreviewButton.addEventListener("click", handleSeePreview);
  closePreviewButton.addEventListener("click", () => previewModal.classList.add("hidden"));
  exportDocxButton.addEventListener("click", handleExportDocx);

  // Mobile export events
  previewExportMobileBtn.addEventListener("click", () => exportPopup.classList.remove("hidden"));
  closeExportPopupBtn.addEventListener("click", () => exportPopup.classList.add("hidden"));
  exportPdfMobileBtn.addEventListener("click", () => {
    handleExportPdf();
    exportPopup.classList.add("hidden");
  });
  seePreviewMobileBtn.addEventListener("click", () => {
    handleSeePreview();
    exportPopup.classList.add("hidden");
  });
  exportDocxMobileBtn.addEventListener("click", () => {
    handleExportDocx();
    exportPopup.classList.add("hidden");
  });

  manageStatesBtn.addEventListener("click", handleOpenStates);
  closeStatesBtn.addEventListener("click", () => statesModal.classList.add("hidden"));
  saveStateBtn.addEventListener("click", handleSaveState);

  joinForm.addEventListener("submit", handleJoin);
  wizardForm.addEventListener("submit", handleWizardSubmit);
}

function updateLockUI() {
  if (!state.editRoomCode) {
    metadataLockInfo.classList.add("hidden");
    toggleWizardFields(false);
    return;
  }

  if (state.metadataLock && state.metadataLock.holder) {
    if (state.metadataLock.holder === state.userName) {
      metadataLockInfo.classList.add("hidden");
      toggleWizardFields(false);
    } else {
      metadataLockInfo.textContent = `${getText(state.language, "metadataLockedBy")} ${state.metadataLock.holder}`;
      metadataLockInfo.classList.remove("hidden");
      toggleWizardFields(true);
    }
  } else {
    // No one has it, try to take it
    tryAcquireMetadataLock(state.editRoomCode, state.userName);
    metadataLockInfo.classList.add("hidden");
    toggleWizardFields(false);
  }
}

function toggleWizardFields(disabled) {
  const inputs = wizardForm.querySelectorAll("input, textarea");
  inputs.forEach(input => {
    if (input.id !== "wizardName") { // Keep user name editable if needed, though usually fixed in edit
      input.disabled = disabled;
    }
  });
  wizardSubmit.disabled = disabled;
  renderCharacterList();
}

function hydrateDefaults() {
  document.getElementById("joinName").value = state.userName || "";
  document.getElementById("joinCode").value = state.roomCode || "";
  document.getElementById("wizardName").value = state.userName || "";
  renderCharacterList();
}

function openInitialPanel() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("mode");
  const room = params.get("room");

  if (mode === "wizard") {
    showWizard();
    if (room && /^\d{4}$/.test(room)) {
      loadWizardForEdit(room);
    }
    return;
  }

  showHome();
}

async function loadWizardForEdit(roomCode) {
  const room = await getRoom(roomCode);
  if (!room) {
    alert(getText(state.language, "roomNotFound"));
    showHome();
    return;
  }

  state.editRoomCode = roomCode;
  
  if (lockSubscription) lockSubscription();
  lockSubscription = subscribeToMetadataLock(roomCode, (lock) => {
    state.metadataLock = lock;
    updateLockUI();
  });
  
  wizardHeading.setAttribute("data-i18n", "editRoomWizardTitle");
  wizardSubtitle.setAttribute("data-i18n", "editRoomWizardDescription");
  wizardSubmit.setAttribute("data-i18n", "saveMetadata");
  backToEditorButton.classList.remove("hidden");
  wizardHeaderActions.classList.remove("hidden");
  applyStaticTranslations(state.language);

  const metadata = room.metadata || {};
  document.getElementById("wizardName").value = state.userName || metadata.createdBy || "";
  document.getElementById("scriptTitle").value = metadata.title || "";
  document.getElementById("scriptArgument").value = metadata.argument || "";
  document.getElementById("scriptSetting").value = metadata.setting || "";
  document.getElementById("scriptGenre").value = metadata.genre || "";
  scriptNotesInput.value = metadata.notes || "";

  // Load characters as array of objects
  if (Array.isArray(metadata.characters)) {
    state.characters = metadata.characters.map(c => typeof c === "object" ? { ...c } : { name: c, description: "" });
  } else {
    state.characters = [];
  }
  renderCharacterList();
}

function showHome() {
  homePanel.classList.remove("hidden");
  joinPanel.classList.remove("hidden");
  wizardPanel.classList.add("hidden");
  resetWizardMetaMode();
}

function showWizard() {
  homePanel.classList.add("hidden");
  joinPanel.classList.add("hidden");
  wizardPanel.classList.remove("hidden");
}

function resetWizardMetaMode() {
  if (state.editRoomCode && state.metadataLock && state.metadataLock.holder === state.userName) {
    releaseMetadataLock(state.editRoomCode, state.userName);
  }
  if (lockSubscription) {
    lockSubscription();
    lockSubscription = null;
  }
  state.editRoomCode = "";
  state.metadataLock = null;
  metadataLockInfo.classList.add("hidden");
  toggleWizardFields(false);

  wizardHeading.setAttribute("data-i18n", "wizardTitle");
  wizardSubtitle.setAttribute("data-i18n", "wizardDescription");
  wizardSubmit.setAttribute("data-i18n", "generateRoom");
  backToEditorButton.classList.add("hidden");
  wizardHeaderActions.classList.add("hidden");
  scriptNotesInput.value = "";
  applyStaticTranslations(state.language);
}

async function handleJoin(event) {
  event.preventDefault();

  const name = document.getElementById("joinName").value.trim();
  const roomCode = document.getElementById("joinCode").value.trim();

  if (!name) {
    alert(getText(state.language, "missingName"));
    return;
  }

  if (!/^\d{4}$/.test(roomCode)) {
    alert(getText(state.language, "invalidRoom"));
    return;
  }

  const room = await getRoom(roomCode);
  if (!room) {
    alert(getText(state.language, "roomNotFound"));
    return;
  }

  state.userName = name;
  state.roomCode = roomCode;
  setStoredUserName(name);
  setStoredRoomCode(roomCode);
  window.location.href = buildEditorUrl(roomCode);
}

async function handleWizardSubmit(event) {
  event.preventDefault();
  
  if (state.editRoomCode && state.metadataLock && state.metadataLock.holder !== state.userName) {
    return;
  }

  const name = document.getElementById("wizardName").value.trim();
  if (!name) {
    alert(getText(state.language, "missingName"));
    return;
  }

  const payload = {
    title: document.getElementById("scriptTitle").value,
    argument: document.getElementById("scriptArgument").value,
    characters: state.characters.filter(c => c.name.trim()), // Only save characters with names
    setting: document.getElementById("scriptSetting").value,
    genre: document.getElementById("scriptGenre").value,
    notes: scriptNotesInput.value
  };

  state.userName = name;
  setStoredUserName(name);

  try {
    if (state.editRoomCode) {
      await updateRoomMetadata(state.editRoomCode, { ...payload, updatedBy: name });
      // Release lock before leaving
      if (state.metadataLock && state.metadataLock.holder === state.userName) {
        await releaseMetadataLock(state.editRoomCode, state.userName);
      }
      window.location.href = buildEditorUrl(state.editRoomCode);
      return;
    }

    const roomCode = await createRoom({ name, ...payload });
    state.roomCode = roomCode;
    setStoredRoomCode(roomCode);
    window.location.href = buildEditorUrl(roomCode);
  } catch (error) {
    const message = error.message === "max-room-limit"
      ? getText(state.language, "maxRoomsReached")
      : getText(state.language, "createFailed");
    alert(message);
    console.error(error);
  }
}

/**
 * Builds a DOM node representing the full script (title page + content).
 * Used by PDF export, preview, and DOCX export to avoid duplication.
 */
function buildScriptDOM(metadata, scriptText, format = 'preview') {
  const container = document.createElement("div");
  container.className = "script-export-content";
  // Inline styles are intentional: they ensure correct rendering both in the
  // live preview and when html2pdf captures the node off-screen.
  container.style.padding = "1in";
  container.style.fontSize = "12pt";
  container.style.fontFamily = "'Courier New', Courier, monospace";
  container.style.color = "#000";
  container.style.backgroundColor = "#fff";
  container.style.lineHeight = "1.4";
  container.style.textAlign = "center";

  // --- Title section ---
  const titleSection = document.createElement("div");
  titleSection.className = "page-title-section";
  if (format === 'doc') {
    titleSection.style.display = "block";
    titleSection.style.textAlign = "center";
    titleSection.style.padding = "2em 0 3em";
    titleSection.style.pageBreakAfter = "always";
  } else {
    titleSection.style.display = "flex";
    titleSection.style.flexDirection = "column";
    titleSection.style.justifyContent = "center";
    titleSection.style.alignItems = "center";
    titleSection.style.textAlign = "center";
    titleSection.style.padding = "2em 0 3em";
  }

  const titleEl = document.createElement("h1");
  titleEl.textContent = (metadata.title || "Untitled").toUpperCase();
  titleEl.style.fontSize = "18pt";
  titleEl.style.marginBottom = "0.5em";
  titleSection.appendChild(titleEl);

  if (metadata.argument && metadata.argument.trim()) {
    const plot = document.createElement("p");
    plot.textContent = metadata.argument;
    plot.style.marginTop = "1.5em";
    plot.style.fontStyle = "italic";
    plot.style.whiteSpace = "pre-wrap";
    titleSection.appendChild(plot);
  }

  if (Array.isArray(metadata.characters) && metadata.characters.length > 0) {
    const charHeader = document.createElement("h2");
    charHeader.textContent = getText(state.language, "characters");
    charHeader.style.marginTop = "2em";
    charHeader.style.fontSize = "1.1em";
    titleSection.appendChild(charHeader);

    const charList = document.createElement("ul");
    if (format === 'doc') {
      charList.style.display = "block";
      charList.style.width = "70%";
      charList.style.margin = "0.5em auto";
      charList.style.paddingLeft = "1.5em";
      charList.style.textAlign = "left";
      charList.style.listStyle = "disc";
    } else {
      charList.style.display = "inline-block";
      charList.style.textAlign = "left";
      charList.style.margin = "0 auto";
      charList.style.padding = "0 1em";
      charList.style.listStyle = "disc inside";
    }
    metadata.characters.forEach(c => {
      const li = document.createElement("li");
      li.textContent = c.name.toUpperCase() + (c.description ? `: ${c.description}` : "");
      charList.appendChild(li);
    });
    titleSection.appendChild(charList);
  }

  container.appendChild(titleSection);

  // --- Script content ---
  const scriptContent = document.createElement("div");
  const blocks = scriptText.split(/\n\s*\n/).filter(Boolean);

  blocks.forEach(blockText => {
    const blockDiv = document.createElement("div");
    blockDiv.className = "preview-block";
    blockDiv.style.marginBottom = format === 'doc' ? "2.5em" : "1.2em";
    blockDiv.style.textAlign = "center";

    const lines = blockText.trim().split("\n");
    const firstLine = lines[0];

    if (
      firstLine.includes(":") &&
      firstLine.split(":")[0] === firstLine.split(":")[0].toUpperCase() &&
      !firstLine.includes("SCENE")
    ) {
      // Dialogue block
      const separatorIndex = firstLine.indexOf(":");
      const charName = firstLine.substring(0, separatorIndex).trim();
      const dialogueText = lines.slice(1).join("\n").trim();

      const nameP = document.createElement("p");
      nameP.className = "preview-char";
      nameP.textContent = charName;
      nameP.style.textAlign = "center";
      nameP.style.margin = "0 0 0.2em 0";
      nameP.style.width = "100%";
      blockDiv.appendChild(nameP);

      const speechP = document.createElement("p");
      speechP.className = "preview-dialogue";
      speechP.style.width = "80%";
      speechP.style.margin = "0 auto";
      speechP.style.textAlign = "justify";
      speechP.innerHTML = formatParenthesisItalics(dialogueText);
      blockDiv.appendChild(speechP);
    } else {
      // Action or scene heading
      const isScene =
        firstLine.toUpperCase().startsWith("SCENE") ||
        firstLine.toUpperCase().startsWith("INT.") ||
        firstLine.toUpperCase().startsWith("EXT.");

      const actionP = document.createElement("p");
      actionP.style.margin = "0";
      actionP.style.textAlign = "justify";

      if (isScene) {
        actionP.className = "preview-scene";
        actionP.style.fontWeight = "bold";
        actionP.style.textTransform = "uppercase";
        actionP.innerHTML = formatBlockHTML(blockText, "action");
      } else {
        actionP.className = "preview-action";
        actionP.innerHTML = formatBlockHTML(blockText, "paragraph");
      }
      blockDiv.appendChild(actionP);
    }
    scriptContent.appendChild(blockDiv);
    if (format === 'doc') {
      const spacer = document.createElement("p");
      spacer.innerHTML = "&nbsp;";
      spacer.style.margin = "0";
      spacer.style.lineHeight = "1";
      scriptContent.appendChild(spacer);
    }
  });

  container.appendChild(scriptContent);
  return container;
}

async function handleExportPdf() {
  if (!state.editRoomCode) return;
  const room = await getRoom(state.editRoomCode);
  if (!room) return;

  const metadata = room.metadata || {};
  const scriptText = room.script?.rawText || "";

  const container = buildScriptDOM(metadata, scriptText);
  document.body.appendChild(container);

  const opt = {
    margin: [0.5, 0.5, 0.5, 0.5],
    filename: `${(metadata.title || "script").replace(/\s+/g, "_")}.pdf`,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
    pagebreak: { mode: ["avoid-all", "css", "legacy"] },
  };

  html2pdf().from(container).set(opt).save().then(() => {
    document.body.removeChild(container);
  });
}

async function handleSeePreview() {
  if (!state.editRoomCode) return;
  const room = await getRoom(state.editRoomCode);
  if (!room) return;

  const metadata = room.metadata || {};
  const scriptText = room.script?.rawText || "";

  previewCanvas.innerHTML = "";
  previewCanvas.appendChild(buildScriptDOM(metadata, scriptText));
  previewModal.classList.remove("hidden");
}

/**
 * Exports the script as a .doc file using the Word-HTML format.
 * No external library needed — Word and LibreOffice both open it natively.
 */
async function handleExportDocx() {
  if (!state.editRoomCode) return;
  const room = await getRoom(state.editRoomCode);
  if (!room) return;

  const metadata = room.metadata || {};
  const scriptText = room.script?.rawText || "";
  const filename = `${(metadata.title || "script").replace(/\s+/g, "_")}.doc`;

  // Serialise the shared DOM into an HTML string
  const scriptDOM = buildScriptDOM(metadata, scriptText, 'doc');
  const bodyHTML = scriptDOM.innerHTML;

  const wordHTML = `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <title>${metadata.title || "Script"}</title>
  <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
  <style>
    body  { font-family: "Courier New", Courier, monospace; font-size: 12pt;
            margin: 1in; color: #000; line-height: 1.4; }
    h1    { text-align: center; font-size: 18pt; text-transform: uppercase; }
    h2    { text-align: center; font-size: 13pt; }
    .page-title-section { text-align: center; page-break-after: always; }
    ul    { display: block; width: 70%; margin: 0.5em auto; padding-left: 1.5em; text-align: left; }
    .preview-char     { text-align: center; margin: 0.8em 0 0.2em; }
    .preview-dialogue { width: 60%; margin: 0 auto; text-align: justify; }
    .preview-scene    { font-weight: bold; text-transform: uppercase; text-align: left; }
    .preview-action   { font-style: italic; text-align: justify; }
  </style>
</head>
<body>${bodyHTML}</body>
</html>`.trim();

  const blob = new Blob(["\ufeff", wordHTML], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}


function formatBlockHTML(text, type) {
  if (!text) return "";
  if (type === "paragraph" || type === "action") {
    return `<i>${text}</i>`;
  }
  return text.replace(/\(([^)]*)\)/g, (match) => `<i>${match}</i>`);
}

function formatParenthesisItalics(text) {
  if (!text) return "";
  return text.replace(/\(([^)]*)\)/g, "<i>($1)</i>");
}

function updateUrl(mode, roomCode) {
  const params = new URLSearchParams();
  if (mode === "wizard") {
    params.set("mode", "wizard");
  } 
  if (roomCode) {
    params.set("room", roomCode);
  }

  const query = params.toString();
  const nextUrl = query ? `?${query}` : window.location.pathname;
  window.history.replaceState({}, "", nextUrl);
}

async function handleOpenStates() {
  if (!state.editRoomCode) return;
  await refreshStatesList();
  statesModal.classList.remove("hidden");
}

async function refreshStatesList() {
  const states = await getScriptStates(state.editRoomCode);
  statesList.innerHTML = "";

  if (!states.length) {
    const empty = document.createElement("p");
    empty.textContent = getText(state.language, "noStates");
    empty.style.textAlign = "center";
    empty.style.color = "#999";
    statesList.appendChild(empty);
    return;
  }

  states.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));

  states.forEach(stateItem => {
    const row = document.createElement("div");
    row.className = "state-row";

    const info = document.createElement("div");
    info.className = "state-info";
    const nameEl = document.createElement("strong");
    nameEl.textContent = stateItem.name;
    const metaEl = document.createElement("small");
    metaEl.textContent = `${stateItem.savedBy || "?"} — ${formatStateTimestamp(stateItem.savedAt)}`;
    info.appendChild(nameEl);
    info.appendChild(metaEl);

    const actions = document.createElement("div");
    actions.className = "state-actions";

    const loadBtn = document.createElement("button");
    loadBtn.className = "primary";
    loadBtn.textContent = getText(state.language, "loadState");
    loadBtn.addEventListener("click", () => handleLoadState(stateItem));

    const delBtn = document.createElement("button");
    delBtn.className = "secondary state-delete-btn";
    delBtn.textContent = getText(state.language, "deleteState");
    delBtn.addEventListener("click", () => handleDeleteState(stateItem.id));

    actions.appendChild(loadBtn);
    actions.appendChild(delBtn);
    row.appendChild(info);
    row.appendChild(actions);
    statesList.appendChild(row);
  });
}

function formatStateTimestamp(ts) {
  if (!ts) return "?";
  const date = new Date(ts);
  return date.toLocaleString();
}

async function handleSaveState() {
  if (!state.editRoomCode) return;

  const now = new Date();
  const defaultName = now.toLocaleString();
  const name = prompt(getText(state.language, "stateNamePrompt"), defaultName);
  if (!name) return;

  const room = await getRoom(state.editRoomCode);
  if (!room) return;

  const rawText = room.script?.rawText || "";
  await saveScriptState(state.editRoomCode, name, rawText, state.userName);
  await refreshStatesList();
  alert(getText(state.language, "stateSaved"));
}

async function handleLoadState(stateItem) {
  if (!state.editRoomCode) return;

  const wantSave = confirm(getText(state.language, "saveBeforeLoad"));
  if (wantSave) {
    const now = new Date();
    const defaultName = now.toLocaleString();
    const saveName = prompt(getText(state.language, "stateNamePrompt"), defaultName);
    if (saveName) {
      const room = await getRoom(state.editRoomCode);
      if (room) {
        await saveScriptState(state.editRoomCode, saveName, room.script?.rawText || "", state.userName);
      }
    }
  }

  const confirmLoad = confirm(getText(state.language, "confirmLoadState"));
  if (!confirmLoad) return;

  const stateData = await loadScriptState(state.editRoomCode, stateItem.id);
  if (!stateData) return;

  await updateScript(state.editRoomCode, stateData.rawText, state.userName);
  await notifyStateChange(state.editRoomCode, state.userName);

  statesModal.classList.add("hidden");
  alert(getText(state.language, "stateLoaded"));
  window.location.href = buildEditorUrl(state.editRoomCode);
}

async function handleDeleteState(stateId) {
  if (!confirm(getText(state.language, "confirmDelete"))) return;
  await deleteScriptState(state.editRoomCode, stateId);
  await refreshStatesList();
}

init();