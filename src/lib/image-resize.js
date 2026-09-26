// ============================================================================
// Client-side image downscaling before upload (browser only).
//
// Phone photos are often 3–12 MB and 4000 px wide, but the app shows them at
// card width (posts) or 32–96 px (avatars). Re-encoding before upload keeps
// feeds light on mobile data and, as a side effect, strips EXIF metadata
// (GPS position, device) that the original file carries.
//
//   const out = await downscaleImage(file, { maxSide: 1600 });
//   // → { file, width, height } | null (null = upload the original)
//
// GIFs (animation) and videos are never touched. Any failure returns null so
// the caller falls back to the original file — never a broken upload.
// ============================================================================

const RESIZABLE = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export const IMAGE_PRESETS = Object.freeze({
  post: { maxSide: 1600, quality: 0.82 },
  avatar: { maxSide: 256, quality: 0.85, square: true },
});

async function decode(file) {
  if (typeof createImageBitmap !== "function") return null;
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    try { return await createImageBitmap(file); } catch { return null; }
  }
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(w, h);
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

async function encode(canvas, type, quality) {
  try {
    if (typeof canvas.convertToBlob === "function") return await canvas.convertToBlob({ type, quality });
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
  } catch {
    return null;
  }
}

/**
 * @param {File|Blob} file
 * @param {{ maxSide?: number, quality?: number, square?: boolean }} [opts]
 *   square: centre-crop to a square first (avatars).
 * @returns {Promise<{ file: File, width: number, height: number } | null>}
 */
export async function downscaleImage(file, { maxSide = 1600, quality = 0.82, square = false } = {}) {
  if (!file || typeof window === "undefined" || !RESIZABLE.has(file.type)) return null;
  const bitmap = await decode(file);
  if (!bitmap) return null;
  try {
    let sx = 0;
    let sy = 0;
    let sw = bitmap.width;
    let sh = bitmap.height;
    if (!sw || !sh) return null;
    if (square) {
      const side = Math.min(sw, sh);
      sx = Math.floor((sw - side) / 2);
      sy = Math.floor((sh - side) / 2);
      sw = side;
      sh = side;
    }
    const scale = Math.min(1, maxSide / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale));
    const h = Math.max(1, Math.round(sh * scale));
    // Already small, not cropped and not a JPEG (the format that carries
    // camera EXIF): keep the original bytes.
    if (scale === 1 && !square && file.type !== "image/jpeg" && file.size <= 400 * 1024) return null;

    const canvas = makeCanvas(w, h);
    const ctx = canvas?.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h);

    // WebP keeps transparency and is smallest; browsers that cannot encode it
    // hand back PNG, in which case JPEG (opaque sources) or PNG is used.
    let blob = await encode(canvas, "image/webp", quality);
    if (!blob || blob.type !== "image/webp") {
      const opaque = file.type === "image/jpeg";
      blob = await encode(canvas, opaque ? "image/jpeg" : "image/png", quality);
    }
    if (!blob || !RESIZABLE.has(blob.type)) return null;
    // Re-encoding a small, already-compressed image can make it bigger; keep
    // the original then (unless it is a JPEG, whose EXIF we want gone).
    if (scale === 1 && !square && blob.size >= file.size && file.type !== "image/jpeg") return null;

    const ext = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png", "image/avif": "avif" }[blob.type];
    const base = (typeof file.name === "string" && file.name.replace(/\.[^.]+$/, "")) || "image";
    const out = typeof File === "function" ? new File([blob], `${base}.${ext}`, { type: blob.type }) : blob;
    return { file: out, width: w, height: h };
  } finally {
    bitmap.close?.();
  }
}
