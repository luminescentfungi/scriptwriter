import { createRoom, getRoom, updateRoomMetadata } from "./firebase.js";
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
const joinForm = document.getElementById("joinForm");
const wizardForm = document.getElementById("wizardForm");
const exportPdfButton = document.getElementById("exportPdf");
const exportDocxButton = document.getElementById("exportDocx");
document.getElementById("addCharacterBtn").addEventListener("click", addCharacter);

const state = {
  language: getStoredLanguage(),
  userName: getStoredUserName(),
  roomCode: getStoredRoomCode(),
  editRoomCode: "",
  characters: []
};

function addCharacter() {
  state.characters.push({ name: "", description: "" });
  renderCharacterList();
}

function renderCharacterList() {
  const list = document.getElementById("characterList");
  list.innerHTML = "";
  state.characters.forEach((char, idx) => {
    const wrapper = document.createElement("div");
    wrapper.className = "character-row";
    wrapper.style.display = "flex";
    wrapper.style.alignItems = "flex-start";
    wrapper.style.marginBottom = "10px";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = "Character name";
    nameInput.value = char.name;
    nameInput.style.marginRight = "8px";
    nameInput.style.flex = "1";
    nameInput.addEventListener("input", e => {
      state.characters[idx].name = e.target.value;
    });

    const descInput = document.createElement("input");
    descInput.type = "text";
    descInput.placeholder = "Description";
    descInput.value = char.description;
    descInput.style.marginTop = "4px";
    descInput.style.flex = "2";
    descInput.addEventListener("input", e => {
      state.characters[idx].description = e.target.value;
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "-";
    delBtn.className = "secondary";
    delBtn.style.marginLeft = "8px";
    delBtn.addEventListener("click", () => {
      state.characters.splice(idx, 1);
      renderCharacterList();
    });

    const col = document.createElement("div");
    col.style.display = "flex";
    col.style.flexDirection = "column";
    col.style.flex = "1";
    col.appendChild(nameInput);
    col.appendChild(descInput);

    wrapper.appendChild(col);
    wrapper.appendChild(delBtn);
    list.appendChild(wrapper);
  });
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
  });

  goWizardButton.addEventListener("click", () => {
    showWizard();
    updateUrl("wizard", "");
  });

  backHomeButton.addEventListener("click", () => {
    showHome();
    updateUrl("home", "");
  });

  backToEditorButton.addEventListener("click", () => {
    if (!state.editRoomCode) {
      return;
    }
    window.location.href = buildEditorUrl(state.editRoomCode);
  });

  exportPdfButton.addEventListener("click", handleExportPdf);
  exportDocxButton.addEventListener("click", handleExportDocx);

  joinForm.addEventListener("submit", handleJoin);
  wizardForm.addEventListener("submit", handleWizardSubmit);
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
  wizardHeading.setAttribute("data-i18n", "editRoomWizardTitle");
  wizardSubtitle.setAttribute("data-i18n", "editRoomWizardDescription");
  wizardSubmit.setAttribute("data-i18n", "saveMetadata");
  backToEditorButton.classList.remove("hidden");
  exportDocxButton.classList.remove("hidden");
  exportPdfButton.classList.remove("hidden");
  applyStaticTranslations(state.language);

  const metadata = room.metadata || {};
  document.getElementById("wizardName").value = state.userName || metadata.createdBy || "";
  document.getElementById("scriptTitle").value = metadata.title || "";
  document.getElementById("scriptArgument").value = metadata.argument || "";
  document.getElementById("scriptSetting").value = metadata.setting || "";
  document.getElementById("scriptGenre").value = metadata.genre || "";

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
  state.editRoomCode = "";
  wizardHeading.setAttribute("data-i18n", "wizardTitle");
  wizardSubtitle.setAttribute("data-i18n", "wizardDescription");
  wizardSubmit.setAttribute("data-i18n", "generateRoom");
  backToEditorButton.classList.add("hidden");
  exportDocxButton.classList.add("hidden");
  exportPdfButton.classList.add("hidden");
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
    genre: document.getElementById("scriptGenre").value
  };

  state.userName = name;
  setStoredUserName(name);

  try {
    if (state.editRoomCode) {
      await updateRoomMetadata(state.editRoomCode, { ...payload, updatedBy: name });
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

async function handleExportPdf() {
  if (!state.editRoomCode) return;
  const room = await getRoom(state.editRoomCode);
  if (!room) return;

  const metadata = room.metadata || {};
  const scriptText = room.script?.rawText || "";
  
  // Create a temporary container for PDF generation
  const container = document.createElement("div");
  container.className = "pdf-export-content";
  container.style.padding = "1in"; // Standard script margins
  container.style.fontSize = "12pt";
  container.style.fontFamily = "'Courier New', Courier, monospace";
  container.style.color = "#000";
  container.style.backgroundColor = "#fff";
  container.style.lineHeight = "1";

  // Title Page (Simulated)
  const titlePage = document.createElement("div");
  titlePage.style.height = "9.5in"; // Fill page
  titlePage.style.display = "flex";
  titlePage.style.flexDirection = "column";
  titlePage.style.justifyContent = "center";
  titlePage.style.textAlign = "center";

  const title = document.createElement("h1");
  title.textContent = (metadata.title || "Untitled").toUpperCase();
  title.style.fontSize = "18pt";
  title.style.textDecoration = "underline";
  title.style.marginBottom = "0.5in";
  titlePage.appendChild(title);

  const author = document.createElement("p");
  author.textContent = `By\n${metadata.createdBy || "Anonymous"}`;
  author.style.whiteSpace = "pre-wrap";
  titlePage.appendChild(author);
  
  container.appendChild(titlePage);

  // Script Content
  const scriptContent = document.createElement("div");
  
  // Process script into lines/blocks
  const blocks = scriptText.split(/\n\s*\n/).filter(Boolean);
  
  blocks.forEach(blockText => {
    const blockDiv = document.createElement("div");
    blockDiv.style.marginBottom = "1.2em";

    // Detect format from serializeBlocks output
    // Format is usually "CHARACTER: text" or just "text"
    const lines = blockText.trim().split("\n");
    const firstLine = lines[0];

    if (firstLine.includes(":") && firstLine.split(":")[0] === firstLine.split(":")[0].toUpperCase() && !firstLine.includes("SCENE")) {
      // Dialogue Block
      const separatorIndex = firstLine.indexOf(":");
      const charName = firstLine.substring(0, separatorIndex).trim();
      const dialogueText = firstLine.substring(separatorIndex + 1).trim();

      // Character Name (Centered @ 3.5in from left, or simplified center)
      const nameP = document.createElement("p");
      nameP.textContent = charName;
      nameP.style.textAlign = "center";
      nameP.style.margin = "0 0 0.2em 0";
      nameP.style.width = "100%";
      blockDiv.appendChild(nameP);

      // Dialogue (Centered with margins)
      const speechP = document.createElement("p");
      speechP.style.width = "60%"; // Standard dialogue width
      speechP.style.margin = "0 auto";
      speechP.style.textAlign = "left";
      speechP.innerHTML = formatParenthesisItalics(dialogueText);
      blockDiv.appendChild(speechP);
    } else {
      // Action or Scene Heading
      const actionP = document.createElement("p");
      actionP.style.margin = "0";
      
      const isScene = firstLine.toUpperCase().startsWith("SCENE") || 
                      firstLine.toUpperCase().startsWith("INT.") || 
                      firstLine.toUpperCase().startsWith("EXT.");
      
      if (isScene) {
        actionP.style.fontWeight = "bold";
        actionP.style.textTransform = "uppercase";
      }

      actionP.innerHTML = formatParenthesisItalics(blockText);
      blockDiv.appendChild(actionP);
    }
    scriptContent.appendChild(blockDiv);
  });

  container.appendChild(scriptContent);
  document.body.appendChild(container);

  const opt = {
    margin: [0.5, 0.5, 0.5, 0.5],
    filename: `${(metadata.title || "script").replace(/\s+/g, "_")}.pdf`,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
  };

  html2pdf().from(container).set(opt).save().then(() => {
    document.body.removeChild(container);
  });
}
async function handleExportDocx() {
  if (!state.editRoomCode) return;
  const room = await getRoom(state.editRoomCode);
  if (!room) return;

  const metadata = room.metadata || {};
  const scriptText = room.script?.rawText || "";
  
  // The library is usually exposed via window.docx when loaded from script tag
  const docxLib = window.docx;
  if (!docxLib) {
    alert("DOCX library not loaded yet. Please wait a moment or refresh.");
    return;
  }
  const { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel } = docxLib;

  const docChildren = [
    // Title Page
    new Paragraph({
      text: (metadata.title || "Untitled").toUpperCase(),
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { before: 2000, after: 400 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `By\n${metadata.createdBy || "Anonymous"}`,
          break: 1,
        }),
      ],
      spacing: { after: 2000 },
    }),
    new Paragraph({ text: "", pageBreakBefore: true }),
  ];

  // Process script into lines/blocks
  const blocks = scriptText.split(/\n\s*\n/).filter(Boolean);
  
  blocks.forEach(blockText => {
    const lines = blockText.trim().split("\n");
    const firstLine = lines[0];

    if (firstLine.includes(":") && firstLine.split(":")[0] === firstLine.split(":")[0].toUpperCase() && !firstLine.includes("SCENE")) {
      // Dialogue Block
      const separatorIndex = firstLine.indexOf(":");
      const charName = firstLine.substring(0, separatorIndex).trim();
      const dialogueText = firstLine.substring(separatorIndex + 1).trim();

      // Character Name
      docChildren.push(new Paragraph({
        text: charName,
        alignment: AlignmentType.CENTER,
        spacing: { before: 240 },
      }));

      // Dialogue
      docChildren.push(new Paragraph({
        children: parseTextForItalicsDocx(dialogueText, TextRun),
        indent: { left: 1440, right: 1440 }, // Approx margins for dialogue
        spacing: { after: 120 },
      }));
    } else {
      // Action or Scene Heading
      const isScene = firstLine.toUpperCase().startsWith("SCENE") || 
                      firstLine.toUpperCase().startsWith("INT.") || 
                      firstLine.toUpperCase().startsWith("EXT.");
      
      docChildren.push(new Paragraph({
        children: parseTextForItalicsDocx(blockText, TextRun, isScene),
        spacing: { before: 240, after: 120 },
      }));
    }
  });

  const doc = new Document({
    sections: [{
      properties: {},
      children: docChildren,
    }],
  });

  Packer.toBlob(doc).then((blob) => {
    saveAs(blob, `${(metadata.title || "script").replace(/\s+/g, "_")}.docx`);
  });
}

function parseTextForItalicsDocx(text, TextRun, isBold = false) {
  const parts = [];
  const regex = /\(([^)]*)\)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Text before parenthesis
    if (match.index > lastIndex) {
      parts.push(new TextRun({
        text: text.substring(lastIndex, match.index),
        bold: isBold
      }));
    }
    // Parenthesis text (italic)
    parts.push(new TextRun({
      text: match[0],
      italics: true,
      bold: isBold
    }));
    lastIndex = regex.lastIndex;
  }

  // Remaining text
  if (lastIndex < text.length) {
    parts.push(new TextRun({
      text: text.substring(lastIndex),
      bold: isBold
    }));
  }

  return parts;
}


function formatParenthesisItalics(text) {
  if (!text) return "";
  return text.replace(/\(([^)]*)\)/g, (match) => `<i>${match}</i>`);
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

init();
