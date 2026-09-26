// ============================================================================
// Register of curriculum files Jazira is AUTHORISED to host.
// ----------------------------------------------------------------------------
// The official textbooks are published by the Ministry of Education through
// «مقرراتي» on منصة مدرستي (and «عين»). No official source grants third
// parties the right to rehost them (docs/research/curriculum-*.md §7–8), so
// this list is EMPTY and every textbook resource links to the official channel.
//
// Add an entry ONLY after written permission (or your own original work) is on
// file, then import the file and rebuild the manifest — see docs/CURRICULUM.md:
//
//   {
//     key: "1447/high-school/grade-2/general/math/t1/exam-samples.pdf",
//     licence: "Original Jazira work — all rights reserved",   // or the permission reference
//     source: "jazira",                                         // who supplied the file
//     store: "public",                                          // "public" (public/resources) | "remote" (CONTENT_BASE_URL)
//     added: "YYYY-MM-DD",
//   },
//
// A key must already exist in the catalog (src/lib/curriculum.js). The manifest
// builder marks a row "hosted" only when it is registered here AND (for the
// public store) the file really exists under public/resources/<key>.
// ============================================================================

export const HOSTED_FILES = [];
