"use client";

import { avatarInitial } from "@/lib/profile";

// Shared avatar: shows the image when present, otherwise a gold first-letter
// fallback. Used across settings, reviews, and anywhere a profile is shown.
export default function Avatar({ src, name, size = 44, className = "" }) {
  const dim = { width: size, height: size };

  if (src) {
    return (
      <img
        src={src}
        alt={name || "صورة المستخدم"}
        style={dim}
        className={`rounded-full object-cover ring-2 ring-champagne-300 ${className}`}
      />
    );
  }

  return (
    <span
      style={{ ...dim, fontSize: size * 0.42 }}
      className={`flex items-center justify-center rounded-full bg-gold-gradient font-extrabold text-white shadow-gold ${className}`}
    >
      {avatarInitial(name)}
    </span>
  );
}
