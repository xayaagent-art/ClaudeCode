/**
 * The one place a dish becomes a picture.
 *
 * Three tiers, in order: a real recipe photograph, then a resolved video
 * thumbnail, then a designed plate. The third is not a placeholder in the
 * apologetic sense — most generated dishes will never have a photograph, so it
 * has to be a state the product is happy to show, not a hole where an image
 * failed. It draws a plate: a warm ground, a rim, and the cuisine set in small
 * caps. No gradients-as-decoration, no food emoji, no broken-image chrome.
 *
 * Every tier occupies the identical box, so a late-arriving thumbnail swaps in
 * without moving a pixel of the layout around it.
 */
export type ImageState = "resolved" | "pending" | "unavailable";

export function FoodImage({
  title,
  cuisine,
  imageUrl,
  state = "resolved",
  className = "",
  compact = false,
}: {
  title: string;
  cuisine: string;
  imageUrl?: string | null;
  state?: ImageState;
  className?: string;
  /** Small tiles drop the rim detail, which turns to mud below ~96px. */
  compact?: boolean;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        className={`img-settle h-full w-full object-cover ${className}`}
        loading="lazy"
        decoding="async"
      />
    );
  }

  // Still waiting on a first look-up: a quiet breathing surface rather than the
  // plate, so "coming" and "there isn't one" do not look identical.
  if (state === "pending") {
    return (
      <div
        aria-hidden="true"
        className={`pulse-soft h-full w-full bg-[linear-gradient(160deg,#efeee9,#e3e2db)] ${className}`}
      />
    );
  }

  const label = (cuisine || title).trim();

  return (
    <div
      aria-hidden="true"
      className={`relative flex h-full w-full items-center justify-center overflow-hidden bg-[#efece4] ${className}`}
    >
      {/* The plate, seen from above. Concentric, off-centre-proof, and sized
          from the shorter edge so it stays a circle in any aspect ratio. */}
      <span className="absolute aspect-square h-[78%] min-h-[78%] rounded-full bg-[#e5e1d6]" />
      {!compact ? (
        <span className="absolute aspect-square h-[62%] rounded-full border border-[#d9d4c6]" />
      ) : null}
      {/* A 62px tile cannot hold "Mediterranean", and clipping it to "MEDI…"
          looks like a fault rather than a label. Small tiles show the plate
          alone; the dish name is already beside them. */}
      {compact ? null : (
        <span className="relative max-w-full truncate px-3 text-center text-meta font-semibold uppercase tracking-[0.14em] text-[#8a8272]">
          {label}
        </span>
      )}
    </div>
  );
}
