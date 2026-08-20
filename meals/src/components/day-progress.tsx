import type { MacroTotals } from "@/lib/nutrition/engine";

/**
 * The day so far: calories against the household's goal, and the macro split.
 *
 * This is a tracking product as well as a cooking one, and the running calorie
 * figure is the part people check without being asked to. It sits above the
 * dish rather than below it because it is the context the dish is chosen in —
 * "1,250 of 2,100" is what makes "cook this" a decision rather than a
 * suggestion — but it is deliberately a strip and not a card-sized hero, so
 * that the dish stays the largest object on the screen.
 *
 * Two kinds of number share this strip and they are not presented as equals.
 * Calories and protein are recorded when a meal is logged; carbohydrate and fat
 * are worked out afterwards from the recipe's ingredients, and carry the
 * "est." mark. Nothing here is filled in when it is unknown: no logs means an
 * empty ring reading 0, not a plausible-looking number.
 */
export function DayProgress({
  consumed,
  target,
  macros,
}: {
  consumed: { calories: number; protein: number };
  target: { calories: number; protein: number };
  macros: MacroTotals;
}) {
  const goal = target.calories > 0 ? target.calories : null;
  const ratio = goal ? Math.min(consumed.calories / goal, 1) : 0;
  const remaining = goal ? Math.max(goal - consumed.calories, 0) : null;

  return (
    <section
      aria-label="Today's nutrition"
      className="mx-gutter rounded-[18px] bg-surface px-4 py-3.5 shadow-[0_1px_3px_rgba(23,23,23,0.06)]"
    >
      {/* Value left, ring right — the reference's hero pair. The ring is
          aligned to this row alone, not to the card, so it reads as belonging
          to the calorie figure rather than floating beside the whole block. */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="tabular text-[22px] font-bold leading-none tracking-[-0.025em]">
            {consumed.calories.toLocaleString()}
            {goal ? (
              <span className="text-[16px] font-semibold text-ink-faint">
                {" "}
                / {goal.toLocaleString()}
              </span>
            ) : null}
          </p>
          <p className="mt-1.5 text-meta text-ink-muted">
            {remaining === null
              ? "calories eaten today"
              : remaining > 0
                ? `calories · ${remaining.toLocaleString()} left today`
                : "calories · goal reached"}
          </p>
        </div>
        <Ring ratio={ratio} />
      </div>

      {/* Three fixed columns rather than a flex row: the labels are different
          lengths, and on a flex row that leaves the values starting at three
          unrelated x positions, which is the difference between a readout and
          a sentence. */}
      <div className="mt-3.5 grid grid-cols-3 gap-3 border-t border-line pt-3">
        <Macro label="Protein" grams={macros.protein} goal={target.protein} />
        <Macro label="Carbs" grams={macros.carbs} estimated />
        <Macro label="Fat" grams={macros.fat} estimated />
      </div>
    </section>
  );
}

/**
 * The one ring in the app.
 *
 * Drawn as a stroked circle rather than a conic gradient so the cap is round at
 * both ends and the track stays a true circle at any pixel density. The value
 * is not repeated inside it — the number is already three millimetres to the
 * right, and setting it twice is how a strip this size turns into clutter.
 */
function Ring({ ratio }: { ratio: number }) {
  const radius = 19;
  const circumference = 2 * Math.PI * radius;
  const percent = Math.round(ratio * 100);

  return (
    <div className="relative size-[48px] shrink-0">
      {/* A thin ring at this diameter reads as a loading spinner rather than a
          dial, so the stroke is heavy relative to the radius and the track is
          always drawn — an arc floating in empty space is the shape people
          have learned to read as "still working".

          The stroke alone was not enough. Shot without the figure inside, a
          round-capped arc at 48px still read as a spinner; the numeral is what
          makes it a dial. It repeats what the fraction beside it already says,
          which is a real cost, so it is set small enough to work as the arc's
          legend rather than as a second headline. */}
      <svg viewBox="0 0 48 48" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="24" cy="24" r={radius} fill="none" stroke="var(--color-surface-sunken)" strokeWidth="7" />
        {ratio > 0 ? (
          <circle
            cx="24"
            cy="24"
            r={radius}
            fill="none"
            stroke="var(--color-ink)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - ratio)}
          />
        ) : null}
      </svg>
      <span className="tabular absolute inset-0 flex items-baseline justify-center pt-[18px] text-[11px] font-bold leading-none">
        {percent}
        <span className="text-[8px] font-semibold">%</span>
      </span>
    </div>
  );
}

/**
 * One macro. `null` grams means the ingredient lists behind today's meals did
 * not resolve, which is shown as an em dash — the screen would rather admit a
 * gap than round an unknown down to zero.
 */
function Macro({
  label,
  grams,
  goal,
  estimated = false,
}: {
  label: string;
  grams: number | null;
  goal?: number;
  estimated?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[12px] font-medium text-ink-faint">
        {label}
        {estimated ? <span className="text-[10px]"> est.</span> : null}
      </p>
      <p className="tabular mt-1 text-[15px] font-semibold leading-none">
        {grams === null ? "—" : `${grams}g`}
        {goal && grams !== null ? (
          <span className="text-[13px] font-medium text-ink-faint"> / {goal}g</span>
        ) : null}
      </p>
    </div>
  );
}
