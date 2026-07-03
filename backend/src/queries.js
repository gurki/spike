import { getDb } from "./db/init.js"
import { getSyncState } from "./eventstore.js"

export function getStats() {
    const db = getDb()

    const totals = db.prepare(`
        SELECT
            (SELECT COUNT(*) FROM tracks) AS tracks,
            (SELECT COUNT(*) FROM events WHERE kind = 'saved') AS saved,
            (SELECT COUNT(*) FROM events WHERE kind = 'listen') AS listens,
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

export function getTracks({ q = null, month = null, playlist = null, limit = 100, offset = 0 } = {}) {
    const like = q ? `%${q}%` : null

    // playlist=YYYY-MM: the actual cached contents of that monthly playlist
    if (playlist) {
        const tracks = getDb().prepare(`
            SELECT t.uri, t.title, t.artists, t.album_name, t.album_release_date,
                   t.duration_ms, t.explicit, t.is_local, t.artwork_sha256,
                   pi.added_at AS saved_at,
                   (SELECT COUNT(*) FROM events e WHERE e.track_uri = t.uri AND e.kind = 'listen') AS listen_count
            FROM playlist_items pi
            JOIN playlists p ON p.uri = pi.playlist_uri
            JOIN tracks t ON t.uri = pi.track_uri
            WHERE p.name = @playlist
              AND (@like IS NULL OR t.title LIKE @like OR t.artists LIKE @like OR t.album_name LIKE @like)
            ORDER BY pi.added_at
            LIMIT @limit OFFSET @offset
        `).all({ playlist, like, limit: Number(limit) || 100, offset: Number(offset) || 0 })
        return { tracks, total: tracks.length }
    }

    // month=YYYY-MM: tracks liked that month (desired state)
    const tracks = getDb().prepare(`
        SELECT t.uri, t.title, t.artists, t.album_name, t.album_release_date,
               t.duration_ms, t.explicit, t.is_local, t.artwork_sha256,
               MIN(CASE WHEN e.kind = 'saved' THEN e.triggered_at END) AS saved_at,
               COUNT(CASE WHEN e.kind = 'listen' THEN 1 END) AS listen_count
        FROM tracks t
        LEFT JOIN events e ON e.track_uri = t.uri
        WHERE (@like IS NULL OR t.title LIKE @like OR t.artists LIKE @like OR t.album_name LIKE @like)
        GROUP BY t.uri
        HAVING (@month IS NULL OR MAX(CASE WHEN e.kind = 'saved' AND e.month = @month THEN 1 END) = 1)
        ORDER BY saved_at DESC NULLS LAST
        LIMIT @limit OFFSET @offset
    `).all({ like, month, limit: Number(limit) || 100, offset: Number(offset) || 0 })

    const total = getDb().prepare("SELECT COUNT(*) n FROM tracks").get().n
    return { tracks, total }
}

export function getPlaylists() {
    return getDb().prepare(`
        SELECT p.name AS month, p.provider_playlist_id AS id, p.last_synced,
               (SELECT COUNT(*) FROM playlist_items pi WHERE pi.playlist_uri = p.uri) AS present,
               (SELECT COUNT(DISTINCT e.track_uri) FROM events e WHERE e.kind = 'saved' AND e.month = p.name) AS liked
        FROM playlists p
        WHERE p.name GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
        ORDER BY p.name DESC
    `).all()
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
