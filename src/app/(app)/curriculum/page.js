import Link from "next/link";
import { Library } from "lucide-react";
import { CURRICULUM, ACADEMIC_YEAR } from "@/lib/curriculum";
import StageCard from "@/components/curriculum/StageCard";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";

export const metadata = {
  title: "المناهج والمصادر التعليمية",
  description: `مكتبة منصة جزيرة للمناهج الدراسية للعام الدراسي ${ACADEMIC_YEAR} — كتب الطالب والنشاط ونماذج الاختبارات لجميع المراحل والمسارات.`,
  alternates: { canonical: "/curriculum" },
};

// Static/ISR — the tree is in-code, so this renders instantly and re-validates
// hourly (in case resources later come from a DB).
export const revalidate = 3600;

export default function CurriculumIndex() {
  return (
    <div>
      <Reveal>
        <div className="mb-8">
          <span className="eyebrow">
            <Library size={13} /> المكتبة التعليمية
          </span>
          <h1 className="mt-4 text-3xl font-extrabold text-ink sm:text-4xl">المناهج والمصادر التعليمية</h1>
          <p className="mt-2 max-w-2xl text-ink-soft">
            العام الدراسي {ACADEMIC_YEAR} — اختر المرحلة للوصول إلى كتب الطالب والنشاط ونماذج الاختبارات،
            وتصفّحها داخل المنصة مباشرة.
          </p>
        </div>
      </Reveal>

      <Stagger className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {CURRICULUM.map((stage) => (
          <StaggerItem key={stage.id}>
            <Link href={`/curriculum/${stage.id}`} className="block h-full">
              <StageCard node={stage} />
            </Link>
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  );
}
