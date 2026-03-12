import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  get,
  onValue,
  update,
  runTransaction,
  serverTimestamp,
  onDisconnect
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const ROOMS_ROOT = "salas";
const COUNTER_PATH = `${ROOMS_ROOT}/_meta/lastRoomId`;

function sanitizeCharacters(charactersRaw) {
  return charactersRaw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function buildInitialScript(metadata) {
  const title = metadata.title || "Untitled";
  const argument = metadata.argument || "";
  const characters = metadata.characters.length ? metadata.characters.join(", ") : "No characters";

  return [
    title.toUpperCase(),
    "",
    `[Synopsis] ${argument}`,
    `[Characters] ${characters}`,
    "",
    "[Scene 1]",
    ""
  ].join("\n");
}

export async function createRoom({ name, title, argument, characters, setting, genre }) {
  const counterRef = ref(db, COUNTER_PATH);
  const roomIdResult = await runTransaction(counterRef, (current) => {
    const currentNumber = Number.isInteger(current) ? current : 999;
    if (currentNumber >= 9999) {
      return current;
    }
    return currentNumber + 1;
  });

  if (!roomIdResult.committed) {
    throw new Error("Room counter transaction was not committed.");
  }

  const roomNumeric = roomIdResult.snapshot.val();
  if (roomNumeric > 9999) {
    throw new Error("max-room-limit");
  }

  const roomCode = String(roomNumeric).padStart(4, "0");
  const cleanedCharacters = sanitizeCharacters(characters);

  const metadata = {
    title: title.trim(),
    argument: argument.trim(),
    characters: cleanedCharacters,
    setting: setting.trim(),
    genre: genre.trim(),
    createdBy: name,
    createdAt: serverTimestamp()
  };

  const roomRef = ref(db, `${ROOMS_ROOT}/${roomCode}`);
  await set(roomRef, {
    metadata,
    script: {
      rawText: buildInitialScript(metadata),
      updatedAt: serverTimestamp(),
      updatedBy: name
    }
  });

  return roomCode;
}

export async function getRoom(roomCode) {
  const roomRef = ref(db, `${ROOMS_ROOT}/${roomCode}`);
  const snapshot = await get(roomRef);
  if (!snapshot.exists()) {
    return null;
  }
  return snapshot.val();
}

export async function updateRoomMetadata(roomCode, { title, argument, characters, setting, genre, updatedBy }) {
  const metadataRef = ref(db, `${ROOMS_ROOT}/${roomCode}/metadata`);
  const cleanedCharacters = sanitizeCharacters(characters);
  await update(metadataRef, {
    title: title.trim(),
    argument: argument.trim(),
    characters: cleanedCharacters,
    setting: setting.trim(),
    genre: genre.trim(),
    updatedBy,
    updatedAt: serverTimestamp()
  });
}

export function subscribeToRoom(roomCode, callback) {
  const roomRef = ref(db, `${ROOMS_ROOT}/${roomCode}`);
  return onValue(roomRef, (snapshot) => {
    callback(snapshot.val());
  });
}

export async function updateScript(roomCode, rawText, userName) {
  const scriptRef = ref(db, `${ROOMS_ROOT}/${roomCode}/script`);
  await update(scriptRef, {
    rawText,
    updatedAt: serverTimestamp(),
    updatedBy: userName
  });
}

export function subscribeToPresence(roomCode, callback) {
  const presenceRef = ref(db, `${ROOMS_ROOT}/${roomCode}/presence`);
  return onValue(presenceRef, (snapshot) => {
    callback(snapshot.val() ?? {});
  });
}

export async function registerPresence(roomCode, userId, payload) {
  const userRef = ref(db, `${ROOMS_ROOT}/${roomCode}/presence/${userId}`);
  await set(userRef, {
    ...payload,
    updatedAt: serverTimestamp()
  });

  const disconnect = onDisconnect(userRef);
  disconnect.remove();
}

export async function updatePresence(roomCode, userId, payload) {
  const userRef = ref(db, `${ROOMS_ROOT}/${roomCode}/presence/${userId}`);
  await update(userRef, {
    ...payload,
    updatedAt: serverTimestamp()
  });
}
