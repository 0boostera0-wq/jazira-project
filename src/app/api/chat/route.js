import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@/lib/supabase-server";
import { CHAT_LIMITS, isValidSessionId, newSessionId, prepareChatInput } from "@/lib/chatStore";
import { isSameOrigin } from "@/lib/http-guards";
import { isRateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Jazira Assistant — secure server-side chat endpoint.
//
//   POST /api/chat   (same-origin, signed in)
//   body: { messages: [{ role: "user"|"assistant", content }], sessionId?, locale?: "ar"|"en" }
//   200  text/plain stream of the reply; header X-Session-Id
//   errors: plain-text localized notice + header X-Error-Code:
//     403 forbidden · 400 invalid_request | empty_message | message_too_long ·
//     413 payload_too_large · 401 not_authenticated · 429 ai_quota_exhausted
//     (+ Retry-After, X-Quota-Limit, X-Quota-Remaining, X-Quota-Reset) ·
//     429 rate_limited · 503 ai_unavailable | ai_busy · 502 ai_error
//   A reply that fails mid-stream aborts the response (the client shows
//   "interrupted"); a reply the user stops is stored as far as it got.
//
// Quota (migration 0013): public.ai_consume() checks the quota, stores the
// user message and charges it in ONE locked transaction per member, so
// parallel requests cannot all pass. Re-sending the same message is free only
// while the server's own ledger says its reply was never delivered
// (ai_usage.replied_at) — deleting chat rows changes nothing. The reply is
// stored (or the claim released) with public.ai_finish(ticket); the ticket
// never leaves this process. No ai_consume() → 503 (never an unmetered model).
//
// The API key is read ONLY here. Provider and model names appear only in
// server logs — never in anything sent to the browser.
// ---------------------------------------------------------------------------

// In-app pages the assistant may link to ([text](/path)); the client renders
// only internal links, everything else as plain text.
const LINKS = [
  ["/exams", "مركز الاختبارات", "Exam center"],
  ["/exams/aptitude", "اختبار القدرات العامة", "Qudurat (General Aptitude) practice"],
  ["/exams/achievement", "الاختبار التحصيلي", "Tahsili (Achievement) practice"],
  ["/curriculum", "المناهج والمصادر", "Curriculum and resources"],
  ["/elementary", "المرحلة الابتدائية", "Elementary stage"],
  ["/middle", "المرحلة المتوسطة", "Middle school"],
  ["/high-school", "المرحلة الثانوية", "High school"],
  ["/community", "المجتمع", "Community"],
  ["/competitions", "المنافسات", "Competitions"],
  ["/subscriptions", "باقة النخبة والاشتراك", "The Elite plan and subscription"],
  ["/settings", "الإعدادات", "Settings"],
  ["/assistant", "مساعد الجزيرة", "Jazira Assistant"],
];

function systemInstruction(locale) {
  if (locale === "en") {
    return [
      'You are "Jazira Assistant", the study assistant of Jazira, an Arabic-first learning platform for students in Saudi Arabia (elementary, middle and high school, plus Qudurat and Tahsili exam preparation).',
      "- Reply in clear, friendly English unless the student explicitly asks for another language.",
      "- Be concise and respectful. Explain step by step, use numbered steps for methods, and end with a short check-your-understanding question when it helps.",
      "- Never help anyone cheat on a real exam or graded work. For homework, guide the method instead of giving only the final answer.",
      "- If asked who you are, you are Jazira Assistant. Never mention the company, provider or model behind you.",
      "- If you are not sure, say so. Never invent facts, sources, statistics or platform features. You cannot see the student's grades, files or account.",
      "- Formatting: use only short paragraphs, '- ' bullet lists, '1. ' numbered lists, **bold**, `inline code`, and fenced code blocks for code. No tables, headings, images or HTML.",
      "- When the student asks where something is on Jazira, add a Markdown link on its own line using ONLY these paths:",
      ...LINKS.map(([path, , en]) => `  - ${en}: ${path}`),
      "- Never link to external websites.",
    ].join("\n");
  }
  return [
    "أنت «مساعد الجزيرة»، المساعد الدراسي لمنصة جزيرة التعليمية العربية لطلاب المملكة العربية السعودية (المراحل الابتدائية والمتوسطة والثانوية، والاستعداد لاختبارَي القدرات والتحصيلي).",
    "- أجب بالعربية الفصحى المبسّطة وبأسلوب ودود ومحترم، ما لم يطلب الطالب صراحةً لغة أخرى.",
    "- كن موجزًا وواضحًا، واشرح خطوة بخطوة، واستخدم خطوات مرقّمة عند شرح طريقة الحل، واختم بسؤال قصير للتحقق من الفهم عند الحاجة.",
    "- لا تساعد على الغش في اختبار حقيقي أو عمل مُقيَّم إطلاقًا. وفي الواجبات، أرشد الطالب إلى طريقة الحل بدل إعطائه الناتج النهائي فقط.",
    "- إذا سُئلت عن هويتك فأنت «مساعد الجزيرة» فقط؛ لا تذكر الشركة أو المزوّد أو النموذج الذي يشغّلك.",
    "- إذا لم تكن متأكدًا فقل ذلك. لا تختلق معلومات أو مصادر أو إحصاءات أو مزايا غير موجودة في المنصة. لا يمكنك رؤية درجات الطالب أو ملفاته أو حسابه.",
    "- التنسيق: استخدم فقط فقرات قصيرة، وقوائم نقطية تبدأ بـ '- '، وقوائم مرقّمة '1. '، و**الخط العريض**، و`الشيفرة القصيرة`، وكتل الشيفرة للبرمجة. لا جداول ولا عناوين ولا صور ولا HTML.",
    "- إذا سأل الطالب عن مكان ميزة في المنصة، فأضف رابطًا بصيغة Markdown على سطر مستقل، باستخدام هذه المسارات فقط:",
    ...LINKS.map(([path, ar]) => `  - ${ar}: ${path}`),
    "- لا تضع روابط لمواقع خارجية أبدًا.",
  ].join("\n");
}

// Plain-text notices, keyed by locale (the client shows its own localized
// copy based on X-Error-Code; these keep the raw response readable).
const NOTICES = {
  ar: {
    quota: ({ limit, time }) =>
      `وصلتَ إلى حدّ الرسائل المجانية مع المساعد (${limit} رسائل كل 8 ساعات).` +
      (time ? ` يمكنك المتابعة بعد الساعة ${time} بتوقيت الرياض،` : " يمكنك المتابعة لاحقًا،") +
      " أو الترقية إلى باقة النخبة لرسائل غير محدودة.",
    unavailable: "المساعد غير متاح حاليًا. يرجى المحاولة بعد قليل.",
    busy: "المساعد مشغول حاليًا بسبب كثرة الطلبات. يرجى المحاولة بعد دقيقة.",
    error: "تعذّر الحصول على رد من المساعد الآن. حاول مرة أخرى بعد قليل.",
    forbidden: "طلب غير مصرّح به.",
    unauthenticated: "يجب تسجيل الدخول أولًا.",
    invalid: "طلب غير صالح.",
    empty: "الرسالة فارغة.",
    tooLong: `الرسالة أطول من الحد المسموح (${CHAT_LIMITS.maxMessageChars} حرف).`,
    tooLarge: "الطلب أكبر من الحجم المسموح.",
    rateLimited: "أرسلتَ رسائل كثيرة خلال وقت قصير. انتظر قليلًا ثم تابع.",
  },
  en: {
    quota: ({ limit, time }) =>
      `You've reached the free limit for the assistant (${limit} messages every 8 hours).` +
      (time ? ` You can continue after ${time} (Riyadh time),` : " You can continue later,") +
      " or upgrade to Elite for unlimited messages.",
    unavailable: "The assistant is unavailable right now. Please try again shortly.",
    busy: "The assistant is busy right now. Please try again in a minute.",
    error: "We couldn't get a reply from the assistant. Please try again shortly.",
    forbidden: "Request not allowed.",
    unauthenticated: "Please sign in first.",
    invalid: "Invalid request.",
    empty: "The message is empty.",
    tooLong: `The message is longer than the limit (${CHAT_LIMITS.maxMessageChars} characters).`,
    tooLarge: "The request is too large.",
    rateLimited: "You've sent a lot of messages in a short time. Wait a moment, then carry on.",
  },
};

/** Plain-text response (used for every error) with a machine-readable code. */
function notice(message, status, code, headers = {}) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Error-Code": code, ...headers },
  });
}

