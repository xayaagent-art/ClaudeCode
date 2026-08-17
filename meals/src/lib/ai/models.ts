/**
 * Task → model routing.
 *
 * Model identifiers live here and nowhere else, so swapping a model is a config
 * change rather than a search-and-replace. Each task is priced differently in
 * practice, and the defaults encode a deliberate policy: the cheap model does
 * the transcription, the capable one does the thinking, and escalation happens
 * only when deterministic validation says the cheap result was not good enough.
 */

export type AITask =
  /** Reading a receipt photo. High volume, low reasoning. */
  | "receipt_parse"
  /** Second attempt at a receipt the cheap model could not read. */
  | "receipt_escalation"
  /** Inventing meal concepts for the ranker to judge. */
  | "meal_candidate_generation";

const DEFAULTS: Record<AITask, string> = {
  receipt_parse: "gemini-3.5-flash-lite",
  receipt_escalation: "gemini-3.6-flash",
  meal_candidate_generation: "gemini-3.6-flash",
};

/** Per-task environment override, checked before the default. */
const ENV_KEYS: Record<AITask, string> = {
  receipt_parse: "GEMINI_RECEIPT_MODEL",
  receipt_escalation: "GEMINI_RECEIPT_ESCALATION_MODEL",
  meal_candidate_generation: "GEMINI_MEAL_MODEL",
};

export function modelFor(task: AITask): string {
  const override = process.env[ENV_KEYS[task]]?.trim();
  if (override) return override;
  return DEFAULTS[task];
}

/** The full routing table, for config displays and telemetry. */
export function modelRouting(): Record<AITask, string> {
  return {
    receipt_parse: modelFor("receipt_parse"),
    receipt_escalation: modelFor("receipt_escalation"),
    meal_candidate_generation: modelFor("meal_candidate_generation"),
  };
}

/**
 * Whether a first-pass receipt result is weak enough to be worth a second,
 * more expensive read.
 *
 * The bar is deliberately high. Escalation doubles the cost of a receipt, so a
 * parse that validated cleanly and read confidently is never retried — only one
 * that produced almost nothing, or that the model itself was unsure about
 * across the board. A handful of uncertain lines is normal on a creased receipt
 * and is what the review screen is for.
 */
export function shouldEscalateReceipt(input: {
  itemCount: number;
  meanConfidence: number | null;
  droppedItems: number;
}): boolean {
  if (input.itemCount === 0) return true;
  // More lines thrown away than kept means the model misread the format.
  if (input.droppedItems > input.itemCount) return true;
  return input.meanConfidence !== null && input.meanConfidence < 0.55;
}
