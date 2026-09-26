// Best-effort device description from the User-Agent. Browsers do NOT expose
// the real hardware name, so we report OS + browser + device type only
// (honest labels).
//
// Stored values are language-neutral codes, never UI text: the settings page
// translates them (settings/model.js deviceInfo()).
//   os:         "Windows" | "iOS" | "macOS" | "Android" | "Linux" | "unknown"
//   browser:    "Edge" | "Opera" | "Chrome" | "Firefox" | "Safari" | "unknown"
//   deviceType: "desktop" | "tablet" | "mobile"
export function parseDevice(ua) {
  const s = ua || (typeof navigator !== "undefined" ? navigator.userAgent : "") || "";
  const l = s.toLowerCase();

  let os = "unknown";
  if (/windows/.test(l)) os = "Windows";
  else if (/iphone|ipad|ipod/.test(l)) os = "iOS";
  else if (/mac os x|macintosh/.test(l)) os = "macOS";
  else if (/android/.test(l)) os = "Android";
  else if (/linux/.test(l)) os = "Linux";

  let browser = "unknown";
  if (/edg\//.test(l)) browser = "Edge";
  else if (/opr\/|opera/.test(l)) browser = "Opera";
  else if (/chrome\//.test(l) && !/edg\//.test(l)) browser = "Chrome";
  else if (/firefox\//.test(l)) browser = "Firefox";
  else if (/safari\//.test(l) && !/chrome|crios|android/.test(l)) browser = "Safari";

  let deviceType = "desktop";
  if (/ipad|tablet/.test(l)) deviceType = "tablet";
  else if (/mobile|iphone|android/.test(l)) deviceType = "mobile";

  return { os, browser, deviceType, label: `${os} — ${browser}`, userAgent: s.slice(0, 400) };
}
