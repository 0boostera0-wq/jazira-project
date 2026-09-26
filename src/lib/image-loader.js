// next/image loader for the illustration library (next.config.js → images.loaderFile).
//
// The Image Optimization API stays OFF (see next.config.js): library art is
// pre-rendered at build time by scripts/process-illustrations.mjs into fixed
// widths, so nothing is resized on request. A manifest `src` such as
// /images/landing/hero.webp is a logical name; the files on disk are
// /images/landing/hero-<width>.webp for every width in IMAGE_WIDTHS.
// Anything else (user media, remote avatars) is returned unchanged.

/** Rendered widths of every library image. Must equal next.config.js deviceSizes ∪ imageSizes. */
export const IMAGE_WIDTHS = [256, 384, 640, 960, 1280, 1536];

export default function imageLoader({ src, width }) {
  if (!src.startsWith("/images/") || !src.endsWith(".webp")) return src;
  const w = IMAGE_WIDTHS.find((x) => x >= width) ?? IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1];
  return `${src.slice(0, -5)}-${w}.webp`;
}
