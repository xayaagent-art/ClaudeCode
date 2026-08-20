"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button, LinkButton, SectionLabel } from "@/components/ui";
import { Sheet } from "@/components/sheet";

/**
 * The kitchen.
 *
 * Not an inventory table. The first thing on the screen is the way to add to
 * it, then the handful of things that actually need a decision today, then
 * everything else grouped by where it physically is. Confidence bands, scores
 * and explanations are all still computed — none of them are shown, because
 * "we are 0.72 confident you still have eggs" is not a sentence anybody needs.
 */

export interface KitchenItem {
  id: string;
  name: string;
  raw_name: string | null;
  storage_location: string;
  status: string;
  quantity: number;
  package_size: string | null;
  created_at: string;
  use_soon: boolean;
  use_soon_score: number;
  freshness_label: string;
  likely_past_best: boolean;
}

/** The four words this screen is allowed to say about an item. */
function statusLabel(item: KitchenItem): { text: string; tone: "warn" | "danger" | "muted" | "good" } {
  if (item.status === "out") return { text: "Probably out", tone: "muted" };
  if (item.likely_past_best) return { text: "Check it", tone: "danger" };
  if (item.use_soon) return { text: "Use soon", tone: "warn" };
  if (item.status === "low") return { text: "Running low", tone: "warn" };
  return { text: "In stock", tone: "good" };
}

const TONES: Record<string, string> = {
  warn: "text-warn",
  danger: "text-danger",
  muted: "text-ink-faint",
  good: "text-ink-faint",
};

const LOCATIONS = ["Fridge", "Freezer", "Produce", "Pantry"];

export function KitchenView({ items }: { items: KitchenItem[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selected, setSelected] = useState<KitchenItem | null>(null);
  const [saving, setSaving] = useState(false);

  const present = useMemo(() => items.filter((item) => item.status !== "out"), [items]);

  const attention = useMemo(
    () =>
      present
        .filter((item) => item.use_soon || item.likely_past_best || item.status === "low")
        .sort((a, b) => b.use_soon_score - a.use_soon_score)
        .slice(0, 6),
    [present],
  );

  const recent = useMemo(() => {
    const attentionIds = new Set(attention.map((item) => item.id));
    return [...present]
      .filter((item) => !attentionIds.has(item.id))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 5);
  }, [present, attention]);

  // The location sections are "everything else". Listing an item under Needs
  // attention and again under Fridge means the same spinach appears twice on
  // one screen, which reads as a bug rather than as organisation.
  const byLocation = useMemo(() => {
    const alreadyShown = new Set([...attention, ...recent].map((item) => item.id));
    const groups = new Map<string, KitchenItem[]>();
    for (const item of present) {
      if (alreadyShown.has(item.id)) continue;
      const key = LOCATIONS.includes(item.storage_location) ? item.storage_location : "Pantry";
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return groups;
  }, [present, attention, recent]);

  async function setStatus(item: KitchenItem, status: string) {
    setSaving(true);
    try {
      await fetch(`/api/inventory/${item.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setSelected(null);
      startTransition(() => router.refresh());
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="px-gutter pad-safe-top pb-6 pt-8">
        <h1 className="text-hero font-semibold tracking-tight">Kitchen</h1>
        <p className="mt-1 text-meta text-ink-muted">
          {present.length === 0
            ? "Nothing in here yet"
            : `${present.length} thing${present.length === 1 ? "" : "s"} to cook with`}
        </p>
      </header>

      <div className="px-gutter">
        <LinkButton href="/kitchen/scan" full>
          Scan groceries
        </LinkButton>
      </div>

      {present.length === 0 ? (
        <section className="px-gutter py-8">
          <div className="rounded-card bg-surface p-8 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <h2 className="text-title font-semibold">Start with your last receipt.</h2>
            <p className="mx-auto mt-2 max-w-xs text-body text-ink-muted">
              Snap it and we&apos;ll fill the kitchen in for you.
            </p>
          </div>
        </section>
      ) : (
        <>
          {attention.length > 0 ? (
            <section>
              <SectionLabel>Needs attention</SectionLabel>
              <ItemList items={attention} onSelect={setSelected} />
            </section>
          ) : null}

          {recent.length > 0 ? (
            <section>
              <SectionLabel>Recently added</SectionLabel>
              <ItemList items={recent} onSelect={setSelected} />
            </section>
          ) : null}

          {LOCATIONS.map((location) => {
            const group = byLocation.get(location);
            if (!group || group.length === 0) return null;
            return (
              <section key={location}>
                <SectionLabel>{location}</SectionLabel>
                <ItemList items={group} onSelect={setSelected} />
              </section>
            );
          })}
        </>
      )}

      <div className="pad-nav" />

      <Sheet
        open={selected !== null}
        title={selected ? titleCase(selected.name) : "Item"}
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <div className="px-gutter py-4">
            <p className={`text-section font-medium ${TONES[statusLabel(selected).tone]}`}>
              {statusLabel(selected).text}
            </p>

            <dl className="mt-6 space-y-4">
              <div>
                <dt className="text-meta text-ink-muted">Added</dt>
                <dd className="text-body">{relativeDays(selected.created_at)}</dd>
              </div>
              {selected.freshness_label ? (
                <div>
                  <dt className="text-meta text-ink-muted">Freshness</dt>
                  <dd className="text-body">{selected.freshness_label}</dd>
                </div>
              ) : null}
              {selected.package_size ? (
                <div>
                  <dt className="text-meta text-ink-muted">Size</dt>
                  <dd className="text-body">{selected.package_size}</dd>
                </div>
              ) : null}
              {selected.raw_name && selected.raw_name.toLowerCase() !== selected.name ? (
                <div>
                  <dt className="text-meta text-ink-muted">On the receipt</dt>
                  <dd className="text-body text-ink-muted">{selected.raw_name}</dd>
                </div>
              ) : null}
            </dl>

            <div className="mt-8 flex flex-col gap-2">
              <Button full onClick={() => void setStatus(selected, "full")} disabled={saving}>
                Still have it
              </Button>
              <Button
                variant="secondary"
                full
                onClick={() => void setStatus(selected, "low")}
                disabled={saving}
              >
                Running low
              </Button>
              <Button
                variant="quiet"
                full
                onClick={() => void setStatus(selected, "out")}
                disabled={saving}
              >
                All gone
              </Button>
            </div>
          </div>
        ) : null}
      </Sheet>
    </>
  );
}

function ItemList({
  items,
  onSelect,
}: {
  items: KitchenItem[];
  onSelect: (item: KitchenItem) => void;
}) {
  return (
    <ul className="mx-gutter overflow-hidden rounded-card bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      {items.map((item) => {
        const status = statusLabel(item);
        return (
          <li key={item.id} className="border-b border-line last:border-b-0">
            <button
              type="button"
              onClick={() => onSelect(item)}
              className="flex min-h-14 w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-surface-sunken"
            >
              <span className="min-w-0 flex-1 truncate text-body">{titleCase(item.name)}</span>
              <span className={`shrink-0 text-meta ${TONES[status.tone]}`}>{status.text}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (character) => character.toUpperCase());
}

/** "Added today" / "Added 6 days ago" — never a raw timestamp. */
function relativeDays(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (!Number.isFinite(days) || days < 0) return "Recently";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}
