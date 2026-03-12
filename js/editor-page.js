  import {
  getRoom,
  subscribeToRoom,
  updateScript,
  subscribeToPresence,
  registerPresence,
  updatePresence
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
const roomLabel = document.getElementById("roomLabel");
const metaCard = document.getElementById("metaCard");
const metaTitle = document.getElementById("metaTitle");
const metaSubtitle = document.getElementById("metaSubtitle");
const metaCharacters = document.getElementById("metaCharacters");
const scriptCanvas = document.getElementById("scriptCanvas");
const characterButtons = document.getElementById("characterButtons");
const commandPanel = document.querySelector(".command-panel");
const panelNotice = document.getElementById("panelNotice");
const presenceInline = document.getElementById("presenceInline");
const goHome = document.getElementById("goHome");
const contextMenu = document.createElement("div");
contextMenu.className = "context-menu hidden";
document.body.appendChild(contextMenu);
const presencePalette = ["#e53935", "#2e7d32", "#1e88e5", "#fb8c00", "#d81b60"];

const state = {
  language: getStoredLanguage(),
  userName: getStoredUserName(),
  roomCode: "",
  roomData: null,
  blocks: [],
  activeIndex: -1,
  saveTimer: null,
  typingLockUntil: 0,
  roomUnsubscribe: null,
  presenceUnsubscribe: null,
  localUserId: makeUserId(),
  lastRemoteRaw: "",
  longPressTimer: null,
  contextIndex: -1,
  keyboardOpen: false,
  presenceByUserId: {}
};

function extractRoomCodeFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("room");
  if (/^\d{4}$/.test(fromQuery || "")) {
    return fromQuery;
  }

  return "";
}

function ensureUserNameBeforeStart() {
  if ((state.userName || "").trim()) {
    return;
  }

  let nextName = "";
  while (!nextName) {
    const prompted = window.prompt(getText(state.language, "missingName"), "");
    if (prompted === null) {
      continue;
    }
    nextName = prompted.trim();
  }

  state.userName = nextName;
  setStoredUserName(nextName);
}

async function init() {
  if (!languageOptions.includes(state.language)) {
    state.language = "en";
  }

  languageSelect.value = state.language;
  ensureUserNameBeforeStart();

  const roomCode = extractRoomCodeFromLocation() || getStoredRoomCode();

  if (!/^\d{4}$/.test(roomCode || "")) {
    window.location.href = "./index.html";
    return;
  }

  state.roomCode = roomCode;
  setStoredRoomCode(roomCode);

  bindEvents();
  applyStaticTranslations(state.language);

  const room = await getRoom(roomCode);
  if (!room) {
    alert(getText(state.language, "roomNotFound"));
    window.location.href = "./index.html";
    return;
  }

  state.roomData = room;
  hydrateRoomView();
  setupRealtime();
  setupPresence();
}

function bindEvents() {
  languageSelect.addEventListener("change", () => {
    state.language = languageSelect.value;
    setStoredLanguage(state.language);
    applyStaticTranslations(state.language);
    hydrateRoomHeader();
  });

  goHome.addEventListener("click", () => {
    window.location.href = "./index.html";
  });

  metaCard.addEventListener("click", () => {
    if (state.keyboardOpen) {
      return;
    }
    window.location.href = `./index.html?mode=wizard&room=${state.roomCode}`;
  });

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) {
      closeContextMenu();
      return;
    }

    if (!event.target.closest(".context-menu")) {
      closeContextMenu();
    }
  });

  document.addEventListener("scroll", closeContextMenu, true);

  document.addEventListener("focusin", (event) => {
    if (!(event.target instanceof HTMLElement)) {
      return;
    }

    if (event.target.classList.contains("block-text")) {
      setKeyboardOpen(true);
    }
  });

  document.addEventListener("focusout", () => {
    requestAnimationFrame(() => {
      const active = document.activeElement;
      const isBlockTextFocused = active instanceof HTMLElement && active.classList.contains("block-text");
      if (!isBlockTextFocused) {
        setKeyboardOpen(false);
      }
    });
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", handleViewportResize);
    window.visualViewport.addEventListener("scroll", handleViewportResize);
  }
}

function hydrateRoomView() {
  hydrateRoomHeader();
  renderCharacterButtons();

  const rawText = state.roomData?.script?.rawText || "";
  state.blocks = parseRawScript(rawText, state.roomData.metadata?.characters || []);
  state.lastRemoteRaw = serializeBlocks(state.blocks);
  renderBlocks();
}