// body.locale → NEXT_LOCALE cookie → Accept-Language → Arabic.
function requestLocale(req, body) {
  if (body?.locale === "ar" || body?.locale === "en") return body.locale;
  const cookie = /(?:^|;\s*)NEXT_LOCALE=(ar|en)\b/.exec(req.headers.get("cookie") || "");
  if (cookie) return cookie[1];
  return /^\s*en\b/i.test(req.headers.get("accept-language") || "") ? "en" : "ar";
}

function riyadhTime(iso, locale) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ar-SA-u-nu-latn", {
    hour: "numeric", minute: "2-digit", timeZone: "Asia/Riyadh",
  }).format(d);
}

// ---------------------------------------------------------------------------
// Server-side quota (public.ai_consume(): Elite unlimited; free = 5 user
// messages per rolling 8 h, +5 with 5 referrals — see docs/DATA_API.md).
// Decided and charged BEFORE the model is contacted.
// ---------------------------------------------------------------------------
const MISSING_RPC = new Set(["PGRST202", "42883"]);

function quotaResponse(q, locale) {
  const retryAfter = q?.resets_at ? Math.max(1, Math.ceil((new Date(q.resets_at).getTime() - Date.now()) / 1000)) : 3600;
  const headers = {
    "Retry-After": String(retryAfter),
    "X-Quota-Limit": String(q?.limit ?? ""),
    "X-Quota-Remaining": "0",
  };
  if (q?.resets_at) headers["X-Quota-Reset"] = new Date(q.resets_at).toISOString();
  const text = NOTICES[locale].quota({ limit: q?.limit, time: riyadhTime(q?.resets_at, locale) });
  return notice(text, 429, "ai_quota_exhausted", headers);
}

