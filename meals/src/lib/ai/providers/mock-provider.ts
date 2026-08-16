import type { AIProvider, ImageInput, ReceiptParseResult } from "@/lib/ai/provider";
import { postProcess } from "@/lib/receipt/normalize";
import { fixtureFor, listFixtures } from "@/fixtures/receipts";

/**
 * Fixture provider, reachable only when AI_PROVIDER=mock.
 *
 * It returns a bundled receipt regardless of the image supplied, so every result
 * carries a warning saying exactly that. Nothing in the real path can reach this
 * class — see ai/index.ts.
 */
export class MockProvider implements AIProvider {
  readonly name = "mock" as const;

  modelName(): string {
    return "fixture";
  }

  assertReady(): void {
    // Always ready — that is the point of mock mode.
  }

  async parseReceipt(_image: ImageInput): Promise<ReceiptParseResult> {
    // MOCK_RECEIPT_FIXTURE selects which bundled receipt to replay, so more
    // retailers can be exercised without touching code.
    const requested = process.env.MOCK_RECEIPT_FIXTURE ?? "trader-joes";
    const fixture = fixtureFor(requested);

    if (!fixture) {
      throw new Error(
        `Unknown fixture "${requested}". Available: ${listFixtures().join(", ")}`,
      );
    }

    return {
      receipt: postProcess(fixture.parsed),
      model: `fixture:${fixture.id}`,
      usage: null,
      warnings: [
        `Mock mode: this is the bundled ${fixture.merchant} fixture, not a reading of your image. Set AI_PROVIDER=openai to parse real receipts.`,
      ],
    };
  }
}
