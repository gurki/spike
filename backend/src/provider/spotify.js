import * as dotenv from "dotenv"
dotenv.config()

import Auth from "./auth.js"
import { registerAdapter, validateAdapter } from "./adapter.js"

async function fetchPaginated(url) {
    const headers = await Auth.getHeader()
    let cursor = { next: url }
    let results = []

    while (cursor.next) {
        const data = await fetch(cursor.next, { headers })
        if (!data.ok) {
            console.error(`❌ Cannot fetch from ${url}`)
            return results
        }
        cursor = await data.json()
        results.push(...cursor.items)
    }

    return results
}


async function fetchLikes(latestAfter) {
    console.log("👂 fetching likes ...")

    const items = await fetchPaginated("https://api.spotify.com/v1/me/tracks?limit=50")

    console.log("✅ fetched", items.length, "likes")

    // Return items with _added_at timestamp for the watcher to track
    return items.map((item) => ({
        ...item.track,
        _added_at: new Date(item.added_at).getTime(),
    }))
}


async function fetchHistory(after) {
    console.log("👂 fetching history ...")

    let url = after === 0
        ? "https://api.spotify.com/v1/me/player/recently-played"
        : `https://api.spotify.com/v1/me/player/recently-played?after=${after}&limit=${process.env.HISTORY_LIMIT || 10}`

    const headers = await Auth.getHeader()
    const data = await fetch(url, { headers })
    if (!data.ok) {
        console.error("❌ Cannot fetch history")
        return { items: [] }
    }

    const res = await data.json()

    const items = (res.items ?? []).map((item) => ({
        ...item.track,
        _played_at: new Date(item.played_at).getTime(),
        context: item.context
            ? { type: item.context.type, uri: item.context.uri, href: item.context.href }
            : null,
    }))

    const afterTime = items.length > 0 ? new Date(items[items.length - 1].played_at).getTime() : after
    console.log("✅ fetched", items.length, "historied tracks")

    return { items, after: afterTime }
}


async function fetchPlaylists() {
    console.log("🏷️ fetching playlists ...")

    const headers = await Auth.getHeader()
    let cursor = { next: "https://api.spotify.com/v1/me/playlists?limit=50" }
    let allPlaylists = []

    while (cursor.next) {
        const data = await fetch(cursor.next, { headers })
        if (!data.ok) {
            console.error("❌ Cannot fetch playlists")
            return { uris: [], names: [] }
        }
        const res = await data.json()
        allPlaylists.push(...res.items)
        cursor.next = res.next
    }

    const uris = allPlaylists.map((p) => `spotify:playlist:${p.id}`)
    const names = allPlaylists.map((p) => ({ uri: `spotify:playlist:${p.id}`, name: p.name }))

    console.log("✅ fetched", allPlaylists.length, "playlists")
    return { uris, names }
}


async function createMonthlyPlaylist(month) {
    console.log("📅 creating monthly playlist", month, "...")

    const headers = await Auth.getHeader()
    const res = await fetch("https://api.spotify.com/v1/me/playlists", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ name: month, public: false }),
    })

    if (res.status !== 201) {
        console.error("❌ Failed to create monthly playlist")
        return null
    }

    const playlist = await res.json()
    console.log(`✅ created playlist "${month}" (${playlist.id})`)
    return playlist.id
}


const SpotifyAdapter = validateAdapter("spotify", {
    fetchLikes,
    fetchHistory,
    fetchPlaylists,
    createMonthlyPlaylist,
})

registerAdapter("spotify", SpotifyAdapter)

export default SpotifyAdapter
