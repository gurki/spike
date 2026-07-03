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

export function getAllAdapters() {
    return Array.from(adapterRegistry.values())
}

// Adapter interface (documented contract)
/**
 * @typedef {Object} TrackInfo
 * @property {string} uri - Provider-neutral URI (provider:track_id)
 * @property {string} title
 * @property {string[]} artists
 * @property {string} album
 * @property {string} [cover]
 * @property {string} [external_url]
 * @property {Object} [external_refs]
 * @property {string} [isrc]
 * @property {number} [duration_ms]
 */

/** @type {Map<string, (addedAfter: number) => Promise<TrackInfo[]>>} */
export let fetchLikes
/** @type {Map<string, (after: number) => Promise<{items: TrackInfo[], after: number}>>} */
export let fetchHistory
/** @type {Map<string, () => Promise<{uris: string[], names: {uri: string, name: string}[]>}>>} */
export let fetchPlaylists
/** @type {Map<string, (month: string) => Promise<string>>} */
export let createMonthlyPlaylist

export function validateAdapter(name, adapter) {
    const required = ['fetchLikes', 'fetchHistory', 'fetchPlaylists', 'createMonthlyPlaylist']
    for (const method of required) {
        if (typeof adapter[method] !== 'function') {
            throw new Error(`Adapter "${name}" missing required method: ${method}`)
        }
    }
    return adapter
}
