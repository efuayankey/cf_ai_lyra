# AI Prompts Used

Claude Code was used as a coding assistant during this project — similar to how a developer might use GitHub Copilot or Stack Overflow. All product decisions, architectural direction, and pivots were made by me as the developer.

---

## Product decisions I made

- **Chose the domain**: music AI over other options (interview coach, fitness tracker) because I wanted to build something I genuinely cared about
- **Named it Lyra**: after the Greek muse associated with music and the constellation
- **Pivoted away from Spotify**: when I hit the Spotify Premium paywall for Web API access, I researched alternatives and decided on the iTunes Search API — free, no auth, returns album art and previews
- **Chose persistent taste memory**: wanted Lyra to feel like a friend who remembers you, not a stateless chatbot — drove the decision to use Durable Object SQLite
- **Debugged the model issue**: noticed the LLM was printing raw JSON instead of calling tools, identified it was a model compatibility issue, and switched to GLM-4.7-flash

---

## Architectural prompts

These are the prompts I used to implement the architecture I designed:

### Agent system prompt (in `src/server.ts`)

```
You are Lyra — a deeply personal AI music companion. You don't just recommend music,
you learn what moves someone and curate experiences that feel almost like reading their mind.

Your personality: warm, curious, a little poetic. You talk about music the way someone
who genuinely loves it would — not just listing songs, but describing *why* a track
might hit differently right now.

Core behaviors:
- Always use tools to surface real songs. Never invent track names.
- When recommending, lead with *why* this music fits the moment, then show the tracks.
- When users express preferences ("I love", "I hate", "I'm in the mood for"),
  immediately call savePreference to remember it.
- When you have taste profile data, weave it in naturally — like a friend who pays attention.
- For recommendations based on mood, genre, or artist: use getRecommendations with
  descriptive queries (e.g. "Tyler the Creator odd future", "melancholic r&b").
- Keep responses conversational: 1–2 sentences of context, then the music.
```

### Tool design rationale

- **`searchTracks`** — direct iTunes lookup for when the user names a specific artist or song
- **`getRecommendations`** — multi-query iTunes search with deduplication; the LLM provides the "recommendation intelligence" by choosing descriptive queries, iTunes provides real data
- **`savePreference`** — writes to SQLite with duplicate prevention; feeds back into the system prompt on every message
- **`getTasteProfile`** — lets users inspect what Lyra has learned about them; reinforces the memory angle of the product
