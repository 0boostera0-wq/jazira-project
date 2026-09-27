// ============================================================================
// Unit table for check N003 (docs/CONTENT_ENGINE.md Appendix B): SI units and
// their common Arabic spellings, grouped by dimension, so a numeric item's
// unit, its accepted alternatives and the units written next to numbers in
// the stem and explanation can be compared.
//
//   parseUnit("كم/س")            → { key: "km/h", dimension: "speed" }
//   unitsAfterNumbers(text)      → [{ value: "12", unit: "cm", dimension: "length", raw }]
//   sameDimension("م", "cm")     → true
//
// Matching is on searchNormalize()d text (hamza, taa marbuta, digits folded),
// so «ثانية» and «ثانيه», «كجم» and «كجم.» are the same unit.
// ============================================================================

import { searchNormalize } from "../../../src/lib/content/normalize.js";

/** key → [dimension, aliases…] (aliases in any script; matched normalized). */
const TABLE = {
  // length
  km: ["length", "km", "كم", "كلم", "كيلومتر", "كيلو متر", "كيلومترات"],
  m: ["length", "m", "م", "متر", "مترا", "أمتار", "امتار", "مترًا"],
  dm: ["length", "dm", "دسم", "ديسيمتر"],
  cm: ["length", "cm", "سم", "سنتيمتر", "سنتمتر", "سنتيمترات"],
  mm: ["length", "mm", "مم", "مليمتر", "ملليمتر", "مليمترات"],
  um: ["length", "µm", "μm", "um", "ميكرومتر"],
  nm: ["length", "nm", "نانومتر"],
  // customary length (taught with conversions in middle-school math)
  in: ["length", "in", "بوصة", "بوصات", "إنش", "انش"],
  ft: ["length", "ft", "قدم", "أقدام", "اقدام", "قدما"],
  yd: ["length", "yd", "ياردة", "ياردات"],
  mi: ["length", "mi", "ميل", "أميال", "اميال", "ميلا"],
  // area
  "km^2": ["area", "km^2", "km2", "كم^2", "كم2", "كيلومتر مربع"],
  "m^2": ["area", "m^2", "m2", "م^2", "م2", "متر مربع", "مترا مربعا"],
  "cm^2": ["area", "cm^2", "cm2", "سم^2", "سم2", "سنتيمتر مربع"],
  "mm^2": ["area", "mm^2", "mm2", "مم^2", "مم2"],
  ha: ["area", "ha", "هكتار"],
  // volume
  "m^3": ["volume", "m^3", "m3", "م^3", "م3", "متر مكعب"],
  "cm^3": ["volume", "cm^3", "cm3", "سم^3", "سم3", "سنتيمتر مكعب"],
  l: ["volume", "l", "L", "لتر", "لترا", "لترات"],
  ml: ["volume", "ml", "mL", "مل", "ملل", "مليلتر", "ملليلتر"],
  cup: ["volume", "cup", "كوب", "أكواب", "اكواب", "كوبا"],
  gal: ["volume", "gal", "جالون", "جالونات", "غالون"],
  qt: ["volume", "qt", "كوارت", "كوارتات"],
  pt: ["volume", "pt", "باينت", "باينتات"],
  floz: ["volume", "fl oz", "أونصة سائلة", "اونصة سائلة"],
  // mass
  t: ["mass", "t", "طن", "أطنان", "اطنان"],
  kg: ["mass", "kg", "كجم", "كغ", "كيلوجرام", "كيلوغرام", "كيلو جرام"],
  g: ["mass", "g", "جم", "غ", "جرام", "غرام", "جرامات", "غرامات"],
  mg: ["mass", "mg", "ملجم", "مجم", "ملغ", "مليجرام", "ملليجرام"],
  lb: ["mass", "lb", "رطل", "أرطال", "ارطال", "رطلا"],
  oz: ["mass", "oz", "أونصة", "اونصة", "أونصات", "اونصات"],
  // time
  h: ["time", "h", "hr", "ساعة", "ساعات", "سا"],
  min: ["time", "min", "دقيقة", "دقائق", "د"],
  s: ["time", "s", "sec", "ث", "ثانية", "ثوان", "ثواني", "ثوانٍ"],
  ms: ["time", "ms", "ملي ثانية", "مللي ثانية"],
  day: ["time", "يوم", "أيام", "ايام", "يوما"],
  week: ["time", "أسبوع", "اسبوع", "أسابيع", "اسابيع", "أسبوعا"],
  month: ["time", "شهر", "أشهر", "اشهر", "شهور", "شهرا"],
  year: ["time", "سنة", "سنوات", "عام", "أعوام", "اعوام", "عاما"],
  // speed / acceleration
  "m/s": ["speed", "m/s", "م/ث", "متر/ثانية", "متر لكل ثانية"],
  "km/h": ["speed", "km/h", "كم/س", "كم/ساعة", "كم/سا", "كيلومتر/ساعة", "كيلومتر لكل ساعة"],
  "m/s^2": ["acceleration", "m/s^2", "m/s2", "م/ث^2", "م/ث2"],
  // force, energy, power, pressure
  n: ["force", "N", "نيوتن"],
  kn: ["force", "kN", "كيلونيوتن"],
  j: ["energy", "J", "جول"],
  kj: ["energy", "kJ", "كيلوجول", "كيلو جول"],
  cal: ["energy", "cal", "سعر", "سعرة", "كالوري"],
  kcal: ["energy", "kcal", "كيلو سعر", "سعر حراري كبير"],
  kwh: ["energy", "kWh", "كيلوواط ساعة", "كيلو واط ساعة"],
  w: ["power", "W", "واط", "وات"],
  kw: ["power", "kW", "كيلوواط", "كيلو واط"],
  pa: ["pressure", "Pa", "باسكال"],
  kpa: ["pressure", "kPa", "كيلوباسكال"],
  atm: ["pressure", "atm", "ض جوي", "ضغط جوي"],
  // temperature
  c: ["temperature", "°C", "℃", "C°", "درجة سيليزية", "درجة مئوية", "س°", "°س"],
  k: ["temperature", "K", "كلفن"],
  f: ["temperature", "°F", "درجة فهرنهايت"],
  // electricity, frequency
  coulomb: ["charge", "كولوم"],
  a: ["current", "A", "أمبير", "امبير"],
  ma: ["current", "mA", "ملي أمبير"],
  v: ["voltage", "V", "فولت"],
  ohm: ["resistance", "Ω", "ohm", "أوم", "اوم"],
  hz: ["frequency", "Hz", "هيرتز", "هرتز"],
  // chemistry
  mol: ["amount", "mol", "مول"],
  "mol/l": ["concentration", "mol/L", "M", "مول/لتر", "مولار"],
  "g/mol": ["molar_mass", "g/mol", "جم/مول", "غ/مول"],
  "g/cm^3": ["density", "g/cm^3", "g/cm3", "جم/سم^3", "جم/سم3"],
  "kg/m^3": ["density", "kg/m^3", "kg/m3", "كجم/م^3", "كجم/م3"],
  // angles, money, ratio
  deg: ["angle", "°", "deg"],
  // «درجة» alone is an angle or a temperature: compatible with both (dimCompatible).
  degree: ["degree", "درجة", "درجات", "degree", "degrees"],
  rad: ["angle", "rad", "راديان"],
  sar: ["currency", "SAR", "ريال", "ريالا", "ريالات", "ريالًا"],
  halala: ["currency", "هللة", "هللات"],
  percent: ["ratio", "%", "٪", "بالمئة", "في المئة", "بالمائة"],
};

