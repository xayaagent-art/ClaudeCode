import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { ReviewView } from "@/components/review-view";
import { confidenceBand, needsReview } from "@/lib/receipt/normalize";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const receipt = await db.getReceipt(id);
  if (!receipt) notFound();

  const items = await db.listReceiptItems(id);

  return (
    <ReviewView
      receipt={{
        id: receipt.id,
        merchant: receipt.merchant,
        purchase_date: receipt.purchase_date,
        total: receipt.total,
        status: receipt.processing_status,
        parser: receipt.parser,
      }}
      items={items.map((item) => ({
        id: item.id,
        raw_name: item.raw_name,
        normalized_name: item.normalized_name,
        quantity: item.quantity,
        package_size: item.package_size,
        price: item.price,
        category: item.category,
        storage_location: item.storage_location,
        classification: item.classification,
        confidence: item.confidence,
        band: confidenceBand(item.confidence),
        included: item.included,
        note: item.notes,
        needs_review: needsReview({
          raw_name: item.raw_name,
          normalized_name: item.normalized_name,
          quantity: item.quantity,
          package_size: item.package_size,
          price: item.price,
          category: item.category,
          storage_location: item.storage_location,
          classification: item.classification,
          confidence: item.confidence,
          uncertain_reason: item.notes,
        }),
      }))}
    />
  );
}
