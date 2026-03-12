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

// --- Spotify types ---

interface SpotifyTrack {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: {
    name: string;
    images: { url: string }[];
  };
  preview_url: string | null;
  external_urls: { spotify: string };
}

interface SpotifySearchResponse {
  tracks: { items: SpotifyTrack[] };
}

interface SpotifyRecommendationsResponse {
  tracks: SpotifyTrack[];
}

// --- Spotify helpers ---

async function getSpotifyToken(
  clientId: string,
  clientSecret: string
): Promise<string> {
  const resp = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`
    },
    body: "grant_type=client_credentials"
  });
  const data = (await resp.json()) as { access_token: string };
  return data.access_token;
}

function formatTrack(track: SpotifyTrack) {
  return {
    id: track.id,
    name: track.name,
    artist: track.artists[0]?.name ?? "Unknown",
    artistId: track.artists[0]?.id ?? "",
    album: track.album.name,
    image: track.album.images[0]?.url ?? "",
    preview_url: track.preview_url,
    spotify_url: track.external_urls.spotify
  };
}

async function spotifySearchTracks(
  query: string,
  token: string,
  limit = 5
): Promise<ReturnType<typeof formatTrack>[]> {
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = (await resp.json()) as SpotifySearchResponse;
  return data.tracks.items.map(formatTrack);
}

async function spotifySearchArtistId(
  name: string,
  token: string
): Promise<string | null> {
  const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(name)}&type=artist&limit=1`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = (await resp.json()) as {
    artists: { items: { id: string }[] };
  };
  return data.artists.items[0]?.id ?? null;
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

    // Hydrate taste profile into system prompt context
    const tasteRows = this.sql<{ type: string; value: string }>`
      SELECT type, value FROM taste_profile ORDER BY created_at DESC LIMIT 30
    `;

    const tasteContext =
      tasteRows.length > 0
        ? `\n\nWhat I know about this listener so far:\n${tasteRows.map((r) => `• ${r.type.replace(/_/g, " ")}: ${r.value}`).join("\n")}`
        : "\n\nI don't know much about this listener yet — still learning their taste.";

    const result = streamText({
      model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
      system: `You are Lyra — a deeply personal AI music companion. You don't just recommend music, you learn what moves someone and curate experiences that feel almost like reading their mind.

Your personality: warm, curious, a little poetic. You talk about music the way someone who genuinely loves it would — not just listing songs, but describing *why* a track might hit differently right now.

Core behaviors:
- Always use tools to find real songs. Never invent track names.
- When recommending, lead with *why* this music fits the moment, then list the tracks.
- When users express preferences ("I love", "I hate", "I'm in the mood for"), immediately call savePreference to remember it.
- When you have taste profile data, weave it in naturally — like a friend who pays attention.
- To recommend based on an artist: first call searchTracks to get real track IDs, then call getRecommendations with those IDs as seeds.
- Keep responses conversational: 1–2 sentences of context, then the music.
- If someone just says a vibe or mood (e.g. "something sad", "hype me up"), call getRecommendations with appropriate valence/energy values.${tasteContext}`,
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: "before-last-2-messages"
      }),
      tools: {
        searchTracks: tool({
          description:
            "Search Spotify for tracks by song title, artist name, or a descriptive query. Also use this to get track/artist IDs before calling getRecommendations.",
          inputSchema: z.object({
            query: z
              .string()
              .describe(
                "Search query — song name, artist, album, or description"
              ),
            limit: z
              .number()
              .min(1)
              .max(10)
              .optional()
              .default(5)
              .describe("Number of results to return")
          }),
          execute: async ({ query, limit }) => {
            const token = await getSpotifyToken(
              this.env.SPOTIFY_CLIENT_ID,
              this.env.SPOTIFY_CLIENT_SECRET
            );
            return await spotifySearchTracks(query, token, limit);
          }
        }),

        getRecommendations: tool({
          description:
            "Get Spotify track recommendations seeded from tracks, artists, or genres — with optional mood and energy tuning. Use searchTracks first to get real Spotify IDs.",
          inputSchema: z.object({
            seedTrackIds: z
              .array(z.string())
              .max(3)
              .optional()
              .describe("Spotify track IDs (from searchTracks results)"),
            seedArtistNames: z
              .array(z.string())
              .max(3)
              .optional()
              .describe(
                "Artist names to look up and seed recommendations from"
              ),
            seedGenres: z
              .array(z.string())
              .max(3)
              .optional()
              .describe(
                "Genres: 'hip-hop', 'r-n-b', 'pop', 'jazz', 'soul', 'indie', 'electronic', etc."
              ),
            valence: z
              .number()
              .min(0)
              .max(1)
              .optional()
              .describe("Mood — 0 = dark/melancholic, 1 = happy/upbeat"),
            energy: z
              .number()
              .min(0)
              .max(1)
              .optional()
              .describe("Energy — 0 = calm/mellow, 1 = intense/energetic"),
            danceability: z
              .number()
              .min(0)
              .max(1)
              .optional()
              .describe("Danceability — 0 = not danceable, 1 = very danceable")
          }),
          execute: async ({
            seedTrackIds = [],
            seedArtistNames = [],
            seedGenres = [],
            valence,
            energy,
            danceability
          }) => {
            const token = await getSpotifyToken(
              this.env.SPOTIFY_CLIENT_ID,
              this.env.SPOTIFY_CLIENT_SECRET
            );

            // Resolve artist names to Spotify IDs
            const artistIds: string[] = [];
            for (const name of seedArtistNames.slice(0, 2)) {
              const id = await spotifySearchArtistId(name, token);
              if (id) artistIds.push(id);
            }

            const totalSeeds =
              seedTrackIds.length + artistIds.length + seedGenres.length;
            if (totalSeeds === 0) {
              return {
                error:
                  "Need at least one seed — provide track IDs, artist names, or genres."
              };
            }

            const params = new URLSearchParams({ limit: "6" });
            if (seedTrackIds.length)
              params.set("seed_tracks", seedTrackIds.slice(0, 3).join(","));
            if (artistIds.length)
              params.set("seed_artists", artistIds.slice(0, 3).join(","));
            if (seedGenres.length)
              params.set("seed_genres", seedGenres.slice(0, 3).join(","));
            if (valence !== undefined)
              params.set("target_valence", valence.toString());
            if (energy !== undefined)
              params.set("target_energy", energy.toString());
            if (danceability !== undefined)
              params.set("target_danceability", danceability.toString());

            const resp = await fetch(
              `https://api.spotify.com/v1/recommendations?${params}`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            const data =
              (await resp.json()) as SpotifyRecommendationsResponse;
            return data.tracks.map(formatTrack);
          }
        }),

        savePreference: tool({
          description:
            "Save something about this listener's taste to their permanent profile. Call this whenever they reveal a preference.",
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
              .describe(
                "The artist name, track name, genre, or mood description to save"
              )
          }),
          execute: async ({ type, value }) => {
            // Avoid exact duplicates
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
            "Retrieve everything Lyra knows about this listener's taste — their likes, dislikes, and mood patterns.",
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
