"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { track } from "@/lib/analytics";
import { nutritionSourceLabel } from "@/lib/nutrition/sources";
import type { ConfidenceBand, InventoryStatus, NutritionSource, StorageLocation } from "@/lib/types";
import { AvatarLink, Button, EmptyState, ErrorNote, LinkButton, Pill } from "@/components/ui";

export interface KitchenItem {
  id: string;
  name: string;
  raw_name: string | null;
  category: string;
  storage_location: StorageLocation;
  status: InventoryStatus;
  quantity: number;
  package_size: string | null;
  days_to_expiry: number | null;
  created_at: string;
  nutrition_source: NutritionSource | null;
  nutrition_confidence: ConfidenceBand | null;
}

const FILTERS: (StorageLocation | "All")[] = ["All", "Fridge", "Pantry", "Freezer", "Produce"];

const STATUS_LABEL: Record<InventoryStatus, string> = {
  full: "Full",
  some: "Some",
  low: "Low",
  out: "Out",
};

export function KitchenView({
  items,
  config,
}: {
  items: KitchenItem[];
  config: { storage: string; parser: string };
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLocation, setNewLocation] = useState<StorageLocation>("Fridge");
  const [error, setError] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<string | null>(null);

  const useSoon = useMemo(
    () =>
      items
        .filter((i) => i.status !== "out" && i.days_to_expiry !== null && i.days_to_expiry <= 4)
        .sort((a, b) => (a.days_to_expiry ?? 0) - (b.days_to_expiry ?? 0)),
    [items],
  );

  const recentlyAdded = useMemo(() => {
    const cutoff = Date.now() - 3 * 86_400_000;
    return items
      .filter((i) => Date.parse(i.created_at) >= cutoff)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 8);
  }, [items]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items
      .filter((item) => filter === "All" || item.storage_location === filter)
      .filter(
        (item) =>
          !needle ||
          item.name.toLowerCase().includes(needle) ||
          (item.raw_name ?? "").toLowerCase().includes(needle),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items, filter, query]);

  async function updateStatus(id: string, status: InventoryStatus) {
    setOpenItem(null);
    setError(null);
    const response = await fetch(`/api/inventory/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      setError("That change didn't save. Try again.");
      return;
    }
    track("inventory_item_updated", { item_id: id, status });
    router.refresh();
  }

  async function removeItem(id: string) {
    setOpenItem(null);
    await fetch(`/api/inventory/${id}`, { method: "DELETE" });
    router.refresh();
  }

  async function addItem() {
    if (!newName.trim()) return;
    setError(null);
    const response = await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        normalized_name: newName.trim(),
        storage_location: newLocation,
        category: newLocation === "Produce" ? "Produce" : "Other",
      }),
    });
    if (!response.ok) {
      setError("We couldn't add that item.");
      return;
    }
    track("inventory_item_added", { manual: true });
    setNewName("");
    setAdding(false);
    router.refresh();
  }

  return (
    <>
      <header className="flex items-start justify-between gap-4 px-5 pt-8 pb-6">
        <div>
          <h1 className="text-display font-semibold tracking-tight">Kitchen</h1>
          <p className="mt-1 text-meta text-ink-muted">
            {items.filter((i) => i.status !== "out").length} items on hand
          </p>
        </div>
        <AvatarLink initials="YS" />
      </header>

      {items.length === 0 ? (
        <EmptyState
          title="Your kitchen is empty"
          body="Scan your latest grocery receipt and we'll build it automatically."
          primary={<LinkButton href="/kitchen/scan">Scan receipt</LinkButton>}
          secondary={
            <Button variant="quiet" onClick={() => setAdding(true)}>
              Add an item manually
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex items-center gap-3 px-5 pb-6">
            <LinkButton href="/kitchen/scan">Scan receipt</LinkButton>
            <Button variant="secondary" onClick={() => setAdding((v) => !v)}>
              + Add item
            </Button>
          </div>

          {useSoon.length > 0 ? (
            <section className="pb-8" aria-label="Use soon">
              <h2 className="px-5 pb-3 text-section font-semibold">Use soon</h2>
              <ul className="px-5">
                {useSoon.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    open={openItem === item.id}
                    onToggle={() => setOpenItem(openItem === item.id ? null : item.id)}
                    onStatus={updateStatus}
                    onRemove={removeItem}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {recentlyAdded.length > 0 ? (
            <section className="pb-8" aria-label="Recently added">
              <h2 className="px-5 pb-3 text-section font-semibold">Recently added</h2>
              <ul className="px-5">
                {recentlyAdded.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    open={openItem === `recent-${item.id}`}
                    onToggle={() =>
                      setOpenItem(openItem === `recent-${item.id}` ? null : `recent-${item.id}`)
                    }
                    onStatus={updateStatus}
                    onRemove={removeItem}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-label="All items" className="pb-10">
            <h2 className="px-5 pb-3 text-section font-semibold">All items</h2>
            <div className="px-5 pb-4">
              <label className="sr-only" htmlFor="kitchen-search">
                Search the kitchen
              </label>
              <input
                id="kitchen-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                className="min-h-11 w-full rounded-xl border border-line bg-surface px-4 text-body placeholder:text-ink-faint"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto px-5 pb-4">
              {FILTERS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFilter(option)}
                  aria-pressed={filter === option}
                  className={`min-h-11 shrink-0 rounded-full border px-4 text-meta transition-colors ${
                    filter === option
                      ? "border-accent bg-accent-soft text-accent-ink"
                      : "border-line bg-surface text-ink-muted hover:text-ink"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>

            {filtered.length === 0 ? (
              <p className="px-5 py-8 text-center text-body text-ink-muted">
                Nothing here matches {query ? `“${query}”` : `the ${filter} filter`}.
              </p>
            ) : (
              <ul className="px-5">
                {filtered.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    open={openItem === `all-${item.id}`}
                    onToggle={() =>
                      setOpenItem(openItem === `all-${item.id}` ? null : `all-${item.id}`)
                    }
                    onStatus={updateStatus}
                    onRemove={removeItem}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {adding ? (
        <div className="stage-enter mx-5 mb-10 rounded-[18px] border border-line bg-surface p-5">
          <h2 className="text-section font-semibold">Add an item</h2>
          <label className="mt-4 block text-meta text-ink-muted" htmlFor="new-item">
            Name
          </label>
          <input
            id="new-item"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Greek yogurt"
            className="mt-1 min-h-11 w-full rounded-xl border border-line px-4 text-body"
          />
          <label className="mt-4 block text-meta text-ink-muted" htmlFor="new-location">
            Where it lives
          </label>
          <select
            id="new-location"
            value={newLocation}
            onChange={(event) => setNewLocation(event.target.value as StorageLocation)}
            className="mt-1 min-h-11 w-full rounded-xl border border-line bg-surface px-4 text-body"
          >
            {(["Fridge", "Pantry", "Freezer", "Produce"] as StorageLocation[]).map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
          <div className="mt-5 flex gap-3">
            <Button onClick={addItem} disabled={!newName.trim()}>
              Add
            </Button>
            <Button variant="quiet" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <p className="px-5 pb-10 text-meta text-ink-faint">
        Storage: {config.storage === "supabase" ? "Supabase" : "local dev store"} · Receipt parser:{" "}
        {config.parser === "openai" ? "OpenAI vision" : "offline fixture"}
      </p>
    </>
  );
}

function ItemRow({
  item,
  open,
  onToggle,
  onStatus,
  onRemove,
}: {
  item: KitchenItem;
  open: boolean;
  onToggle: () => void;
  onStatus: (id: string, status: InventoryStatus) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <li className="border-b border-line last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-3 py-3 text-left"
      >
        <span className="min-w-0">
          <span className="block truncate text-body">{item.name}</span>
          <span className="mt-0.5 block text-meta text-ink-muted">
            {item.storage_location}
            {item.package_size ? ` · ${item.package_size}` : ""}
            {item.quantity > 1 ? ` · ×${item.quantity}` : ""}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {item.days_to_expiry !== null && item.days_to_expiry <= 4 && item.status !== "out" ? (
            <Pill tone={item.days_to_expiry <= 1 ? "danger" : "warn"}>
              {item.days_to_expiry <= 0 ? "today" : `${item.days_to_expiry}d`}
            </Pill>
          ) : null}
          <Pill tone={item.status === "out" ? "neutral" : item.status === "low" ? "warn" : "good"}>
            {STATUS_LABEL[item.status]}
          </Pill>
        </span>
      </button>

      {open ? (
        <div className="stage-enter pb-4">
          <p className="pb-2 text-meta text-ink-muted">
            How much is left?
            {item.raw_name ? ` · from receipt line “${item.raw_name}”` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            {(["full", "some", "low", "out"] as InventoryStatus[]).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => onStatus(item.id, status)}
                className={`min-h-11 rounded-full border px-4 text-meta ${
                  item.status === status
                    ? "border-accent bg-accent-soft text-accent-ink"
                    : "border-line bg-surface text-ink-muted hover:text-ink"
                }`}
              >
                {STATUS_LABEL[status]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              className="min-h-11 rounded-full border border-line px-4 text-meta text-danger hover:bg-danger-soft"
            >
              Remove
            </button>
          </div>
          <p className="pt-3 text-meta text-ink-faint">
            {nutritionSourceLabel(item.nutrition_source)}
            {item.nutrition_confidence ? ` · ${item.nutrition_confidence} confidence` : ""}
          </p>
        </div>
      ) : null}
    </li>
  );
}
