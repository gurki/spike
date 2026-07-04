import { getDb } from "./db/init.js"
import { canonicalUri } from "./canonical.js"
import { localMonth, localTime, TIME_ZONE } from "./time.js"
import { deterministicUlid, savedKey, listenKey, playlistAddedKey } from "./ids.js"

let statements = null

function prepare() {
    if (statements) return statements
    const db = getDb()

    statements = {
        db,

        upsertTrack: db.prepare(`
            INSERT INTO tracks (
                uri, title, artists, album_name, album_type, album_total_tracks,
                album_release_date, duration_ms, isrc, explicit, track_number,
                disc_number, is_local
            ) VALUES (
                @uri, @title, @artists, @album_name, @album_type, @album_total_tracks,
                @album_release_date, @duration_ms, @isrc, @explicit, @track_number,
                @disc_number, @is_local
            )
            ON CONFLICT(uri) DO UPDATE SET
                title = COALESCE(excluded.title, title),
                artists = COALESCE(excluded.artists, artists),
                album_name = COALESCE(excluded.album_name, album_name),
                album_type = COALESCE(excluded.album_type, album_type),
                album_total_tracks = COALESCE(excluded.album_total_tracks, album_total_tracks),
                album_release_date = COALESCE(excluded.album_release_date, album_release_date),
                duration_ms = COALESCE(excluded.duration_ms, duration_ms),
                isrc = COALESCE(excluded.isrc, isrc),
                explicit = COALESCE(excluded.explicit, explicit),
                track_number = COALESCE(excluded.track_number, track_number),
                disc_number = COALESCE(excluded.disc_number, disc_number)
        `),

        insertEvent: db.prepare(`
            INSERT OR IGNORE INTO events (
                id, natural_key, kind, track_uri, triggered_at, month, local_time, tz,
                context_type, context_uri, provider, raw_snapshot
            ) VALUES (
                @id, @natural_key, @kind, @track_uri, @triggered_at, @month, @local_time, @tz,
                @context_type, @context_uri, @provider, @raw_snapshot
            )
        `),

        trackExists: db.prepare("SELECT 1 FROM tracks WHERE uri = ?"),
        insertTrackStub: db.prepare("INSERT OR IGNORE INTO tracks (uri, is_local) VALUES (?, ?)"),
    }

    return statements
}

// Map a raw Spotify track object onto stable fields only. Volatile provider
// fields (popularity, available_markets, preview_url) are excluded by design.
export function trackRow(rawTrack) {
    return {
        uri: canonicalUri(rawTrack),
        title: rawTrack.name ?? null,
        artists: rawTrack.artists ? JSON.stringify(rawTrack.artists.map((a) => a.name)) : null,
        album_name: rawTrack.album?.name ?? null,
        album_type: rawTrack.album?.album_type ?? null,
        album_total_tracks: rawTrack.album?.total_tracks ?? null,
        album_release_date: rawTrack.album?.release_date ?? null,
        duration_ms: rawTrack.duration_ms ?? null,
        isrc: rawTrack.external_ids?.isrc ?? null,
        explicit: rawTrack.explicit == null ? null : Number(rawTrack.explicit),
        track_number: rawTrack.track_number ?? null,
        disc_number: rawTrack.disc_number ?? null,
        is_local: Number(Boolean(rawTrack.is_local)),
    }
}

export function upsertTrack(rawTrack) {
    const stmts = prepare()
    const row = trackRow(rawTrack)
    if (!row.uri) throw new Error("track has no uri")
    stmts.upsertTrack.run(row)
    return row.uri
}

function insertEvent(stmts, { kind, naturalKey, trackUri, triggeredAt, contextType, contextUri, rawSnapshot }) {
    const result = stmts.insertEvent.run({
        id: deterministicUlid(triggeredAt, naturalKey),
        natural_key: naturalKey,
        kind,
        track_uri: trackUri,
        triggered_at: triggeredAt,
        month: localMonth(triggeredAt),
        local_time: localTime(triggeredAt),
        tz: TIME_ZONE,
        context_type: contextType ?? null,
        context_uri: contextUri ?? null,
        provider: "spotify",
        raw_snapshot: rawSnapshot ? JSON.stringify(rawSnapshot) : null,
    })
    return result.changes > 0
}

// addedAt / playedAt are provider timestamps, VERBATIM - they are the id basis.

export function recordSaved(addedAt, rawTrack) {
    const stmts = prepare()
    const uri = upsertTrack(rawTrack)
    const inserted = insertEvent(stmts, {
        kind: "saved",
        naturalKey: savedKey(addedAt, uri),
        trackUri: uri,
        triggeredAt: addedAt,
    })
    return { uri, inserted }
}

export function recordListen(playedAt, rawTrack, context = null) {
    const stmts = prepare()
    const uri = upsertTrack(rawTrack)
    const inserted = insertEvent(stmts, {
        kind: "listen",
        naturalKey: listenKey(playedAt, uri),
        trackUri: uri,
        triggeredAt: playedAt,
        contextType: context?.type ?? null,
        contextUri: context?.uri ?? null,
    })
    return { uri, inserted }
}

export function recordPlaylistAdded(addedAt, trackUri, playlistUri) {
    const stmts = prepare()
    if (!stmts.trackExists.get(trackUri)) {
        stmts.insertTrackStub.run(trackUri, Number(trackUri.startsWith("spotify:local:")))
    }
    const inserted = insertEvent(stmts, {
        kind: "playlist-added",
        naturalKey: playlistAddedKey(addedAt, trackUri),
        trackUri,
        triggeredAt: addedAt,
        contextType: "playlist",
        contextUri: playlistUri,
    })
    return { inserted }
}

// Bulk import of a full likes fetch inside one transaction.
export function recordAllSaved(items) {
    const stmts = prepare()
    let inserted = 0
    stmts.db.transaction(() => {
        for (const item of items) {
            if (recordSaved(item.added_at, item.track).inserted) inserted++
        }
    })()
    return { total: items.length, inserted }
}

export function getSyncState(key) {
    return prepare().db.prepare("SELECT value FROM sync_state WHERE key = ?").get(key)?.value ?? null
}

export function setSyncState(key, value) {
    prepare().db.prepare(`
        INSERT INTO sync_state (key, value, updated_at) VALUES (?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, String(value))
}
