import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Small shared primitives. Deliberately few: hierarchy comes from type and
 * spacing, so most content needs no container at all.
 */

export function PageHeader({
  title,
  eyebrow,
  action,
}: {
  title: string;
  eyebrow?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-4 px-5 pt-8 pb-6">
      <div className="min-w-0">
        {eyebrow ? <p className="text-meta text-ink-muted">{eyebrow}</p> : null}
        <h1 className="mt-1 truncate text-display font-semibold tracking-tight">{title}</h1>
      </div>
      {action}
    </header>
  );
}

export function AvatarLink({ initials }: { initials: string }) {
  return (
    <Link
      href="/settings"
      aria-label="Household settings"
      className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-meta font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
    >
      {initials}
    </Link>
  );
}

export function SectionHeading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 pb-3">
      <h2 className="text-section font-semibold">{children}</h2>
      {action}
    </div>
  );
}

export function Divider() {
  return <hr className="mx-5 border-line" />;
}

type ButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "quiet" | "danger";
  size?: "md" | "sm";
  disabled?: boolean;
  full?: boolean;
  ariaLabel?: string;
};

const VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-accent text-white hover:bg-accent-ink disabled:bg-ink-faint",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-surface-sunken",
  quiet: "text-ink-muted hover:text-ink hover:bg-surface-sunken",
  danger: "border border-line-strong bg-surface text-danger hover:bg-danger-soft",
};

export function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  size = "md",
  disabled,
  full,
  ariaLabel,
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
        size === "sm" ? "px-4 text-meta" : "px-6 text-body"
      } ${full ? "w-full" : ""} ${VARIANTS[variant]}`}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
  full,
}: {
  href: string;
  children: ReactNode;
  variant?: NonNullable<ButtonProps["variant"]>;
  full?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-6 text-body font-medium transition-colors ${
        full ? "w-full" : ""
      } ${VARIANTS[variant]}`}
    >
      {children}
    </Link>
  );
}

export function Card({
  children,
  className = "",
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "li";
}) {
  const Tag = as;
  return (
    <Tag
      className={`rounded-[18px] border border-line bg-surface shadow-[0_1px_2px_rgba(23,23,23,0.04)] ${className}`}
    >
      {children}
    </Tag>
  );
}

export function EmptyState({
  title,
  body,
  primary,
  secondary,
}: {
  title: string;
  body: string;
  primary?: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <div className="px-5 py-12 text-center">
      <h2 className="text-title font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-body text-ink-muted">{body}</p>
      {primary ? <div className="mt-7 flex justify-center">{primary}</div> : null}
      {secondary ? <div className="mt-3 flex justify-center">{secondary}</div> : null}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="mx-5 rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-meta text-danger"
    >
      {children}
    </p>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "danger" | "accent";
}) {
  const tones = {
    neutral: "bg-surface-sunken text-ink-muted",
    good: "bg-good-soft text-good",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
    accent: "bg-accent-soft text-accent-ink",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-meta ${tones[tone]}`}>
      {children}
    </span>
  );
}

/**
 * Recipe imagery placeholder. Nothing is generated or borrowed — recipes
 * without a real photograph get a quiet typographic plate instead.
 */
export function RecipePlate({
  title,
  cuisine,
  imageUrl,
  className = "",
}: {
  title: string;
  cuisine: string;
  imageUrl?: string | null;
  className?: string;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        className={`h-full w-full object-cover ${className}`}
        loading="lazy"
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className={`flex h-full w-full items-center justify-center bg-[linear-gradient(140deg,#eef1ec,#e4e8e0)] ${className}`}
    >
      <span className="px-3 text-center text-meta font-medium uppercase tracking-[0.14em] text-accent-ink/60">
        {cuisine || title.slice(0, 12)}
      </span>
    </div>
  );
}

/**
 * A food image that knows it might not have arrived yet.
 *
 * Enrichment is asynchronous by design (M2), so a card is drawn before any
 * thumbnail exists and updated when one lands. Three states, never a broken
 * image: `resolved` shows the photograph, `pending` shows a quiet shimmer
 * because a lookup is still coming, and `unavailable` shows the typographic
 * plate for a dish nobody found a picture of. Reserving the aspect ratio in
 * every state is what stops the card jumping when the image settles.
 */
export function FoodImage({
  title,
  cuisine,
  imageUrl,
  state = "resolved",
  className = "",
  rounded = "",
}: {
  title: string;
  cuisine: string;
  imageUrl?: string | null;
  state?: "resolved" | "pending" | "unavailable";
  className?: string;
  rounded?: string;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        className={`img-settle h-full w-full object-cover ${rounded} ${className}`}
        loading="lazy"
        decoding="async"
      />
    );
  }

  if (state === "pending") {
    return (
      <div
        aria-hidden="true"
        className={`pulse-soft h-full w-full bg-[linear-gradient(140deg,#eef1ec,#e2e6de)] ${rounded} ${className}`}
      />
    );
  }

  // Nothing is borrowed or generated. A dish with no photograph gets a plate
  // that looks deliberate — legible cuisine, real contrast — rather than an
  // empty grey rectangle that reads as a failed image.
  return (
    <div
      aria-hidden="true"
      className={`flex h-full w-full flex-col items-center justify-center gap-2 bg-[linear-gradient(145deg,#e9eee8,#dde3da)] ${rounded} ${className}`}
    >
      <svg width="26" height="26" viewBox="0 0 24 24" className="text-accent-ink/35">
        <path
          d="M4 10h16M6 10a6 6 0 0 1 12 0M5 14h14l-1 4H6l-1-4Z"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {/*
        Truncated rather than wrapped: an 80px tile cannot hold
        "Mediterranean", and clipping it mid-word to "DITERRANE" looks like a
        rendering fault. One line, ellipsised, is legibly a label.
      */}
      <span className="w-full truncate px-3 text-center text-meta font-semibold uppercase tracking-[0.06em] text-accent-ink/60">
        {cuisine || title.slice(0, 14)}
      </span>
    </div>
  );
}

/** Small-caps label that opens a section. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="label-cap px-gutter pb-3 pt-8">{children}</p>;
}

/**
 * The three numbers a dinner is actually judged on, on one line.
 *
 * Deliberately three and not eight: time, protein and how much of it is
 * already in the kitchen. Everything else the ranker knows stays internal.
 */
export function StatRow({
  items,
}: {
  items: { value: string; label: string }[];
}) {
  return (
    <div className="flex items-stretch gap-2">
      {items.map((item, index) => (
        <div
          key={item.label}
          className={`flex-1 ${index > 0 ? "border-l border-line pl-3" : ""}`}
        >
          <p className="tabular text-title font-semibold">{item.value}</p>
          <p className="text-meta text-ink-muted">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * A CTA pinned above the bottom navigation.
 *
 * The decision on a screen should always be within thumb reach, whatever the
 * scroll position — "Cook this" at the end of a long recipe is a scroll away
 * from being used.
 */
export function StickyBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ground/92 px-gutter pt-3 backdrop-blur-md md:left-56">
      <div className="mx-auto max-w-2xl pb-safe-plus">{children}</div>
    </div>
  );
}
