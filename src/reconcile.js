import { getDb } from "./db/init.js"
import { getAdapter } from "./provider/adapter.js"
import { recordPlaylistAdded, setSyncState } from "./eventstore.js"

const MONTHLY_NAME = /^\d{4}-\d{2}$/

// --- desired state: liked tracks grouped by Berlin month -----------------

// A human cannot individually like BULK_THRESHOLD songs within one second;
// identical added_at timestamps mean an album save (pre-2019 spotify saved
// all album tracks to liked songs) or a bulk library import. Those stay in
// the event log but are excluded from monthly playlists by default.
const BULK_THRESHOLD = Number(process.env.BULK_THRESHOLD) || 5

export function desiredByMonth(month = null, { includeBulk = false } = {}) {
    const rows = getDb().prepare(`
        SELECT e.month, e.track_uri, e.triggered_at AS added_at, t.is_local,
               COUNT(*) OVER (PARTITION BY e.triggered_at) AS cluster
        FROM events e
        JOIN tracks t ON t.uri = e.track_uri
        WHERE e.kind = 'saved' AND (@month IS NULL OR e.month = @month)
        ORDER BY e.month, added_at
    `).all({ month })

    const months = new Map()
    for (const row of rows) {
        if (!months.has(row.month)) months.set(row.month, { desired: new Map(), localSkipped: [], bulkSkipped: [] })
        const bucket = months.get(row.month)
        if (bucket.desired.has(row.track_uri) || bucket.localSkipped.includes(row.track_uri)
            || bucket.bulkSkipped.includes(row.track_uri)) continue // earliest event per month wins
        if (row.is_local) {
            bucket.localSkipped.push(row.track_uri) // Web API cannot add local files
        } else if (!includeBulk && row.cluster >= BULK_THRESHOLD) {
            bucket.bulkSkipped.push(row.track_uri)
        } else {
            bucket.desired.set(row.track_uri, row.added_at)
        }
    }
    return months
}

// --- actual state: monthly playlists via snapshot cache ------------------

function playlistStore(db) {
    return {
        upsert: db.prepare(`
            INSERT INTO playlists (uri, provider_playlist_id, name, snapshot_id, last_synced)
            VALUES (@uri, @id, @name, @snapshotId, datetime('now'))
            ON CONFLICT(uri) DO UPDATE SET
                name = excluded.name,
                snapshot_id = excluded.snapshot_id,
                last_synced = excluded.last_synced
        `),
        getSnapshot: db.prepare("SELECT snapshot_id FROM playlists WHERE uri = ?"),
        cachedItems: db.prepare("SELECT track_uri, added_at FROM playlist_items WHERE playlist_uri = ?"),
        clearItems: db.prepare("DELETE FROM playlist_items WHERE playlist_uri = ?"),
        insertItem: db.prepare(`
            INSERT OR IGNORE INTO playlist_items (playlist_uri, track_uri, added_at)
            VALUES (?, ?, ?)
        `),
    }
}

// Fetch a playlist's items (respecting the snapshot cache), refresh the cache,
// and record playlist-added events - deterministic natural keys make this
// idempotent, so every refetch also backfills history.
async function loadPlaylistItems(adapter, store, playlist, { refresh }) {
    const cachedSnapshot = store.getSnapshot.get(playlist.uri)?.snapshot_id

    if (!refresh && cachedSnapshot === playlist.snapshotId) {
        return store.cachedItems.all(playlist.uri).map((r) => ({ uri: r.track_uri, addedAt: r.added_at }))
    }

    const items = await adapter.fetchPlaylistItems(playlist.id)
    const db = getDb()
    db.transaction(() => {
        store.upsert.run({
            uri: playlist.uri,
            id: playlist.id,
            name: playlist.name,
            snapshotId: playlist.snapshotId ?? null,
        })
        store.clearItems.run(playlist.uri)
        for (const item of items) {
            store.insertItem.run(playlist.uri, item.uri, item.addedAt)
            recordPlaylistAdded(item.addedAt, item.uri, playlist.uri)
        }
    })()

    return items
}

// --- diff (pure) ----------------------------------------------------------

export function diffMonth(desired, actualUris) {
    const actual = new Set(actualUris)
    const missing = [...desired.keys()].filter((uri) => !actual.has(uri))
    const extra = [...actual].filter((uri) => !desired.has(uri))
    return { missing, extra }
}

// --- reconcile ------------------------------------------------------------

export async function reconcile({ month = null, since = null, dryRun = false, prune = false, refresh = false, includeBulk = false } = {}) {
    const adapter = getAdapter(process.env.PROVIDER || "spotify")
    const db = getDb()
    const store = playlistStore(db)

    const desired = desiredByMonth(month, { includeBulk })
    const playlists = await adapter.fetchPlaylists()
    const monthlies = new Map(playlists.filter((p) => MONTHLY_NAME.test(p.name)).map((p) => [p.name, p]))

    // months with likes plus monthly-named playlists that exist anyway
    const months = [...new Set([...desired.keys(), ...monthlies.keys()])]
        .filter((m) => !month || m === month)
        .filter((m) => !since || m >= since)
        .sort()

    const report = []
    let added = 0
    let removed = 0

    for (const m of months) {
        const bucket = desired.get(m) ?? { desired: new Map(), localSkipped: [], bulkSkipped: [] }
        let playlist = monthlies.get(m) ?? null

        const actualItems = playlist ? await loadPlaylistItems(adapter, store, playlist, { refresh }) : []
        const { missing, extra } = diffMonth(bucket.desired, actualItems.map((i) => i.uri))

        if (!dryRun && missing.length > 0) {
            if (!playlist) {
                playlist = await adapter.createMonthlyPlaylist(m)
                monthlies.set(m, playlist)
            }
            const sorted = missing.sort((a, b) => bucket.desired.get(a) < bucket.desired.get(b) ? -1 : 1)
            await adapter.addTracksToPlaylist(playlist.id, sorted)
            added += sorted.length
        }

        if (!dryRun && prune && extra.length > 0 && playlist) {
            await adapter.removeTracksFromPlaylist(playlist.id, extra)
            removed += extra.length
        }

        if (!dryRun && playlist && (missing.length > 0 || (prune && extra.length > 0))) {
            // refresh cache + playlist-added events after mutation; snapshot is
            // marked stale (null) so the next reconcile re-verifies it cheaply
            await loadPlaylistItems(adapter, store, { ...playlist, snapshotId: null }, { refresh: true })
        }

        report.push({
            month: m,
            playlistId: playlist?.id ?? null,
            liked: bucket.desired.size,
            present: actualItems.length,
            missing,
            extra,
            localSkipped: bucket.localSkipped,
            bulkSkipped: bucket.bulkSkipped,
        })
    }

    if (!dryRun) setSyncState("last_reconcile", new Date().toISOString())

    return { months: report, applied: dryRun ? null : { added, removed } }
}