function hydrateRoomHeader() {
  const metadata = state.roomData?.metadata || {};
  let charsStr = getText(state.language, "noCharacters");
  if (Array.isArray(metadata.characters) && metadata.characters.length) {
    charsStr = metadata.characters.map(c => typeof c === "object" ? c.name : c).join(", ");
  }

  roomLabel.textContent = `${getText(state.language, "roomLabel")} ${state.roomCode}`;
  metaTitle.textContent = metadata.title || getText(state.language, "untitled");
  metaSubtitle.textContent = `${metadata.setting || "—"} • ${metadata.genre || "—"}`;
  metaCharacters.textContent = charsStr;
}

function renderCharacterButtons() {
  characterButtons.innerHTML = "";
  const characters = state.roomData?.metadata?.characters || [];

  const descButton = document.createElement("button");
  descButton.type = "button";
  descButton.textContent = "📝";
  descButton.addEventListener("click", () => {
    insertBlock("paragraph", "", state.blocks.length, { justCreated: true });
  });
  characterButtons.appendChild(descButton);

  characters.forEach((charObj) => {
    const characterName = typeof charObj === "object" ? charObj.name : charObj;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = characterName;
    button.addEventListener("click", () => applyCharacterToSelection(characterName));
    characterButtons.appendChild(button);
  });
}

function applyCharacterToSelection(character) {
  const activeBlock = state.blocks[state.activeIndex];
  console.log("Applying character", character, "to active block", activeBlock);

  if (!activeBlock || activeBlock.type !== "paragraph") {
    showPanelNotice("Crea un nuevo bloque en blanco para añadir un personaje.");
    return;
  }

  if (!activeBlock.justCreated) {
    showPanelNotice("Crea un nuevo bloque en blanco para añadir un personaje.");
    return;
  }

  if ((activeBlock.text || "").trim()) {
    showPanelNotice("Crea un nuevo bloque en blanco para añadir un personaje.");
    return;
  }

  console.log(`Active block ${state.activeIndex} is empty paragraph, converting to dialogue`);
  activeBlock.type = "dialogue";
  activeBlock.character = String(character).toUpperCase();
  activeBlock.justCreated = false;
  state.typingLockUntil = Date.now() + 1000;
  scheduleSave();
  renderBlocks();
  focusActiveTextAtEnd();
  updatePresenceNow(false);
}

