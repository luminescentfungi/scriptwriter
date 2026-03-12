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
