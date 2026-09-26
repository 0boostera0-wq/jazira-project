"use client";

// Browser-only helpers for picked media files (dimensions + video length).
import { MEDIA_LIMITS, mediaKindOf, validateMediaFile } from "./model";

/**
 * Validate a picked file and read what the upload needs.
 * → { kind, dims, duration? } or { error } where error is a
 *   `community.composer.errors.*` key.
 */
export async function prepareMedia(file, kindHint) {
  const kind = kindHint || mediaKindOf(file?.type) || "image";
  const error = validateMediaFile(file, kind);
  if (error) return { error };
  if (kind === "video") {
    try {
      const info = await readVideoInfo(file);
      if (!Number.isFinite(info.duration)) return { error: "videoRead" };
      if (info.duration > MEDIA_LIMITS.videoSeconds + 0.5) return { error: "videoLength" };
      return { kind, dims: { width: info.width, height: info.height }, duration: info.duration };
    } catch {
      return { error: "videoRead" };
    }
  }
  return { kind, dims: await readImageDims(file) };
}

/** Natural pixel size of an image file, or null if it can't be decoded. */
export function readImageDims(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

/** { duration, width, height } of a video file; rejects when unreadable. */
export function readVideoInfo(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => {
      resolve({ duration: v.duration, width: v.videoWidth, height: v.videoHeight });
      URL.revokeObjectURL(url);
    };
    v.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable")); };
    v.src = url;
  });
}
