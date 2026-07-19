import { BRAND } from "@/lib/constants";
import IslandMark from "@/components/IslandMark";

// Brand lockup: the wordmark + the fixed Jazira island centerpiece. The island
// never moves — the animated robot mascots (NavRobots) roam behind the nav
// around it. No motion here, so it's cheap and stable everywhere it's reused.
export default function BrandLogo({ size = "lg" }) {
  const isLg = size === "lg";
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`bg-gradient-to-r from-gold to-champagne bg-clip-text font-extrabold text-transparent ${
          isLg ? "text-3xl" : "text-lg"
        }`}
      >
        {BRAND.name}
      </span>
      <IslandMark size={isLg ? 52 : 36} className="shrink-0 drop-shadow-[0_3px_6px_rgba(160,130,70,0.18)]" />
    </div>
  );
}
