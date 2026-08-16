import { todayISO } from "@/lib/date";
import { handle } from "@/lib/http";
import { getTodayPayload } from "@/lib/views/today";

export const runtime = "nodejs";

/** Everything the Today screen needs in one round trip. */
export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date") ?? todayISO();
  return handle(() => getTodayPayload(date));
}
