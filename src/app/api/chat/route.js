import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// مساعد جزيرة الذكي — secure server-side chat endpoint.
// The API key is read ONLY here (server). It is never sent to the browser.
// Messages are saved to Supabase chat_history table.
// ---------------------------------------------------------------------------

const SYSTEM_INSTRUCTION = `أنت "مساعد جزيرة الذكي"، مرشد تعليمي راقٍ وودود في منصة جزيرة التعليمية (طابع جزيرة 🏝️).
- تحدّث دائمًا باللغة العربية الفصحى المبسّطة وبأسلوب فاخر ومحترم.
- ساعد الطلاب في القدرات والتحصيلي والمواد الدراسية لجميع المراحل (ابتدائي، متوسط، ثانوي).
- كن موجزًا وواضحًا، واستخدم خطوات مرقّمة عند الشرح.
- لا تشجّع على الغش إطلاقًا، وحثّ الطالب على الأمانة والاجتهاد.
- إذا سُئلت عن هويتك فأنت «مساعد جزيرة» فقط؛ لا تذكر اسم الشركة أو النموذج الذي يشغّلك.
- إذا سأل المستخدم عن مكان ميزة داخل المنصة، وجّهه للصفحة المناسبة واكتب الرابط على سطر مستقل بصيغة [النص](/path)، مثل:
  - القدرات/التحصيلي => /high-school
  - الابتدائية => /elementary
  - المتوسطة => /middle
  - المجتمع => /community
  - المسابقات => /competitions
  - الاشتراكات وباقة النخبة => /subscriptions
  - الإعدادات => /settings`;

// Stream a single plain-text message (used for graceful errors).
function textStream(message, status = 200) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(encoder.encode(message));
      c.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

// ---------------------------------------------------------------------------
// Server-side quota (public.ai_quota(): Elite unlimited; free = 5 user messages
// per rolling 8 h, +5 with 5 referrals — see docs/DATA_API.md). Checked BEFORE
// the model is contacted. User-visible texts never name the AI provider/model;
// provider details go to server logs only.
// ---------------------------------------------------------------------------
const NOTICES = {
  ar: {
    quota: ({ limit, time }) =>
      `وصلتَ إلى حدّ الرسائل المجانية مع المساعد (${limit} رسائل كل 8 ساعات).` +
      (time ? ` يمكنك المتابعة بعد الساعة ${time} بتوقيت الرياض،` : " يمكنك المتابعة لاحقًا،") +
      " أو الترقية إلى باقة النخبة لرسائل غير محدودة.",
    unavailable: "المساعد غير متاح حاليًا. يرجى المحاولة بعد قليل.",
  },
  en: {
    quota: ({ limit, time }) =>
      `You've reached the free limit for the assistant (${limit} messages every 8 hours).` +
      (time ? ` You can continue after ${time} (Riyadh time),` : " You can continue later,") +
      " or upgrade to Elite for unlimited messages.",
    unavailable: "The assistant is unavailable right now. Please try again shortly.",
  },
};

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

/** → { ok: true } | { ok: false, response } */
async function checkQuota(supabase, locale) {
  const { data: q, error } = await supabase.rpc("ai_quota");
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      console.warn("[AI] ai_quota() is not deployed yet — server-side quota not enforced");
      return { ok: true };
    }
    console.error("[AI] ai_quota() failed:", error.code, error.message);
    return { ok: false, response: textStream(NOTICES[locale].unavailable, 503) };
  }
  if (!q || q.unlimited || (typeof q.remaining === "number" && q.remaining > 0)) return { ok: true };

  const retryAfter = q.resets_at ? Math.max(1, Math.ceil((new Date(q.resets_at).getTime() - Date.now()) / 1000)) : 3600;
  const response = textStream(NOTICES[locale].quota({ limit: q.limit, time: riyadhTime(q.resets_at, locale) }), 429);
  response.headers.set("Retry-After", String(retryAfter));
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Error-Code", "ai_quota_exhausted");
  response.headers.set("X-Quota-Limit", String(q.limit ?? ""));
  response.headers.set("X-Quota-Remaining", "0");
  if (q.resets_at) response.headers.set("X-Quota-Reset", new Date(q.resets_at).toISOString());
  return { ok: false, response };
}

