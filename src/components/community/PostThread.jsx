"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquareOff, RotateCcw, ShieldOff } from "lucide-react";
import { useT } from "@/i18n/client";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import PostCard from "./PostCard";
import { PostSkeleton } from "./skeletons";
import { useSignInPrompt } from "./SignInPrompt";
import { useViewer } from "./useViewer";
import { useApi } from "./context";

/** A single post with its comments open (permalink / share target / notification target). */
export default function PostThread({ id, source, viewer: viewerOverride }) {
  const t = useT("community");
  const api = useApi(source);
  const viewer = useViewer(viewerOverride);
  const [prompt, askSignIn] = useSignInPrompt();
  const [state, setState] = useState({ status: "loading", post: null });

  const load = useCallback(async () => {
    setState({ status: "loading", post: null });
    try {
      const res = await api.getPost(id);
      if (!res.available) setState({ status: "unavailable", post: null });
      else setState({ status: res.post ? "ready" : "missing", post: res.post });
    } catch {
      setState({ status: "error", post: null });
    }
  }, [api, id]);

  useEffect(() => { if (viewer.isLoaded) load(); }, [viewer.isLoaded, viewer.userId, load]);

  const onPatch = useCallback((pid, patch) => {
    setState((s) => (s.post && s.post.id === pid ? { ...s, post: { ...s.post, ...(typeof patch === "function" ? patch(s.post) : patch) } } : s));
  }, []);

  if (state.status === "loading") return <PostSkeleton />;

  if (state.status !== "ready") {
    const key = state.status === "blocked" ? "blocked" : state.status === "missing" || state.status === "removed" ? "missing" : "unavailable";
    return (
      <div className="surface">
        <EmptyState
          image={key === "unavailable" ? "system.offline" : undefined}
          icon={key === "missing" ? MessageSquareOff : key === "blocked" ? ShieldOff : undefined}
          compact
          title={t(`thread.${key}.title`)}
          description={t(`thread.${key}.body`)}
          action={<Button href="/community">{t("thread.back")}</Button>}
          secondary={key === "unavailable" ? <Button variant="ghost" iconStart={RotateCcw} onClick={load}>{t("feed.retry")}</Button> : null}
        />
      </div>
    );
  }

  return (
    <>
      <PostCard
        post={state.post}
        api={api}
        viewer={viewer}
        askSignIn={askSignIn}
        onPatch={onPatch}
        onRemove={() => setState({ status: "removed", post: null })}
        onBlocked={() => setState({ status: "blocked", post: null })}
        commentsOpen
        level={2}
      />
      {prompt}
    </>
  );
}
