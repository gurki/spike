# spike 🦔
a spotify **watchdog** and **database** for **likes ❤️** and track **history ⏳**.

spike watches your spotify account, records every like and play as an event in
a local sqlite database, keeps monthly playlists (`YYYY-MM`) in sync with your
liked songs, and can rebuild its entire database from the spotify api at any
time. the database is the journal; spotify is the source of truth.

## Setup
create an app for the spotify [Web API](https://developer.spotify.com/documentation/web-api) on your spotify developer dashboard

```
App Name:        my spike app
App Description: watchdog for likes ❤️ and track history ⏳
Redirect URI:    http://127.0.0.1:8888/callback
```

copy `/backend/.env.example` to `/backend/.env` and add your [client credentials](https://developer.spotify.com/documentation/web-api/concepts/authorization).

```env
PORT=8888

CLIENT_ID="YOUR_SPOTIFY_CLIENT_ID"
CLIENT_SECRET="YOUR_SPOTIFY_CLIENT_SECRET"

LIKES_INTERVAL_S=60
HISTORY_INTERVAL_S=60
```

## Run (Docker, recommended for the server)

```sh
cd backend
docker compose up -d --build
```

the `backend/db` directory (sqlite database, artwork, auth tokens) is
bind-mounted and persists across rebuilds. deploying an update is
`git pull && docker compose up -d --build`.

## Run (bare metal)

executed with [bun](https://bun.sh); the code itself uses standard node APIs.

```sh
cd backend
bun install
bun index.js        # or: bun --watch index.js for development
```

a systemd unit for running without docker is in `deploy/spike.service`.

## Authorization

log in once at http://127.0.0.1:8888/login. tokens are stored in
`backend/db/auth.json` and refreshed automatically.

## Commands

the running daemon is the single executor; the `spike` cli is a thin http
client (`SPIKE_URL` to target a remote instance, default `http://127.0.0.1:8888`).

```sh
bun cli.js sync-likes         # rebuild/refresh all likes from the spotify api
bun cli.js reconcile --dry-run          # per-month drift report, no changes
bun cli.js reconcile --since 2026-04    # add missing likes to monthly playlists
bun cli.js reconcile --month 2026-05    # single month
bun cli.js reconcile --prune            # also remove non-liked extras (default: keep)
bun cli.js verify             # consistency + integrity checks, exit 2 on drift
bun cli.js hydrate            # backfill track metadata + album artwork
bun cli.js stats              # totals, likes per month, top artists
bun cli.js events --month 2026-06 --kind saved
```

remote example from another machine on the LAN:

```sh
SPIKE_URL=http://nuc:8888 bun cli.js verify
```

or plain http: `curl -X POST http://nuc:8888/ops/sync-likes`.

a nightly consistency check via cron:

```cron
15 4 * * * curl -sf -X POST http://127.0.0.1:8888/ops/verify | grep -q '"ok":true' || echo "spike drift" | mail -s spike you@example.com
```

## How it works

### Reconciliation, not bookkeeping

monthly playlists are kept in sync by comparing **desired state** (liked
tracks grouped by the calendar month of `added_at`, Europe/Berlin time)
against **actual state** (the real playlist contents) and adding whatever is
missing. catching up on missed months, healing drift, and live operation are
all the same code path. reconcile is **additive-only**: tracks you removed
from a playlist by hand, or unliked later, are reported but never touched
(`--prune` opts into exact matching per run).

### Events

every observation is an event row with a **deterministic id** derived from
its natural key (`provider|kind|timestamp|track`), so re-running any sync or
rebuilding the database from scratch never creates duplicates:

- `saved` - a like, timestamped with spotify's `added_at`
- `heard` - a play from recently-played, timestamped with `played_at`
- `playlist-added` - a track landing in a monthly playlist (also backfilled
  from spotify's own `added_at` when playlists are scanned)

### Rebuild from the source of truth

`sync-likes` refetches the entire library; deterministic ids make it
idempotent. delete `db/spike.db` and everything except play history is fully
reconstructed from the api. **limitation:** spotify only exposes the last ~50
recently-played tracks, so `heard` history is live-capture only - keep the
daemon running.

the one exception: your **full lifetime play history** can be rebuilt from
spotify's gdpr export. request the **extended streaming history** under
[account privacy settings](https://www.spotify.com/account/privacy/) (arrives
by email within ~30 days), unzip it somewhere the daemon can read, and run

```sh
bun cli.js import-history --path /path/to/my_spotify_data
```

plays shorter than 30s are skipped (`--min-ms` to change), entries without a
track uri (podcasts, or the basic non-extended export) are ignored, and a
±2 minute fuzzy window prevents duplicates where the export overlaps
live-captured plays. re-importing is a no-op. run `hydrate` afterwards to
fill in metadata and artwork for historical tracks.

### Watchers

the daemon polls likes and recently-played every `*_INTERVAL_S` seconds,
records events, and triggers a debounced reconcile of the affected month.
watcher cursors persist in the database, so likes during downtime are picked
up on the next poll or `sync-likes`.

### Artwork

`hydrate` downloads each album's cover (largest size) once into a
content-addressed store (`db/artwork/sha256/<aa>/<bb>/<hash>`, the same
layout as the journey blob store, no extensions - content type lives in the
database) and links tracks to it - ready to be pushed as blobs to a future
journey server.

## Endpoints

- `GET /browse` - searchable cover grid of all tracks (open in a browser)
- `GET /healthz` - liveness
- `GET /stats` - totals, likes per month, top artists, last sync times
- `GET /events?month=&kind=&limit=` - event log
- `GET /tracks?q=&limit=&offset=` - track details incl. saved date + play count
- `GET /artwork/<sha256>` - album cover from the content-addressed store
- `POST /ops/sync-likes | /ops/reconcile | /ops/verify` - operations (query
  params: `dry-run`, `prune`, `month`, `since`, `strict`, `deep`)
- `POST /ops/hydrate` + `GET /ops/jobs/:id` - long-running hydration
- `GET /login`, `GET /callback` - spotify oauth

## Storage

everything lives in `backend/db`:

- `spike.db` - sqlite database (tracks, events, playlist cache, sync state)
- `artwork/` - content-addressed album covers
- `auth.json` - spotify oauth tokens
- `liked.json`, `playlists.json`, `history.csv` - legacy files from the
  pre-sqlite era, kept untouched; not read by the current code

sqlite driver: `bun:sqlite` under bun, `better-sqlite3` under node ≥ 18 - the
single runtime-specific module is `src/db/driver.js`.
