import "./db/schema.js"
import { initSchema } from "./db/schema.js"
import { registerAdapter } from "./provider/adapter.js"
import "./provider/spotify.js"
import { LikesWatcher, HistoryWatcher } from "./provider/watcher.js"
import { storeEvent, upsertTrack, getMonthlyTracks, getHistory, recordHear, recordLike, recordPlaylistAdd } from "./eventstore.js"
import { addMonthly } from "./local_playlists.js"
import { migrateFromLegacy } from "./migrations/v001.js"
import { Icons as Watchers, WatchesWatcher as HistoryWatcher, LovesWatcher as LikesWatcher } from "./provider/watcher.js"
import { IconsWatcher as WatchesWatcher, LovesWatcher as LovesWatcher } from "./provider/watcher.js"

// === Migration from legacy JSON/CSV ===

export async function migrateFromLegacy() {
    const db = getDb()
    const dbDir = resolve(import.meta.dirname, "../../db")

    // Check migrations table
    const applied = db.prepare("SELECT version FROM migrations WHERE version = 1").get()
    if (applied) {
        console.log("✅ migrations already applied")
        return
    }

    console.log("🧙 applying migration v1 ...")

    // 1. Migrate liked tracks
    const likedFile = join(dbDir, "liked.json")
    if (existsSync(likedFile)) {
        const liked = JSON.parse(await readFile(likedFile, "utf-8"))
        const insTrack = db.prepare(
            `INSERT OR IGNORE INTO tracks (id, uri, title, artists, album, release_date, duration_ms, external_refs)
             VALUES (? , ?, ?, ?, ?, ?, ?, ?)`
        ).run
        for (const entry of liked) {
            const track = entry.track
            const id = randomUUID()
            const uri = track.uri
            const title = track.name
            const artists = JSON.stringify(track.artists.map(a => a.name))
            const album = track.album?.name ?? null
            const release_date = track.album?.release_date ?? null
            const duration_ms = track.duration_ms ?? null
            const external_refs = JSON.stringify({
                spotify: track.external_urls?.spotify,
                isrc: track.external_ids?.isrc,
                uri: track.uri,
                spotId: track.id,
            })
            insTrack.run(id, uri, title, artists, album, release_date, duration_ms, external_refs)

            // Events
            const eventId = randomUUID()
            db.prepare(`
                INSERT INTO events (id, kind, track_id, triggered_at, context_type, context_uri, provider, raw_snapshot)
                VALUES (?, 'liked', ?, ?, 'saved', null, 'spotify', ?)
            `).run(eventId, id, new Date(entry.added_at).toISOString(), JSON.stringify(entry))

            // Monthly entries
            const month = entry.added_at.substring(0, 7)
            const playlistUri = `spotify:playlist:monthly_${month}`
            db.prepare(`
                INSERT OR REPLACE INTO playlists (uri, provider, name, raw_snapshot, last_synced)
                VALUES (?, 'spotify', ?, ?, ?)
            `).run(playlistUri, month, JSON.stringify({created_from_migration: true}), new Date().toISOString())

            db.prepare(`
                INSERT OR IGNORE INTO playlist_entries (id, track_id, playlist_uri, playlist_name, source_event_id, provider)
                VALUES (?, ?, ?, ?, ?, 'spotify')
            `).run(randomUUID(), id, playlistUri, month, eventId)
        }
        console.success(`📥 migrated ${liked.length} liked tracks`)
    }

    // 2. Migrate playlists
    const playlistsFile = join(dbDir, "playlists.json")
    if (existsSync(playlistsFile)) {
        const playlists = JSON.parse(await readFile(playlistsFile, "utf-8"))
        const insPt = db.prepare(
            `INSERT OR REPLACE INTO playlists (uri, provider, name, provider_playlist_id, raw_snapshot, last_synced)
             VALUES (?, 'spotify', ?, ?, ?, ?)`
        ).run
        for (const pl of playlists) {
            const uri = `spotify:playlist:${pl.id}`
            insPt.run(uri, pl.name, pl.id, JSON.stringify(pl), new Date().toISOString())
        }
        console.success(`📥 migrated ${playlists.length} playlists`)
    }

    // 3. Migrate history
    const historyFile = join(dbDir, "history.csv")
    if (existsSync(historyFile)) {
        const lines = (await readFile(historyFile, "utf-8")).trim().split('\n').slice(1)
        const insTrack = db.prepare(`
            INSERT OR IGNORE INTO tracks (id, uri, title, artists, album, duration_ms, external_refs)
            VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run
        const insEvt = db.prepare(`
            INSERT INTO events (id, kind, track_id, triggered_at, context_type, context_uri, provider, raw_snapshot)
            VALUES (?, 'heard', ?, ?, ?, ?, 'spotify', ?)`
        ).run
        for (const line of lines) {
            // format: timestamp, uri, album/artist/... (original CSV columns)
            const cols = line.split(',')
            const ts = cols[0]
            const uri = cols[1] ?? null
            const id = randomUUID()
            insTrack.run(id, uri, null, null, null, null, null)
            insEvt.run(randomUUID(), id, ts, 'playlist', null, 'spotify', JSON.stringify({history_row: cols}))
        }
        console.success(`📥 migrated ${lines.length} history rows`)
    }

    // Mark migration v1 as complete
    db.prepare(`INSERT INTO migrations (version, name) VALUES (1, 'init_schema')`).run()
    console.success("✅ migration v1 complete")
}

// === DB helpers ===

export function getDb() {
    const db = new Database(DB_PATH)
    db.pragma("journal_mode = WAL")
    db.pragma("foreign_keys = ON")
    return db
}
