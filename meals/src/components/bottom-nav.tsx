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

  // Sheets and the camera own the whole screen; a tab bar underneath them is
  // just chrome in the way.
  if (pathname.startsWith("/kitchen/scan")) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 lg:inset-y-0 lg:right-auto lg:left-0 lg:w-56">
      {/*
        A floating pill leaves transparent gutters beside and above it, and page
        content scrolling underneath shows through them — which reads as a
        rendering fault rather than as depth. The reference fades its content
        out under the navigation; this is that fade.
      */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-ground via-ground/95 to-transparent lg:hidden"
      />
      {/* `relative` matters: without it the absolutely-positioned fade above
          paints over this row and washes the Scan action out to a ghost. */}
      <div className="pointer-events-auto relative mx-auto flex max-w-[26rem] items-center gap-2.5 px-4 pb-safe-plus pt-2 lg:h-full lg:max-w-none lg:flex-col lg:items-stretch lg:justify-start lg:px-4 lg:pt-10">
        {/*
          A floating pill rather than an edge-to-edge bar: it reads as an object
          resting on the page, which is most of why the reference's navigation
          feels like an app and not a website.
        */}
        <nav
          aria-label="Primary"
          className="flex flex-1 items-stretch justify-around rounded-full bg-surface/95 p-1.5 shadow-[0_4px_20px_-4px_rgba(23,23,23,0.18),0_1px_3px_rgba(23,23,23,0.08)] backdrop-blur-md lg:flex-none lg:flex-col lg:gap-1 lg:rounded-[20px] lg:p-2"
        >
          {DESTINATIONS.map((destination) => {
            const active =
              pathname === destination.href || pathname.startsWith(`${destination.href}/`);
            const Icon = destination.icon;
            return (
              <Link
                key={destination.href}
                href={destination.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[46px] flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-3 transition-colors lg:flex-row lg:justify-start lg:gap-3 lg:rounded-[14px] lg:px-3 lg:py-2.5 ${
                  active
                    ? "bg-surface-sunken text-ink"
                    : "text-ink-faint hover:text-ink-muted"
                }`}
              >
                <Icon filled={active} />
                <span
                  className={`text-[10px] leading-none tracking-tight lg:text-body ${
                    active ? "font-semibold" : "font-medium"
                  }`}
                >
                  {destination.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/*
          Scan is the product's primary verb, not a fourth destination — so it
          sits outside the pill, in the one place the eye reliably returns to.
        */}
        <Link
          href="/kitchen/scan"
          aria-label="Scan groceries"
          className="flex size-[54px] shrink-0 items-center justify-center rounded-full bg-ink text-white shadow-[0_4px_20px_-4px_rgba(23,23,23,0.4)] active:opacity-90 lg:h-12 lg:w-full lg:gap-3 lg:rounded-[14px]"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 9V6.5A2.5 2.5 0 0 1 6.5 4H9M15 4h2.5A2.5 2.5 0 0 1 20 6.5V9M20 15v2.5a2.5 2.5 0 0 1-2.5 2.5H15M9 20H6.5A2.5 2.5 0 0 1 4 17.5V15"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
            />
            <path d="M4 12h16" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
          <span className="hidden text-body font-medium lg:inline">Scan</span>
        </Link>
      </div>
    </div>
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
