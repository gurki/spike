import { getAdapter } from "./provider/adapter.js"
import { recordAllSaved, setSyncState } from "./eventstore.js"
import { reconcile as reconcileImpl } from "./reconcile.js"
import { verify as verifyImpl } from "./verify.js"

// The daemon is the single executor: one op at a time, watcher-triggered
// reconciles queue behind manual ones instead of interleaving.
let chain = Promise.resolve()

export function withLock(fn) {
    const run = chain.then(fn, fn)
    chain = run.catch(() => {})
    return run
}

// Minimal job registry for long-running ops (hydrate).
const jobs = new Map()
let jobCounter = 0

export function startJob(name, fn) {
    const id = `${name}-${++jobCounter}`
    const job = { id, name, status: "running", startedAt: new Date().toISOString(), progress: null, result: null, error: null }
    jobs.set(id, job)

    withLock(fn)
        .then((result) => {
            job.status = "done"
            job.result = result
        })
        .catch((error) => {
            job.status = "failed"
            job.error = error.message
        })
        .finally(() => {
            job.finishedAt = new Date().toISOString()
        })

    return job
}

export const getJob = (id) => jobs.get(id) ?? null

export function jobProgress(id, progress) {
    const job = jobs.get(id)
    if (job) job.progress = progress
}

// --- operations ----------------------------------------------------------

// Full rebuild/refresh of the likes library from the source of truth.
export async function syncLikes() {
    const adapter = getAdapter(process.env.PROVIDER || "spotify")
    const { items, total } = await adapter.fetchAllLikes()
    const result = recordAllSaved(items)
    setSyncState("last_full_likes_sync", new Date().toISOString())
    console.log(`✅ sync-likes: ${result.total} likes fetched (api total ${total}), ${result.inserted} new events`)
    return { fetched: result.total, apiTotal: total, newEvents: result.inserted }
}

// Reconcile monthly playlists against liked songs. Runs a full likes sync
// first by default so the desired state is fresh.
export async function reconcile({ month, since, dryRun, prune, refresh, sync = true } = {}) {
    if (sync) await syncLikes()
    return reconcileImpl({ month, since, dryRun, prune, refresh })
}

export async function verify(flags = {}) {
    return verifyImpl(flags) // does its own full likes sync internally
}

// Long-running: run as a job, poll via GET /ops/jobs/:id.
export function startHydrate() {
    let job = null
    job = startJob("hydrate", async () => {
        const { hydrate } = await import("./hydrate.js")
        return hydrate({ onProgress: (progress) => jobProgress(job.id, progress) })
    })
    return job
}
