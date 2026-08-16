import { z } from "zod";

/**
 * The contract the receipt parser must satisfy. The model is given the JSON
 * schema below as a strict structured-output format; whatever comes back is
 * still validated with zod before anything touches the database.
 */

export const storageLocationSchema = z.enum(["Fridge", "Pantry", "Freezer", "Produce"]);

export const classificationSchema = z.enum(["human_food", "non_food", "pet_food", "uncertain"]);

export const parsedReceiptItemSchema = z.object({
  /** Verbatim from the receipt, abbreviations and all. Never cleaned up. */
  raw_name: z.string().min(1),
  normalized_name: z.string().min(1),
  quantity: z.number().positive().max(99),
  package_size: z.string().nullable(),
  price: z.number().nullable(),
  category: z.string(),
  storage_location: storageLocationSchema,
  classification: classificationSchema,
  confidence: z.number().min(0).max(1),
  /** Populated only when the line is genuinely ambiguous. */
  uncertain_reason: z.string().nullable(),
});

export const parsedReceiptSchema = z.object({
  merchant: z.string().nullable(),
  purchase_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
    .nullable(),
  currency: z.string().default("USD"),
  subtotal: z.number().nullable(),
  tax: z.number().nullable(),
  total: z.number().nullable(),
  items: z.array(parsedReceiptItemSchema),
});

export type ParsedReceiptItem = z.infer<typeof parsedReceiptItemSchema>;
export type ParsedReceipt = z.infer<typeof parsedReceiptSchema>;

/** JSON Schema handed to the Responses API. Strict mode: every key required. */
export const receiptJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["merchant", "purchase_date", "currency", "subtotal", "tax", "total", "items"],
  properties: {
    merchant: { type: ["string", "null"], description: "Store name exactly as printed." },
    purchase_date: {
      type: ["string", "null"],
      description: "Purchase date as YYYY-MM-DD, or null if not legible.",
    },
    currency: { type: "string", description: "ISO currency code, e.g. USD." },
    subtotal: { type: ["number", "null"] },
    tax: { type: ["number", "null"] },
    total: { type: ["number", "null"] },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "raw_name",
          "normalized_name",
          "quantity",
          "package_size",
          "price",
          "category",
          "storage_location",
          "classification",
          "confidence",
          "uncertain_reason",
        ],
        properties: {
          raw_name: {
            type: "string",
            description: "The line exactly as printed, including abbreviations.",
          },
          normalized_name: {
            type: "string",
            description: "Readable product name a person would use, e.g. 'Organic Red Onions'.",
          },
          quantity: { type: "number", description: "Units purchased. Default 1." },
          package_size: {
            type: ["string", "null"],
            description: "Package size if printed, e.g. '2 lb', '16 oz'.",
          },
          price: { type: ["number", "null"], description: "Line price, null if not legible." },
          category: {
            type: "string",
            description:
              "Produce, Dairy, Bakery, Frozen, Pantry, Beverages, Meat, Snacks, Household, Pet, or Other.",
          },
          storage_location: {
            type: "string",
            enum: ["Fridge", "Pantry", "Freezer", "Produce"],
          },
          classification: {
            type: "string",
            enum: ["human_food", "non_food", "pet_food", "uncertain"],
            description:
              "human_food only for food a person eats. Cleaning supplies, toiletries and paper goods are non_food. Anything for animals is pet_food. Use uncertain when the line is not legible enough to decide.",
          },
          confidence: {
            type: "number",
            description:
              "0-1 confidence in the normalized name and classification. Use a genuine estimate, not false precision.",
          },
          uncertain_reason: {
            type: ["string", "null"],
            description: "Short note when the line is ambiguous, otherwise null.",
          },
        },
      },
    },
  },
} as const;

export const RECEIPT_SYSTEM_PROMPT = `You transcribe grocery receipts into structured data.

Rules:
- Transcribe only purchasable line items. Ignore store address, phone numbers, loyalty text, payment method, card digits, cashier names and marketing footers.
- raw_name must be the line exactly as printed, including abbreviations and truncation.
- normalized_name is the readable product name a person would say out loud. Expand obvious abbreviations (ORG -> Organic, PNT -> Peanut). Do not invent detail the receipt does not support.
- Set quantity from the receipt when printed; otherwise 1. Weighted items priced per pound are quantity 1 with the weight in package_size.
- classification: human_food for anything a person eats or drinks. non_food for household, cleaning, paper and personal care products. pet_food for anything intended for animals. uncertain when you genuinely cannot tell.
- Never invent products that are not on the receipt. If a line is unreadable, include it with a low confidence and uncertain_reason set, rather than guessing a plausible product.
- confidence reflects how sure you are of normalized_name and classification together. Round to two decimals; do not output false precision.
- If the totals are not legible, return null for them rather than computing your own.`;
