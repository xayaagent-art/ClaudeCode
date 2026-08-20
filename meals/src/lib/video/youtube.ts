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
const CHANNELS_ENDPOINT = "https://www.googleapis.com/youtube/v3/channels";

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
  snippet?: { channelId?: string };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  status?: { embeddable?: boolean; privacyStatus?: string };
}

interface ChannelItem {
  id?: string;
  snippet?: { title?: string; description?: string };
  statistics?: { subscriberCount?: string; videoCount?: string };
}

/** Words a cooking channel uses about itself. */
const CULINARY_WORDS = [
  "recipe", "cook", "cooking", "kitchen", "chef", "food", "baking", "cuisine",
  "culinary", "meal", "dishes", "eats", "curry", "vegan", "vegetarian",
];

function looksCulinary(channel: ChannelItem | undefined): boolean {
  if (!channel) return false;
  const haystack = `${channel.snippet?.title ?? ""} ${channel.snippet?.description ?? ""}`
    .toLowerCase()
    .slice(0, 600);
  return CULINARY_WORDS.some((word) => haystack.includes(word));
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
    // Duration is no longer filtered here. `medium` meant 4-20 minutes, which
    // threw away both the 2-3 minute cook-alongs that are usually the best
    // answer and every Short — including the genuinely instructional ones. The
    // ranker judges duration now, with the full field to choose from.
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
      videosUrl.searchParams.set("part", "snippet,contentDetails,statistics,status");
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

    // One batched channels.list for every distinct channel in the shortlist.
    // Costs 1 quota unit total and is what lets an established cooking creator
    // be told apart from a big general channel that happened to post a recipe.
    const channels = new Map<string, ChannelItem>();
    const channelIds = [
      ...new Set(
        [...details.values()]
          .map((detail) => detail.snippet?.channelId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (channelIds.length > 0) {
      try {
        const channelsUrl = new URL(CHANNELS_ENDPOINT);
        channelsUrl.searchParams.set("key", key);
        channelsUrl.searchParams.set("part", "snippet,statistics");
        channelsUrl.searchParams.set("id", channelIds.join(","));
        const channelsResponse = await fetch(channelsUrl, { signal: options.signal });
        if (channelsResponse.ok) {
          const body = (await channelsResponse.json()) as { items?: ChannelItem[] };
          for (const item of body.items ?? []) {
            if (item.id) channels.set(item.id, item);
          }
        }
      } catch {
        // Channel signals are a preference, not a requirement.
      }
    }

    return items
      .map((item): VideoCandidate => {
        const videoId = item.id!.videoId!;
        const detail = details.get(videoId);
        const channelId = detail?.snippet?.channelId ?? null;
        const channel = channelId ? channels.get(channelId) : undefined;
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
          like_count: detail?.statistics?.likeCount ? Number(detail.statistics.likeCount) : null,
          comment_count: detail?.statistics?.commentCount
            ? Number(detail.statistics.commentCount)
            : null,
          channel_id: channelId,
          channel_subscribers: channel?.statistics?.subscriberCount
            ? Number(channel.statistics.subscriberCount)
            : null,
          channel_video_count: channel?.statistics?.videoCount
            ? Number(channel.statistics.videoCount)
            : null,
          channel_is_culinary: channel ? looksCulinary(channel) : null,
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
