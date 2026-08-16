import { canonicalName } from "@/lib/kitchen/match";
import type { InventoryItem, InventoryStatus } from "@/lib/types";

/**
 * Restock detection.
 *
 * Buying spinach again when spinach is already Low should refill the item you
 * have, not create a second "Spinach" row. But two genuinely different yogurts
 * must stay separate, or the kitchen becomes a lie.
 *
 * The distinction is canonical product identity plus the display name: same
 * canonical *and* same product name is the same thing; same canonical but a
 * different product name is a sibling product.
 */

export type RestockDecision =
  | { kind: "restock"; target: InventoryItem; newStatus: InventoryStatus; reason: string }
  | { kind: "additional"; target: InventoryItem; newStatus: InventoryStatus; reason: string }
  | { kind: "new_product"; reason: string };

export interface IncomingProduct {
  normalized_name: string;
  category: string;
  package_size: string | null;
  quantity: number;
}

/** Same canonical identity AND same product name — the same thing on the shelf. */
function isSameProduct(incoming: IncomingProduct, existing: InventoryItem): boolean {
  if (canonicalName(incoming.normalized_name) !== canonicalName(existing.normalized_name)) {
    return false;
  }
  return (
    incoming.normalized_name.trim().toLowerCase() ===
    existing.normalized_name.trim().toLowerCase()
  );
}

/**
 * Decide what a newly purchased product means for existing inventory.
 *
 * - Item was running out  → restock, back to Full.
 * - Item still has plenty → additional stock, stays Full, quantity increases.
 * - No match, or a different product sharing a canonical name → new row.
 */
export function decideRestock(
  incoming: IncomingProduct,
  inventory: InventoryItem[],
): RestockDecision {
  const candidates = inventory.filter((item) => isSameProduct(incoming, item));

  if (candidates.length === 0) {
    const sibling = inventory.find(
      (item) => canonicalName(item.normalized_name) === canonicalName(incoming.normalized_name),
    );
    return {
      kind: "new_product",
      reason: sibling
        ? `Different product from the "${sibling.normalized_name}" already in the kitchen`
        : "Not currently in the kitchen",
    };
  }

  // Prefer refilling the emptiest matching item — that is the one you replaced.
  const order: InventoryStatus[] = ["out", "low", "some", "full"];
  const target = candidates.slice().sort(
    (a, b) => order.indexOf(a.status) - order.indexOf(b.status),
  )[0];

  if (target.status === "out" || target.status === "low") {
    return {
      kind: "restock",
      target,
      newStatus: "full",
      reason: `Was ${target.status}, and you bought more`,
    };
  }

  return {
    kind: "additional",
    target,
    newStatus: "full",
    reason: `Already had ${target.status}, topped up`,
  };
}
