import Link from "next/link";
import { ShieldCheck, ArrowRight } from "lucide-react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import { BRAND } from "@/lib/constants";

// Premium shared shell for every legal page. Full-width composition with a
// sticky table of contents on desktop so the page never feels empty.
// `sections`: [{ id, h, body: (string | string[])[] }]
export default function LegalPage({ eyebrow = "الوثائق النظامية", title, updated, intro, sections = [], related = [] }) {
  return (
    <main className="relative min-h-screen overflow-x-clip bg-cream-gradient">
      <SiteHeader />

      {/* decorative field */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-40 top-24 h-[32rem] w-[32rem] rounded-full opacity-50 blur-3xl" style={{ background: "radial-gradient(circle, rgba(201,162,39,0.14), transparent 65%)" }} />
        <div className="absolute -left-48 top-96 h-[30rem] w-[30rem] rounded-full opacity-40 blur-3xl" style={{ background: "radial-gradient(circle, rgba(201,168,106,0.12), transparent 65%)" }} />
      </div>

      <div className="relative mx-auto w-full max-w-6xl px-5 pb-24 pt-36 sm:px-8 sm:pt-44">
        {/* header */}
        <div className="mb-12 text-center">
          <span className="eyebrow"><ShieldCheck size={13} /> {eyebrow}</span>
          <h1 className="mt-5 text-3xl font-extrabold text-ink sm:text-5xl">{title}</h1>
          {updated && <p className="mt-3 text-sm text-ink-muted">آخر تحديث · {updated}</p>}
          {intro && <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-ink-soft">{intro}</p>}
        </div>

        <div className="grid gap-10 lg:grid-cols-[260px_1fr]">
          {/* sticky TOC */}
          <aside className="hidden lg:block">
            <div className="sticky top-28">
              <div className="bezel"><div className="bezel-core glass p-5">
                <p className="mb-3 text-xs font-bold text-ink-muted">محتويات الصفحة</p>
                <nav className="space-y-1">
                  {sections.map((s, i) => (
                    <a key={s.id} href={`#${s.id}`} className="flex items-start gap-2 rounded-xl px-2.5 py-2 text-sm text-ink-soft transition hover:bg-champagne-100/70 hover:text-ink">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-gold-gradient text-[10px] font-extrabold text-white ltr-nums">{i + 1}</span>
                      <span className="leading-snug">{s.h}</span>
                    </a>
                  ))}
                </nav>
              </div></div>

              {related.length > 0 && (
                <div className="bezel mt-4"><div className="bezel-core glass p-5">
                  <p className="mb-3 text-xs font-bold text-ink-muted">وثائق ذات صلة</p>
                  <div className="space-y-1.5">
                    {related.map((r) => (
                      <Link key={r.href} href={r.href} className="flex items-center gap-1.5 text-sm font-semibold text-gold hover:underline">
                        <ArrowRight size={14} /> {r.label}
                      </Link>
                    ))}
                  </div>
                </div></div>
              )}
            </div>
          </aside>

          {/* article */}
          <article className="min-w-0">
            <div className="bezel"><div className="bezel-core glass-strong p-6 sm:p-10">
              {sections.map((s, i) => (
                <section key={s.id} id={s.id} className={i > 0 ? "mt-9 border-t border-champagne-200/60 pt-9" : ""}>
                  <h2 className="flex items-center gap-2.5 text-xl font-extrabold text-ink">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gold-gradient text-xs font-extrabold text-white ltr-nums">{i + 1}</span>
                    {s.h}
                  </h2>
                  <div className="mt-4 space-y-3 leading-relaxed text-ink-soft">
                    {s.body.map((b, j) =>
                      Array.isArray(b) ? (
                        <ul key={j} className="space-y-2">
                          {b.map((li, k) => (
                            <li key={k} className="flex gap-2.5">
                              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                              <span>{li}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p key={j}>{b}</p>
                      )
                    )}
                  </div>
                </section>
              ))}

              <p className="mt-10 rounded-2xl bg-champagne-100/50 p-4 text-sm text-ink-muted">
                لأي استفسار حول هذه الوثيقة يمكنك التواصل مع فريق {BRAND.name} عبر صفحة الدعم في أي وقت.
              </p>
            </div></div>
          </article>
        </div>
      </div>

      <SiteFooter />
    </main>
  );
}
