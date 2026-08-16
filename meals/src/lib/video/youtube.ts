import type { VideoCandidate, VideoProvider, VideoSearchOptions } from "@/lib/video/provider";

/**
 * YouTube Data API v3.
 *
 * Quota matters: search.list costs 100 units and the default free daily quota is
 * 10,000 units, so roughly 100 searches a day. videos.list (for duration and
 * view count) costs 1 unit. That budget is only workable because the discovery
 * service caches a resolved source on the recipe and never re-searches it —
 * see meals/discovery-service.ts.
 */

const SEARCH_ENDPOINT = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_ENDPOINT = "https://www.googleapis.com/youtube/v3/videos";

interface SearchItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    description?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: Record<string, { url?: string; width?: number }>;
  };
}

interface VideoItem {
  id?: string;
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string };
  status?: { embeddable?: boolean; privacyStatus?: string };
}

/** ISO-8601 duration (PT12M34S) → seconds. */
export function parseIsoDuration(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^P(?:([\d.]+)D)?T?(?:([\d.]+)H)?(?:([\d.]+)M)?(?:([\d.]+)S)?$/.exec(value);
  if (!match) return null;
  const [, d, h, m, s] = match;
  const seconds =
    Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : null;
}

/** Prefer the largest thumbnail YouTube offers for the card and detail hero. */
function bestThumbnail(
  thumbnails: Record<string, { url?: string; width?: number }> | undefined,
): string | null {
  if (!thumbnails) return null;
  const ranked = Object.values(thumbnails)
    .filter((t): t is { url: string; width?: number } => Boolean(t?.url))
    .sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return ranked[0]?.url ?? null;
}

export class YouTubeProvider implements VideoProvider {
  readonly name = "YouTube";
  readonly platform = "youtube" as const;

  private apiKey(): string | undefined {
    return process.env.YOUTUBE_API_KEY;
  }

  enabled(): boolean {
    return Boolean(this.apiKey());
  }

  unavailableReason(): string | null {
    return this.enabled()
      ? null
      : "YOUTUBE_API_KEY is not set, so no cooking videos can be looked up.";
  }

  async search(query: string, options: VideoSearchOptions = {}): Promise<VideoCandidate[]> {
    const key = this.apiKey();
    if (!key) return [];

    const limit = Math.min(options.limit ?? 6, 10);

    const searchUrl = new URL(SEARCH_ENDPOINT);
    searchUrl.searchParams.set("key", key);
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("type", "video");
    searchUrl.searchParams.set("maxResults", String(limit));
    searchUrl.searchParams.set("videoEmbeddable", "true");
    // Exclude Shorts-length clips; a 45-second video is not a recipe to cook from.
    searchUrl.searchParams.set("videoDuration", "medium");
    searchUrl.searchParams.set("safeSearch", "moderate");
    searchUrl.searchParams.set("relevanceLanguage", "en");

    const searchResponse = await fetch(searchUrl, { signal: options.signal });
    if (!searchResponse.ok) {
      throw new Error(`youtube search failed: ${searchResponse.status}`);
    }
    const searchBody = (await searchResponse.json()) as { items?: SearchItem[] };
    const items = (searchBody.items ?? []).filter((item) => item.id?.videoId);
    if (items.length === 0) return [];

    // Second call is 1 quota unit and gives duration and view count, both of
    // which the quality heuristic needs.
    const ids = items.map((item) => item.id!.videoId!).join(",");
    const details = new Map<string, VideoItem>();
    try {
      const videosUrl = new URL(VIDEOS_ENDPOINT);
      videosUrl.searchParams.set("key", key);
      videosUrl.searchParams.set("part", "contentDetails,statistics,status");
      videosUrl.searchParams.set("id", ids);
      const videosResponse = await fetch(videosUrl, { signal: options.signal });
      if (videosResponse.ok) {
        const videosBody = (await videosResponse.json()) as { items?: VideoItem[] };
        for (const item of videosBody.items ?? []) {
          if (item.id) details.set(item.id, item);
        }
      }
    } catch {
      // Details are an enhancement; a search result without them still ranks.
    }

    return items
      .map((item): VideoCandidate => {
        const videoId = item.id!.videoId!;
        const detail = details.get(videoId);
        return {
          platform: "youtube",
          video_id: videoId,
          url: `https://www.youtube.com/watch?v=${videoId}`,
          title: item.snippet?.title ?? "",
          channel: item.snippet?.channelTitle ?? "",
          description: item.snippet?.description ?? "",
          thumbnail_url: bestThumbnail(item.snippet?.thumbnails),
          duration_seconds: parseIsoDuration(detail?.contentDetails?.duration),
          published_at: item.snippet?.publishedAt ?? null,
          view_count: detail?.statistics?.viewCount ? Number(detail.statistics.viewCount) : null,
        };
      })
      .filter((candidate) => {
        const detail = details.get(candidate.video_id);
        // Drop anything we know is private or non-embeddable.
        return !detail?.status || detail.status.privacyStatus !== "private";
      });
  }
}

export const youtubeProvider = new YouTubeProvider();
