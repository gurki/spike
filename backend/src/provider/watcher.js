import { EventEmitter } from "node:events"
import { getAdapter } from "./adapter.js"

// Watchers poll the provider and emit raw items with VERBATIM provider
// timestamps; the eventstore derives natural keys and month buckets from
// them. Cursors are epoch ms, persisted by the daemon in sync_state.

class TrackWatcher extends EventEmitter {
    constructor(name, intervalMs) {
        super()
        this.name = name
        this.interval = intervalMs
        this.lastUpdate = 0
        this.provider = process.env.PROVIDER || "spotify"
    }

    due() {
        if (Date.now() < this.lastUpdate + this.interval) return false
        this.lastUpdate = Date.now()
        return true
    }
}

export class LikesWatcher extends TrackWatcher {
    constructor() {
        super("likes", (Number(process.env.LIKES_INTERVAL_S) || 60) * 1000)
        this.latest = Date.now()
    }

    async update() {
        if (!this.due()) return

        const adapter = getAdapter(this.provider)
        const items = await adapter.fetchLikes(this.latest)
        if (items.length === 0) return

        items.sort((a, b) => Date.parse(a.added_at) - Date.parse(b.added_at))
        this.latest = Date.parse(items[items.length - 1].added_at)

        for (const item of items) {
            this.emit("saved", { addedAt: item.added_at, track: item.track })
        }
    }
}

export class HistoryWatcher extends TrackWatcher {
    constructor() {
        super("history", (Number(process.env.HISTORY_INTERVAL_S) || 60) * 1000)
        this.after = 0
    }

    async update() {
        if (!this.due()) return

        const adapter = getAdapter(this.provider)
        const items = await adapter.fetchHistory(this.after)
        if (items.length === 0) return

        items.sort((a, b) => Date.parse(a.played_at) - Date.parse(b.played_at))
        this.after = Date.parse(items[items.length - 1].played_at)

        for (const item of items) {
            this.emit("heard", {
                playedAt: item.played_at,
                track: item.track,
                context: item.context ? { type: item.context.type, uri: item.context.uri } : null,
            })
        }
    }
}
