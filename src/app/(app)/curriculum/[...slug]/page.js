import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Home } from "lucide-react";
import { resolveCurriculum, allCurriculumPaths, ACADEMIC_YEAR } from "@/lib/curriculum";
import StageCard from "@/components/curriculum/StageCard";
import SubjectBrowser from "@/components/curriculum/SubjectBrowser";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";

export const revalidate = 3600;

// Pre-render every branch + leaf path → sub-second navigation.
export function generateStaticParams() {
  return allCurriculumPaths().map((slug) => ({ slug }));
}

export function generateMetadata({ params }) {
  const r = resolveCurriculum(params.slug);
  if (!r?.node) return {};
  const path = "/curriculum/" + params.slug.join("/");
  return {
    title: `${r.node.name} — المناهج والمصادر`,
    alternates: { canonical: path },
  };
}

export default function CurriculumNode({ params }) {
  const slug = params.slug || [];
  const r = resolveCurriculum(slug);
  if (!r?.node) notFound();
  const { node, trail } = r;

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="mb-5 flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
        <Link href="/curriculum" className="inline-flex items-center gap-1 hover:text-gold">
          <Home size={14} /> المكتبة
        </Link>
        {trail.map((n, i) => {
          const href = "/curriculum/" + slug.slice(0, i + 1).join("/");
          const last = i === trail.length - 1;
          return (
            <span key={n.id} className="inline-flex items-center gap-1.5">
              <ChevronLeft size={14} />
              {last ? (
                <span className="font-bold text-ink">{n.name}</span>
              ) : (
                <Link href={href} className="hover:text-gold">
                  {n.name}
                </Link>
              )}
            </span>
          );
        })}
      </nav>

      <Reveal>
        <h1 className="text-2xl font-extrabold text-ink sm:text-3xl">{node.name}</h1>
        <p className="mt-1 text-sm text-ink-soft">العام الدراسي {ACADEMIC_YEAR}</p>
      </Reveal>

      <div className="mt-7">
        {node.children ? (
          <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {node.children.map((child) => (
              <StaggerItem key={child.id}>
                <Link href={"/curriculum/" + [...slug, child.id].join("/")} className="block h-full">
                  <StageCard node={child} />
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
        ) : (
          <SubjectBrowser subjects={node.subjects || []} />
        )}
      </div>
    </div>
  );
}
