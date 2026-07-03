import Database from "better-sqlite3"
import { randomUUID } from "crypto"
import { existsSync } from "fs"
import { readFile } from "fs/promises"
import { resolve, join } from "path"

import { initSchema } from "./db/schema.js"
import { getDb } from "./db/init.js"
import { registerAdapter } from "./provider/adapter.js"
import "./provider/spotify.js"

initSchema()

// === Migration from legacy JSON/CSV ===

export async function migrateFromLegacy() {
    const db = getDb()

    // Check migrations table
    const applied = db.prepare("SELECT version FROM migrations WHERE version = 1").get()
    if (applied) {
        console.log("✅ migrations already applied")
        return
    }

    const dbDir = resolve(import.meta.dirname, "../../db")

    console.log("🧙 applying migration v1 ...")

    // 1. Migrate liked tracks
    const likedFile = join(dbDir, "liked.json")
    if (existsSync(likedFile)) {
        const liked = JSON.parse(await readFile(likedFile, "utf-8"))
        const insTrack = db.prepare(
            `INSERT OR IGNORE INTO tracks (id, uri, title, artists, album, release_date, duration_ms, external_refs)
             VALUES (@id, @uri, @title, @artists, @album, @release_date, @duration_ms, @external_refs)`
        ).get

        const insEvt = db.prepare(`
            INSERT INTO events (id, kind, track_id, triggered_at, context_type, context_uri, provider, raw_snapshot)
            VALUES (@evt_id, 'liked', @track_id, @triggered_at, 'saved', null, 'spotify', @raw)
        `).run

        const insMonthlyPT = db.prepare(`
            INSERT OR REPLACE INTO playlists (uri, provider, name, raw_snapshot, last_synced)
            VALUES (@uri, 'spotify', @name, @raw, @synced)
        `).run

        const insMonthlyEntry = db.prepare(`
            INSERT OR IGNORE INTO playlist_entries (id, track_id, playlist_uri, playlist_name, source_event_id, provider)
            VALUES (@id, @track_id, @playlist_uri, @playlist_name, @evt_id, 'spotify')
        `).run

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

            insTrack({ id, uri, title, artists, album, release_date, duration_ms, external_refs })

            const eventId = randomUUID()
            insEvt({
                evt_id: eventId,
                track_id: id,
                triggered_at: new Date(entry.added_at).toISOString(),
                raw: JSON.stringify(entry),
            })

            const month = entry.added_at.substring(0, 7)
            const playlistUri = `spotify:playlist:monthly_${month}`
            insMonthlyPT({
                uri: playlistUri,
                name: month,
                raw: JSON.stringify({created_from_migration: true}),
                synced: new Date().toISOString(),
            })
            insMonthlyEntry({
                id: randomUUID(),
                track_id: id,
                playlist_uri: playlistUri,
                playlist_name: month,
                evt_id: eventId,
            })
        }
        console.success(`📥 migrated ${liked.length} liked tracks`)
    }

    // 2. Migrate playlists
    const playlistsFile = join(dbDir, "playlists.json")
    if (existsSync(playlistsFile)) {
        const playlists = JSON.parse(await readFile(playlistsFile, "utf-8"))
        const insPt = db.prepare(
            `INSERT OR REPLACE INTO playlists (uri, provider, name, provider_playlist_id, raw_snapshot, last_synced)
             VALUES (@uri, 'spotify', @name, @pid, @raw, @synced)`
        ).run
        for (const pl of playlists) {
            const uri = `spotify:playlist:${pl.id}`
            insPt({ uri, name: pl.name, pid: pl.id, raw: JSON.stringify(pl), synced: new Date().toISOString() })
        }
        console.success(`📥 migrated ${playlists.length} playlists`)
    }

    // 3. Migrate history
    const historyFile = join(dbDir, "history.csv")
    if (existsSync(historyFile)) {
        const lines = (await readFile(historyFile, "utf-8")).trim().split('\n').slice(1)
        const insTrack = db.prepare(`
            INSERT OR IGNORE INTO tracks (id, uri, title, artists, album, duration_ms, external_refs)
            VALUES (@id, @uri, @title, @artists, @album, @duration_ms, @external_refs)`
        ).get
        const insEvt = db.prepare(`
            INSERT INTO events (id, kind, track_id, triggered_at, context_type, context_uri, provider, raw_snapshot)
            VALUES (@evt_id, 'heard', @track_id, @ts, @ctx_type, @ctx_uri, 'spotify', @raw)`
        ).run
        for (const line of lines) {
            const cols = line.split(',').map(c => c.replace(/^"|"$/g, ''))
            const ts = cols[0]
            const uri = cols[1] ?? null
            const id = randomUUID()
            insTrack({ id, uri, title: null, artists: null, album: null, duration_ms: null, external_refs: null })
            insEvt({ evt_id: randomUUID(), track_id: id, ts, ctx_type: 'playlist', ctx_uri: null, raw: JSON.stringify({history_row: cols}) })
        }
        console.success(`📥 migrated ${lines.length} history rows`)
    }

    // Mark migration v1 as complete
    db.prepare(`INSERT INTO migrations (version, name) VALUES (1, 'init_schema')`).run()
    console.success("✅ migration v1 complete")
}
