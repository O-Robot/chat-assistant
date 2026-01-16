export function getUserInfo() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("userInfo");
  return raw ? JSON.parse(raw) : null;
}

export function setUserInfo(info: any) {
  if (typeof window === "undefined") return;
  localStorage.setItem("userInfo", JSON.stringify(info));
}

export function clearUserInfo() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("userInfo");
}

// session id helpers
export function getSessionId() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("sessionId");
}

export function setSessionId(id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("sessionId", id);
}

// clear session but keep user info
export function endChat() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("sessionId");
}