const BY_ALIAS = new Map();
const DIMENSION = new Map();
for (const [key, [dimension, ...aliases]] of Object.entries(TABLE)) {
  DIMENSION.set(key, dimension);
  for (const alias of [key, ...aliases]) {
    // Case matters for SI symbols (m vs M, k vs K) only in Latin; Arabic has no case.
    const exact = String(alias).trim();
    if (!BY_ALIAS.has(`x:${exact}`)) BY_ALIAS.set(`x:${exact}`, key);
    const norm = searchNormalize(exact);
    if (norm && !BY_ALIAS.has(`n:${norm}`)) BY_ALIAS.set(`n:${norm}`, key);
  }
}

export const UNIT_KEYS = Object.freeze(Object.keys(TABLE));

/** { key, dimension } for a unit text, or null when it is not in the table. */
export function parseUnit(text) {
  const raw = String(text ?? "").trim().replace(/[.،,]+$/, "");
  if (!raw) return null;
  const key = BY_ALIAS.get(`x:${raw}`) ?? BY_ALIAS.get(`n:${searchNormalize(raw)}`)
    // «ال» prefix and a trailing tanween alef: «المتر», «مترًا»
    ?? BY_ALIAS.get(`n:${searchNormalize(raw).replace(/^ال/, "")}`)
    ?? null;
  if (key) return { key, dimension: DIMENSION.get(key) };
  // A rate of two known units not in the table: «ريالًا / ساعة», «صفحة/دقيقة» needs both known.
  const parts = raw.split(/\s*\/\s*/);
  if (parts.length === 2 && parts[0] && parts[1]) {
    const a = parseUnit(parts[0]);
    const b = parseUnit(parts[1]);
    if (a && b) return { key: `${a.key}/${b.key}`, dimension: `${a.dimension}/${b.dimension}` };
  }
  return null;
}

