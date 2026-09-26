// Messages that embed Arabic learning content ({letter}, {heard}) in UI copy.
// The Arabic part is rendered in its own lang="ar" <bdi>, so screen readers
// switch voice only for it (the English words around it stay English) and it
// can't reorder the sentence. Server- and client-safe (no hooks).

const SLOT = "⁣"; // invisible separator: never part of a message

/** t(key, vars) with vars[slot] rendered as an isolated Arabic span. */
export function withArabic(t, key, vars, slot, arabic) {
  const [before, after = ""] = t(key, { ...vars, [slot]: SLOT }).split(SLOT);
  return (
    <>
      {before}
      <bdi lang="ar" dir="rtl">
        {arabic}
      </bdi>
      {after}
    </>
  );
}
