export const adapterRegistry = new Map()

export function registerAdapter(provider, adapter) {
    adapterRegistry.set(provider, adapter)
    return adapter
}

export function getAdapter(provider) {
    const adapter = adapterRegistry.get(provider)
    if (!adapter) {
        throw new Error(`Adapter not registered: ${provider}`)
    }
    return adapter
}

// Adapter contract. All timestamps are returned VERBATIM as provider strings;
// callers derive natural keys and month buckets from them.
//
//   fetchLikes(latestAfterMs)            -> [{ added_at, track }]           (incremental, newest first)
//   fetchAllLikes()                      -> { items: [{ added_at, track }], total }
//   fetchLikedTotal()                    -> number
//   fetchHistory(afterMs)                -> [{ played_at, track, context }]
//   fetchPlaylists()                     -> [{ id, uri, name, snapshotId, tracksTotal }]
//   fetchPlaylistItems(playlistId)       -> [{ addedAt, uri, isLocal }]     (canonical uris)
//   addTracksToPlaylist(playlistId, uris)
//   removeTracksFromPlaylist(playlistId, uris)
//   createMonthlyPlaylist(month)         -> { id, uri, name, snapshotId, tracksTotal }
//   fetchTracksBatch(trackIds)           -> [rawTrack]
export function validateAdapter(name, adapter) {
    const required = [
        "fetchLikes",
        "fetchAllLikes",
        "fetchLikedTotal",
        "fetchHistory",
        "fetchPlaylists",
        "fetchPlaylistItems",
        "addTracksToPlaylist",
        "removeTracksFromPlaylist",
        "createMonthlyPlaylist",
        "fetchTracksBatch",
    ]
    for (const method of required) {
        if (typeof adapter[method] !== "function") {
            throw new Error(`Adapter "${name}" missing required method: ${method}`)
        }
    }
    return adapter
}
