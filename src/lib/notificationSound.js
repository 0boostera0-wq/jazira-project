// Subtle "water drop" notification sound, synthesized with Web Audio (no asset).
// Respects browser autoplay rules (AudioContext resumes only after a user
// gesture) and only plays when the caller says the user's setting is enabled.

let ctx = null;
let enabled = true; // mirrors the user's saved preference (set via setSoundEnabled)

export function setSoundEnabled(v) {
  enabled = !!v;
}

function getCtx() {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  } catch {
    return null;
  }
}

// Call once from a user-gesture handler (e.g. opening the app) to unlock audio.
export function primeAudio() {
  const c = getCtx();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}

export function playNotificationSound() {
  if (!enabled) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") { c.resume().catch(() => {}); return; }
  try {
    const t = c.currentTime;
    // a soft, quick pitch-drop with a gentle envelope — like a water droplet
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.12);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.34);
  } catch {
    /* ignore */
  }
}
