"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

// Two small robot mascots that play in the chat background. They sit BEHIND the
// messages (low z-index), are semi-transparent and pointer-events-none, so they
// add life without ever blocking the conversation.
//
// Behaviour is scene-based and randomized: wandering, chasing, a tree-climb +
// coconut throw with a cartoon smoke puff on impact and a laugh, and a playful
// collision. Random waypoints + jitter give effectively endless variety.

function MiniRobot({ color = "#C9A86A", laughing = false, hurt = false }) {
  return (
    <svg width="40" height="46" viewBox="0 0 40 46" aria-hidden="true">
      <line x1="20" y1="3" x2="20" y2="9" stroke="#B8923F" strokeWidth="2" />
      <circle cx="20" cy="3" r="2.4" fill="#C9A227" />
      <rect x="6" y="9" width="28" height="22" rx="8" fill={color} stroke="#B8923F" strokeWidth="1.5" />
      <rect x="11" y="13" width="18" height="13" rx="5" fill="#FFFDF9" />
      {/* eyes */}
      {hurt ? (
        <>
          <path d="M14 18 l4 4 M18 18 l-4 4" stroke="#4A3F2F" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M22 18 l4 4 M26 18 l-4 4" stroke="#4A3F2F" strokeWidth="1.6" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="16" cy="20" r="2.1" fill="#4A3F2F" />
          <circle cx="24" cy="20" r="2.1" fill="#4A3F2F" />
        </>
      )}
      {/* mouth */}
      {laughing ? (
        <path d="M15 24 q5 5 10 0" stroke="#C9A227" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      ) : (
        <path d="M16 24 q4 2 8 0" stroke="#C9A227" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      )}
      {/* legs */}
      <rect x="12" y="31" width="4" height="8" rx="2" fill={color} />
      <rect x="24" y="31" width="4" height="8" rx="2" fill={color} />
    </svg>
  );
}

// Cartoon smoke puff.
function SmokePuff() {
  return (
    <motion.div
      initial={{ scale: 0.3, opacity: 0.8 }}
      animate={{ scale: 1.6, opacity: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.9 }}
      className="absolute"
    >
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="absolute block h-4 w-4 rounded-full bg-ink/30"
          style={{
            left: [0, 10, -8, 4][i],
            top: [0, -8, 6, 10][i],
          }}
        />
      ))}
    </motion.div>
  );
}

const SCENES = ["wander", "chase", "climbThrow", "collide"];
const rand = (min, max) => Math.random() * (max - min) + min;

export default function ChatMascots() {
  const [scene, setScene] = useState("wander");
  const [tick, setTick] = useState(0);
  const [coconut, setCoconut] = useState(false);
  const [puff, setPuff] = useState(false);

  // Advance to a random next scene on an interval.
  useEffect(() => {
    const id = setInterval(() => {
      setScene((prev) => {
        const choices = SCENES.filter((s) => s !== prev);
        return choices[Math.floor(Math.random() * choices.length)];
      });
      setTick((t) => t + 1);
    }, rand(6500, 9000));
    return () => clearInterval(id);
  }, []);

  // Trigger the coconut + smoke sequence during the climb/throw scene.
  useEffect(() => {
    if (scene !== "climbThrow") {
      setCoconut(false);
      setPuff(false);
      return;
    }
    const t1 = setTimeout(() => setCoconut(true), 1200);
    const t2 = setTimeout(() => {
      setCoconut(false);
      setPuff(true);
    }, 2300);
    const t3 = setTimeout(() => setPuff(false), 3200);
    return () => [t1, t2, t3].forEach(clearTimeout);
  }, [scene, tick]);

  // Random waypoints recomputed each scene change → endless variety of motion.
  const targets = useMemo(() => {
    switch (scene) {
      case "chase":
        return {
          a: { x: rand(60, 78), y: rand(60, 75), rotate: rand(-8, 8) },
          b: { x: rand(40, 58), y: rand(60, 75), rotate: rand(-8, 8) },
        };
      case "climbThrow":
        return {
          a: { x: 28, y: 8, rotate: -6 }, // climbs up near the palm
          b: { x: 70, y: 78, rotate: 0 }, // stays below, looking up
        };
      case "collide":
        return {
          a: { x: 47, y: 70, rotate: rand(-12, 0) },
          b: { x: 53, y: 70, rotate: rand(0, 12) },
        };
      default: // wander
        return {
          a: { x: rand(15, 45), y: rand(55, 80), rotate: rand(-6, 6) },
          b: { x: rand(55, 85), y: rand(55, 80), rotate: rand(-6, 6) },
        };
    }
  }, [scene, tick]);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      style={{ opacity: 0.22 }}
      aria-hidden="true"
    >
      {/* Robot A (the trickster / climber) */}
      <motion.div
        className="absolute"
        animate={{
          left: `${targets.a.x}%`,
          top: `${targets.a.y}%`,
          rotate: targets.a.rotate,
        }}
        transition={{ type: "spring", stiffness: 40, damping: 12, duration: 2 }}
      >
        <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 2.4, repeat: Infinity }}>
          <MiniRobot color="#D4B984" laughing={scene === "climbThrow" && puff} />
        </motion.div>

        {/* laugh marks when the prank lands */}
        <AnimatePresence>
          {scene === "climbThrow" && puff && (
            <motion.span
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: 1, y: -10 }}
              exit={{ opacity: 0 }}
              className="absolute -top-3 right-0 text-[10px] font-extrabold text-ink"
            >
              هههـ
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Falling coconut */}
      <AnimatePresence>
        {coconut && (
          <motion.div
            className="absolute"
            initial={{ left: "30%", top: "14%", opacity: 1 }}
            animate={{ left: "68%", top: "74%", rotate: 360 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: "easeIn" }}
          >
            <span className="block h-3 w-3 rounded-full" style={{ background: "#7C6028" }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Robot B (the target) */}
      <motion.div
        className="absolute"
        animate={{
          left: `${targets.b.x}%`,
          top: `${targets.b.y}%`,
          rotate: targets.b.rotate,
        }}
        transition={{ type: "spring", stiffness: 40, damping: 12, duration: 2 }}
      >
        <motion.div
          animate={puff ? { x: [0, -6, 6, -3, 0] } : { y: [0, -4, 0] }}
          transition={{ duration: puff ? 0.5 : 2.4, repeat: puff ? 0 : Infinity }}
        >
          <MiniRobot color="#C9A86A" hurt={puff} />
        </motion.div>

        {/* smoke puff on impact */}
        <AnimatePresence>{puff && <SmokePuff />}</AnimatePresence>
      </motion.div>
    </div>
  );
}
