# DharmaSeed Player — Design Document

## Problem

Listening to dharma talks on dharmaseed.org (and hermesamara.org) has friction:
- No way to queue talks
- No resume-where-you-left-off
- Difficult to explore related talks

## Goal

A mobile-friendly web app (PWA) that lets you search for talks on Dharma Seed, queue them, and resume playback where you left off. Designed to be shareable and extensible for future features like related talk recommendations.

## Data Source

**Dharma Seed undocumented JSON API** at `https://www.dharmaseed.org/api/1/`:
- `POST /api/1/talks/` with `detail=0` → edition timestamp + array of all talk IDs
- `POST /api/1/talks/` with `detail=1&items=123,456,...` → full talk objects
- Fields per talk: `id`, `title`, `description`, `teacher_id`, `audio_url`, `duration_in_minutes`, `recording_date`, `retreat_id`, `venue_id`, `update_date`
- Same pattern for `/api/1/teachers/` and `/api/1/centers/`
- Supports delta sync via `edition` parameter
- Used by the official Android app (https://github.com/dharmaseed/dharmaseed-android)
- Audio files served directly as MP3s (e.g. `https://dharmaseed.org/talks/12345/12345.mp3`)

**Hermes Amara** hosts Rob Burbea's ~439 talks but audio is on dharmaseed.org anyway. Could be added later as a curated subset/tag.

## Architecture

```
┌─────────────────┐         ┌──────────────────────────┐       ┌─────────────────┐
│   Frontend       │  ──→   │  Cloudflare Pages         │  ──→  │  dharmaseed.org  │
│   (PWA)          │  ←──   │  Functions + KV cache      │  ←──  │  /api/1/...      │
│                  │         │                           │       │                  │
│ - Audio player   │         │ - GET /api/talks?q=...    │       │                  │
│ - Queue UI       │         │ - GET /api/talks/:id      │       └─────────────────┘
│ - Resume state   │         │ - Cache talk metadata     │
│   (localStorage) │         │                           │
└─────────────────┘         └──────────────────────────┘
```

### Frontend
- **Vite + TypeScript**, no framework (vanilla TS + DOM)
- Mobile-first single-column layout
- Sticky audio player bar at the bottom
- localStorage for queue and playback position

### Backend
- **Cloudflare Pages Functions** (serverless, TypeScript)
- Proxies Dharma Seed API (avoids CORS issues)
- **KV storage** for caching talk metadata (24h TTL)
- Clean REST API surface for the frontend

### Why this architecture
- CORS: Dharma Seed API doesn't support browser cross-origin requests
- Caching: on-demand caching in KV avoids syncing 15k+ talks upfront
- Extensibility: easy to add endpoints (e.g. `/api/talks/:id/related`)
- Shareability: server-side state possible later (user accounts, shared playlists)
- Simplicity: single repo, single deploy, generous free tier

## Tech Stack

- TypeScript (frontend + backend)
- Vite (frontend build + dev server)
- Cloudflare Pages + Functions (hosting + serverless backend)
- Cloudflare KV (metadata cache)
- Wrangler CLI (local dev + deployment)

## MVP Features (priority order)

1. **Search talks** — text search, results show title, teacher, duration, date
2. **Play a talk** — tap to play via HTML5 `<audio>` element
3. **Queue management** — add/remove/reorder talks in a queue
4. **Auto-resume** — persist playback position, restore on revisit
5. **Auto-advance** — when a talk ends, play next in queue

## Future Features (not MVP)

- Related talks (same teacher, retreat, topic similarity)
- Browse by teacher / retreat
- Cross-device sync (server-side user state)
- Offline playback (service worker caching of audio)
- Shared playlists via URL
- Hermes Amara integration (curated Rob Burbea collection)

## Project Structure

```
robapp/
├── src/                    # Frontend TypeScript
│   ├── index.html
│   ├── main.ts             # Entry point
│   ├── player.ts           # Audio playback + resume logic
│   ├── queue.ts            # Queue management (localStorage)
│   ├── search.ts           # Search UI + API calls
│   ├── api.ts              # Client-side API wrapper
│   └── styles.css
├── functions/              # Cloudflare Pages Functions (backend)
│   └── api/
│       ├── talks.ts        # GET /api/talks?q=... (search/list)
│       └── talks/
│           └── [id].ts     # GET /api/talks/:id (single talk details)
├── package.json
├── tsconfig.json
├── vite.config.ts
└── wrangler.toml           # Cloudflare config + KV bindings
```

## Key Design Decisions

- **No audio proxying**: MP3s load directly from dharmaseed.org to save bandwidth
- **On-demand caching**: only cache talks that are actually searched/viewed
- **localStorage first**: queue + resume state lives client-side; server-side sync is a future add-on
- **Mobile-first**: designed for phone use, single-column, big touch targets
- **Creative Commons**: Dharma Seed content is CC BY-NC-ND 4.0 — non-commercial use, no derivatives
