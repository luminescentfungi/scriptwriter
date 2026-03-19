const keys = {
  language: "scriptwriter.language",
  userName: "scriptwriter.userName",
  roomCode: "scriptwriter.roomCode"
};

export function getStoredLanguage() {
  return localStorage.getItem(keys.language) ?? "en";
}

export function setStoredLanguage(language) {
  localStorage.setItem(keys.language, language);
}

export function getStoredUserName() {
  return localStorage.getItem(keys.userName) ?? "";
}

export function setStoredUserName(name) {
  localStorage.setItem(keys.userName, name);
}

export function getStoredRoomCode() {
  return localStorage.getItem(keys.roomCode) ?? "";
}

export function setStoredRoomCode(code) {
  localStorage.setItem(keys.roomCode, code);
}

export function getRecentCharacters(roomCode) {
  try {
    const stored = localStorage.getItem(`scriptwriter.recentChars.${roomCode}`);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function updateRecentCharacters(roomCode, characterName) {
  let recent = getRecentCharacters(roomCode);
  recent = recent.filter(c => c !== characterName);
  recent.unshift(characterName);
  recent = recent.slice(0, 4);
  localStorage.setItem(`scriptwriter.recentChars.${roomCode}`, JSON.stringify(recent));
  return recent;
}
