import { NextResponse } from "next/server";
import { isLocale, localizeHref } from "@/i18n/config";
import { nodeHref } from "@/components/curriculum/model";
import { resolveCurriculum } from "@/lib/curriculum";

// High school year 1 has a single programme (the common first year), so
// /curriculum/high-school/grade-1 is an alias: a real 308 to that leaf instead
// of a rendered page (search, the command palette and old links use the alias).
// The deeper paths (…/grade-1/first-year) are still served by [...slug].
const SLUG = ["high-school", "grade-1"];

export function GET(request, { params }) {
  const locale = isLocale(params?.locale) ? params.locale : "ar";
  const node = resolveCurriculum(SLUG)?.node;
  const target = node ? nodeHref(SLUG, node) : "/curriculum/high-school";
  const url = new URL(localizeHref(target, locale), request.url);
  url.search = new URL(request.url).search; // keep ?subject= etc.
  return NextResponse.redirect(url, 308);
}
