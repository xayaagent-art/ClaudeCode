import { handle } from "@/lib/http";
import { confirmReceipt } from "@/lib/receipt/service";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Ctx) {
  const { id } = await params;
  return handle(() => confirmReceipt(id));
}
