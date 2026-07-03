# Spike: Phase 1-3 Implementation Plan

## Overview
Re-architect spike from Spotify-centric file storage to provider-neutral local-first SQLite architecture.

## Phase 1: Provider-neutral schema & migration

### 1a. Schema (`backend/src/db/schema.sql`)
- `tracks` table: id (UUID PK), uri (TEXT UNIQUE - provider-neutral identifier), title, artists (TEXT[]), album, external_refs (JSONB), created_at
- `events` table: id (UUID PK), kind (heard/liked/added_to_playlist), triggered_at, context_type, context_uri, provider, raw_snapshot (JSONB), created_at
- `playlist_entries` table: id (UUID PK), track_id (FK→tracks), playlist_uri, playlist_name, source_event_id (FK→events, UNIQUE), created_at
- `playlists` table: uri (PK), provider, name, provider_playlist_id, raw_snapshot (JSONB), last_synced
- `metadata_enrichments` table: track_id (FK), isrc, musicbrainz_id, artwork_url, cached_at
- `migrations` table: version (PK), applied_at

Key design: tracks.id is internal UUID, not Spotify ID. Spotify IDs live in tracks.uri and external_refs.

### 1b. Migration v1 (`backend/src/migrations/001.js`)
- Reads `db/liked.json`, `db/playlists.json`, `db/history.csv`
- Upserts into new schema, idempotent via unique constraints

### 1c. Dependency
- Add `better-sqlite3` to package.json

## Phase 2: Event-driven core

### 2a. Event Store (`backend/src/eventstore.js`)
- `addEvent(kind, trackUri, context, provider, rawSnapshot)` - write to events table
- `getOrCreateTrack(externalRefs)` - upsert track returning id
- `recordHear(trackUri, context)` - adds event + playlist entries
- `recordLike(trackUri, context)` - adds event 
- `recordPlaylistAdd(trackUri, playlistUri, context)` - adds event + playlist entry
- All inserts are `INSERT OR IGNORE` for idempotency

### 2b. Provider adapter interface (`backend/src/provider/adapter.js`)
- Abstract: `fetchLikes()`, `fetchHistory()`, `fetchPlaylists()`, `createMonthlyPlaylist()`
- `adapterRegistry.register('spotify', adapter)` pattern

### 2c. Spotify adapter (`backend/src/provider/spotify.js`)
- Implements adapter interface using existing Spotify API calls
- Routes results through event store

### 2d. Watcher rewrite (`backend/src/watcher.js`)
- Base `TrackWatcher` emits `event` with `kind, trackUri, context, provider`
- `index.js` wires: `watcher.on("event", ev => EventStore.addEvent(ev))`

## Phase 3: Local-first monthly playlists + optional sync

### 3a. Local playlists (`backend/src/local_playlists.js`)
- Monthly playlists stored in SQLite via `playlist_entries` table
- `getTracksForMonth(YYYY-MM)` queries DB directly
- Spotify playlist becomes optional output target

### 3b. Optional Spotify mirror
- After recording like locally, optionally sync to Spotify monthly playlist
- Preserves `STARTUP_FETCH_ALL` semantics

## Implementation Order
1c → 1a → 1b → 2a → 2b → 2c → 2d → 3a → 3b → rewire index.js → test
