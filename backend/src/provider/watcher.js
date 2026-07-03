import { EventEmitter } from "node:events"
import { getAdapter } from "./adapter.js"

export class TrackWatcher extends EventEmitter {
    constructor(name, interval, limit) {
        super()
        this.name = name
        this.interval = interval
        this.limit = limit
        this.lastUpdate = 0
        this.provider = process.env.PROVIDER || "spotify"
    }
}

export class LikesWatcher extends TrackWatcher {
    constructor(name = "likes") {
        const interval = (process.env.LIKES_INTERVAL_S || 60) * 1000
        const limit = process.env.LIKES_LIMIT || 10
        super(name, interval, limit)
        this.latest = Date.now()
    }

    async update() {
        if (Date.now() < this.lastUpdate + this.interval) return
        this.lastUpdate = Date.now()

        const adapter = getAdapter(this.provider)
        const items = await adapter.fetchLikes?.(this.latest)
        if (!items || items.length === 0) return

        items.sort((a, b) => (a._added_at ?? 0) - (b._added_at ?? 0))
        this.latest = items[items.length - 1]._added_at

        for (const item of items) {
            this.emit("trackAdded", {
                kind: "liked",
                trackUri: item.uri,
                context: { type: "saved", _month: new Date(item._added_at).toISOString().substring(0, 7) },
                provider: this.provider,
                rawSnapshot: item,
            })
        }
    }
}

export class HistoryWatcher extends TrackWatcher {
    constructor(name = "history") {
        const interval = (process.env.HISTORY_INTERVAL_S || 60) * 1000
        const limit = process.env.HISTORY_LIMIT || 10
        super(name, interval, limit)
        this.after = 0
    }

    async update() {
        if (Date.now() < this.lastUpdate + this.interval) return
        this.lastUpdate = Date.now()

        const adapter = getAdapter(this.provider)
        const result = await adapter.fetchHistory?.(this.after)
        const items = result?.items ?? []
        if (items.length === 0) return

        items.sort((a, b) => (a._played_at ?? 0) - (b._played_at ?? 0))
        this.after = items[items.length - 1]._played_at

        for (const item of items) {
            this.emit("trackAdded", {
                kind: "heard",
                trackUri: item.uri,
                context: item.context
                    ? { type: item.context.type, uri: item.context.uri }
                    : { type: "player" },
                provider: this.provider,
                rawSnapshot: item,
            })
        }
    }
}