function renderBlocks() {
  console.log("Rendering script blocks. Current block count:", state.blocks.length);
  scriptCanvas.innerHTML = "";

  state.blocks.forEach((block, index) => {
    const lockedByOther = isBlockLockedByOther(index);
    const node = document.createElement("article");
    node.className = `block ${block.type}`;
    node.dataset.index = String(index);
    if (index === state.activeIndex) {
      node.classList.add("active");
    }
    if (lockedByOther) {
      node.classList.add("locked");
    }

    if (block.type === "dialogue") {
      const cue = document.createElement("div");
      cue.className = "dialogue-character";
      cue.textContent = `${block.character || "CHARACTER"}:`;
      node.appendChild(cue);
    }

    const textNode = document.createElement("div");
    textNode.className = "block-text";
    textNode.contentEditable = String(!lockedByOther);
    textNode.spellcheck = true;
    textNode.innerHTML = formatBlockHTML(block.text, block.type);

    textNode.addEventListener("input", () => {
      console.log(`Input event on block ${index}. Current text length: ${textNode.textContent?.length}`);
      if (isBlockLockedByOther(index)) {
        console.warn(`Block ${index} is locked by another user. Reverting local change.`);
        textNode.innerHTML = formatBlockHTML(state.blocks[index].text || "", state.blocks[index].type);
        return;
      }
      // Get plain text from the editable div
      let nextRaw = textNode.innerText || "";

      // Auto-capitalize after a dot followed by space/newline and a parenthesis
      // e.g. ". (l" -> ". (L" or ". )l" -> ". )L"
      nextRaw = nextRaw.replace(/(\.\s*[\(\)]\s*)([a-z])/g, (match, p1, p2) => p1 + p2.toUpperCase());

      state.blocks[index].text = nextRaw;
      if (state.blocks[index].type === "paragraph" && nextRaw.trim()) {
        state.blocks[index].justCreated = false;
      }
      state.typingLockUntil = Date.now() + 1000;
      scheduleSave();
      updatePresenceNow(true);

      // Re-render italics formatting if needed
      const currentHTML = textNode.innerHTML;
      const expectedHTML = formatBlockHTML(nextRaw, state.blocks[index].type);
      if (currentHTML !== expectedHTML) {
        const offset = getCaretOffset(textNode);
        textNode.innerHTML = expectedHTML;
        // Restore caret position accurately instead of jumping to end
        setCaretOffset(textNode, offset);
      }
    });

// Formats text based on block type. Paragraphs are fully italicized.
// Dialogue blocks only italicize portions within parentheses.
function formatBlockHTML(text, type) {
  if (!text) return "";
  if (type === "paragraph" || type === "action") {
    return `<i>${text}</i>`;
  }
  // Replace (content) with <i>(content)</i>, non-greedy for nested/adjacent
  return text.replace(/\(([^)]*)\)/g, (match) => `<i>${match}</i>`);
}

    node.appendChild(textNode);
    textNode.addEventListener("click", () => {
      console.log(`Block text ${index} clicked.`);
      if (isBlockLockedByOther(index)) {
        return;
      }
      selectBlock(index, false);
    });

    textNode.addEventListener("focus", () => {
      console.log(`Block text ${index} focused.`);
      if (isBlockLockedByOther(index)) {
        return;
      }
      selectBlock(index, false);
      updatePresenceNow(false);
    });

    node.addEventListener("click", () => {
      console.log(`Block ${index} clicked.`);
      if (isBlockLockedByOther(index)) {
        console.log(`Block ${index} is locked. Interaction restricted.`);
        return;
      }
      selectBlock(index, true);
    });

    node.addEventListener("contextmenu", (event) => {
      console.log(`Context menu requested for block ${index}.`);
      if (isBlockLockedByOther(index)) {
        event.preventDefault();
        closeContextMenu();
        return;
      }
      event.preventDefault();
      selectBlock(index, false);
      openContextMenu(index, event.clientX, event.clientY);
    });

    node.addEventListener("pointerdown", (event) => {
      if (isBlockLockedByOther(index)) {
        return;
      }
      clearTimeout(state.longPressTimer);
      state.longPressTimer = setTimeout(() => {
        console.log(`Long press detected on block ${index}. Opening context menu.`);
        if (isBlockLockedByOther(index)) {
          return;
        }
        // Inhibit selection and keyboard on mobile long-press
        if (window.getSelection) {
          window.getSelection().removeAllRanges();
        }
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        selectBlock(index, false);
        openContextMenu(index, event.clientX, event.clientY);
      }, 480);
    });

    node.addEventListener("pointerup", () => {
      clearTimeout(state.longPressTimer);
    });

    node.addEventListener("pointercancel", () => {
      clearTimeout(state.longPressTimer);
    });

    node.addEventListener("pointerleave", () => {
      clearTimeout(state.longPressTimer);
    });

    scriptCanvas.appendChild(node);
  });

  const blankTarget = document.createElement("div");
  blankTarget.className = "blank-target";
  blankTarget.addEventListener("click", () => {
    console.log("Blank target clicked. Appending new paragraph at end.");
    insertBlock("paragraph", "", state.blocks.length, { justCreated: true });
  });
  scriptCanvas.appendChild(blankTarget);
  applyPresenceHighlightsToDom();
}

function selectBlock(index, focusEditor) {
  console.log(`Selecting block at index ${index}. Focus editor: ${focusEditor}`);
  if (isBlockLockedByOther(index)) {
    console.warn(`Selection failed: Block ${index} is currently locked by another user.`);
    return;
  }

  const hasChanged = state.activeIndex !== index;
  state.activeIndex = index;

  if (hasChanged) {
    syncActiveBlockStyles();
  }

  if (!focusEditor) {
    return;
  }

  const activeText = scriptCanvas.querySelector(`.block[data-index="${state.activeIndex}"] .block-text`);
  if (!activeText) {
    return;
  }

  if (hasChanged) {
    console.log("New block selected, focusing and moving caret to end.");
    activeText.focus();
    moveCaretToEnd(activeText);
  } else {
    console.log("Same block re-selected, ensuring focus but NOT moving caret.");
    if (document.activeElement !== activeText) {
      activeText.focus();
    }
  }

  updatePresenceNow(false);
}

