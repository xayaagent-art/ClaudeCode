import type { VideoPlatform } from "@/lib/types";

/**
 * Video provider abstraction.
 *
 * YouTube is the only implementation for the MVP, but nothing above this
 * interface knows that. Adding another platform means adding a provider and
 * registering it — the discovery service, the quality heuristic and the UI all
 * work off `VideoCandidate`.
 */
export interface VideoCandidate {
  platform: VideoPlatform;
  video_id: string;
  url: string;
  title: string;
  channel: string;
  description: string;
  thumbnail_url: string | null;
  /** Null when the provider does not report duration. */
  duration_seconds: number | null;
  published_at: string | null;
  view_count: number | null;
}

export interface VideoSearchOptions {
  /** Hard cap on results returned to the caller. */
  limit?: number;
  signal?: AbortSignal;
}

export interface VideoProvider {
  readonly name: string;
  readonly platform: VideoPlatform;
  /** False when the provider is not configured; callers must degrade, not fake. */
  enabled(): boolean;
  /** Why it is unavailable, for surfacing honestly in logs and config screens. */
  unavailableReason(): string | null;
  search(query: string, options?: VideoSearchOptions): Promise<VideoCandidate[]>;
}
