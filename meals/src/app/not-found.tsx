import Link from "next/link";

export default function NotFound() {
  return (
    <div className="px-5 py-20 text-center">
      <h1 className="text-title font-semibold">We couldn&apos;t find that</h1>
      <p className="mt-2 text-body text-ink-muted">
        The page or recipe you were after isn&apos;t here.
      </p>
      <Link href="/today" className="mt-6 inline-block text-body text-accent hover:underline">
        Back to Today
      </Link>
    </div>
  );
}
