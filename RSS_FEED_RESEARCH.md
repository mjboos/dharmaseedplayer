# Dharma Seed RSS Feed & API Research

Research into RSS feeds and API endpoints available from dharmaseed.org, and how they compare to the current HTML-scraping approach used by this app.

## 1. Available RSS Feeds

### Main Feed
- `https://dharmaseed.org/feeds/recordings/` — Most recent ~20 talks across all teachers

### Teacher-Specific Feeds
- Pattern: `https://dharmaseed.org/feeds/teacher/{TEACHER_ID}/`
- Returns ~20-25 most recent talks for that teacher
- Teacher IDs match the IDs used in web URLs (e.g., `/teacher/85/` = Jack Kornfield)

### Retreat-Specific Feeds
- Pattern: `https://dharmaseed.org/feeds/retreat/{RETREAT_ID}/`
- Returns **all talks** for that retreat (100+ items observed)
- This is the most useful feed for our app — no item count limitation

### Center-Specific Feeds (via subdomains)
- `https://imsrc.dharmaseed.org/feeds/recordings/` (IMS Retreat Center)
- `https://imsfr.dharmaseed.org/feeds/recordings/` (IMS Forest Refuge)
- `https://gaia.dharmaseed.org/feeds/recordings/` (Gaia House)

### URLs That Do NOT Exist
- `https://dharmaseed.org/feeds/latest.xml` — 404
- `https://dharmaseed.org/feeds/` — 404
- `https://dharmaseed.org/rss/` — 404

## 2. RSS Feed Data Structure

Standard RSS 2.0 with iTunes podcast extensions (`itunes:*`) and Atom namespace.

### Item-Level Fields (per talk)

| RSS Field | Example | Notes |
|---|---|---|
| `<title>` | "Jack Kornfield: Solstice" | Teacher name + talk title |
| `<link>` | `https://dharmaseed.org/talks/94273/` | Talk page URL, talk ID extractable |
| `<description>` | "(Spirit Rock Meditation Center)" | **Often just venue name, NOT full description** |
| `<pubDate>` | "Mon, 15 Dec 2025 06:30:00 +0000" | RFC 2822 format |
| `<guid>` | `20251215-Jack_Kornfield-SR-solstice-94273.mp3` | Contains date, teacher, location code, slug, talk ID |
| `<enclosure>` | url, length (bytes), type="audio/mpeg" | Direct MP3 download link |
| `<itunes:author>` | "Jack Kornfield" | Teacher name |
| `<itunes:duration>` | "1:34:29" | H:MM:SS or MM:SS string format |
| `<itunes:summary>` | Same as description | Often minimal |

### What's Missing from RSS (compared to JSON API)

- **`retreat_id`** — Not present; only venue name sometimes in description
- **`teacher_id`** — Only teacher name as text, no numeric ID
- **Full description** — `<description>` is often just the venue name in parentheses
- **`venue_id` / `center_id`** — Not present as structured data
- **Duration as number** — Only available as H:MM:SS string, not minutes

### Enclosure URL Format
```
https://dharmaseed.org//talks/{talk_id}/{YYYYMMDD}-{Teacher_Name}-{Location}-{slug}-{talk_id}.mp3?rss=
```
Note: Double-slash `//talks` and trailing `?rss=` parameter are quirks but URLs are functional.

## 3. RSS Feed Limitations

| Limitation | Impact |
|---|---|
| **~20-25 item limit** on main/teacher feeds | Cannot browse full teacher catalog via RSS |
| **No pagination** | No `next` links, no page parameters |
| **No search** | Feeds are static, cannot filter or query |
| **Minimal descriptions** | Often just venue name, not talk description |
| **No retreat IDs** | Can't link talks to retreats |
| **Retreat feeds have no limit** | Good for retreat browsing |

## 4. JSON API at `/api/1/` (Already Used)

### Endpoints

| Endpoint | Method | Parameters | Returns |
|---|---|---|---|
| `/api/1/talks/` | POST | `detail=0` | Edition timestamp + array of ALL talk IDs |
| `/api/1/talks/` | POST | `detail=1&items=123,456,...` | Full talk objects |
| `/api/1/teachers/` | POST | `detail=0` | Edition timestamp + array of ALL teacher IDs |
| `/api/1/teachers/` | POST | `detail=1&items=42,...` | Full teacher objects |
| `/api/1/centers/` | POST | Same pattern | Center data |

### Talk Object Fields (from `detail=1`)

