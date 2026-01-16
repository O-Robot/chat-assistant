// Detect if we're on the dedicated chat domain
export const isChatDomain = () => {
  if (typeof window === "undefined") return false;
  console.log("Hostname:", window.location.port);
  return window.location.port === "3000";
  //   return window.location.hostname.startsWith("chat.");
};
