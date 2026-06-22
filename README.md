# 🏝️ منصة جزيرة التعليمية — Jazira Edu Platform

منصة تعليمية تفاعلية فاخرة بالكامل باللغة العربية (RTL) بثيم "البيج الراقي"
(خلفيات كريمية، لمسات ذهبية شامبانية، ومكوّنات زجاجية شفافة).

A production-ready prototype built with **Next.js 14 (App Router)**, **Tailwind CSS**,
**Framer Motion**, **Clerk** (auth), and **Google Gemini** (AI assistant).

---

## ✨ الميزات / Features

- **مصادقة Clerk** — تسجيل عبر Google وApple ورقم الجوال (يعمل تلقائيًا في وضع تجريبي إن لم تُضبط المفاتيح).
- **قائمة جانبية زجاجية (RTL)** — بطاقة مستخدم ديناميكية، أقسام بقوائم منسدلة، وحالة زائر/مسجّل.
- **المرحلة الابتدائية** — لوحة رسم تفاعلية لتدريب الكتابة + تحدّي قراءة صوتي مع تغذية بصرية فورية.
- **القدرات والتحصيلي** — محرّك اختبارات بأسئلة عشوائية، مؤقّت صارم (40 ثانية/سؤال) مع إرسال تلقائي.
- **التجربة المجانية** — اختبار واحد مجاني ثم جدار دفع.
- **المسابقات** — لوحة متصدرين حسب نقاط XP + جوائز (PS5 / 500 ريال / iPad).
- **المجتمع التعليمي** — خلاصة اجتماعية بأسلوب Binance Square مع إعجاب وتعليق ووسام ذهبي للنخبة.
- **الاشتراكات** — باقة النخبة (19 ريال) بواجهة دفع (Apple Pay / مدى) + نظام دعوات (افتح بـ 5 دعوات).
- **المساعد الذكي (Gemini)** — ودجة عائمة، روبوت متحرك (سكون/تفكير)، بث نصي مباشر، حدود استخدام (3 رسائل/8 ساعات للمجاني)، وروابط تفاعلية حسب السياق.

---

## 🚀 التشغيل / Getting Started

> **متطلّب:** Node.js 18.18+ مثبّت على جهازك. (لم يكن مثبّتًا أثناء توليد المشروع.)

```bash
# 1) ثبّت الحزم
npm install

# 2) شغّل بيئة التطوير
npm run dev

# 3) افتح المتصفح
# http://localhost:3000
```

التطبيق **يعمل مباشرةً** حتى بدون مفاتيح Clerk (وضع زائر تجريبي). المساعد الذكي
يحتاج مفتاح `GEMINI_API_KEY` الموجود في `.env.local`.

---

## 🔑 المتغيّرات البيئية / Environment Variables

انسخ `.env.example` إلى `.env.local` واملأ القيم. الملف `.env.local` **مُتجاهَل من Git**.

| المتغيّر | الوصف |
|---|---|
| `GEMINI_API_KEY` | مفتاح Google Gemini (مطلوب للمساعد الذكي) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | مفتاح Clerk العام (اختياري) |
| `CLERK_SECRET_KEY` | مفتاح Clerk السرّي (اختياري) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | مفتاح Stripe (واجهة فقط في هذا النموذج) |

### ⚠️ تنبيه أمني مهم
مفتاح `GEMINI_API_KEY` الذي زوّدتنا به مكتوب الآن في `.env.local` (وهو مُتجاهَل من Git).
بما أنه شُورك كنص صريح، **يُنصح بشدّة بإلغائه وإنشاء مفتاح جديد** من Google AI Studio
قبل النشر للإنتاج. لا تضع أي مفتاح سرّي في كود الواجهة (client) أبدًا.

---

## 🗂️ هيكل المشروع / Structure

```
src/
├─ app/
│  ├─ layout.js                 # الجذر: RTL + خط Tajawal + Clerk/Providers
│  ├─ globals.css               # ثيم البيج + الزجاج
│  ├─ page.js                   # الصفحة الترحيبية
│  ├─ not-found.js
│  ├─ sign-in / sign-up         # صفحات Clerk
│  ├─ api/chat/route.js         # واجهة Gemini مع البث المباشر
│  └─ (app)/                    # القسم الأساسي (قائمة + مساعد ذكي)
│     ├─ layout.js
│     ├─ dashboard / elementary / middle / high-school
│     ├─ community / competitions / subscriptions
│     ├─ achievements / settings / about / feedback / support
├─ components/                  # Sidebar, AIAssistant, RobotMascot, QuduratTest, ...
├─ context/                     # AppContext (اشتراك/XP/دعوات) + AuthProvider
├─ hooks/                       # useAiUsage (حدود الاستخدام)
└─ lib/                         # constants, questions (بنك الأسئلة), authConfig
```

---

## 🧪 ملاحظات النموذج / Prototype Notes

- الاشتراك، XP، الدعوات، وحدود المساعد الذكي تُحفظ في **localStorage** (لا حاجة لقاعدة بيانات للتجربة).
- بنك الأسئلة مُحاكى في `src/lib/questions.js` — استبدله بنداء API آمن للإنتاج.
- واجهة الدفع تجريبية (لا تتم معاملة فعلية) — اربطها بـ Stripe/Tap للإنتاج.
- زر "محاكاة دعوة ناجحة" في صفحة الاشتراكات لأغراض العرض فقط.