```json
{
  "id": 94273,
  "title": "Solstice",
  "description": "",
  "teacher_id": 85,
  "teachers": [85],
  "audio_url": "/talks/94273/20251215-Jack_Kornfield-SR-solstice-94273.mp3",
  "duration_in_minutes": 94.49,
  "rec_date": "2025-12-15 06:30:00",
  "retreat_id": 94,
  "venue_id": 15,
  "update_date": "2025-12-17 03:23:16",
  "language_id": 1,
  "recording_type": "Talk",
  "is_featured": false,
  "video_url": "",
  "publishability": "general"
}
```

### Key Capability: Delta Sync
- Pass `edition` parameter to get only talks updated since that timestamp
- The [official Android app](https://github.com/dharmaseed/dharmaseed-android) uses this to sync incrementally in batches of 500
- Enables building a local index of all 15k+ talks without re-downloading everything

## 5. Comparison: RSS vs JSON API vs HTML Scraping

| Capability | RSS Feeds | JSON API (`/api/1/`) | HTML Scraping (current) |
|---|---|---|---|
| Full catalog access | No (~20-25 items) | Yes (all 15k+ talks) | Yes (paginated) |
| Search | No | No (need client-side) | Yes (server-side search) |
| Teacher-specific | Yes (limited to ~25) | Yes (all) | Yes (paginated) |
| Retreat-specific | Yes (all talks) | Yes (all) | Yes (paginated) |
| Talk description | Minimal (venue only) | Full text | Full text |
| Audio URL | Yes | Yes | Yes |
| Duration | H:MM:SS string | Minutes (number) | H:MM:SS string |
| Retreat ID | No | Yes | Yes |
| Teacher ID | No (name only) | Yes | Yes |
| Stability | High (podcast contract) | Medium (undocumented) | Low (HTML can change) |
| CORS | Likely blocked | No CORS headers | No CORS headers |

## 6. Recommendations

### What We Currently Scrape (and alternatives)

| Current Function | Current Method | Could Replace With |
|---|---|---|
| `searchTalks()` | HTML scraping of `/talks/?search=` | No RSS/API alternative for server-side search |
| `fetchTeacherTalks()` | HTML scraping of `/teacher/{id}/` | RSS: limited to ~25 talks. JSON API: would need local index |
| `fetchRetreatTalks()` | HTML scraping of `/retreats/{id}/` | **RSS `/feeds/retreat/{id}/` — best candidate for replacement** |
| `searchTeachers()` | HTML scraping of `/teachers/?search=` | No RSS/API alternative |
| `fetchTalkDetail()` | JSON API `/api/1/talks/` | Already using JSON API (keep as-is) |
| Teacher name lookup | JSON API `/api/1/teachers/` | Already using JSON API (keep as-is) |

### Recommended Changes (in priority order)

1. **Replace `fetchRetreatTalks()` with RSS parsing** — The retreat RSS feed at `/feeds/retreat/{id}/` returns all talks with no pagination limit. This eliminates fragile HTML regex parsing for retreat browsing. RSS is a stable public contract (Apple Podcasts, Spotify depend on it).

2. **Keep search as HTML scraping** — There is no RSS or JSON API endpoint for text search. The current HTML scraping approach is the only viable method for server-side search.

3. **Consider the JSON API bulk approach for teacher browsing** — Instead of scraping HTML for teacher talks, fetch all talk IDs via `detail=0`, then batch-fetch details via `detail=1`. This mirrors the Android app's approach and avoids HTML parsing entirely. Downside: requires syncing more data upfront.

4. **Keep `fetchTalkDetail()` and teacher lookups as-is** — Already using the JSON API correctly.

### Future Consideration: Full JSON API Migration

The `detail=0` + batch `detail=1` pattern could eliminate HTML scraping entirely by building a local search index. This is architecturally cleaner but requires:
- Initial sync of all talk IDs (one POST)
- Batch fetching details (15k+ talks in batches of 500)
- Client-side or server-side search/filter on the local dataset
- Periodic delta sync via `edition` parameter

The Android app proves this scales, but it's a bigger architectural change that trades HTML fragility for a local data management requirement.

## Sources

- Dharma Seed main feed: https://dharmaseed.org/feeds/recordings/
- Dharma Seed teacher feed (Jack Kornfield): https://dharmaseed.org/feeds/teacher/85/
- Dharma Seed retreat feed (Spirit Rock Monday/Wednesday): https://dharmaseed.org/feeds/retreat/94/
- Dharma Seed Android app: https://github.com/dharmaseed/dharmaseed-android
- Third-party API (dharma-api.com): https://github.com/tombh/dharma-api
