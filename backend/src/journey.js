import { readFileSync } from "node:fs"

import { getDb } from "./db/init.js"
import { getSyncState, setSyncState } from "./eventstore.js"
import { entityUlid } from "./ids.js"

// Push spike's canonical data to a journey server as music.* items over the
// normal sync api. Item ids are deterministic (event ids are already journey
// ulids; track ids derive from the provider uri), so pushes are idempotent
// and re-runnable - the server absorbs duplicates.

const JOURNEY_URL = () => process.env.JOURNEY_URL || "http://127.0.0.1:8090"
const CLIENT_VERSION = "0.2.0"

function config() {
    const token = process.env.JOURNEY_TOKEN
    const clientId = process.env.JOURNEY_CLIENT_ID
    if (!token || !clientId) throw new Error("JOURNEY_TOKEN and JOURNEY_CLIENT_ID must be set")
    return { url: JOURNEY_URL(), token, clientId }
}

const toIso = (s) => s.includes("T") ? s : s.replace(" ", "T") + "Z"

function source(clientId) {
    return {
        clientId,
        client: "journey-spotify-watcher",
        clientVersion: CLIENT_VERSION,
        provider: "spotify",
    }
}

// --- item builders ---------------------------------------------------------

export const trackItemId = (uri) => entityUlid(`spotify|${uri}`)

function trackItem(row, artwork, clientId) {
    const created = toIso(row.created_at)
    const item = {
        id: trackItemId(row.uri),
        type: "music.track",
        schemaVersion: "1",
        ts: created,
        createdAt: created,
        updatedAt: toIso(row.hydrated_at ?? row.created_at),
        source: source(clientId),
        data: {
            title: row.title,
            artists: JSON.parse(row.artists).map((name) => ({ name })),
            providerIds: { spotify: row.uri },
            ...(row.album_name && {
                album: {
                    title: row.album_name,
                    ...(row.album_type && { albumType: row.album_type }),
                    ...(row.album_total_tracks != null && { totalTracks: row.album_total_tracks }),
                    ...(row.album_release_date && { releaseDate: row.album_release_date }),
                },
            }),
            ...(row.duration_ms != null && { durationMs: row.duration_ms }),
            ...(row.isrc && { isrc: row.isrc }),
            ...(row.explicit != null && { explicit: Boolean(row.explicit) }),
            ...(row.track_number != null && { trackNumber: row.track_number }),
            ...(row.disc_number != null && { discNumber: row.disc_number }),
        },
    }
    if (artwork) {
        item.attachments = [{
            id: `sha256:${artwork.sha256}`,
            mime: artwork.content_type ?? "image/jpeg",
            size: artwork.bytes,
            role: "artwork",
        }]
    }
    return item
}

function eventItem(event, track, playlistName, clientId) {
    const ts = event.triggered_at
    const trackRef = {
        title: track.title,
        artists: JSON.parse(track.artists),
        providerUri: track.uri,
    }

    const base = {
        ts,
        createdAt: ts,
        updatedAt: ts,
        source: source(clientId),
        ...(event.tz && { tz: event.tz }),
    }

    if (event.kind === "listen") {
        const startedAt = track.duration_ms
            ? new Date(Date.parse(ts) - track.duration_ms).toISOString()
            : ts
        return {
            ...base,
            id: event.id,
            type: "music.listen",
            schemaVersion: "1",
            data: {
                startedAt,
                endedAt: ts,
                provider: "spotify",
                track: { ...trackRef, ...(track.duration_ms != null && { durationMs: track.duration_ms }) },
                ...(event.context_type && event.context_uri && {
                    context: { type: event.context_type, providerUri: event.context_uri },
                }),
                confidence: "inferred",
            },
        }
    }

    // saved / playlist-added -> music.library_event
    const data = {
        event: event.kind,
        provider: "spotify",
        track: trackRef,
    }
    if (event.kind === "playlist-added" && event.context_uri) {
        data.playlist = {
            providerUri: event.context_uri,
            ...(playlistName && { name: playlistName }),
            ...(playlistName && /^\d{4}-\d{2}$/.test(playlistName) && { purpose: "monthly-liked" }),
        }
    }
    return { ...base, id: event.id, type: "music.library_event", schemaVersion: "1", data }
}

// --- transport ---------------------------------------------------------------

async function api(cfg, method, path, body, headers = {}) {
    const res = await fetch(cfg.url + path, {
        method,
        headers: { "Authorization": `Bearer ${cfg.token}`, ...headers },
        body,
    })
    return res
}

