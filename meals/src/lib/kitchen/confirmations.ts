import { todayISO } from "@/lib/date";
import type { InventoryInsight } from "@/lib/kitchen/state";
import type { InventoryStatus } from "@/lib/types";

/**
 * Lightweight confirmation prompts.
 *
 * The rule from the product brief: infer when you can, make correction easy when
 * you are moderately unsure, and only *ask* when uncertainty is high AND the
 * answer changes something. This module decides that, and deliberately returns
 * at most a couple of questions — it is not a pantry checklist.
 */

export type ConfirmationKind =
  | "recommendation_depends_on_it"
  | "probably_expired"
  | "probably_out"
  | "stale_confidence";

export interface ConfirmationPrompt {
  item_id: string;
  item_name: string;
  kind: ConfirmationKind;
  /** The question, in the household's language. */
  question: string;
  /** Answers offered, mapped to the status each one implies. */
  options: { label: string; status: InventoryStatus }[];
  /** Internal ranking — the highest-value question is asked first. */
  priority: number;
}

const PLENTY_LOW_OUT: ConfirmationPrompt["options"] = [
  { label: "Plenty", status: "full" },
  { label: "Low", status: "low" },
  { label: "Out", status: "out" },
];

/** Never ask about the same thing more often than this. */
const REASK_DAYS = 5;
/** Below this confidence, a status is a guess rather than knowledge. */
const UNCERTAIN_BELOW = 0.5;
/** Most questions to put in front of someone at once. */
const MAX_PROMPTS = 2;

export interface ConfirmationContext {
  insights: InventoryInsight[];
  /** Canonical names the current recommendation set depends on. */
  recommendationDependencies?: string[];
  today?: string;
}

/**
 * Choose the few confirmations actually worth asking.
 *
 * Every branch here has to answer "what changes if they tell us?" — routine
 * check-ins on high-confidence items are explicitly not generated.
 */
export function chooseConfirmations(context: ConfirmationContext): ConfirmationPrompt[] {
  const today = context.today ?? todayISO();
  const dependencies = new Set(
    (context.recommendationDependencies ?? []).map((name) => name.toLowerCase()),
  );

  const prompts: ConfirmationPrompt[] = [];

  for (const insight of context.insights) {
    const item = insight.item;
    const name = item.normalized_name;
    const recentlyAsked =
      insight.days_since_confirmed !== null && insight.days_since_confirmed < REASK_DAYS;

    // 1. A recommendation leans on something we are not sure about. Highest
    //    value: the answer decides whether tonight's suggestion is real.
    if (
      dependencies.has(name.toLowerCase()) &&
      insight.confidence < UNCERTAIN_BELOW &&
      item.status !== "out" &&
      !recentlyAsked
    ) {
      prompts.push({
        item_id: item.id,
        item_name: name,
        kind: "recommendation_depends_on_it",
        question: `Still have ${name.toLowerCase()}?`,
        options: PLENTY_LOW_OUT,
        priority: 100,
      });
      continue;
    }

    // 2. Probably past its best. Food safety, and it stops us recommending it.
    if (insight.likely_past_best && item.status !== "out" && !recentlyAsked) {
      prompts.push({
        item_id: item.id,
        item_name: name,
        kind: "probably_expired",
        question: `Is the ${name.toLowerCase()} still good?`,
        options: [
          { label: "Still fine", status: item.status },
          { label: "Threw it out", status: "out" },
        ],
        priority: 80,
      });
      continue;
    }

    // 3. We think it ran out through inference alone. Confirming stops us
    //    hiding an ingredient the household actually has.
    if (
      item.status === "low" &&
      item.status_source === "inferred" &&
      insight.confidence < UNCERTAIN_BELOW &&
      !recentlyAsked
    ) {
      prompts.push({
        item_id: item.id,
        item_name: name,
        kind: "probably_out",
        question: `We think you're nearly out of ${name.toLowerCase()}.`,
        options: [
          { label: "Still have some", status: "some" },
          { label: "You're right", status: "out" },
        ],
        priority: 60,
      });
      continue;
    }

    // 4. Long time since anyone looked, and it is a perishable we still list.
    if (
      insight.confidence < 0.35 &&
      insight.use_soon &&
      item.status !== "out" &&
      !recentlyAsked
    ) {
      prompts.push({
        item_id: item.id,
        item_name: name,
        kind: "stale_confidence",
        question: `Still have ${name.toLowerCase()}?`,
        options: PLENTY_LOW_OUT,
        priority: 40,
      });
    }
  }

  void today;
  return prompts.sort((a, b) => b.priority - a.priority).slice(0, MAX_PROMPTS);
}
