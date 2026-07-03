import { getDb } from "./db/init.js"
import { getSyncState } from "./eventstore.js"

export function getStats() {
    const db = getDb()

    const totals = db.prepare(`
        SELECT
            (SELECT COUNT(*) FROM tracks) AS tracks,
            (SELECT COUNT(*) FROM events WHERE kind = 'saved') AS saved,
            (SELECT COUNT(*) FROM events WHERE kind = 'heard') AS heard,
            (SELECT COUNT(*) FROM events WHERE kind = 'playlist-added') AS playlistAdded
    `).get()

    const likesPerMonth = db.prepare(`
        SELECT month, COUNT(*) AS likes
        FROM events WHERE kind = 'saved'
        GROUP BY month ORDER BY month
    `).all()

    const topArtists = db.prepare(`
        SELECT je.value AS artist, COUNT(*) AS likes
        FROM events e
        JOIN tracks t ON t.uri = e.track_uri, json_each(t.artists) je
        WHERE e.kind = 'saved'
        GROUP BY je.value ORDER BY likes DESC LIMIT 20
    `).all()

    return {
        totals,
        likesPerMonth,
        topArtists,
        lastFullLikesSync: getSyncState("last_full_likes_sync"),
        lastReconcile: getSyncState("last_reconcile"),
    }
}

export function getTracks({ q = null, limit = 100, offset = 0 } = {}) {
    const like = q ? `%${q}%` : null
    const tracks = getDb().prepare(`
        SELECT t.uri, t.title, t.artists, t.album_name, t.album_release_date,
               t.duration_ms, t.explicit, t.is_local, t.artwork_sha256,
               MIN(CASE WHEN e.kind = 'saved' THEN e.triggered_at END) AS saved_at,
               COUNT(CASE WHEN e.kind = 'heard' THEN 1 END) AS heard_count
        FROM tracks t
        LEFT JOIN events e ON e.track_uri = t.uri
        WHERE (@like IS NULL OR t.title LIKE @like OR t.artists LIKE @like OR t.album_name LIKE @like)
        GROUP BY t.uri
        ORDER BY saved_at DESC NULLS LAST
        LIMIT @limit OFFSET @offset
    `).all({ like, limit: Number(limit) || 100, offset: Number(offset) || 0 })

    const total = getDb().prepare("SELECT COUNT(*) n FROM tracks").get().n
    return { tracks, total }
}

export function getArtwork(sha256) {
    return getDb().prepare("SELECT path, content_type FROM artwork WHERE sha256 = ?").get(sha256) ?? null
}

export function getEvents({ month = null, kind = null, limit = 50 } = {}) {
    const events = getDb().prepare(`
        SELECT e.id, e.kind, e.triggered_at, e.month, e.context_type, e.context_uri,
               e.track_uri, t.title, t.artists
        FROM events e
        JOIN tracks t ON t.uri = e.track_uri
        WHERE (@kind IS NULL OR e.kind = @kind)
          AND (@month IS NULL OR e.month = @month)
        ORDER BY e.triggered_at DESC
        LIMIT @limit
    `).all({ month, kind, limit: Number(limit) || 50 })

    return { events }
}
