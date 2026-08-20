"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Three destinations, nothing else. Settings lives behind the avatar in the
 * page header, not here — adding a fourth tab is how apps become dashboards.
 *
 * Mobile: fixed bottom bar inside the safe area. Desktop: a left rail.
 */
const DESTINATIONS = [
  { href: "/today", label: "Today", icon: SunIcon },
  { href: "/plan", label: "Plan", icon: CalendarIcon },
  { href: "/kitchen", label: "Kitchen", icon: BasketIcon },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ground/92 backdrop-blur-md pad-safe-bottom pt-2 lg:inset-y-0 lg:right-auto lg:left-0 lg:w-56 lg:border-t-0 lg:border-r lg:px-4 lg:pt-10"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around lg:mx-0 lg:max-w-none lg:flex-col lg:gap-1">
        {DESTINATIONS.map((destination) => {
          const active =
            pathname === destination.href || pathname.startsWith(`${destination.href}/`);
          const Icon = destination.icon;
          return (
            <li key={destination.href} className="flex-1 lg:flex-none">
              <Link
                href={destination.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-3 py-1.5 text-[11px] leading-none tracking-tight transition-colors lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:py-2.5 lg:text-body ${
                  active
                    ? "text-accent lg:bg-accent-soft"
                    : "text-ink-muted hover:text-ink lg:hover:bg-surface-sunken"
                }`}
              >
                <Icon filled={active} />
                <span className={active ? "font-medium" : undefined}>{destination.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SunIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.6" fill={filled ? "currentColor" : "none"} />
      <path
        d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CalendarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="3.5"
        y="5"
        width="17"
        height="15"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.6"
        fill={filled ? "currentColor" : "none"}
        fillOpacity={filled ? 0.15 : 0}
      />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function BasketIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 9h16l-1.4 9.2a2 2 0 0 1-2 1.8H7.4a2 2 0 0 1-2-1.8L4 9Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill={filled ? "currentColor" : "none"}
        fillOpacity={filled ? 0.15 : 0}
      />
      <path d="M8.5 9 11 3.8M15.5 9 13 3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
