import { healthReport } from "@/lib/diagnostics";
import { ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const live = new URL(request.url).searchParams.get("live") === "1";
  return ok(await healthReport(live));
}