// Basic protection: only accept same-origin requests (blocks casual external abuse).
function isSameOrigin(req) {
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin fetches may omit Origin
  const host = req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(req) {
  if (!isSameOrigin(req)) {
    return textStream("طلب غير مصرّح به.", 403);
  }

  // Check authentication
  const supabase = await createClient();
  if (!supabase) return textStream(NOTICES[requestLocale(req, null)].unavailable, 503);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return textStream("يجب تسجيل الدخول أولاً", 401);
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  // Key missing entirely — neutral notice for the user, setup hint in the logs only.
  if (!apiKey || apiKey.length < 8) {
    console.warn("[AI] GEMINI_API_KEY is not set — add it to the Vercel env / .env.local and restart.");
    return textStream(NOTICES[requestLocale(req, null)].unavailable, 503);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return textStream("طلب غير صالح.", 400);
  }

  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const sessionId = body?.sessionId || crypto.randomUUID();
  const last = messages[messages.length - 1];
  const userText = (last?.content || "").toString().slice(0, 4000);
  if (!userText.trim()) return textStream("الرسالة فارغة.", 400);

  // Server-side quota — before anything is stored or sent to the model.
  const locale = requestLocale(req, body);
  const quota = await checkQuota(supabase, locale);
  if (!quota.ok) return quota.response;

  // Ordered fallback list — first model wins; later ones tried if the chosen
  // one is unavailable for this key type (e.g. AQ. keys may have different
  // access than AIza keys).
  // Account-agnostic ordered fallback. Same server key for every authenticated
  // user — the assistant never depends on a specific account/profile/cache.
  const MODEL_FALLBACKS = [
    process.env.GEMINI_MODEL,   // honour explicit override first
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
  ].filter(Boolean);

  // Save user message to Supabase
  await supabase.from('chat_history').insert({
    user_id: user.id,
    session_id: sessionId,
    message_type: 'user',
    content: userText,
  });

  // Build Gemini chat history once (shared across model attempts).
  const history = messages
    .slice(0, -1)
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content || "") }],
    }));
  while (history.length && history[0].role === "model") history.shift();

  const genAI = new GoogleGenerativeAI(apiKey);
  const encoder = new TextEncoder();

  let lastErr = null;

  for (const modelName of MODEL_FALLBACKS) {
    try {
      console.log(`[AI] trying model: ${modelName}`);

      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: SYSTEM_INSTRUCTION,
      });

      const chat = model.startChat({
        history,
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
      });

      const result = await chat.sendMessageStream(userText);
      let fullResponse = "";

      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of result.stream) {
              const text = chunk.text();
              if (text) {
                fullResponse += text;
                controller.enqueue(encoder.encode(text));
              }
            }
            // Persist assistant reply server-side only
            await supabase.from("chat_history").insert({
              user_id: user.id,
              session_id: sessionId,
              message_type: "assistant",
              content: fullResponse,
            });
          } catch {
            controller.enqueue(encoder.encode("\n\n[انقطع البث مؤقتًا، حاول مرة أخرى]"));
          } finally {
            controller.close();
          }
        },
      });

      console.log(`[AI] streaming with model: ${modelName}`);
      return new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
    } catch (err) {
      const msg = String(err?.message || err);
      // Only fall through to the next model if this one is simply unavailable.
      if (/not found|unsupported|model|404|NOT_FOUND/i.test(msg)) {
        console.warn(`[AI] model "${modelName}" unavailable, trying next…`);
        lastErr = err;
        continue;
      }
      // Any other error (auth, quota, network) — surface it immediately.
      lastErr = err;
      break;
    }
  }

  // All models exhausted or a non-model error occurred.
  const errMsg = String(lastErr?.message || lastErr || "");
  if (/API key not valid|API_KEY_INVALID|invalid api key/i.test(errMsg)) {
    console.error("[AI] provider rejected the API key (check GEMINI_API_KEY)");
    return textStream(NOTICES[locale].unavailable, 503);
  }
  if (/quota|rate limit|RESOURCE_EXHAUSTED/i.test(errMsg)) {
    return textStream("⏳ تم تجاوز الحصة المسموحة مؤقتًا. يرجى المحاولة بعد قليل.");
  }
  if (/not found|unsupported|model|404/i.test(errMsg)) {
    console.error("[AI] no model available for this key:", errMsg.slice(0, 200));
    return textStream(NOTICES[locale].unavailable, 503);
  }
  return textStream("عذرًا، تعذّر الاتصال بالمساعد الذكي حاليًا. حاول مرة أخرى بعد قليل. 🙏");
}
