import "./src/bugle.js"

import express from "express"
import * as dotenv from "dotenv"
dotenv.config()

import Auth from "./src/auth.js"
import "./src/provider/spotify.js"
import { LikesWatcher, HistoryWatcher } from "./src/provider/watcher.js"
import { recordSaved, recordHeard, getSyncState, setSyncState } from "./src/eventstore.js"
import { withLock, getJob, syncLikes, reconcile, verify, importHistory, startHydrate } from "./src/ops.js"
import { getStats, getEvents, getTracks, getPlaylists, getArtwork } from "./src/queries.js"
import { BROWSE_HTML } from "./src/browse.js"
import { localMonth } from "./src/time.js"
import { closeDb } from "./src/db/init.js"

const PORT = Number(process.env.PORT) || 8888
const app = express()

app.use("/", Auth.router)

// --- health + inspection --------------------------------------------------

app.get("/healthz", (req, res) => {
    res.json({ ok: true, uptime: process.uptime() })
})

app.get("/stats", (req, res) => {
    res.json(getStats())
})

app.get("/events", (req, res) => {
    res.json(getEvents(req.query))
})

app.get("/tracks", (req, res) => {
    res.json(getTracks(req.query))
})

app.get("/playlists", (req, res) => {
    res.json({ playlists: getPlaylists() })
})

app.get("/artwork/:sha256", (req, res) => {
    const artwork = getArtwork(req.params.sha256)
    if (!artwork) return res.sendStatus(404)
    res.set("Cache-Control", "public, max-age=31536000, immutable")
    if (artwork.content_type) res.type(artwork.content_type)
    res.sendFile(artwork.path)
})

app.get("/browse", (req, res) => {
    res.type("html").send(BROWSE_HTML)
})

// --- operations (the daemon is the single executor) -----------------------

const flag = (value) => value === "" || value === "true" || value === "1" || value === true

function opHandler(fn) {
    return async (req, res) => {
        try {
            res.json(await withLock(fn(req)))
        } catch (error) {
            console.error("❌ op failed:", error)
            res.status(500).json({ error: error.message })
        }
    }
}

app.post("/ops/sync-likes", opHandler(() => () => syncLikes()))

app.post("/ops/reconcile", opHandler((req) => () => reconcile({
    month: req.query.month || null,
    since: req.query.since || null,
    dryRun: flag(req.query["dry-run"]),
    prune: flag(req.query.prune),
    refresh: flag(req.query.refresh),
    includeBulk: flag(req.query["include-bulk"]),
})))

app.post("/ops/verify", opHandler((req) => () => verify({
    strict: flag(req.query.strict),
    deep: flag(req.query.deep),
})))

app.post("/ops/import-history", opHandler((req) => () => importHistory({
    path: req.query.path,
    minMs: req.query["min-ms"] ? Number(req.query["min-ms"]) : undefined,
})))

app.post("/ops/hydrate", (req, res) => {
    res.status(202).json(startHydrate())
})

app.get("/ops/jobs/:id", (req, res) => {
    const job = getJob(req.params.id)
    if (!job) return res.status(404).json({ error: "job not found" })
    res.json(job)
})

// --- watchers --------------------------------------------------------------

const likesWatcher = new LikesWatcher()
const historyWatcher = new HistoryWatcher()
let reconcileTimer = null
const pendingMonths = new Set()

likesWatcher.on("saved", ({ addedAt, track }) => {
    const { inserted } = recordSaved(addedAt, track)
    if (!inserted) return
    setSyncState("likes_cursor", Date.parse(addedAt))

    // debounce: batch likes arriving together into one reconcile per month
    pendingMonths.add(localMonth(addedAt))
    clearTimeout(reconcileTimer)
    reconcileTimer = setTimeout(() => {
        for (const month of pendingMonths) {
            withLock(() => reconcile({ month, sync: false }))
                .then((result) => {
                    const applied = result.applied?.added ?? 0
                    if (applied) console.log(`✅ reconciled ${month}: ${applied} added`)
                })
                .catch((error) => console.error("❌ watcher reconcile failed:", error.message))
        }
        pendingMonths.clear()
    }, 5000)
})

historyWatcher.on("heard", ({ playedAt, track, context }) => {
    const { inserted } = recordHeard(playedAt, track, context)
    if (inserted) setSyncState("history_cursor", Date.parse(playedAt))
})

// --- lifecycle --------------------------------------------------------------

const server = app.listen(PORT, async () => {
    console.log("🦔 spike listening on", PORT, "...")

    const authenticated = await Auth.init()
    if (!authenticated) {
        console.error(`❌ not authenticated - visit http://127.0.0.1:${PORT}/login 👋`)
        return
    }

    likesWatcher.latest = Number(getSyncState("likes_cursor")) || Date.now()
    historyWatcher.after = Number(getSyncState("history_cursor")) || 0

    setInterval(() => {
        likesWatcher.update().catch((error) => console.error("❌ likes watcher:", error.message))
        historyWatcher.update().catch((error) => console.error("❌ history watcher:", error.message))
    }, 10 * 1000)

    console.log("👂 watchers running")
})

function shutdown() {
    console.log("👋 shutting down ...")
    clearTimeout(reconcileTimer)
    server.close(() => {
        closeDb()
        process.exit(0)
    })
    setTimeout(() => process.exit(1), 5000).unref()
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