/** → { ok: true, ticket } | { ok: false, response } */
async function consume(supabase, sessionId, text, locale) {
  const N = NOTICES[locale];
  let res;
  try {
    res = await supabase.rpc("ai_consume", { p_session: sessionId, p_content: text });
  } catch (err) {
    console.error("[AI] ai_consume() failed:", String(err?.message || err).slice(0, 200));
    return { ok: false, response: notice(N.unavailable, 503, "ai_unavailable") };
  }
  const { data, error } = res || {};
  if (error) {
    if (MISSING_RPC.has(error.code)) {
      console.error("[AI] ai_consume() is not deployed (apply migration 0013) — refusing unmetered requests");
    } else if (error.message === "invalid_argument") {
      return { ok: false, response: notice(N.invalid, 400, "invalid_request") };
    } else {
      console.error("[AI] ai_consume() failed:", error.code, error.message);
    }
    return { ok: false, response: notice(N.unavailable, 503, "ai_unavailable") };
  }
  if (data?.ok && data.ticket) return { ok: true, ticket: data.ticket };
  if (data?.reason === "quota") return { ok: false, response: quotaResponse(data.quota, locale) };
  console.error("[AI] ai_consume() returned an unexpected payload");
  return { ok: false, response: notice(N.unavailable, 503, "ai_unavailable") };
}

/** Store the delivered reply (or release the claim when nothing was delivered). Never throws. */
async function finish(supabase, ticket, reply) {
  try {
    const { error } = await supabase.rpc("ai_finish", {
      p_ticket: ticket,
      p_reply: typeof reply === "string" && reply.trim() ? reply.slice(0, 20000) : null,
    });
    if (error) console.warn("[AI] could not finish the reply:", error.code, error.message);
  } catch (err) {
    console.warn("[AI] could not finish the reply:", String(err?.message || err).slice(0, 200));
  }
}

// Burst limit per member, shared by every server instance (Elite is
// unlimited by quota; this only blunts scripted floods).
const BURST = { max: 20, windowSeconds: 60 };