function insertBlock(type, character = "", targetIndex = null, options = {}) {
  console.log(`Inserting new block of type "${type}" at target index: ${targetIndex}`);
  const index = targetIndex === null
    ? (state.activeIndex >= 0 ? state.activeIndex + 1 : state.blocks.length)
    : targetIndex;

  const block = {
    type,
    character: type === "dialogue" ? String(character || "CHARACTER").toUpperCase() : "",
    text: "",
    justCreated: Boolean(options.justCreated)
  };

  state.blocks.splice(index, 0, block);
  state.activeIndex = index;
  console.log(`New block inserted. Updated state.activeIndex to: ${index}`);
  state.typingLockUntil = Date.now() + 1000;
  scheduleSave();
  renderBlocks();

  focusActiveTextAtEnd();

  updatePresenceNow(false);
}

function focusActiveTextAtEnd() {
  console.log("Focusing active block text and moving caret to end.");
  const activeText = scriptCanvas.querySelector(".block.active .block-text");
  if (!activeText) {
    console.warn("Focus failed: No active block text element found in DOM.");
    return;
  }

  activeText.contentEditable = String(!isBlockLockedByOther(state.activeIndex));
  activeText.focus();
  moveCaretToEnd(activeText);
}

function openContextMenu(index, x, y) {
  console.log(`Opening context menu for block ${index} at coordination (${x}, ${y}).`);
  state.contextIndex = index;
  contextMenu.innerHTML = "";

  const actions = [
    { key: "contextDelete", action: () => { console.log(`Action: Delete block at ${index}`); deleteBlock(index); } },
    { key: "contextAddBefore", action: () => { console.log(`Action: Insert paragraph before block ${index}`); insertBlock("paragraph", "", index); } },
    { key: "contextAddAfter", action: () => { console.log(`Action: Insert paragraph after block ${index}`); insertBlock("paragraph", "", index + 1); } }
  ];

  actions.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = getText(state.language, item.key);
    button.addEventListener("click", (menuEvent) => {
      menuEvent.stopPropagation();
      item.action();
      closeContextMenu();
    });
    contextMenu.appendChild(button);
  });

  contextMenu.classList.remove("hidden");
  const maxX = Math.max(8, window.innerWidth - 180);
  const maxY = Math.max(8, window.innerHeight - 220);
  contextMenu.style.left = `${Math.min(x, maxX)}px`;
  contextMenu.style.top = `${Math.min(y, maxY)}px`;
}

function closeContextMenu() {
  if (!contextMenu.classList.contains("hidden")) {
    console.log("Closing context menu.");
    contextMenu.classList.add("hidden");
  }
}

function deleteBlock(index) {
  console.log(`Attempting to delete block at index ${index}.`);
  if (index < 0 || index >= state.blocks.length) {
    console.warn(`Deletion aborted: index ${index} is out of bounds.`);
    return;
  }

  if (isBlockLockedByOther(index)) {
    console.warn(`Deletion aborted: block ${index} is locked.`);
    return;
  }

  state.blocks.splice(index, 1);
  state.activeIndex = -1;

  state.typingLockUntil = Date.now() + 1000;
  scheduleSave();
  renderBlocks();
  updatePresenceNow(false);
}

function scheduleSave() {
  console.log("Save operation scheduled.");
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(async () => {
    const rawText = serializeBlocks(state.blocks);
    if (rawText === state.lastRemoteRaw) {
      console.log("Save skipped: current blocks match remote state.");
      return;
    }

    console.log("Persisting script changes to Firebase...");
    state.lastRemoteRaw = rawText;
    await updateScript(state.roomCode, rawText, state.userName || "Guest");
  }, 220);
}

function setupRealtime() {
  console.log("Initializing real-time script synchronization.");
  cleanupSubscriptions();

  state.roomUnsubscribe = subscribeToRoom(state.roomCode, (room) => {
    console.log("Received script update from Firebase.");
    if (!room) {
      console.error("Critical: Received null room data from subscription.");
      return;
    }

    state.roomData = room;
    hydrateRoomHeader();
    renderCharacterButtons();

    const remoteRaw = room.script?.rawText || "";
    if (Date.now() < state.typingLockUntil) {
      console.log("Incoming remote update ignored due to active local typing lock.");
      return;
    }

    const localRaw = serializeBlocks(state.blocks);
    if (remoteRaw === localRaw) {
      console.log("No differences detected between local and remote script.");
      state.lastRemoteRaw = remoteRaw;
      return;
    }

    console.log("Synchronizing script blocks with remote data.");
    state.blocks = parseRawScript(remoteRaw, room.metadata?.characters || []);
    state.lastRemoteRaw = remoteRaw;
    if (state.activeIndex >= state.blocks.length) {
      state.activeIndex = state.blocks.length - 1;
    }
    renderBlocks();
  });
}

