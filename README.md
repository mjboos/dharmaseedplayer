# Dharma Seed Player

Simple DharmaSeed search/player app with a Hono server and TypeScript workers.

## Requirements

- Node.js 20+
- npm

## Run locally

```bash
npm install
npm run dev
```

Server starts at `http://localhost:3000`.

## Install as an app

The site is a Progressive Web App. On Android, open it in Chrome and choose **Install app** (or **Add to Home screen**) from the ⋮ menu; on iOS, use Safari's Share → **Add to Home Screen**. It then opens full-screen from its own icon.

Playlists and playback positions are stored in the browser for the site's address, so the installed app shares them with the browser tab, as long as you install it from the same address. `public/sw.js` caches the app shell (network-first, so deploys show up on the next launch); API calls and audio are never cached. When adding a file to `public/`, add it to `SHELL` in `public/sw.js`. `tests/pwa.test.ts` checks this.

## Back up and move playlists

In the queue panel, tap the playlist name to open the playlist list, then use **Export playlists** to download a `.json` file with all playlists and playback positions. **Import playlists** on another device or browser (or after clearing site data) merges that file back in: nothing is removed, playlists that already exist only get the talks they're missing, and positions already saved on the device are kept.

## Run tests

```bash
npm test
```

Tests are written with Node's built-in test runner and executed through `tsx`.

## API endpoints

- `GET /api/talks?q=<query>&page=<n>&teacher=<id>`: Search talk titles and descriptions, optionally within one teacher's talks.
- `GET /api/talks/:id`: Fetch one talk detail.
- `GET /api/teachers?q=<query>`: Search teachers.
- `GET /api/teachers/match?q=<query>&partial=1`: Find teacher names inside a query and split off the rest (e.g. `goldstein metta` → Joseph Goldstein + `metta`). `partial=1` treats the last word as unfinished, for search-as-you-type.
- `GET /api/teachers/:id/talks?page=<n>&q=<query>`: List talks by teacher.
- `GET /api/retreats/:id/talks`: List talks from a retreat.

## Project structure

- `server.ts`: HTTP server and static file serving.
- `worker/index.ts`: API routes.
- `worker/dharmaseed.ts`: DharmaSeed integration and parsing logic.
- `public/`: Client-side app, including the PWA manifest, service worker (`sw.js`) and icons (`icon.svg` is the source for the PNGs).
- `shared/types.ts`: Shared data types.
- `tests/`: Unit and API tests.
