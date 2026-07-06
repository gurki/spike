import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

import { getDb } from "./db/init.js"
import { recordListen, setSyncState } from "./eventstore.js"

// Import a Spotify GDPR "extended streaming history" export - the only source
// for plays older than the api's ~50-item recently-played window. Entries
// look like:
//   { ts, ms_played, spotify_track_uri, master_metadata_track_name,
//     master_metadata_album_artist_name, master_metadata_album_album_name, ... }
// Deterministic ids make re-imports idempotent; a fuzzy window guards against
// near-duplicate timestamps between the export and live-captured plays.

const HISTORY_FILE = /^(Streaming_History_Audio.*|endsong.*|StreamingHistory.*)\.json$/

function historyFiles(path) {
    if (statSync(path).isFile()) return [path]
    return readdirSync(path)
        .filter((name) => HISTORY_FILE.test(name))
        .sort()
        .map((name) => join(path, name))
}

export function importHistory({ path, minMs = 30_000 } = {}) {
    if (!path) throw new Error("path required (file or directory of the extended streaming history export)")

    const db = getDb()
    const nearDuplicate = db.prepare(`
        SELECT 1 FROM events
        WHERE kind = 'listen' AND track_uri = @uri
          AND datetime(triggered_at) BETWEEN datetime(@ts, '-120 seconds') AND datetime(@ts, '+120 seconds')
        LIMIT 1
    `)

    const files = historyFiles(path)
    const result = { files: files.length, entries: 0, imported: 0, tooShort: 0, noUri: 0, nearDuplicates: 0 }

    for (const file of files) {
        const entries = JSON.parse(readFileSync(file, "utf8"))

        db.transaction(() => {
            for (const entry of entries) {
                result.entries++

                const uri = entry.spotify_track_uri ?? entry.spotifyTrackUri ?? null
                if (!uri) { result.noUri++; continue } // podcasts, videos, or basic (non-extended) export entries

                const playedMs = entry.ms_played ?? entry.msPlayed ?? 0
                if (playedMs < minMs) { result.tooShort++; continue }

                const ts = entry.ts ?? entry.endTime
                if (!ts) continue

                if (nearDuplicate.get({ uri, ts })) { result.nearDuplicates++; continue }

                const track = {
                    uri,
                    name: entry.master_metadata_track_name ?? entry.trackName ?? null,
                    artists: entry.master_metadata_album_artist_name
                        ? [{ name: entry.master_metadata_album_artist_name }]
                        : entry.artistName ? [{ name: entry.artistName }] : null,
                    album: entry.master_metadata_album_album_name
                        ? { name: entry.master_metadata_album_album_name }
                        : undefined,
                }

                const { inserted } = recordListen(ts, track, null)
                if (inserted) result.imported++
            }
        })()

        console.log(`📼 ${file}: ${result.imported} imported so far`)
    }

    setSyncState("last_history_import", new Date().toISOString())
    return result
}
