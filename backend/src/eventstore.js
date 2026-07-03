import { getDb } from "./db/init.js"
import { randomUUID } from "crypto"

const db = getDb()

const prepUpsTrack = db.prepare(`
    INSERT INTO tracks (id, uri, title, artists, album, release_date, duration_ms, external_refs)
    VALUES (@id, @uri, @title, @artists, @album, @release_date, @duration_ms, @external_refs)
    ON CONFLICT(uri) DO UPDATE SET
        title = COALESCE(excluded.title, title),
        artists = COALESCE(excluded.artists, artists),
        album = COALESCE(excluded.album, album),
        release_date = COALESCE(excluded.release_date, release_date),
        duration_ms = COALESCE(excluded.duration_ms, duration_ms),
        external_refs = COALESCE(excluded.external_refs, external_refs)
    RETURNING *
`).run

const prepInsEvent = db.prepare(`
    INSERT INTO events (id, kind, track_id, triggered_at, context_type, context_uri, provider, raw_snapshot)
    VALUES (@id, @kind, @track_id, @triggered_at, @context_type, @context_uri, @provider, @raw_snapshot)
`).run

const prepSelTrackByUri = db.prepare(`SELECT * FROM tracks WHERE uri = ?`).get

export function upsertTrack( trackUri, snapshot ) {
    const raw = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot
    const track = raw.track ?? raw

    const title = track.name ?? track.title ?? null
    const artists = track.artists ? JSON.stringify(track.artists.map(a => a.name ?? a)) : null
    const album = track.album?.name ?? null
    const release_date = track.album?.release_date ?? null
    const duration_ms = track.duration_ms ?? null

    const externalRefs = {}
    if (track.external_urls?.spotify) externalRefs.spotify = track.external_urls.spotify
    if (track.external_ids?.isrc) externalRefs.isrc = track.external_ids.isrc
    if (track.uri) externalRefs.uri = track.uri
    if (track.id) externalRefs.spotId = track.id

    return prepUpsTrack({
        id: randomUUID(),
        uri: trackUri,
        title,
        artists,
        album,
        release_date,
        duration_ms,
        external_refs: JSON.stringify(externalRefs),
    })
}

export function storeEvent(kind, trackUri, context, provider, rawSnapshot) {
    const existing = prepSelTrackByUri.get(trackUri)
    if (!existing) {
        upsertTrack(trackUri, rawSnapshot)
    }

    const track = prepSelTrackByUri.get(trackUri)
    if (!track) {
        throw new Error(`Failed to resolve track for URI: ${trackUri}`)
    }

    const raw = rawSnapshot
        ? (typeof rawSnapshot === 'string' ? rawSnapshot : JSON.stringify(rawSnapshot))
        : null

    const eventId = randomUUID()
    prepInsEvent.run({
        id: eventId,
        kind,
        track_id: track.id,
        triggered_at: new Date().toISOString(),
        context_type: context?.type ?? null,
        context_uri: context?.uri ?? null,
        provider,
        raw_snapshot: raw,
    })

    return eventId
}

const prepGetMonthly = db.prepare(`
    SELECT t.title, t.artists, t.uri as track_uri, t.album, t.duration_ms, t.release_date, p.playlist_uri, p.playlist_name, e.triggered_at
    FROM playlist_entries pe
    JOIN tracks t ON pe.track_id = t.id
    JOIN events e ON pe.source_event_id = e.id
    JOIN playlists p ON pe.playlist_uri = p.uri
    WHERE p.provider = ? AND pe.provider = ?
    AND (strftime('%Y-%m', e.triggered_at) = ? OR strftime('%Y-%m', pe.created_at) = ?)
    ORDER BY e.triggered_at DESC
`).all

export function getMonthlyTracks( month ) {
    if (month.startsWith('spotify:playlist:monthly_')) {
        const yearMonth = month.replace('spotify:playlist:monthly_', '')
        return prepGetMonthly('local', 'local', yearMonth, yearMonth)
    }
    return prepGetMonthly('spotify', 'spotify', month, month)
}

const prepGetHistory = db.prepare(`
    SELECT e.id, e.kind, e.triggered_at, e.context_type, e.context_uri, e.provider, e.raw_snapshot,
           t.id as track_id, t.title, t.artists, t.album, t.uri as track_uri, t.release_date, t.duration_ms
    FROM events e
    JOIN tracks t ON e.track_id = t.id
    WHERE e.kind = 'heard'
    ORDER BY e.triggered_at DESC
    LIMIT ?
`).all

export function getHistory(limit = 50) {
    return prepGetHistory.all(limit)
}