export const dimensionOf = (text) => parseUnit(text)?.dimension ?? null;

/** Dimensions that may describe the same quantity («درجة» is an angle or a temperature). */
export function dimCompatible(da, db) {
  if (!da || !db) return false;
  if (da === db) return true;
  const deg = new Set(["angle", "temperature"]);
  return (da === "degree" && deg.has(db)) || (db === "degree" && deg.has(da));
}

/** True when both units are known and measure the same (or a compatible) dimension. */
export function sameDimension(a, b) {
  return dimCompatible(dimensionOf(a), dimensionOf(b));
}

// A number (Western or Arabic-Indic digits, decimals, fractions) followed by a
// unit made of letters, °, %, ٪, /, ^, digits after ^ and at most one space
// inside (for two-word units such as «متر مربع»).
const NUMBER = String.raw`[-−]?[0-9٠-٩۰-۹]+(?:[.,٫][0-9٠-٩۰-۹]+)?(?:\/[0-9٠-٩۰-۹]+)?`;
const UNIT_CHARS = String.raw`[A-Za-zµμΩ°℃%٪ء-ي٠-٩/^²³]`;
const QUANTITY_RE = new RegExp(`(${NUMBER})\\s?(${UNIT_CHARS}+(?:\\s${UNIT_CHARS}+)?)`, "gu");

/** Quantities written as <number> <unit> whose unit is in the table. */
export function unitsAfterNumbers(text) {
  const out = [];
  for (const m of String(text ?? "").matchAll(QUANTITY_RE)) {
    const unitText = m[2].replace(/²/g, "^2").replace(/³/g, "^3");
    // Try the two-word unit first, then its first word («5 متر مربع» / «5 متر في»).
    const words = unitText.split(" ");
    const hit = parseUnit(unitText) ? unitText : parseUnit(words[0]) ? words[0] : null;
    if (!hit) continue;
    const parsed = parseUnit(hit);
    out.push({ value: m[1], unit: parsed.key, dimension: parsed.dimension, raw: `${m[1]} ${hit}` });
  }
  return out;
}

/** True when `text` mentions the unit (any alias of the same key). */
export function mentionsUnit(text, unitText) {
  const target = parseUnit(unitText);
  if (!target) return searchNormalize(text).includes(searchNormalize(unitText));
  const norm = ` ${searchNormalize(text)} `;
  for (const [alias, key] of BY_ALIAS) {
    if (key !== target.key) continue;
    const a = alias.slice(2);
    if (alias.startsWith("x:") ? String(text ?? "").includes(a) : norm.includes(` ${a} `) || norm.includes(`${a} `)) return true;
  }
  return unitsAfterNumbers(text).some((q) => q.unit === target.key);
}
