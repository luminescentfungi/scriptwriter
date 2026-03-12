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

const state = {
  language: getStoredLanguage(),
  userName: getStoredUserName(),
  roomCode: getStoredRoomCode(),
  editRoomCode: ""
};

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

  joinForm.addEventListener("submit", handleJoin);
  wizardForm.addEventListener("submit", handleWizardSubmit);
}

function hydrateDefaults() {
  document.getElementById("joinName").value = state.userName;
  document.getElementById("joinCode").value = state.roomCode;
  document.getElementById("wizardName").value = state.userName;
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
  applyStaticTranslations(state.language);

  const metadata = room.metadata || {};
  document.getElementById("wizardName").value = state.userName || metadata.createdBy || "";
  document.getElementById("scriptTitle").value = metadata.title || "";
  document.getElementById("scriptArgument").value = metadata.argument || "";
  document.getElementById("scriptCharacters").value = (metadata.characters || []).join(", ");
  document.getElementById("scriptSetting").value = metadata.setting || "";
  document.getElementById("scriptGenre").value = metadata.genre || "";
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
    characters: document.getElementById("scriptCharacters").value,
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
