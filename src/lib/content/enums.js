// ============================================================================
// Content-engine enums (docs/CONTENT_ENGINE.md §2). The JSON Schemas in
// data/schemas mirror these lists; tests/unit/content-foundation.test.js
// asserts they agree. Lower snake case except the literals fixed by the
// requirements (PROVENANCE_REVIEW_REQUIRED, the dedup classes).
// Pure data: safe on the server and the client.
// ============================================================================

const freeze = (list) => Object.freeze([...list]);

// §2.1 / §2.2
export const LANGUAGES = freeze(["ar", "en"]);
export const RUN_KINDS = freeze(["crawl", "extract", "gen", "check", "val", "xval", "dedup", "var", "import", "report"]);
export const GRADE_CODES = freeze(["e1", "e2", "e3", "e4", "e5", "e6", "m1", "m2", "m3", "h1", "h2", "h3", "apt", "ach"]);
export const STAGES = freeze(["elementary", "middle", "high-school"]);

// §2.3 source
export const SOURCE_KINDS = freeze(["official_portal", "official_document", "official_news", "internal", "licensed"]);
export const RETRIEVAL_METHODS = freeze(["api_get", "download", "manual"]);
export const LICENSE_STATUSES = freeze(["all_rights_reserved", "permission_granted", "public_domain", "internal", "unknown"]);
export const PROVENANCE_STATUSES = freeze(["verified", "PROVENANCE_REVIEW_REQUIRED"]);
export const REDISTRIBUTION = freeze(["link_only", "allowed", "internal"]);
export const PUBLISH_POLICIES = freeze(["pending_owner_decision", "derived_questions_allowed", "blocked"]);

// §2.4 resource and term evidence
export const RESOURCE_KINDS = freeze([
  "student_book", "activity_book", "teacher_guide", "practice_resource",
  "test_resource", "audio", "question_bank_external", "other",
]);
export const FILE_TYPES = freeze(["pdf", "zip", "other"]);
export const AVAILABILITY = freeze(["external_official", "unavailable", "needs_review"]);
export const TERMS = freeze(["t1", "t2", "both"]);
export const TERM_STATUSES = freeze(["verified", "inferred", "needs_review", "unknown"]);
export const EXTRACTION_STATUSES = freeze(["not_started", "frontmatter_done", "full_done", "failed", "not_applicable"]);
export const TEXT_QUALITY = freeze(["ok", "repaired", "untrusted"]);
export const TOC_STATUSES = freeze(["found", "not_found", "partial"]);
export const RESOURCE_STATUSES = freeze(["active", "needs_review", "unavailable"]);
export const TERM_EVIDENCE_METHODS = freeze([
  "cover_text", "title_page_text", "listing_title", "toc_marker", "vision",
  "plan_guide", "course_code", "owner_decision",
]);
/** Best status each evidence route can give (§2.4 table). */
export const TERM_EVIDENCE_GRADE = Object.freeze({
  cover_text: "verified", title_page_text: "verified", toc_marker: "verified", vision: "verified",
  listing_title: "inferred", plan_guide: "inferred", course_code: "inferred", owner_decision: "inferred",
});
export const CONFIDENCE = freeze(["high", "medium", "low"]);

// §2.5 curriculum nodes
export const NODE_KINDS = freeze(["stage", "grade", "track", "term", "subject", "unit", "chapter", "lesson"]);
export const PAGE_RANGE_METHODS = freeze(["toc", "ien_align", "manual"]);
export const PAGE_RANGE_STATUSES = freeze(["verified", "needs_review"]);
export const NODE_STATUSES = freeze(["verified", "needs_review", "source_only", "unavailable"]);
export const NODE_AUDIT_CODES = freeze(["title_mismatch", "missing_in_toc", "missing_in_ien", "order_mismatch", "term_conflict"]);
export const SUBJECT_TERM_STATUSES = freeze(["verified", "inferred", "needs_review", "absent"]);

// §2.6 page maps, TOC, exercise index
export const PAGE_KINDS = freeze([
  "cover", "front_matter", "toc", "unit_opener", "lesson", "exercise", "review",
  "answer_key", "glossary", "back_matter", "unknown",
]);
export const PAGE_FLAGS = freeze([
  "reversed_fixed", "presentation_forms_fixed", "ligature_fixed", "split_letters_fixed",
  "font_garbage", "low_text", "no_text_layer", "two_column", "vision_read",
]);
export const TEXT_METHODS = freeze(["text", "vision", "none"]);
export const READ_METHODS = freeze(["text", "vision"]);
export const EXERCISE_KINDS = freeze(["example", "exercise", "review", "answer_key"]);

// §2.7 objectives
export const OBJECTIVE_ORIGINS = freeze(["extracted", "authored"]);
export const OBJECTIVE_STATUSES = freeze(["draft", "validated"]);

