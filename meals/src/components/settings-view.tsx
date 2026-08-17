"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Member } from "@/lib/types";
import { Button, Divider, ErrorNote } from "@/components/ui";

const CUISINES = ["Indian", "Mediterranean", "Greek", "Mexican", "Italian", "Thai", "Japanese"];

const DIETARY = [
  { key: "vegetarian", label: "Vegetarian" },
  { key: "eggs", label: "Eats eggs" },
  { key: "occasional_chicken", label: "Occasional chicken" },
];

export function SettingsView({
  householdName,
  members,
  config,
}: {
  householdName: string;
  members: Member[];
  config: { storage: string; parser: string; meals: string; nutrition: string; video: string };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function save(memberId: string, profile: Record<string, unknown>, name?: string) {
    setSavingId(memberId);
    setError(null);
    const response = await fetch("/api/household", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_id: memberId, name, profile }),
    });
    setSavingId(null);
    if (!response.ok) {
      setError("Those settings didn't save.");
      return;
    }
    router.refresh();
  }

  return (
    <>
      <header className="flex items-start justify-between gap-4 px-5 pt-8 pb-6">
        <div>
          <p className="text-meta text-ink-muted">{householdName}</p>
          <h1 className="mt-1 text-display font-semibold tracking-tight">Settings</h1>
        </div>
        <Link href="/today" className="min-h-11 self-center px-2 text-meta text-ink-muted hover:text-ink">
          Done
        </Link>
      </header>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {members.map((member) => (
        <MemberSettings
          key={member.id}
          member={member}
          saving={savingId === member.id}
          onSave={save}
        />
      ))}

      <Divider />

      <section className="px-5 py-8">
        <h2 className="text-section font-semibold">How this build is wired</h2>
        <dl className="mt-3 space-y-2 text-meta">
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">Storage</dt>
            <dd>{config.storage}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">Receipt parser</dt>
            <dd>{config.parser}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">Meal ideas</dt>
            <dd>{config.meals}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">Nutrition data</dt>
            <dd>{config.nutrition}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-ink-muted">Cooking videos</dt>
            <dd>{config.video}</dd>
          </div>
        </dl>
      </section>
    </>
  );
}

function MemberSettings({
  member,
  saving,
  onSave,
}: {
  member: Member;
  saving: boolean;
  onSave: (memberId: string, profile: Record<string, unknown>, name?: string) => void;
}) {
  const [name, setName] = useState(member.name);
  const [calories, setCalories] = useState(member.profile.calorie_target);
  const [protein, setProtein] = useState(member.profile.protein_target);
  const [maxTime, setMaxTime] = useState(member.profile.max_cooking_time);
  const [spice, setSpice] = useState(member.profile.spice_preference);
  const [cuisines, setCuisines] = useState<string[]>(member.profile.preferred_cuisines);
  const [dietary, setDietary] = useState<string[]>(member.profile.dietary_preferences);
  const [allergies, setAllergies] = useState(member.profile.allergies.join(", "));
  const [dislikes, setDislikes] = useState(member.profile.dislikes.join(", "));

  function toggle(list: string[], value: string, set: (next: string[]) => void) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  function splitList(value: string): string[] {
    return value
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }

  return (
    <section className="px-5 py-8" aria-label={`${member.name}'s preferences`}>
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        aria-label="Name"
        className="w-full rounded-lg bg-transparent text-title font-semibold tracking-tight"
      />

      <div className="mt-5 flex gap-4">
        <Field
          id={`cal-${member.id}`}
          label="Daily calories"
          value={calories}
          onChange={setCalories}
          suffix="kcal"
        />
        <Field
          id={`pro-${member.id}`}
          label="Daily protein"
          value={protein}
          onChange={setProtein}
          suffix="g"
        />
      </div>

      <div className="mt-5">
        <p className="text-meta text-ink-muted">Cuisines</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {CUISINES.map((cuisine) => (
            <Chip
              key={cuisine}
              active={cuisines.includes(cuisine)}
              onClick={() => toggle(cuisines, cuisine, setCuisines)}
            >
              {cuisine}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <p className="text-meta text-ink-muted">Diet</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {DIETARY.map((option) => (
            <Chip
              key={option.key}
              active={dietary.includes(option.key)}
              onClick={() => toggle(dietary, option.key, setDietary)}
            >
              {option.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-5 flex gap-4">
        <Field
          id={`time-${member.id}`}
          label="Max cooking time"
          value={maxTime}
          onChange={setMaxTime}
          suffix="min"
        />
        <div className="flex-1">
          <label className="block text-meta text-ink-muted" htmlFor={`spice-${member.id}`}>
            Spice
          </label>
          <select
            id={`spice-${member.id}`}
            value={spice}
            onChange={(event) => setSpice(event.target.value as typeof spice)}
            className="mt-1 min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-body"
          >
            <option value="mild">Mild</option>
            <option value="medium">Medium</option>
            <option value="hot">Hot</option>
          </select>
        </div>
      </div>

      <div className="mt-5">
        <label className="block text-meta text-ink-muted" htmlFor={`allergies-${member.id}`}>
          Allergies (comma separated)
        </label>
        <input
          id={`allergies-${member.id}`}
          value={allergies}
          onChange={(event) => setAllergies(event.target.value)}
          placeholder="none"
          className="mt-1 min-h-11 w-full rounded-xl border border-line px-4 text-body"
        />
      </div>

      <div className="mt-4">
        <label className="block text-meta text-ink-muted" htmlFor={`dislikes-${member.id}`}>
          Dislikes (comma separated)
        </label>
        <input
          id={`dislikes-${member.id}`}
          value={dislikes}
          onChange={(event) => setDislikes(event.target.value)}
          placeholder="olives"
          className="mt-1 min-h-11 w-full rounded-xl border border-line px-4 text-body"
        />
      </div>

      <div className="mt-6">
        <Button
          disabled={saving}
          onClick={() =>
            onSave(
              member.id,
              {
                calorie_target: calories,
                protein_target: protein,
                max_cooking_time: maxTime,
                spice_preference: spice,
                preferred_cuisines: cuisines,
                dietary_preferences: dietary,
                allergies: splitList(allergies),
                dislikes: splitList(dislikes),
              },
              name.trim() || member.name,
            )
          }
        >
          {saving ? "Saving…" : `Save ${member.name}'s settings`}
        </Button>
      </div>
    </section>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  suffix,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix: string;
}) {
  return (
    <div className="flex-1">
      <label className="block text-meta text-ink-muted" htmlFor={id}>
        {label}
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          id={id}
          type="number"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="tabular min-h-11 w-full rounded-xl border border-line px-4 text-body"
        />
        <span className="text-meta text-ink-muted">{suffix}</span>
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-11 rounded-full border px-4 text-meta transition-colors ${
        active
          ? "border-accent bg-accent-soft text-accent-ink"
          : "border-line bg-surface text-ink-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
