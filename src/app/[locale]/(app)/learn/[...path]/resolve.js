import { leafOf, loadOutline } from "@/lib/curriculum-outline";
import { parseLearnPath, resolveLearnNode } from "@/components/learn/learn-logic";

/**
 * /learn/<path> → { tree, ctx } for an outline node, or null for any path
 * that names no node (malformed, unknown leaf, unknown subject/unit/lesson).
 * The leaf outline is memoized, so the layout, metadata and page share one load.
 */
export async function resolveLearn(path) {
  const parsed = parseLearnPath(path);
  if (!parsed) return null;
  const leaf = leafOf(parsed.nodeId);
  const tree = leaf ? await loadOutline(leaf) : null;
  const ctx = tree ? resolveLearnNode(tree, parsed.nodeId) : null;
  return ctx ? { tree, ctx } : null;
}
