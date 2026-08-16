import "server-only";
import { activeProviderName, type AIProvider } from "@/lib/ai/provider";
import { MockProvider } from "@/lib/ai/providers/mock-provider";
import { OpenAIProvider } from "@/lib/ai/providers/openai-provider";

/**
 * The single place a provider is chosen.
 *
 * Nothing else in the app instantiates a provider, and no UI component ever
 * calls a model directly. The mock provider is unreachable unless
 * AI_PROVIDER resolves to "mock", which is what keeps fixture data out of real
 * mode entirely.
 */
export function getAIProvider(): AIProvider {
  return activeProviderName() === "openai" ? new OpenAIProvider() : new MockProvider();
}

export { activeProviderName, isRealMode, AIConfigurationError } from "@/lib/ai/provider";
export type { AIProvider, AIUsage, ImageInput, ReceiptParseResult } from "@/lib/ai/provider";
