import Link from "next/link";
import { healthReport } from "@/lib/diagnostics";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The health check as a page.
 *
 * Same report as /api/diagnostics. It exists as a page because deployment
 * protection redirects API routes to SSO while serving pages normally, and a
 * check that cannot be read is not a check.
 */
export default async function LiveDiagnosticsPage({
  searchParams,
}: {
  searchParams: Promise<{ live?: string }>;
}) {
  const { live } = await searchParams;
  const report = await healthReport(live === "1");

  return (
    <>
      <header className="flex items-start justify-between gap-4 px-5 pt-8 pb-6">
        <div>
          <p className="text-meta text-ink-muted">Diagnostics</p>
          <h1 className="mt-1 text-display font-semibold tracking-tight">Live check</h1>
        </div>
        <Link
          href="/settings/diagnostics"
          className="min-h-11 self-center px-2 text-meta text-ink-muted hover:text-ink"
        >
          Back
        </Link>
      </header>
      <section className="px-5 pb-10">
        <pre className="overflow-x-auto rounded-xl border border-line bg-surface-sunken p-4 text-meta">
          {JSON.stringify(report, null, 2)}
        </pre>
      </section>
    </>
  );
}
