"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { track } from "@/lib/analytics";
import type { Classification, ConfidenceBand, StorageLocation } from "@/lib/types";
import { Button, Card, ErrorNote, Pill, StickyBar } from "@/components/ui";

export interface ReviewItem {
  id: string;
  raw_name: string;
  normalized_name: string;
  quantity: number;
  package_size: string | null;
  price: number | null;
  category: string;
  storage_location: StorageLocation;
  classification: Classification;
  confidence: number;
  band: ConfidenceBand;
  included: boolean;
  note: string | null;
  needs_review: boolean;
}

interface ReviewReceipt {
  id: string;
  merchant: string | null;
  purchase_date: string | null;
  total: number | null;
  status: string;
  parser: "openai" | "gemini" | "fixture" | null;
}

export function ReviewView({ receipt, items }: { receipt: ReviewReceipt; items: ReviewItem[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  // The clean items are the machine's work, not the household's. They collapse
  // behind a count so the screen only asks about the handful it is unsure of.
  const [showAll, setShowAll] = useState(false);

  const { ready, review, excluded } = useMemo(() => {
    const readyItems: ReviewItem[] = [];
    const reviewItems: ReviewItem[] = [];
    const excludedItems: ReviewItem[] = [];
    for (const item of items) {
      if (item.classification === "non_food" || item.classification === "pet_food") {
        excludedItems.push(item);
      } else if (!item.included) {
        excludedItems.push(item);
      } else if (item.needs_review) {
        reviewItems.push(item);
      } else {
        readyItems.push(item);
      }
    }
    return { ready: readyItems, review: reviewItems, excluded: excludedItems };
  }, [items]);

  const addCount = ready.length + review.length;

  async function patch(itemId: string, body: Record<string, unknown>) {
    setError(null);
    const response = await fetch(`/api/receipts/${receipt.id}/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      setError("That change didn't save.");
      return;
    }
    track("receipt_item_corrected", { receipt_id: receipt.id, item_id: itemId });
    setEditing(null);
    router.refresh();
  }

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/receipts/${receipt.id}/confirm`, { method: "POST" });
      const body = (await response.json()) as { added?: number; error?: string };
      if (!response.ok) throw new Error(body.error ?? "We couldn't add these to your kitchen.");
      track("receipt_confirmed", { receipt_id: receipt.id, added: body.added ?? 0 });

      // Stage 2: nutrition enrichment runs after the kitchen already has the food.
      void fetch("/api/nutrition/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipt_id: receipt.id }),
      });

      router.push("/kitchen");
    } catch (caught) {
      setError((caught as Error).message);
      setSaving(false);
    }
  }

  if (receipt.status === "confirmed") {
    return (
      <div className="px-5 py-16 text-center">
        <h1 className="text-title font-semibold">This receipt is already in your kitchen</h1>
        <p className="mt-2 text-body text-ink-muted">
          {addCount} items from {receipt.merchant ?? "this receipt"} were added.
        </p>
        <div className="mt-7 flex justify-center">
          <Link href="/kitchen" className="text-body text-accent hover:underline">
            Go to Kitchen
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <header className="px-gutter pad-safe-top pb-6 pt-8">
        <p className="text-meta text-ink-muted">
          {receipt.merchant ?? "Your receipt"}
          {receipt.total !== null ? ` · $${receipt.total.toFixed(2)}` : ""}
        </p>
        <h1 className="mt-1 text-hero font-semibold tracking-tight">
          {ready.length} item{ready.length === 1 ? "" : "s"} ready
        </h1>
        {review.length > 0 ? (
          <p className="mt-2 text-body text-ink-muted">
            {review.length} need{review.length === 1 ? "s" : ""} a quick look.
          </p>
        ) : (
          <p className="mt-2 text-body text-ink-muted">Everything read cleanly.</p>
        )}
        {receipt.parser === "fixture" ? (
          <p className="mt-4 rounded-card bg-warn-soft px-4 py-3 text-meta text-warn">
            This is a bundled sample receipt, not a reading of your photo.
          </p>
        ) : null}
      </header>

      {review.length > 0 ? (
        <section className="px-gutter pb-8" aria-label="Needs a quick look">
          <p className="label-cap pb-3">Needs a quick look</p>
          <ul className="space-y-3">
            {review.map((item) => (
              <Card as="li" key={item.id} className="p-4">
                <p className="font-mono text-meta text-ink-faint">&ldquo;{item.raw_name}&rdquo;</p>
                <p className="mt-1 text-section font-medium">
                  {titleCaseName(item.normalized_name)}?
                </p>
                {item.note ? <p className="mt-2 text-meta text-ink-muted">{item.note}</p> : null}

                {editing === item.id ? (
                  <EditForm item={item} onSave={(body) => patch(item.id, body)} onCancel={() => setEditing(null)} />
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => patch(item.id, { classification: "human_food" })}>
                      Accept
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(item.id)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="quiet" onClick={() => patch(item.id, { included: false })}>
                      Remove
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="px-gutter pb-8" aria-label="Ready to add">
        <button
          type="button"
          onClick={() => setShowAll((open) => !open)}
          aria-expanded={showAll}
          className="flex min-h-11 w-full items-center justify-between text-left"
        >
          <span className="label-cap">
            {showAll ? "Hide" : `View all ${ready.length}`}
          </span>
          <span aria-hidden="true" className="text-meta text-ink-faint">
            {showAll ? "−" : "+"}
          </span>
        </button>
        <ul hidden={!showAll}>
          {ready.map((item) => (
            <li key={item.id} className="border-b border-line last:border-b-0">
              {editing === item.id ? (
                <div className="py-3">
                  <EditForm
                    item={item}
                    onSave={(body) => patch(item.id, body)}
                    onCancel={() => setEditing(null)}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-body">{item.normalized_name}</p>
                    <p className="mt-0.5 text-meta text-ink-muted">
                      {item.storage_location}
                      {item.package_size ? ` · ${item.package_size}` : ""}
                      {item.quantity > 1 ? ` · ×${item.quantity}` : ""}
                      {item.price === null ? " · price not legible" : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="quiet" onClick={() => setEditing(item.id)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="quiet" onClick={() => patch(item.id, { included: false })}>
                      Remove
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {excluded.length > 0 ? (
        <section className="px-gutter pb-8" aria-label="Not added">
          <p className="label-cap pb-3">Not food</p>
          <ul>
            {excluded.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-b-0"
              >
                <span className="min-w-0">
                  <span className="block truncate text-body text-ink-muted">
                    {item.normalized_name}
                  </span>
                  <span className="mt-0.5 block font-mono text-meta text-ink-faint">
                    {item.raw_name}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Pill tone="neutral">
                    {item.classification === "pet_food"
                      ? "pet food"
                      : item.classification === "non_food"
                        ? "not food"
                        : "removed"}
                  </Pill>
                  {!item.included && item.classification === "human_food" ? (
                    <Button size="sm" variant="quiet" onClick={() => patch(item.id, { included: true })}>
                      Undo
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <div className="pad-nav" />

      <StickyBar>
        <Button full onClick={confirm} disabled={saving || addCount === 0}>
          {saving ? "Adding…" : "Add to Kitchen"}
        </Button>
      </StickyBar>
    </>
  );
}

function titleCaseName(value: string): string {
  return value.replace(/\b[a-z]/g, (character) => character.toUpperCase());
}

function EditForm({
  item,
  onSave,
  onCancel,
}: {
  item: ReviewItem;
  onSave: (body: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(item.normalized_name);
  const [quantity, setQuantity] = useState(item.quantity);
  const [location, setLocation] = useState<StorageLocation>(item.storage_location);

  return (
    <div className="stage-enter mt-4">
      <label className="block text-meta text-ink-muted" htmlFor={`name-${item.id}`}>
        Name
      </label>
      <input
        id={`name-${item.id}`}
        value={name}
        onChange={(event) => setName(event.target.value)}
        className="mt-1 min-h-11 w-full rounded-xl border border-line px-4 text-body"
      />

      <div className="mt-3 flex gap-3">
        <div className="w-24">
          <label className="block text-meta text-ink-muted" htmlFor={`qty-${item.id}`}>
            Quantity
          </label>
          <input
            id={`qty-${item.id}`}
            type="number"
            min={1}
            max={99}
            value={quantity}
            onChange={(event) => setQuantity(Number(event.target.value))}
            className="mt-1 min-h-11 w-full rounded-xl border border-line px-3 text-body"
          />
        </div>
        <div className="flex-1">
          <label className="block text-meta text-ink-muted" htmlFor={`loc-${item.id}`}>
            Storage
          </label>
          <select
            id={`loc-${item.id}`}
            value={location}
            onChange={(event) => setLocation(event.target.value as StorageLocation)}
            className="mt-1 min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-body"
          >
            {(["Fridge", "Pantry", "Freezer", "Produce"] as StorageLocation[]).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Button
          size="sm"
          onClick={() =>
            onSave({
              normalized_name: name.trim() || item.normalized_name,
              quantity: quantity > 0 ? quantity : 1,
              storage_location: location,
              classification: "human_food",
              included: true,
            })
          }
        >
          Save
        </Button>
        <Button size="sm" variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
