"use client";

import { useState } from "react";
import Image from "next/image";
import { Float } from "./motion/Reveal";

// Renders /public/illustrations/<name> via next/image (auto WebP/AVIF, correct
// responsive sizing, async decode → far cheaper on weak devices). Falls back to
// an elegant CSS placeholder if the file is missing.
export default function Illustration({
  name,
  icon: Icon,
  alt = "",
  className = "",
  float = true,
  ratio = "4 / 3",
  priority = false,
  sizes = "(max-width: 768px) 92vw, 45vw",
}) {
  const [errored, setErrored] = useState(false);
  const showImg = name && !errored;

  const shell = (
    <div className={`relative bezel ${className}`}>
      <div
        className="bezel-core relative overflow-hidden"
        style={{ background: "linear-gradient(135deg,#fffdf9,#f3e9d4)", aspectRatio: ratio }}
      >
        {showImg ? (
          <Image
            src={`/illustrations/${name}`}
            alt={alt}
            fill
            sizes={sizes}
            priority={priority}
            onError={() => setErrored(true)}
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {Icon && <Icon strokeWidth={1.1} className="h-1/4 w-1/4 text-champagne-500/60" />}
          </div>
        )}
      </div>
      {/* ambient gold glow behind the plate */}
      <div
        className="pointer-events-none absolute -inset-8 -z-10 rounded-[3rem] opacity-70 blur-3xl"
        style={{ background: "radial-gradient(45% 45% at 50% 45%, rgba(201,162,39,0.20), transparent 70%)" }}
      />
    </div>
  );

  return float ? <Float amount={9} duration={7}>{shell}</Float> : shell;
}