async function readBody(req) {
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > CHAT_LIMITS.maxBodyBytes) return { ok: false, tooLarge: true };
  try {
    const text = await req.text();
    // Bytes, not UTF-16 units (Arabic is 2 bytes per letter in UTF-8).
    if (Buffer.byteLength(text, "utf8") > CHAT_LIMITS.maxBodyBytes) return { ok: false, tooLarge: true };
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

export async function POST(req) {
  if (!isSameOrigin(req)) return notice(NOTICES[requestLocale(req, null)].forbidden, 403, "forbidden");

  const parsed = await readBody(req);
  const body = parsed.ok ? parsed.value : null;
  const locale = requestLocale(req, body);
  const N = NOTICES[locale];
  if (!parsed.ok) return parsed.tooLarge ? notice(N.tooLarge, 413, "payload_too_large") : notice(N.invalid, 400, "invalid_request");

  const supabase = await createClient();
  if (!supabase) return notice(N.unavailable, 503, "ai_unavailable");
  let user = null;
  try {
    ({ data: { user } } = await supabase.auth.getUser());
  } catch (err) {
    console.error("[AI] auth check failed:", String(err?.message || err).slice(0, 200));
    return notice(N.unavailable, 503, "ai_unavailable");
  }
  if (!user) return notice(N.unauthenticated, 401, "not_authenticated");

  const input = prepareChatInput(body?.messages);
  if (!input.ok) {
    if (input.error === "empty_message") return notice(N.empty, 400, "empty_message");
    if (input.error === "message_too_long") return notice(N.tooLong, 400, "message_too_long");
    return notice(N.invalid, 400, "invalid_request");
  }
  const sessionId = isValidSessionId(body?.sessionId) ? body.sessionId : newSessionId();

  if (await isRateLimited({ bucket: "chat", key: user.id, ...BURST })) {
    return notice(N.rateLimited, 429, "rate_limited", { "Retry-After": "60" });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  // Key missing entirely — neutral notice for the user, setup hint in the logs only.
  if (!apiKey || apiKey.length < 8) {
    console.warn("[AI] GEMINI_API_KEY is not set — add it to the Vercel env / .env.local and restart.");
    return notice(N.unavailable, 503, "ai_unavailable");
  }

  // Quota + store + charge, atomically (a retry of an undelivered reply is free).
  const charge = await consume(supabase, sessionId, input.text, locale);
  if (!charge.ok) return charge.response;
  const { ticket } = charge;

  // Ordered fallback list (server-only) — first available model wins.
  const MODEL_FALLBACKS = [
    process.env.GEMINI_MODEL,
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
  ].filter(Boolean);

  const history = input.history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const genAI = new GoogleGenerativeAI(apiKey);
  const encoder = new TextEncoder();
  let lastErr = null;

  for (const modelName of MODEL_FALLBACKS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: systemInstruction(locale) });
      const chat = model.startChat({ history, generationConfig: { temperature: 0.6, maxOutputTokens: 1536 } });
      const result = await chat.sendMessageStream(input.text);
      console.log(`[AI] streaming with model: ${modelName}`);

      let cancelled = false;
      const stream = new ReadableStream({
        async start(controller) {
          let full = "";
          let failed = false;
          try {
            for await (const chunk of result.stream) {
              if (cancelled) break;
              const text = chunk.text();
              if (text) {
                full += text;
                controller.enqueue(encoder.encode(text));
              }
            }
          } catch (err) {
            if (!cancelled) {
              failed = true;
              console.error("[AI] stream interrupted:", String(err?.message || err).slice(0, 200));
            }
          }
          // Keep complete replies and replies the user stopped (the charge is
          // spent); a failed one is dropped and the claim released, so a
          // retry neither leaves a broken half answer nor costs again.
          await finish(supabase, ticket, failed ? null : full);
          if (cancelled) return;
          if (failed) controller.error(new Error("stream_interrupted"));
          else controller.close();
        },
        cancel() {
          cancelled = true;
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          "X-Session-Id": sessionId,
        },
      });
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || err);
      // Only fall through to the next model if this one is simply unavailable.
      if (/not found|unsupported|model|404|NOT_FOUND/i.test(msg)) {
        console.warn(`[AI] model "${modelName}" unavailable, trying next…`);
        continue;
      }
      break;
    }
  }

  // All models exhausted or a non-model error occurred (details → logs only).
  // Nothing was delivered: release the claim so a retry is not charged again.
  await finish(supabase, ticket, null);
  const errMsg = String(lastErr?.message || lastErr || "");
  if (/API key not valid|API_KEY_INVALID|invalid api key/i.test(errMsg)) {
    console.error("[AI] provider rejected the API key (check GEMINI_API_KEY)");
    return notice(N.unavailable, 503, "ai_unavailable");
  }
  if (/quota|rate limit|RESOURCE_EXHAUSTED|429/i.test(errMsg)) {
    console.warn("[AI] provider rate limit:", errMsg.slice(0, 200));
    return notice(N.busy, 503, "ai_busy", { "Retry-After": "60" });
  }
  if (/not found|unsupported|model|404/i.test(errMsg)) {
    console.error("[AI] no model available for this key:", errMsg.slice(0, 200));
    return notice(N.unavailable, 503, "ai_unavailable");
  }
  console.error("[AI] request failed:", errMsg.slice(0, 200));
  return notice(N.error, 502, "ai_error");
}
