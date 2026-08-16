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
        {/* Desktop gets a wider column and a side rail; mobile keeps bottom nav. */}
        <div className="mx-auto min-h-dvh w-full max-w-2xl pb-24 md:max-w-5xl md:pb-8 md:pl-56">
          <main id="main">{children}</main>
        </div>
        <BottomNav />
      </body>
    </html>
  );
}
