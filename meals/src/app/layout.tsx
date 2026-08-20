import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { BottomNav } from "@/components/bottom-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meals",
  description: "Receipt to dinner for a two-person household.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Meals",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fafaf7",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={GeistSans.className}>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-ground"
        >
          Skip to content
        </a>
        {/*
          A phone-shaped canvas, centred. Desktop gets the side rail and a
          little more room, but deliberately not a dashboard width — this is a
          product you use standing in a kitchen, and stretching the hero card
          across 1400px would make it something else.
        */}
        <div className="mx-auto min-h-dvh w-full max-w-[26rem] md:max-w-[34rem] md:pl-0 lg:pl-56">
          <main id="main">{children}</main>
        </div>
        <BottomNav />
      </body>
    </html>
  );
}
