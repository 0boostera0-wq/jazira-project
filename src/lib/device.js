// Best-effort device label from the User-Agent. Browsers do NOT expose the real
// hardware name, so we report OS + browser + device type only (honest labels).
export function parseDevice(ua) {
  const s = ua || (typeof navigator !== "undefined" ? navigator.userAgent : "") || "";
  const l = s.toLowerCase();

  let os = "نظام غير معروف";
  if (/windows/.test(l)) os = "Windows";
  else if (/iphone|ipad|ipod/.test(l)) os = "iOS";
  else if (/mac os x|macintosh/.test(l)) os = "macOS";
  else if (/android/.test(l)) os = "Android";
  else if (/linux/.test(l)) os = "Linux";

  let browser = "متصفح";
  if (/edg\//.test(l)) browser = "Edge";
  else if (/opr\/|opera/.test(l)) browser = "Opera";
  else if (/chrome\//.test(l) && !/edg\//.test(l)) browser = "Chrome";
  else if (/firefox\//.test(l)) browser = "Firefox";
  else if (/safari\//.test(l) && !/chrome|crios|android/.test(l)) browser = "Safari";

  let deviceType = "حاسوب";
  if (/ipad|tablet/.test(l)) deviceType = "جهاز لوحي";
  else if (/mobile|iphone|android/.test(l)) deviceType = "جوال";

  return { os, browser, deviceType, label: `${os} — ${browser}`, userAgent: s.slice(0, 400) };
}
