"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Mic, PencilLine } from "lucide-react";
import Tabs from "@/components/ui/Tabs";
import { useT } from "@/i18n/client";
import GameSkeleton from "./GameSkeleton";

function WriteLoading() {
  const t = useT("stages");
  return <GameSkeleton kind="write" label={t("elementary.games.loading")} />;
}
function ReadLoading() {
  const t = useT("stages");
  return <GameSkeleton kind="read" label={t("elementary.games.loading")} />;
}

// Each game ships in its own chunk. Nothing is fetched until the games are
// about to scroll into view, and the reading game only when its tab is opened.
const DrawingCanvas = dynamic(() => import("@/components/DrawingCanvas"), { ssr: false, loading: WriteLoading });
const ReadingChallenge = dynamic(() => import("@/components/ReadingChallenge"), { ssr: false, loading: ReadLoading });

export default function LearningGames() {
  const t = useT("stages");
  const [tab, setTab] = useState("write");
  const [near, setNear] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "600px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const items = [
    { value: "write", label: t("elementary.games.tabs.write"), icon: PencilLine },
    { value: "read", label: t("elementary.games.tabs.read"), icon: Mic },
  ];

  return (
    <div ref={boxRef}>
      {/* 44px tabs (the shared Tabs are 36px); on phones the two tabs share the row, so keep padding tight and the icons unshrinkable. */}
      <Tabs
        items={items}
        value={tab}
        onChange={(v) => {
          setNear(true);
          setTab(v);
        }}
        label={t("elementary.games.tabsLabel")}
        className="w-full xs:w-fit [&>button]:h-11 [&>button]:flex-1 [&>button]:justify-center [&>button]:px-3 xs:[&>button]:flex-none xs:[&>button]:px-5 [&_svg]:shrink-0"
      />
      <div role="tabpanel" aria-label={items.find((i) => i.value === tab)?.label} className="mt-4">
        {!near ? (
          tab === "write" ? <WriteLoading /> : <ReadLoading />
        ) : tab === "write" ? (
          <DrawingCanvas />
        ) : (
          <ReadingChallenge />
        )}
      </div>
    </div>
  );
}
