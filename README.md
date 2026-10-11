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

## Run tests

```bash
npm test
```

Tests are written with Node's built-in test runner and executed through `tsx`.

## API endpoints

- `GET /api/talks?q=<query>&page=<n>&teacher=<id>`: Search talk titles and descriptions, optionally within one teacher's talks.
- `GET /api/talks/:id`: Fetch one talk with its description and retreat (used by shared `#talk/<id>` links).
- `GET /api/teachers?q=<query>`: Search teachers.
- `GET /api/teachers/match?q=<query>&partial=1`: Find teacher names inside a query and split off the rest (e.g. `goldstein metta` → Joseph Goldstein + `metta`). `partial=1` treats the last word as unfinished, for search-as-you-type.
- `GET /api/teachers/:id/talks?page=<n>&q=<query>`: List talks by teacher.
- `GET /api/retreats/:id/talks`: List talks from a retreat.

## Project structure

- `server.ts`: HTTP server and static file serving.
- `worker/index.ts`: API routes.
- `worker/dharmaseed.ts`: DharmaSeed integration and parsing logic.
- `public/`: Client-side app.
- `shared/types.ts`: Shared data types.
- `tests/`: Unit and API tests.
