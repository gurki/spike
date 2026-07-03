import Auth from "../auth.js"
import { registerAdapter, validateAdapter } from "./adapter.js"
import { canonicalUri } from "../canonical.js"

const API = "https://api.spotify.com/v1"

export class SpotifyApiError extends Error {
    constructor(status, url) {
        super(`spotify api error ${status} for ${url}`)
        this.status = status
        this.url = url
    }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Every API call routes through here: 429 honors Retry-After, 5xx/network
// errors back off exponentially, a 401 forces one token refresh.
async function request(url, { method = "GET", body, maxRetries = 4 } = {}) {
    let refreshed = false

    for (let attempt = 0; ; attempt++) {
        const headers = await Auth.getHeader()
        if (body) headers["Content-Type"] = "application/json"

        let res
        try {
            res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
        } catch (error) {
            if (attempt >= maxRetries) throw error
            await sleep(1000 * 2 ** attempt)
            continue
        }

        if (res.ok) {
            return res.status === 204 ? null : await res.json()
        }

        if (res.status === 401 && !refreshed) {
            refreshed = true
            await Auth.refreshTokens()
            continue
        }

        if (res.status === 429 && attempt < maxRetries) {
            const retryAfter = Number(res.headers.get("retry-after")) || 1
            await sleep(retryAfter * 1000 + Math.random() * 250)
            continue
        }

        if (res.status >= 500 && attempt < maxRetries) {
            await sleep(1000 * 2 ** attempt)
            continue
        }

        throw new SpotifyApiError(res.status, url)
    }
}

async function fetchPaginated(url) {
    let items = []
    let total = 0
    let next = url

    while (next) {
        const page = await request(next)
        items.push(...(page.items ?? []))
        total = page.total ?? items.length
        next = page.next
    }

    return { items, total }
}

// --- likes ---------------------------------------------------------------

// Full library rebuild: every saved track with its verbatim added_at.
async function fetchAllLikes() {
    console.log("👂 fetching all likes ...")
    const { items, total } = await fetchPaginated(`${API}/me/tracks?limit=50`)
    console.log("✅ fetched", items.length, "likes")
    return { items, total }
}

async function fetchLikedTotal() {
    const page = await request(`${API}/me/tracks?limit=1`)
    return page.total
}

// Incremental poll: likes come back newest-first, so stop paginating as soon
// as a page reaches the cursor. Steady state is a single request.
async function fetchLikes(latestAfterMs) {
    let next = `${API}/me/tracks?limit=50`
    const items = []

    while (next) {
        const page = await request(next)
        for (const item of page.items ?? []) {
            if (Date.parse(item.added_at) <= latestAfterMs) return items
            items.push(item)
        }
        next = page.next
    }

    return items
}

// --- history -------------------------------------------------------------

async function fetchHistory(afterMs) {
    const url = afterMs > 0
        ? `${API}/me/player/recently-played?after=${afterMs}&limit=50`
        : `${API}/me/player/recently-played?limit=50`

    const page = await request(url)
    return page.items ?? []
}

// --- playlists -----------------------------------------------------------

async function fetchPlaylists() {
    console.log("🏷️ fetching playlists ...")
    const { items } = await fetchPaginated(`${API}/me/playlists?limit=50`)
    return items.map((p) => ({
        id: p.id,
        uri: `spotify:playlist:${p.id}`,
        name: p.name,
        snapshotId: p.snapshot_id,
        tracksTotal: p.tracks?.total ?? 0,
    }))
}

// February 2026 api surface: /playlists/{id}/items replaces .../tracks, entries
// nest under `item` (transitionally aliased as `track`), and the DELETE body
// key is `items`. Verified empirically 2026-07 against a scratch playlist.
async function fetchPlaylistItems(playlistId) {
    const fields = "next,items(added_at,is_local,item(uri,is_local,linked_from(uri)))"
    const url = `${API}/playlists/${playlistId}/items?limit=100&fields=${encodeURIComponent(fields)}`
    const { items } = await fetchPaginated(url)

    return items
        .map((entry) => ({ entry, inner: entry.item ?? entry.track }))
        .filter(({ inner }) => inner?.uri)
        .map(({ entry, inner }) => ({
            addedAt: entry.added_at,
            uri: canonicalUri(inner),
            isLocal: Boolean(inner.is_local || entry.is_local),
        }))
}

async function addTracksToPlaylist(playlistId, uris) {
    for (let i = 0; i < uris.length; i += 100) {
        await request(`${API}/playlists/${playlistId}/items`, {
            method: "POST",
            body: { uris: uris.slice(i, i + 100) },
        })
    }
}

async function removeTracksFromPlaylist(playlistId, uris) {
    for (let i = 0; i < uris.length; i += 100) {
        await request(`${API}/playlists/${playlistId}/items`, {
            method: "DELETE",
            body: { items: uris.slice(i, i + 100).map((uri) => ({ uri })) },
        })
    }
}

async function createMonthlyPlaylist(month) {
    console.log("📅 creating monthly playlist", month, "...")
    const playlist = await request(`${API}/me/playlists`, {
        method: "POST",
        body: { name: month, public: false },
    })
    return {
        id: playlist.id,
        uri: `spotify:playlist:${playlist.id}`,
        name: playlist.name,
        snapshotId: playlist.snapshot_id,
        tracksTotal: 0,
    }
}

// --- tracks --------------------------------------------------------------

// Batch fetch, falling back to per-track requests if the batch endpoint is
// ever removed for this app (slated for removal in the feb 2026 migration;
// still live as of 2026-07).
let batchTracksAvailable = true

async function fetchTracksBatch(trackIds) {
    const tracks = []
    for (let i = 0; i < trackIds.length; i += 50) {
        const chunk = trackIds.slice(i, i + 50)

        if (batchTracksAvailable) {
            try {
                const page = await request(`${API}/tracks?ids=${chunk.join(",")}`)
                tracks.push(...(page.tracks ?? []).filter(Boolean))
                continue
            } catch (error) {
                if (!(error instanceof SpotifyApiError && [400, 404, 410].includes(error.status))) throw error
                batchTracksAvailable = false
                console.warn("⚠️ batch /tracks endpoint gone, falling back to per-track fetches")
            }
        }

        for (const id of chunk) {
            try {
                tracks.push(await request(`${API}/tracks/${id}`))
            } catch (error) {
                if (error instanceof SpotifyApiError && [400, 404].includes(error.status)) continue
                throw error
            }
        }
    }
    return tracks
}

const SpotifyAdapter = validateAdapter("spotify", {
    fetchLikes,
    fetchAllLikes,
    fetchLikedTotal,
    fetchHistory,
    fetchPlaylists,
    fetchPlaylistItems,
    addTracksToPlaylist,
    removeTracksFromPlaylist,
    createMonthlyPlaylist,
    fetchTracksBatch,
})

registerAdapter("spotify", SpotifyAdapter)

export default SpotifyAdapter
