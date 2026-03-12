export function getRoute() {
  const hash = window.location.hash || "#/";
  const normalized = hash.startsWith("#") ? hash.slice(1) : hash;
  const parts = normalized.split("/").filter(Boolean);

  if (parts.length === 0) {
    return { name: "home" };
  }

  if (parts[0] === "wizard") {
    return { name: "wizard" };
  }

  if (parts[0] === "room" && parts[1]) {
    return { name: "room", roomCode: parts[1] };
  }

  return { name: "home" };
}

export function goHome() {
  window.location.hash = "#/";
}

export function goWizard() {
  window.location.hash = "#/wizard";
}

export function goRoom(roomCode) {
  window.location.hash = `#/room/${roomCode}`;
}
