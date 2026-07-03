import { createHash } from "node:crypto"
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

import { getDb } from "./db/init.js"
import { getAdapter } from "./provider/adapter.js"
import { upsertTrack } from "./eventstore.js"

const ARTWORK_DIR = process.env.SPIKE_ARTWORK_DIR
    || join(resolve(import.meta.dirname, "../db"), "artwork")

// Same layout as the journey blob store: sha256/<aa>/<bb>/<full-hash>,
// no extension - the path is derivable from the hash alone; content type
// lives in the artwork table.
export function artworkPath(sha256) {
    return join(ARTWORK_DIR, "sha256", sha256.slice(0, 2), sha256.slice(2, 4), sha256)
}

// Download bytes into the content-addressed store; idempotent by hash.
async function storeArtwork(db, url) {
    const existing = db.prepare("SELECT sha256 FROM artwork WHERE source_url = ?").get(url)
    if (existing) return existing.sha256

    const res = await fetch(url)
    if (!res.ok) throw new Error(`artwork download failed: ${res.status} ${url}`)
    const bytes = Buffer.from(await res.arrayBuffer())
    const sha256 = createHash("sha256").update(bytes).digest("hex")

    // dedupe by content: the same bytes from a different url reuse the row
    const byHash = db.prepare("SELECT sha256 FROM artwork WHERE sha256 = ?").get(sha256)
    if (byHash) return byHash.sha256

    const path = artworkPath(sha256)

    if (!existsSync(path)) {
        mkdirSync(dirname(path), { recursive: true })
        const tmp = `${path}.tmp-${process.pid}`
        writeFileSync(tmp, bytes)
        renameSync(tmp, path)
    }

    db.prepare(`
        INSERT OR IGNORE INTO artwork (sha256, path, source_url, content_type, bytes)
        VALUES (?, ?, ?, ?, ?)
    `).run(sha256, path, url, res.headers.get("content-type"), bytes.length)

    return sha256
}

function largestImage(images = []) {
    return images.reduce((best, img) => (img?.width ?? 0) > (best?.width ?? 0) ? img : best, images[0])
}

// Backfill stable metadata and album artwork for tracks that lack them.
// Re-running is a no-op once everything is hydrated.
export async function hydrate({ onProgress = () => {} } = {}) {
    const db = getDb()
    const adapter = getAdapter(process.env.PROVIDER || "spotify")

    const pending = db.prepare(`
        SELECT uri FROM tracks
        WHERE is_local = 0
          AND (hydrated_at IS NULL OR title IS NULL OR duration_ms IS NULL OR artwork_sha256 IS NULL)
    `).all().map((row) => row.uri)

    // local tracks: stamp hydrated, no catalog metadata to fetch
    db.prepare("UPDATE tracks SET hydrated_at = datetime('now') WHERE is_local = 1 AND hydrated_at IS NULL").run()

    if (pending.length === 0) return { hydrated: 0, artworkDownloaded: 0, failed: 0 }

    const setHydrated = db.prepare("UPDATE tracks SET artwork_sha256 = ?, hydrated_at = datetime('now') WHERE uri = ?")
    const ids = pending
        .map((uri) => ({ uri, id: uri.split(":").pop() }))
        .filter(({ id }) => id && /^[A-Za-z0-9]+$/.test(id))

    let hydrated = 0
    let downloaded = 0
    let failed = 0
    const artworkCache = new Map() // image url -> sha256 (album-level dedupe within the run)

    for (let i = 0; i < ids.length; i += 50) {
        const batch = ids.slice(i, i + 50)
        const tracks = await adapter.fetchTracksBatch(batch.map((b) => b.id))

        for (const raw of tracks) {
            try {
                const uri = upsertTrack(raw)
                const image = largestImage(raw.album?.images)
                let sha256 = null
                if (image?.url) {
                    if (!artworkCache.has(image.url)) {
                        artworkCache.set(image.url, await storeArtwork(db, image.url))
                        downloaded++
                    }
                    sha256 = artworkCache.get(image.url)
                }
                setHydrated.run(sha256, uri)
                hydrated++
            } catch (error) {
                console.error("❌ hydrate failed for", raw?.uri, error.message)
                failed++
            }
        }

        onProgress(`${Math.min(i + 50, ids.length)}/${ids.length} tracks, ${downloaded} covers`)
    }

    return { hydrated, artworkDownloaded: downloaded, failed }
}