async function setupPresence() {
  console.log("Registering user presence for the session.");
  await registerPresence(state.roomCode, state.localUserId, {
    name: state.userName || "Guest",
    line: 1,
    mode: "editing",
    isEditing: false
  });

  state.presenceUnsubscribe = subscribeToPresence(state.roomCode, (presenceMap) => {
    console.log("Presence update received. Re-rendering presence chips.");
    presenceInline.innerHTML = "";
    state.presenceByUserId = buildColoredPresenceMap(presenceMap);

    Object.entries(state.presenceByUserId).forEach(([userId, payload]) => {
      const chip = document.createElement("span");
      const name = payload.name || "Guest";
      const suffix = userId === state.localUserId ? ` (${getText(state.language, "you")})` : "";
      chip.textContent = `${name}${suffix}`;
      chip.style.borderColor = payload.color;
      chip.style.color = payload.color;
      presenceInline.appendChild(chip);
    });

    applyPresenceHighlightsToDom();
  });

  scriptCanvas.addEventListener("click", () => {
    console.log("Global canvas click. Refreshing user presence.");
    updatePresenceNow(false);
  });
}

async function updatePresenceNow(isEditing) {
  console.log(`Updating presence. Index: ${state.activeIndex}, Is Editing: ${isEditing}`);
  const line = state.activeIndex >= 0 ? state.activeIndex + 1 : 1;
  const activeBlock = state.blocks[state.activeIndex];
  const mode = activeBlock?.type === "dialogue" ? "dialogue" : "paragraph";
  await updatePresence(state.roomCode, state.localUserId, {
    name: state.userName || "Guest",
    line,
    mode,
    isEditing
  });
}

function buildColoredPresenceMap(presenceMap) {
  console.log("Building color-mapped presence object.");
  const entries = Object.entries(presenceMap || {}).filter(([, payload]) => !!payload);
  const result = {};

  entries.forEach(([userId, payload], index) => {
    result[userId] = {
      ...payload,
      color: presencePalette[index % presencePalette.length]
    };
  });

  return result;
}

function buildLineColorMap() {
  console.log("Generating current line highlight color configuration.");
  const lineColors = new Map();
  const entries = Object.values(state.presenceByUserId || {});

  entries.forEach((payload) => {
    const line = Number(payload.line || 1);
    if (!lineColors.has(line) && payload.color) {
      lineColors.set(line, payload.color);
    }
  });

  return lineColors;
}

function getLockerForIndex(index) {
  const targetLine = index + 1;
  const entries = Object.entries(state.presenceByUserId || {});
  const locker = entries.find(([userId, payload]) => {
    if (userId === state.localUserId || !payload) {
      return false;
    }

    const line = Number(payload.line || 1);
    return payload.isEditing === true && line === targetLine;
  }) || null;

  if (locker) {
    console.log(`Block ${index} is locked by user ID: ${locker[0]}`);
  }
  return locker;
}

function isBlockLockedByOther(index) {
  return Boolean(getLockerForIndex(index));
}

function applyPresenceHighlightsToDom() {
  console.log("Applying presence highlights to script block elements.");
  const lineColors = buildLineColorMap();
  const nodes = scriptCanvas.querySelectorAll(".block");

  nodes.forEach((node, index) => {
    const lockedByOther = isBlockLockedByOther(index);
    const color = lineColors.get(index + 1);
    if (color) {
      node.classList.add("presence-highlight");
      node.style.setProperty("--presence-color", color);
    } else {
      node.classList.remove("presence-highlight");
      node.style.removeProperty("--presence-color");
    }

    node.classList.toggle("locked", lockedByOther);

    const textNode = node.querySelector(".block-text");
    if (textNode instanceof HTMLElement) {
      const canEdit = !lockedByOther;
      textNode.contentEditable = String(canEdit);
      if (!canEdit && document.activeElement === textNode) {
        console.log(`Blurring inactive/locked block-text at index ${index}.`);
        textNode.blur();
      }
    }

    if (lockedByOther && index === state.activeIndex) {
      console.log(`Current user was active on block ${index}, which is now locked. Ejecting selection.`);
      state.activeIndex = -1;
      node.classList.remove("active");
    }
  });
}

