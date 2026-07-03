import { existsSync } from "node:fs"

import { getDb } from "./db/init.js"
import { getAdapter } from "./provider/adapter.js"
import { recordAllSaved } from "./eventstore.js"
import { localMonth } from "./time.js"
import { reconcile } from "./reconcile.js"

// Consistency guarantee: full likes re-sync from the source of truth, dry-run
// reconcile (nothing missed in playlists), plus integrity checks (nothing
// missed in the local db). Report-only.
//
// Note: saved events are append-only, so local saved count >= current api
// total once anything was ever unliked. Completeness means: the full fetch
// paginated to the api's own total, and every fetched like is recorded
// (transactional insert) - not that the counts are equal.
export async function verify({ strict = false, deep = false } = {}) {
    const db = getDb()
    const adapter = getAdapter(process.env.PROVIDER || "spotify")
    const checks = []
    const check = (name, ok, detail) => checks.push({ name, ok, detail })

    // 1. likes completeness against the source of truth
    const { items, total: apiTotal } = await adapter.fetchAllLikes()
    recordAllSaved(items)
    const localSaved = db.prepare("SELECT COUNT(*) n FROM events WHERE kind = 'saved'").get().n
    check("likes completeness", items.length === apiTotal,
        `fetched ${items.length} of api total ${apiTotal}; ${localSaved} saved events locally` +
        (localSaved > apiTotal ? ` (${localSaved - apiTotal} historically unliked, kept by design)` : ""))

    // 2. per-month playlist drift (dry-run reconcile)
    const result = await reconcile({ dryRun: true })
    const missing = result.months.reduce((n, m) => n + m.missing.length, 0)
    const extra = result.months.reduce((n, m) => n + m.extra.length, 0)
    check("playlist drift: missing", missing === 0,
        missing === 0 ? "no liked tracks missing from monthly playlists" : `${missing} tracks missing - run reconcile`)
    check("playlist drift: extra", !strict || extra === 0,
        `${extra} extra tracks in monthly playlists${extra ? " (kept by design; --prune removes)" : ""}`)

    // 3. orphan events
    const orphans = db.prepare(`
        SELECT COUNT(*) n FROM events e LEFT JOIN tracks t ON t.uri = e.track_uri WHERE t.uri IS NULL
    `).get().n
    check("orphan events", orphans === 0, `${orphans} events without a track row`)

    // 4. hydration completeness
    const unhydrated = db.prepare(`
        SELECT COUNT(*) n FROM tracks WHERE is_local = 0 AND (hydrated_at IS NULL OR title IS NULL OR duration_ms IS NULL)
    `).get().n
    check("hydration", unhydrated === 0, `${unhydrated} tracks missing metadata${unhydrated ? " - run hydrate" : ""}`)

    // 5. artwork completeness + files on disk
    const missingArt = db.prepare("SELECT COUNT(*) n FROM tracks WHERE is_local = 0 AND artwork_sha256 IS NULL").get().n
    check("artwork coverage", missingArt === 0, `${missingArt} tracks without artwork${missingArt ? " - run hydrate" : ""}`)

    const artworkRows = db.prepare("SELECT sha256, path FROM artwork").all()
    const lost = artworkRows.filter((row) => !existsSync(row.path))
    check("artwork files", lost.length === 0, `${lost.length} of ${artworkRows.length} artwork files missing on disk`)

    if (deep) {
        const { createHash } = await import("node:crypto")
        const { readFileSync } = await import("node:fs")
        const corrupt = artworkRows.filter((row) =>
            existsSync(row.path) &&
            createHash("sha256").update(readFileSync(row.path)).digest("hex") !== row.sha256)
        check("artwork integrity (deep)", corrupt.length === 0, `${corrupt.length} files fail re-hash`)
    }

    // 6. local tracks (informational - never representable in playlists via API)
    const locals = db.prepare("SELECT COUNT(*) n FROM tracks WHERE is_local = 1").get().n
    check("local tracks", true, `${locals} local-file tracks (excluded from playlists by the api)`)

    // 7. month bucketing invariant
    const badMonths = db.prepare("SELECT triggered_at, month FROM events").all()
        .filter((row) => localMonth(row.triggered_at) !== row.month).length
    check("month bucketing", badMonths === 0, `${badMonths} events with inconsistent month`)

    return { ok: checks.every((c) => c.ok), checks, reconcile: result }
}
