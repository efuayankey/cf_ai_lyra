import { createWorkersAI } from "workers-ai-provider";
import { routeAgentRequest } from "agents";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
  streamText,
  convertToModelMessages,
  pruneMessages,
  tool,
  stepCountIs
} from "ai";
import { z } from "zod";

// --- iTunes Search API ---
// No auth required — completely free and open

interface ItunesTrack {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName: string;
  artworkUrl100: string;
  previewUrl?: string;
  trackViewUrl: string;
  primaryGenreName: string;
}

interface ItunesSearchResponse {
  results: ItunesTrack[];
}

function formatTrack(track: ItunesTrack) {
  return {
    id: String(track.trackId),
    name: track.trackName,
    artist: track.artistName,
    album: track.collectionName,
    // Upgrade artwork from 100x100 to 300x300 for better quality
    image: track.artworkUrl100.replace("100x100bb", "300x300bb"),
    preview_url: track.previewUrl ?? null,
    store_url: track.trackViewUrl,
    genre: track.primaryGenreName
  };
}

async function itunesSearch(query: string, limit = 5) {
  const params = new URLSearchParams({
    term: query,
    media: "music",
    entity: "song",
    limit: String(Math.min(limit, 10))
  });
  const resp = await fetch(`https://itunes.apple.com/search?${params}`);
  const data = (await resp.json()) as ItunesSearchResponse;
  return (data.results ?? []).map(formatTrack);
}

// --- Lyra Agent ---

export class LyraAgent extends AIChatAgent<Env> {
  onStart() {
    this.sql`
      CREATE TABLE IF NOT EXISTS taste_profile (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        value TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
  }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const workersai = createWorkersAI({ binding: this.env.AI });

    // Hydrate taste profile into system prompt
    const tasteRows = this.sql<{ type: string; value: string }>`
      SELECT type, value FROM taste_profile ORDER BY created_at DESC LIMIT 30
    `;

    const tasteContext =
      tasteRows.length > 0
        ? `\n\nWhat I know about this listener so far:\n${tasteRows.map((r) => `• ${r.type.replace(/_/g, " ")}: ${r.value}`).join("\n")}`
        : "\n\nI don't know much about this listener yet — still learning their taste.";

    const result = streamText({
      model: workersai("@cf/zai-org/glm-4.7-flash"),
      system: `You are Lyra — a deeply personal AI music companion. You don't just recommend music, you learn what moves someone and curate experiences that feel almost like reading their mind.

Your personality: warm, curious, a little poetic. You talk about music the way someone who genuinely loves it would — not just listing songs, but describing *why* a track might hit differently right now.

Core behaviors:
- Always use tools to surface real songs. Never invent track names.
- When recommending, lead with *why* this music fits the moment, then show the tracks.
- When users express preferences ("I love", "I hate", "I'm in the mood for"), immediately call savePreference to remember it.
- When you have taste profile data, weave it in naturally — like a friend who pays attention.
- For recommendations based on mood, genre, or artist: use getRecommendations with descriptive queries (e.g. "Tyler the Creator odd future", "melancholic r&b", "high energy rap workout").
- For direct lookups: use searchTracks with the artist/song name.
- Keep responses conversational: 1–2 sentences of context, then the music.${tasteContext}`,
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: "before-last-2-messages"
      }),
      tools: {
        searchTracks: tool({
          description:
            "Search for tracks by song title or artist name. Use this for direct lookups — 'find songs by Frank Ocean', 'search for Nights'.",
          inputSchema: z.object({
            query: z
              .string()
              .describe("Artist name, song title, or album name"),
            limit: z
              .number()
              .min(1)
              .max(10)
              .optional()
              .default(5)
              .describe("Number of results")
          }),
          execute: async ({ query, limit }) => {
            return await itunesSearch(query, limit);
          }
        }),

        getRecommendations: tool({
          description:
            "Get music recommendations by running multiple descriptive searches. You provide the search queries — make them specific and evocative (e.g. 'chill late night r&b', 'aggressive trap', 'soulful jazz piano'). Results are deduplicated and curated.",
          inputSchema: z.object({
            queries: z
              .array(z.string())
              .min(1)
              .max(4)
              .describe(
                "2–4 descriptive search queries that capture the mood, genre, or artists to pull from"
              ),
            limitPerQuery: z
              .number()
              .min(1)
              .max(5)
              .optional()
              .default(3)
              .describe("Results per query (default 3)")
          }),
          execute: async ({ queries, limitPerQuery = 3 }) => {
            const batches = await Promise.all(
              queries.map((q) => itunesSearch(q, limitPerQuery))
            );

            // Flatten and dedupe by track id
            const seen = new Set<string>();
            const tracks: ReturnType<typeof formatTrack>[] = [];
            for (const batch of batches) {
              for (const track of batch) {
                if (!seen.has(track.id)) {
                  seen.add(track.id);
                  tracks.push(track);
                }
              }
            }
            return tracks.slice(0, 8);
          }
        }),

        savePreference: tool({
          description:
            "Save something about this listener's taste permanently. Call this whenever they reveal a preference — likes, dislikes, moods, artists, genres.",
          inputSchema: z.object({
            type: z.enum([
              "liked_artist",
              "liked_track",
              "liked_genre",
              "disliked_genre",
              "disliked_artist",
              "mood_context"
            ]),
            value: z
              .string()
              .describe("The artist, track, genre, or mood to save")
          }),
          execute: async ({ type, value }) => {
            const existing = this.sql<{ id: number }>`
              SELECT id FROM taste_profile WHERE type = ${type} AND value = ${value} LIMIT 1
            `;
            if (existing.length === 0) {
              this.sql`INSERT INTO taste_profile (type, value) VALUES (${type}, ${value})`;
            }
            return { saved: true, type, value };
          }
        }),

        getTasteProfile: tool({
          description:
            "Retrieve everything Lyra knows about this listener — their likes, dislikes, and mood patterns.",
          inputSchema: z.object({}),
          execute: async () => {
            const rows = this.sql<{
              type: string;
              value: string;
              created_at: string;
            }>`
              SELECT type, value, created_at FROM taste_profile ORDER BY created_at DESC
            `;
            return rows.length > 0
              ? rows
              : { message: "No preferences saved yet. Tell me what you love." };
          }
        })
      },
      stopWhen: stepCountIs(5),
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse();
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
