// Arabic natural relative time. Reads ISO timestamps from Supabase.
// قبل لحظات / قبل دقيقة / قبل ساعتين / قبل 6 ساعات / قبل يوم / قبل أسبوع / قبل شهر
// Older than a year → formatted date (e.g. ١٥ مارس ٢٠٢٥).

const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

// Arabic count phrasing: 1 → "مفرد", 2 → "مثنى", 3–10 → "X جمع", 11+ → "X مفرد"
function arCount(n, [singular, dual, plural]) {
  if (n === 1) return singular;
  if (n === 2) return dual;
  if (n >= 3 && n <= 10) return `${n} ${plural}`;
  return `${n} ${singular}`;
}

export function timeAgo(input) {
  if (!input) return "";
  const then = new Date(input);
  if (isNaN(then.getTime())) return "";
  const now = Date.now();
  const s = Math.max(0, Math.floor((now - then.getTime()) / 1000));

  if (s < 45) return "قبل لحظات";
  const m = Math.floor(s / 60);
  if (m < 60) return `قبل ${arCount(m, ["دقيقة", "دقيقتين", "دقائق"])}`;
  const h = Math.floor(m / 60);
  if (h < 24) return `قبل ${arCount(h, ["ساعة", "ساعتين", "ساعات"])}`;
  const d = Math.floor(h / 24);
  if (d < 7) return `قبل ${arCount(d, ["يوم", "يومين", "أيام"])}`;
  const w = Math.floor(d / 7);
  if (w < 5) return `قبل ${arCount(w, ["أسبوع", "أسبوعين", "أسابيع"])}`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `قبل ${arCount(mo, ["شهر", "شهرين", "أشهر"])}`;

  // older than a year → formatted date
  return `${then.getDate()} ${AR_MONTHS[then.getMonth()]} ${then.getFullYear()}`;
}