async function pushItems(cfg, items, result) {
    for (let i = 0; i < items.length; i += 200) {
        const batch = items.slice(i, i + 200)
        const res = await api(cfg, "POST", "/api/sync",
            JSON.stringify({ since: 0, limit: 0, push: batch }),
            { "Content-Type": "application/json" })
        if (!res.ok) throw new Error(`journey sync failed: ${res.status} ${await res.text()}`)
        const body = await res.json()
        result.accepted += body.accepted?.length ?? 0
        result.superseded += body.superseded?.length ?? 0
        for (const rejection of body.rejected ?? []) {
            result.rejected.push(rejection)
            console.error("❌ journey rejected", rejection.id ?? "", rejection.reason ?? "")
        }
    }
}

async function uploadBlob(cfg, artwork, result) {
    const head = await api(cfg, "HEAD", `/api/blobs/sha256:${artwork.sha256}`)
    if (head.status === 200) { result.blobsSkipped++; return }

    const bytes = readFileSync(artwork.path)
    const res = await api(cfg, "PUT", `/api/blobs/sha256:${artwork.sha256}`, bytes, {
        "Content-Type": artwork.content_type ?? "application/octet-stream",
    })
    if (!res.ok) throw new Error(`blob upload failed: ${res.status} sha256:${artwork.sha256}`)
    result.blobsUploaded++
}

// --- sync op --------------------------------------------------------------------

export async function journeySync({ full = false } = {}) {
    const cfg = config()
    const db = getDb()
    const result = { tracks: 0, events: 0, skippedIncomplete: 0, blobsUploaded: 0, blobsSkipped: 0, accepted: 0, superseded: 0, rejected: [] }

    const eventCursor = full ? 0 : Number(getSyncState("journey_cursor_events")) || 0

    // 1. tracks (with artwork blobs first - the server requires attachment
    //    blobs to exist before the referencing item). Tracks are mutable, so
    //    push is dirty-driven: complete tracks that were never synced or were
    //    hydrated since their last sync. --full re-pushes every complete track.
    const dirty = full ? "" : "AND (t.journey_synced_at IS NULL OR t.journey_synced_at < COALESCE(t.hydrated_at, t.created_at))"
    const trackRows = db.prepare(`
        SELECT t.rowid AS rid, t.*, a.sha256, a.path, a.content_type, a.bytes
        FROM tracks t LEFT JOIN artwork a ON a.sha256 = t.artwork_sha256
        WHERE t.title IS NOT NULL AND t.artists IS NOT NULL ${dirty}
        ORDER BY t.rowid
    `).all()

    const trackItems = []
    const pushedTrackUris = []
    for (const row of trackRows) {
        if (row.sha256) await uploadBlob(cfg, row, result)
        trackItems.push(trackItem(row, row.sha256 ? row : null, cfg.clientId))
        pushedTrackUris.push(row.uri)
    }
    await pushItems(cfg, trackItems, result)
    result.tracks = trackItems.length

    // 2. events (listens + library events)
    const eventRows = db.prepare(`
        SELECT e.rowid AS rid, e.*, p.name AS playlist_name
        FROM events e LEFT JOIN playlists p ON p.uri = e.context_uri
        WHERE e.rowid > ? ORDER BY e.rowid
    `).all(eventCursor)

    const trackByUri = new Map()
    const trackOf = (uri) => {
        if (!trackByUri.has(uri)) trackByUri.set(uri, db.prepare("SELECT * FROM tracks WHERE uri = ?").get(uri))
        return trackByUri.get(uri)
    }

    const eventItems = []
    for (const event of eventRows) {
        const track = trackOf(event.track_uri)
        if (!track?.title || !track?.artists) { result.skippedIncomplete++; continue }
        eventItems.push(eventItem(event, track, event.playlist_name, cfg.clientId))
    }
    await pushItems(cfg, eventItems, result)
    result.events = eventItems.length

    if (result.rejected.length === 0) {
        // mark pushed tracks synced (chunked to stay within sqlite's variable limit)
        const markSynced = db.prepare("UPDATE tracks SET journey_synced_at = datetime('now') WHERE uri = ?")
        db.transaction(() => {
            for (const uri of pushedTrackUris) markSynced.run(uri)
        })()
        if (eventRows.length) setSyncState("journey_cursor_events", eventRows[eventRows.length - 1].rid)
        setSyncState("last_journey_sync", new Date().toISOString())
    }

    return result
}