function parseRawScript(rawText, characters) {
  console.log("Parsing raw script content into block objects.");
  const chunks = rawText
    .split(/\n\s*\n/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  if (!chunks.length) {
    return [];
  }

  return chunks.map((chunk) => {
    const lines = chunk.split("\n");
    const first = lines[0] || "";
    const dialogueMatch = first.match(/^([A-ZÁÉÍÓÚÑ0-9 ]+):$/);

    if (dialogueMatch) {
      const body = lines.slice(1).join("\n").trim();
      return {
        type: "dialogue",
        character: dialogueMatch[1].trim(),
        text: body
      };
    }

    if (/^\[.*\]$/.test(chunk)) {
      return {
        type: "action",
        character: "",
        text: chunk.slice(1, -1).trim()
      };
    }

    const type = characters.includes(first.trim()) ? "dialogue" : "paragraph";
    return {
      type,
      character: type === "dialogue" ? first.trim() : "",
      text: chunk
    };
  });
}

function serializeBlocks(blocks) {
  console.log(`Serializing ${blocks.length} blocks to raw text format.`);
  return blocks
    .map((block) => {
      const normalized = block.text || "";
      if (block.type === "dialogue") {
        return `${(block.character || "CHARACTER").toUpperCase()}:\n${normalized}`.trim();
      }

      if (block.type === "action") {
        return `[${block.text.trim()}]`;
      }

      return normalized;
    })
    .filter(Boolean)
    .join("\n\n");
}

function setKeyboardOpen(isOpen) {
  console.log(`Setting state.keyboardOpen to: ${isOpen}`);
  state.keyboardOpen = isOpen;
  document.body.classList.toggle("keyboard-open", isOpen);
  adjustViewportLayout();
}

function handleViewportResize() {
  console.log("Handling viewport resize.");
  adjustViewportLayout();
  if (!window.visualViewport) {
    return;
  }

  const keyboardLikelyOpen = window.innerHeight - window.visualViewport.height > 140;
  console.log(`Heuristic evaluation: Keyboard likely open: ${keyboardLikelyOpen}`);
  setKeyboardOpen(keyboardLikelyOpen);
}

function adjustViewportLayout() {
  console.log("Adjusting overall layout for viewport changes.");
  if (!window.visualViewport) {
    return;
  }

  const keyboardOffset = Math.max(0, window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop);
  commandPanel.style.bottom = `${keyboardOffset}px`;
  document.documentElement.style.setProperty("--keyboard-offset", `${keyboardOffset}px`);
}

adjustViewportLayout();

function showPanelNotice(message) {
  if (!panelNotice) {
    return;
  }

  panelNotice.textContent = message;
  panelNotice.classList.remove("hidden");
  clearTimeout(showPanelNotice.timer);
  showPanelNotice.timer = setTimeout(() => {
    panelNotice.classList.add("hidden");
  }, 1300);
}

function syncActiveBlockStyles() {
  const nodes = scriptCanvas.querySelectorAll(".block");
  nodes.forEach((node, index) => {
    node.classList.toggle("active", index === state.activeIndex);
  });
}

function moveCaretToEnd(element) {
  console.log("Moving caret to the end of the text element.");
  if (!element.isConnected) {
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  if (!selection) {
    return;
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

function getCaretOffset(element) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return 0;
  const range = selection.getRangeAt(0);
  const preCaretRange = range.cloneRange();
  preCaretRange.selectNodeContents(element);
  preCaretRange.setEnd(range.endContainer, range.endOffset);
  return preCaretRange.toString().length;
}

function setCaretOffset(element, offset) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  let currentOffset = 0;
  let targetNode = null;
  let targetOffset = 0;

  function traverse(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const nextOffset = currentOffset + node.length;
      if (offset >= currentOffset && offset <= nextOffset) {
        targetNode = node;
        targetOffset = offset - currentOffset;
        return true;
      }
      currentOffset = nextOffset;
    } else {
      for (const child of node.childNodes) {
        if (traverse(child)) return true;
      }
    }
  }

  traverse(element);
  if (targetNode) {
    range.setStart(targetNode, targetOffset);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  } else {
    moveCaretToEnd(element);
  }
}

function cleanupSubscriptions() {
  console.log("Cleaning up active database subscriptions.");
  if (state.roomUnsubscribe) {
    state.roomUnsubscribe();
    state.roomUnsubscribe = null;
  }

  if (state.presenceUnsubscribe) {
    state.presenceUnsubscribe();
    state.presenceUnsubscribe = null;
  }
}

function makeUserId() {
  console.log("Generating unique local user session identifier.");
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  return `u-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

init().catch((error) => {
  console.error("Critical: Initialization failure.", error);
  alert("Editor failed to load.");
  window.location.href = "./index.html";
});
