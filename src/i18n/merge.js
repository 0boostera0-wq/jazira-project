// Pure helper shared by the server loader (messages/index.js) and the client
// MessagesProvider. Kept in its own module so the client bundle doesn't pull in
// the namespace loader table.

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Deep-merge plain message objects (arrays and leaves from `b` win). Pure. */
export function mergeMessages(a, b) {
  if (!isPlainObject(a) || !isPlainObject(b)) return b;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = k in a ? mergeMessages(a[k], v) : v;
  return out;
}
