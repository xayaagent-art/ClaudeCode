"use client";

import { useEffect, type ReactNode } from "react";

/**
 * Bottom sheet.
 *
 * Sheets replace the navigation-away-and-come-back pattern for anything that
 * is a decision rather than a destination: alternatives, swapping a day,
 * looking at one kitchen item. Escape and the scrim close it; the drag
 * indicator says which way it goes. `dismissible={false}` is for a
 * confirmation that must not be lost to a stray tap.
 */
export function Sheet({
  open,
  title,
  onClose,
  children,
  footer,
  dismissible = true,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  dismissible?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dismissible) onClose();
    };
    document.addEventListener("keydown", onKey);
    // The page behind must not scroll while a sheet owns the screen.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose, dismissible]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Close"
        tabIndex={dismissible ? 0 : -1}
        onClick={dismissible ? onClose : undefined}
        className="scrim-in absolute inset-0 h-full w-full cursor-default bg-ink/25 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="sheet-rise relative flex max-h-[88dvh] w-full max-w-2xl flex-col rounded-t-[28px] bg-surface shadow-[0_-8px_40px_rgba(0,0,0,0.14)]"
      >
        <div className="flex shrink-0 flex-col items-center pt-3">
          <span aria-hidden="true" className="h-1 w-9 rounded-full bg-line-strong" />
        </div>
        <div className="flex shrink-0 items-center justify-between gap-4 px-gutter pb-2 pt-4">
          <h2 className="text-title font-semibold tracking-tight">{title}</h2>
          {dismissible ? (
            <button
              type="button"
              onClick={onClose}
              className="-mr-2 flex size-11 items-center justify-center rounded-full text-ink-muted hover:bg-surface-sunken hover:text-ink"
              aria-label="Close"
            >
              <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
                <path
                  d="M5 5l10 10M15 5L5 15"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-line px-gutter pb-safe-plus pt-3">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
