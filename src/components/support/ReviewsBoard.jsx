"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Crown, LogIn, PenLine, RotateCcw, Trash2 } from "lucide-react";
import { useLocale, useT } from "@/i18n/client";
import { formatNumber, formatRelative } from "@/i18n/format";
import { useAuthUser } from "@/context/AuthProvider";
import { getSupabase } from "@/lib/supabase-lazy";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Dialog from "@/components/ui/Dialog";
import EmptyState from "@/components/ui/EmptyState";
import { ProgressBar } from "@/components/ui/Progress";
import Skeleton, { SkeletonText } from "@/components/ui/Skeleton";
import { cn } from "@/components/ui/cn";
import Avatar from "@/components/Avatar";
import Stars from "./Stars";
import StarInput from "./StarInput";
import CountedTextarea from "./CountedTextarea";
import {
  REVIEW_MAX, createReview, deleteReview, fetchMyReview, fetchReviewStats, fetchReviewsPage, updateReview,
} from "./reviewsApi";

/* ── Summary ─────────────────────────────────────────────────────────────── */
function Summary({ stats, t, locale }) {
  if (stats.state === "loading") {
    return (
      <Card aria-busy="true">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-4 h-12 w-24" />
        <div className="mt-6 space-y-3">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-3" />)}</div>
      </Card>
    );
  }
  if (stats.state !== "ready") return null;
  const { total, counts, average } = stats;
  return (
    <Card>
      <h2 className="t-h4">{t("reviews.summary.title")}</h2>
      {total === 0 ? (
        <div className="mt-3">
          <Stars value={0} size={20} label={t("reviews.summary.emptyTitle")} />
          <p className="mt-3 text-sm font-medium text-ink">{t("reviews.summary.emptyTitle")}</p>
          <p className="t-small mt-1 text-ink-3">{t("reviews.summary.emptyBody")}</p>
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-end gap-4">
            <p className="flex items-baseline gap-1.5 leading-none">
              <span className="sr-only">{t("reviews.summary.average")}: </span>
              <span className="text-[3.25rem] font-bold tabular text-ink">
                {formatNumber(average, locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </span>
              <span className="text-sm text-ink-3">{t("reviews.summary.outOf")}</span>
            </p>
            <div className="pb-1">
              <Stars value={average} size={18} label={t("reviews.stars.label", { rating: formatNumber(average, locale, { maximumFractionDigits: 1 }) })} />
              <p className="t-caption mt-1">{t("reviews.summary.basedOn", { count: total })}</p>
            </div>
          </div>
          <h3 className="sr-only">{t("reviews.summary.distribution")}</h3>
          <ul className="mt-6 space-y-2.5">
            {[5, 4, 3, 2, 1].map((n) => {
              const c = counts[n] || 0;
              const label = t("reviews.summary.stars", { count: n });
              return (
                <li key={n} className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-3 text-sm">
                  <span className="text-ink-2">{label}</span>
                  <ProgressBar value={(c / total) * 100} size="sm" label={label} />
                  <span className="text-end tabular text-ink-3">{formatNumber(c, locale)}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}

/* ── One review ──────────────────────────────────────────────────────────── */
function ReviewCard({ review, mine, t, tc, locale }) {
  const p = review.profile;
  const name = p?.full_name || t("reviews.list.member");
  const badge = p?.is_elite && p?.show_elite_badge !== false;
  return (
    <article className="flex h-full flex-col rounded-lg border border-line/15 bg-surface p-5 shadow-xs">
      <header className="flex items-start gap-3">
        <Avatar src={p?.avatar_url} name={name} size={44} alt="" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5">
            <span dir="auto" className="truncate font-medium text-ink">{name}</span>
            {badge && <Badge tone="gold" size="sm" icon={Crown}>{tc("premium.badge")}</Badge>}
            {mine && <Badge size="sm">{t("reviews.list.you")}</Badge>}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <Stars value={review.rating} size={15} label={t("reviews.stars.label", { rating: review.rating })} />
            <time dateTime={review.created_at} className="t-caption">{formatRelative(review.created_at, locale)}</time>
          </p>
        </div>
      </header>
      {review.content && (
        <p dir="auto" className="t-body mt-4 whitespace-pre-line break-words text-ink-2">{review.content}</p>
      )}
    </article>
  );
}

/* ── Composer (create / show / edit own review) ──────────────────────────── */
function Composer({ auth, mine, onSave, onDelete, t, locale }) {
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [error, setError] = useState(null); // { field: "rating" | "text" | "form", msg }
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [flash, setFlash] = useState("");

  const start = (r) => {
    setRating(r?.rating || 0);
    setText(r?.content || "");
    setError(null);
    setEditing(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (rating < 1 || rating > 5) return setError({ field: "rating", msg: t("reviews.composer.errors.rating") });
    if (text.trim().length > REVIEW_MAX) return setError({ field: "text", msg: t("reviews.composer.errors.long", { max: REVIEW_MAX }) });
    setBusy(true);
    setError(null);
    const res = await onSave({ rating, content: text });
    setBusy(false);
    if (res?.error) return setError({ field: "form", msg: t("reviews.composer.errors.generic") });
    setFlash(t(mine.review ? "reviews.composer.updated" : "reviews.composer.created"));
    setEditing(false);
  };

  const remove = async () => {
    setBusy(true);
    const res = await onDelete();
    setBusy(false);
    setConfirm(false);
    if (res?.error) return setError({ field: "form", msg: t("reviews.composer.errors.generic") });
    setFlash(t("reviews.composer.deleted"));
    setEditing(false);
    setRating(0);
    setText("");
  };

  if (!auth.isLoaded || (auth.isSignedIn && mine.state === "loading")) {
    return (
      <Card aria-busy="true">
        <Skeleton className="h-4 w-32" />
        <SkeletonText lines={2} className="mt-4" />
        <Skeleton className="mt-5 h-10 w-36" rounded="full" />
      </Card>
    );
  }

  if (!auth.isSignedIn) {
    return (
      <Card tone="gold">
        <h2 className="t-h4">{t("reviews.composer.signedOutTitle")}</h2>
        <p className="t-small mt-1 text-ink-2">{t("reviews.composer.signedOutBody")}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button href={`/sign-in?next=${encodeURIComponent("/reviews")}`} size="sm" iconStart={LogIn}>{t("reviews.composer.signIn")}</Button>
          <Button href="/sign-up" size="sm" variant="secondary">{t("reviews.composer.signUp")}</Button>
        </div>
      </Card>
    );
  }

  const own = mine.review;
  const showForm = editing || !own;
  const len = text.trim().length;

  return (
    <Card>
      {flash && !showForm && <Alert tone="success" className="mb-4">{flash}</Alert>}
      {!showForm ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <h2 className="t-h4">{t("reviews.composer.yours")}</h2>
            <span className="t-caption">{t("reviews.composer.yoursMeta", { date: formatRelative(own.created_at, locale) })}</span>
          </div>
          <Stars value={own.rating} size={20} className="mt-3" label={t("reviews.stars.label", { rating: own.rating })} />
          {own.content && <p dir="auto" className="t-small mt-2 line-clamp-6 whitespace-pre-line break-words text-ink-2">{own.content}</p>}
          {error?.field === "form" && <p role="alert" className="mt-3 text-[0.8125rem] text-danger">{error.msg}</p>}
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line/10 pt-4">
            <Button size="sm" variant="secondary" iconStart={PenLine} onClick={() => { setFlash(""); start(own); }}>{t("reviews.composer.edit")}</Button>
            <Button size="sm" variant="ghost" iconStart={Trash2} className="!text-danger hover:!bg-danger-soft" onClick={() => setConfirm(true)}>
              {t("reviews.composer.delete")}
            </Button>
          </div>
          <Dialog
            open={confirm}
            onClose={() => setConfirm(false)}
            title={t("reviews.composer.confirmTitle")}
            size="sm"
            footer={
              <>
                <Button variant="ghost" onClick={() => setConfirm(false)}>{t("reviews.composer.cancel")}</Button>
                <Button variant="danger" loading={busy} onClick={remove}>{t("reviews.composer.confirm")}</Button>
              </>
            }
          >
            <p className="t-body text-ink-2">{t("reviews.composer.confirmBody")}</p>
          </Dialog>
        </>
      ) : (
        <form onSubmit={submit} noValidate>
          <h2 className="t-h4">{t("reviews.composer.title")}</h2>
          <p className="t-small mt-1 text-ink-3">{t("reviews.composer.body")}</p>
          {flash && <Alert tone="success" className="mt-4">{flash}</Alert>}
          <StarInput
            className="mt-5"
            legend={t("reviews.composer.rating")}
            value={rating}
            onChange={(n) => { setRating(n); setError(null); }}
            error={error?.field === "rating" ? error.msg : undefined}
            optionLabel={(n) => t("reviews.stars.option", { count: n })}
            caption={(n) => t(`feedback.rating.r${n}`)}
          />
          <CountedTextarea
            className="mt-5"
            label={t("reviews.composer.text")}
            optionalText={t("reviews.composer.optional")}
            error={error?.field === "text" ? error.msg : undefined}
            count={len}
            max={REVIEW_MAX}
            counterText={t("reviews.composer.counter", { count: len, max: REVIEW_MAX })}
            rows={5}
            value={text}
            onChange={(e) => { setText(e.target.value); setError(null); }}
            maxLength={REVIEW_MAX + 100}
            placeholder={t("reviews.composer.textPlaceholder")}
          />
          {error?.field === "form" && <p role="alert" className="mt-2 text-[0.8125rem] text-danger">{error.msg}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit" loading={busy} className="flex-1 sm:flex-none">
              {t(own ? "reviews.composer.update" : "reviews.composer.submit")}
            </Button>
            {own && <Button variant="ghost" onClick={() => { setEditing(false); setError(null); }}>{t("reviews.composer.cancel")}</Button>}
          </div>
        </form>
      )}
    </Card>
  );
}

/* ── Board ───────────────────────────────────────────────────────────────── */
/**
 * /reviews client island: real ratings summary (exact per-star counts), the
 * signed-in user's own review (create / edit / delete under RLS) and a
 * paginated list. Honest empty / unavailable / error states — never sample data.
 */
export default function ReviewsBoard() {
  const t = useT("support");
  const tc = useT("common");
  const { locale } = useLocale();
  const auth = useAuthUser();
  const { isLoaded, isSignedIn, userId, name, imageUrl, isElite, showEliteBadge } = auth;

  const [client, setClient] = useState(undefined); // undefined = loading · null = not configured
  const [stats, setStats] = useState({ state: "loading" });
  const [list, setList] = useState({ state: "loading", rows: [], page: 0, hasMore: false });
  const [more, setMore] = useState({ loading: false, error: false });
  const [mine, setMine] = useState({ state: "loading", review: null });
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    getSupabase().then((s) => alive.current && setClient(s || null)).catch(() => alive.current && setClient(null));
    return () => { alive.current = false; };
  }, []);

  const loadStats = useCallback(async (s) => {
    const r = await fetchReviewStats(s);
    if (!alive.current) return;
    setStats(r.error ? { state: r.error } : { state: "ready", ...r });
  }, []);

  const loadFirst = useCallback(async (s) => {
    setList((l) => ({ ...l, state: "loading" }));
    const r = await fetchReviewsPage(s, 0);
    if (!alive.current) return;
    setList(r.error ? { state: r.error, rows: [], page: 0, hasMore: false } : { state: "ready", rows: r.rows, page: 0, hasMore: r.hasMore });
  }, []);

  useEffect(() => {
    if (client === undefined) return;
    if (client === null) {
      setStats({ state: "unavailable" });
      setList({ state: "unavailable", rows: [], page: 0, hasMore: false });
      return;
    }
    loadStats(client);
    loadFirst(client);
  }, [client, loadStats, loadFirst]);

  useEffect(() => {
    if (!client || !isLoaded) return;
    if (!isSignedIn) { setMine({ state: "idle", review: null }); return; }
    let on = true;
    setMine({ state: "loading", review: null });
    fetchMyReview(client, userId).then((r) => {
      if (on) setMine({ state: r.error ? "error" : "ready", review: r.review || null });
    });
    return () => { on = false; };
  }, [client, isLoaded, isSignedIn, userId]);

  const loadMore = async () => {
    if (!client || more.loading) return;
    setMore({ loading: true, error: false });
    const next = list.page + 1;
    const r = await fetchReviewsPage(client, next);
    if (!alive.current) return;
    if (r.error) return setMore({ loading: false, error: true });
    setList((l) => {
      const seen = new Set(l.rows.map((x) => x.id));
      return { ...l, rows: [...l.rows, ...r.rows.filter((x) => !seen.has(x.id))], page: next, hasMore: r.hasMore };
    });
    setMore({ loading: false, error: false });
  };

  const selfProfile = { id: userId, full_name: name, avatar_url: imageUrl, is_elite: isElite, show_elite_badge: showEliteBadge };

  const onSave = async (values) => {
    const own = mine.review;
    const r = own ? await updateReview(client, userId, own.id, values) : await createReview(client, userId, values);
    if (r.error) {
      // One review per user (DB unique index): a review written in another tab
      // makes the insert fail — pick it up so the next save edits it instead.
      if (!own) {
        const again = await fetchMyReview(client, userId);
        if (again.review) setMine({ state: "ready", review: again.review });
      }
      return r;
    }
    const row = { ...r.review, profile: selfProfile };
    setMine({ state: "ready", review: r.review });
    setList((l) => ({
      ...l,
      state: "ready",
      rows: own ? l.rows.map((x) => (x.id === row.id ? row : x)) : [row, ...l.rows],
    }));
    loadStats(client);
    return r;
  };

  const onDelete = async () => {
    const own = mine.review;
    if (!own) return { ok: true };
    const r = await deleteReview(client, userId, own.id);
    if (r.error) return r;
    setList((l) => ({ ...l, rows: l.rows.filter((x) => x.id !== own.id) }));
    // Older reviews by the same user (from the previous multi-review UI) become "mine" next.
    const again = await fetchMyReview(client, userId);
    setMine({ state: "ready", review: again.review || null });
    loadStats(client);
    return r;
  };

  const unavailable = list.state === "unavailable";

  return (
    <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
      {/* Rail: summary + composer (first on mobile). When reviews are unavailable
          the explanation leads on phones and the fallback follows it. */}
      <aside className={cn("lg:col-span-4", unavailable && "order-last lg:order-none")}>
        <div className="space-y-4 lg:sticky lg:top-24">
          <Summary stats={stats} t={t} locale={locale} />
          {unavailable ? (
            <Card tone="gold">
              <h2 className="t-h4">{t("reviews.fallback.title")}</h2>
              <p className="t-small mt-1 text-ink-2">{t("reviews.fallback.body")}</p>
              <Button href="/feedback" size="sm" className="mt-4" iconEnd={ArrowRight}>{t("reviews.fallback.cta")}</Button>
            </Card>
          ) : (
            <Composer auth={auth} mine={mine} onSave={onSave} onDelete={onDelete} t={t} locale={locale} />
          )}
        </div>
      </aside>

      {/* Reviews */}
      <section aria-labelledby="reviews-list-title" className="min-w-0 lg:col-span-8">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 id="reviews-list-title" className="t-h3">{t("reviews.list.title")}</h2>
          {stats.state === "ready" && stats.total > 0 && (
            <span className="t-caption">{t("reviews.summary.basedOn", { count: stats.total })}</span>
          )}
        </div>

        {list.state === "loading" ? (
          <div className="grid gap-4 sm:grid-cols-2" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="surface-flat p-5">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-11 w-11" rounded="full" />
                  <div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-1/2" /><Skeleton className="h-3 w-1/3" /></div>
                </div>
                <SkeletonText lines={3} className="mt-4" />
              </div>
            ))}
          </div>
        ) : unavailable ? (
          <Card tone="flat" pad="none">
            <EmptyState image="support.empty" title={t("reviews.list.unavailableTitle")} description={t("reviews.list.unavailableBody")} />
          </Card>
        ) : list.state === "error" ? (
          <Card tone="flat" pad="none">
            <EmptyState
              image="support.offline"
              title={t("reviews.list.errorTitle")}
              description={t("reviews.list.errorBody")}
              action={<Button onClick={() => { loadFirst(client); loadStats(client); }} iconStart={RotateCcw}>{tc("actions.retry")}</Button>}
            />
          </Card>
        ) : list.rows.length === 0 ? (
          <Card tone="flat" pad="none">
            <EmptyState image="support.empty" title={t("reviews.list.emptyTitle")} description={t("reviews.list.emptyBody")} />
          </Card>
        ) : (
          <>
            <ul className="grid gap-4 sm:grid-cols-2">
              {list.rows.map((r) => (
                <li key={r.id} className="animate-fade">
                  <ReviewCard review={r} mine={isSignedIn && r.user_id === userId} t={t} tc={tc} locale={locale} />
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-col items-center gap-2">
              {list.hasMore ? (
                <Button variant="secondary" onClick={loadMore} loading={more.loading}>{t("reviews.list.loadMore")}</Button>
              ) : (
                <p className="t-caption">{t("reviews.list.end")}</p>
              )}
              {more.error && <p role="alert" className="text-[0.8125rem] text-danger">{t("reviews.list.moreError")}</p>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

// Named exports for composition / visual QA.
export { Summary as ReviewsSummary, ReviewCard, Composer as ReviewComposer };
