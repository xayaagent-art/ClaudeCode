/**
 * Nutrition readout. Two numbers, two bars, no pie charts.
 * State is never carried by colour alone — the numeric label always says it.
 */
export function NutritionStat({
  label,
  consumed,
  target,
  unit,
}: {
  label: string;
  consumed: number;
  target: number;
  unit: string;
}) {
  const ratio = target > 0 ? Math.min(1, consumed / target) : 0;
  const over = target > 0 && consumed > target;

  return (
    <div className="flex-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-meta text-ink-muted">{label}</span>
        <span className="tabular text-meta text-ink-faint">
          {Math.round(target).toLocaleString()} {unit}
        </span>
      </div>
      <p className="tabular mt-1 text-title font-semibold">
        {Math.round(consumed).toLocaleString()}
        <span className="ml-1 text-body font-normal text-ink-muted">{unit}</span>
      </p>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunken"
        role="progressbar"
        aria-label={`${label}: ${Math.round(consumed)} of ${Math.round(target)} ${unit}`}
        aria-valuenow={Math.round(consumed)}
        aria-valuemin={0}
        aria-valuemax={Math.round(target)}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${
            over ? "bg-warn" : "bg-accent"
          }`}
          style={{ width: `${Math.max(ratio * 100, consumed > 0 ? 3 : 0)}%` }}
        />
      </div>
    </div>
  );
}
