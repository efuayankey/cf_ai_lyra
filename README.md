# Lyra 🎵

**Lyra** is a deeply personal AI music companion built on Cloudflare's edge infrastructure. It doesn't just recommend music — it learns what moves you, remembers your taste across sessions, and curates experiences that feel like a friend who really pays attention.

**Live demo:** https://lyra.efuayankey123.workers.dev

---

## Architecture

| Component | Technology |
|---|---|
| LLM | GLM-4.7-flash via Cloudflare Workers AI |
| Agent & coordination | Cloudflare Durable Objects (`AIChatAgent`) |
| Taste memory | SQLite built into Durable Object |
| Music data | iTunes Search API (no auth required) |
| Frontend | React + Cloudflare Pages |
| Real-time chat | WebSockets via Cloudflare Agents SDK |

### How it satisfies the assignment requirements

- **LLM** — `@cf/zai-org/glm-4.7-flash` via Workers AI, no API key needed
- **Workflow / coordination** — `LyraAgent` extends `AIChatAgent`, a Durable Object that orchestrates multi-step tool call chains: `searchTracks` → `getRecommendations` → `savePreference`
- **User input via chat** — real-time WebSocket chat interface built with the Cloudflare Agents SDK and React
- **Memory / state** — SQLite table inside the Durable Object persists a `taste_profile` across all sessions; saved preferences are injected into the system prompt on every message

---

## Features

- **Real track search** — searches iTunes for real songs, returns album art, artist, and album
- **30-second audio previews** — play track previews directly in the browser
- **Apple Music links** — open any track in Apple Music with one click
- **Mood-based recommendations** — multi-query search engine deduplicates and curates results based on vibe
- **Persistent taste memory** — every preference you share is saved permanently in Durable Object SQLite
- **Taste profile view** — ask *"what do you know about me?"* to see everything Lyra has learned

---

## Running the project

### Prerequisites

- Node.js 18+
- A free Cloudflare account

### Setup

```bash
git clone https://github.com/efuayankey/cf_ai_lyra.git
cd cf_ai_lyra
npm install
```

### Authenticate with Cloudflare

```bash
npx wrangler login
```

### Deploy

Workers AI requires Cloudflare's infrastructure, so deploy directly:

```bash
npm run deploy
```

Your app will be live at `https://lyra.[your-subdomain].workers.dev`

### Local dev (UI only)

```bash
npm run dev
```

Note: `env.AI` (Workers AI) is not supported in local mode — the UI loads but the agent won't respond. Deploy for full functionality.

---

## How to use

1. Open the live URL: https://lyra.efuayankey123.workers.dev
2. Type a mood, artist, or feeling — e.g. *"I love Tyler the Creator"* or *"I'm sad tonight"*
3. Lyra finds real tracks, shows album art, and lets you preview them in the browser
4. The more you share, the more personalized it gets — Lyra remembers everything across sessions

---

## Project structure

```
src/
  server.ts    — LyraAgent (Durable Object): LLM, tools, taste memory
  app.tsx      — React chat UI with song cards and audio preview
  client.tsx   — Entry point
  styles.css   — Global styles
wrangler.jsonc — Cloudflare config (Durable Objects, Workers AI binding)
```

---

## Tools

| Tool | Description |
|---|---|
| `searchTracks` | Search iTunes by artist, song, or album name |
| `getRecommendations` | Multi-query iTunes search, deduped, for discovery |
| `savePreference` | Persist a like/dislike/mood to SQLite permanently |
| `getTasteProfile` | Retrieve the full saved taste profile |