// §2.8 question
export const SCOPES = freeze(["curriculum", "aptitude", "achievement"]);
export const LINK_ROLES = freeze(["primary", "aligned"]);
export const QUESTION_TYPES = freeze(["mcq", "true_false", "matching", "ordering", "short_answer", "numeric"]);
export const ITEM_STYLES = freeze(["definition", "conceptual", "computation", "application", "scenario", "reasoning", "review"]);
export const DIFFICULTY_SOURCES = freeze(["author", "generator_estimate", "validator_estimate", "empirical"]);
export const FIXED_ORDER_REASONS = freeze([
  "all_of_above", "none_of_above", "combined_option", "numeric_ascending", "conventional_scale", "source_order",
]);
export const MATCHING_SCORING = freeze(["partial", "all_or_nothing"]);
export const ORDERING_CRITERIA = freeze(["chronological", "ascending", "descending", "process_steps", "other"]);
export const SHORT_ANSWER_MATCH = freeze(["normalized_exact", "exact_marks"]);
export const TOLERANCE_KINDS = freeze(["abs", "rel"]);
export const QUOTE_KINDS = freeze(["fact", "definition", "quran", "hadith", "poetry", "data"]);
export const ORIGINS = freeze(["source_derived", "transformed", "generated_practice", "internal_authored", "review_required"]);
export const GENERATOR_KINDS = freeze(["llm_subagent", "human", "script", "legacy_unknown"]);
export const QUESTION_STATUSES = freeze(["candidate", "validated", "published", "rejected", "review_required", "retired"]);
export const VALIDATION_STATUSES = freeze(["pending", "structural_pass", "auto_pass", "validated", "failed", "review_required"]);
export const REWRITE_CHANGES = freeze(["context", "representation"]);
export const VARIANT_KINDS = freeze(["template", "rewrite"]);
export const EXPR_FORMATS = freeze(["int", "fraction", "mixed"]); // plus decimal:<d>

/** difficulty 1..5 → band 1..3 (1–2 → 1, 3 → 2, 4–5 → 3). */
export const difficultyBand = (level) => (level <= 2 ? 1 : level === 3 ? 2 : 3);
/** Legacy bank difficulty 1/2/3 → level 2/3/4. */
export const legacyDifficultyLevel = (legacy) => ({ 1: 2, 2: 3, 3: 4 })[legacy] ?? null;

// §2.10 validation record
export const VALIDATION_ROLES = freeze(["deterministic", "primary", "resolver", "language", "human"]);
export const VALIDATION_VERDICTS = freeze(["pass", "warn", "fail", "disagree", "abstain"]);
export const CHECK_RESULTS = freeze(["pass", "warn", "fail"]);
export const SUPPORT = freeze(["supported", "partial", "unsupported", "not_checked"]);
export const AMBIGUITY = freeze(["none", "minor", "ambiguous"]);

// §2.11 dedup
export const DEDUP_CLASSES = freeze(["EXACT_DUPLICATE", "NEAR_DUPLICATE", "RELATED", "UNIQUE"]);
export const DEDUP_SIGNALS = freeze([
  "exact_hash", "minhash", "same_answer", "same_pages", "numeric_variant", "template_variant", "semantic_judged",
]);

// §2.12 exam templates
export const TEMPLATE_KINDS = freeze(["lesson", "chapter", "subject", "term", "full_year", "practice", "mock", "timed", "weakness", "random"]);
export const STRATIFY_BY = freeze(["objective", "lesson", "chapter", "unit", "topic", "none"]);
export const COVERAGE_WEIGHTS = freeze(["equal", "lesson_count", "pool_size", "error_rate"]);
export const TERM_RULES = freeze(["inherit", "single_term", "both_terms"]);
export const TIMING_MODES = freeze(["timed", "untimed"]);
export const FEEDBACK_MODES = freeze(["end", "immediate"]);
export const QUOTAS = freeze(["exam", "practice"]);
export const QUESTION_ORDERS = freeze(["shuffle", "shuffle_keep_stimulus", "by_stratum"]);

// §2.13 sessions
export const SESSION_STATUSES = freeze(["in_progress", "submitted", "expired", "abandoned"]);
export const TERM_SCOPES = freeze(["t1", "t2", "year"]);
export const VERDICTS = freeze(["correct", "incorrect", "partial", "unanswered"]);

// §4.1 fetch queue and crawl changes; §4.4 review decisions; §4.3b prep alignment
export const FETCH_KINDS = freeze(["api", "head", "range", "full"]);
export const FETCH_STATES = freeze(["pending", "done", "failed", "parked"]);
export const REVIEW_DECISIONS = freeze(["accept_key", "set_key", "reject", "repair"]);
export const ALIGNMENT_STATUSES = freeze(["verified", "needs_review"]);
export const REGISTRY_KINDS = freeze(["x_node", "objective"]);
