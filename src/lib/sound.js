// Global UI-sound gate. Every UI sound MUST go through playSound() so the
// "المؤثرات الصوتية" preference silences the entire site, not just the toggle.
let enabled = true;

export function setSoundEnabled(value) {
  enabled = !!value;
}

export function isSoundEnabled() {
  return enabled;
}

export function playSound(src, volume = 0.5) {
  if (!enabled || typeof window === "undefined") return;
  try {
    const audio = new Audio(src);
    audio.volume = volume;
    audio.play().catch(() => {});
  } catch {
    // ignore playback failures (autoplay policy, missing file, etc.)
  }
}
