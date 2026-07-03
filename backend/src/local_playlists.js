import { getDb } from "./db/init.js"
import { randomUUID } from "crypto"

const db = getDb()

const preplUpsPT = db.prepare(`
    INSERT INTO playlists (uri, provider, name, provider_playlist_id, description, raw_snapshot, last_synced)
    VALUES (@uri, @provider, @name, @provider_playlist_id, @desc, @raw_snap, @synced)
    ON CONFLICT(uri) DO UPDATE SET
        name = COALESCE(excluded.name, name),
        provider_playlist_id = COALESCE(excluded.provider_playlist_id, provider_playlist_id),
        description = COALESCE(excluded.description, description),
        raw_snapshot = COALESCE(excluded.raw_snapshot, raw_snapshot),
        last_synced = excluded.last_synced
`).run

const prepInsEntry = db.prepare(`
    INSERT INTO playlist_entries (id, track_id, playlist_uri, playlist_name, source_event_id, provider, provider_playlist_id)
    VALUES (@id, @track_id, @playlist_uri, @playlist_name, @source_event_id, @provider, @provider_playlist_id)
    ON CONFLICT IGNORE
`).run

const prepSelTrackByUri = db.prepare(`SELECT id FROM tracks WHERE uri = ?`).get

export function storePlaylist(name, uri, provider, providerPlaylistId, description, rawSnapshot) {
    preplUpsPT({
        uri, provider, name, provider_playlist_id: providerPlaylistId,
        desc: description, raw_snap: typeof rawSnapshot === "string" ? rawSnapshot : JSON.stringify(rawSnapshot),
        synced: new Date().toISOString(),
    })
}

export function addMonthly( trackUri, month, eventId ) {
    const playlistUri = `spotify:playlist:monthly_${month}`
    storePlaylist(month, playlistUri, "local", null, null, null)

    const trackId = prepSelTrackByUri.get(trackUri)?.id
    if (!trackId) {
        console.warn(`⚠️ track not found for ${trackUri}`)
        return null
    }

    return prepInsEntry.run({
        id: randomUUID(),
        track_id: trackId,
        playlist_uri: playlistUri,
        playlist_name: month,
        source_event_id: eventId,
        provider: "local",
        provider_playlist_id: null,
    })
}

const prepGetAllPL = db.prepare(`SELECT * FROM playlists ORDER BY last_synced DESC, created_at DESC`).all

export function listLocalPlaylists() {
    return prepGetAllPL.all()
}

export function listLocalMonthlyUris() {
    const rows = listLocalPlaylists()
    return rows.filter(p => p.name && /^\d{4}-\d{2}$/.test(p.name)).map(p => p.uri)
}
