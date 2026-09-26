import { setRequestLocale } from "@/i18n/server";
import { buildMetadata } from "@/lib/seo";
import Hero from "@/components/landing/Hero";
import StageSelector from "@/components/landing/StageSelector";
import CurriculumFeature from "@/components/landing/CurriculumFeature";
import ExamFeature from "@/components/landing/ExamFeature";
import AssistantFeature from "@/components/landing/AssistantFeature";
import CommunityFeature from "@/components/landing/CommunityFeature";
import ProgressBento from "@/components/landing/ProgressBento";
import PlansTeaser from "@/components/landing/PlansTeaser";
import PrivacyTrust from "@/components/landing/PrivacyTrust";
import FaqTeaser from "@/components/landing/FaqTeaser";
import FinalCta from "@/components/landing/FinalCta";

export async function generateMetadata({ params }) {
  return buildMetadata({ locale: params.locale, key: "home", path: "/" });
}

/**
 * Public homepage — a fully static Server Component (no client JS of its own;
 * the marketing header/footer come from the (site) layout). Section rhythm
 * alternates split / bento / tinted bands so it never reads as one template.
 */
export default function HomePage({ params }) {
  setRequestLocale(params.locale);
  return (
    <>
      <Hero />
      <StageSelector />
      <CurriculumFeature />
      <ExamFeature />
      <AssistantFeature />
      <CommunityFeature />
      <ProgressBento />
      <PlansTeaser />
      <PrivacyTrust />
      <FaqTeaser />
      <FinalCta />
    </>
  );
}
