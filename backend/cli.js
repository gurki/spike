#!/usr/bin/env node

// Thin HTTP client for the running spike daemon. The daemon is the single
// executor (db + spotify tokens); this just calls its endpoints and renders
// the results.

const BASE_URL = process.env.SPIKE_URL || "http://127.0.0.1:8888"

function parseFlags(args) {
    const flags = {}
    for (let i = 0; i < args.length; i++) {
        const arg = args[i]
        if (!arg.startsWith("--")) continue
        const eq = arg.indexOf("=")
        if (eq > 0) {
            flags[arg.slice(2, eq)] = arg.slice(eq + 1)
        } else if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
            flags[arg.slice(2)] = args[++i]
        } else {
            flags[arg.slice(2)] = true
        }
    }
    return flags
}

function printTable(rows, columns) {
    if (rows.length === 0) return console.log("(empty)")
    const widths = columns.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length)))
    const line = (cells) => cells.map((cell, i) => String(cell ?? "").padEnd(widths[i])).join("  ")
    console.log(line(columns))
    console.log(widths.map((w) => "─".repeat(w)).join("──"))
    for (const row of rows) console.log(line(columns.map((c) => row[c])))
}

async function call(method, path, flags = {}) {
    const url = new URL(path, BASE_URL)
    for (const [key, value] of Object.entries(flags)) {
        if (key !== "json" && value !== undefined) url.searchParams.set(key, value)
    }

    let res
    try {
        res = await fetch(url, { method })
    } catch {
        console.error(`❌ spike daemon unreachable at ${BASE_URL} - is it running? (SPIKE_URL to override)`)
        process.exit(1)
    }

    const body = await res.json().catch(() => null)
    if (!res.ok && res.status !== 202) {
        console.error(`❌ ${res.status}:`, body?.error ?? res.statusText)
        process.exit(1)
    }
    return { status: res.status, body }
}

function printReconcile(result) {
    const rows = result.months.map((m) => ({
        month: m.month,
        playlist: m.playlistId ?? (m.missing.length ? "— (would create)" : "—"),
        liked: m.liked,
        present: m.present,
        missing: m.missing.length,
        extra: m.extra.length,
        bulk: m.bulkSkipped?.length ?? 0,
        local: m.localSkipped.length,
    }))
    printTable(rows, ["month", "playlist", "liked", "present", "missing", "extra", "bulk", "local"])

    const drift = result.months.filter((m) => m.missing.length || m.extra.length)
    const missing = drift.reduce((n, m) => n + m.missing.length, 0)
    const extra = drift.reduce((n, m) => n + m.extra.length, 0)
    const bulk = result.months.reduce((n, m) => n + (m.bulkSkipped?.length ?? 0), 0)
    console.log(`\n${drift.length} months with drift · ${missing} missing · ${extra} extra` +
        (extra ? " (kept; use --prune to remove)" : "") +
        (bulk ? ` · ${bulk} bulk saves excluded (album saves/imports; --include-bulk to add)` : ""))
    if (result.applied) console.log(`applied: ${result.applied.added} added, ${result.applied.removed} removed`)
}

function printVerify(result) {
    for (const check of result.checks) {
        console.log(`${check.ok ? "✅" : "❌"} ${check.name}: ${check.detail}`)
    }
    console.log(result.ok ? "\n✅ all checks passed" : "\n❌ drift or integrity issues found")
}

const commands = {
    "sync-likes": async (flags) => {
        const { body } = await call("POST", "/ops/sync-likes", flags)
        console.log(`✅ ${body.fetched} likes (api total ${body.apiTotal}), ${body.newEvents} new events`)
        return 0
    },

    "reconcile": async (flags) => {
        const { body } = await call("POST", "/ops/reconcile", flags)
        if (flags.json) return console.log(JSON.stringify(body, null, 2)) ?? 0
        printReconcile(body)
        const drift = body.months.some((m) => m.missing.length || m.extra.length)
        return flags["dry-run"] && drift ? 2 : 0
    },

    "verify": async (flags) => {
        const { body } = await call("POST", "/ops/verify", flags)
        if (flags.json) return console.log(JSON.stringify(body, null, 2)) ?? 0
        printVerify(body)
        return body.ok ? 0 : 2
    },

    "import-history": async (flags) => {
        const { body } = await call("POST", "/ops/import-history", flags)
        console.log(`✅ ${body.imported} plays imported from ${body.files} files ` +
            `(${body.entries} entries: ${body.tooShort} too short, ${body.noUri} without track uri, ` +
            `${body.nearDuplicates} near-duplicates skipped)`)
        return 0
    },

    "hydrate": async (flags) => {
        const { body } = await call("POST", "/ops/hydrate", flags)
        console.log(`⏳ hydrate started (job ${body.id})`)
        for (;;) {
            await new Promise((resolve) => setTimeout(resolve, 2000))
            const { body: job } = await call("GET", `/ops/jobs/${body.id}`)
            if (job.progress) process.stdout.write(`\r${job.progress}    `)
            if (job.status !== "running") {
                console.log(`\n${job.status === "done" ? "✅" : "❌"} hydrate ${job.status}`,
                    job.result ? JSON.stringify(job.result) : job.error ?? "")
                return job.status === "done" ? 0 : 1
            }
        }
    },

    "stats": async (flags) => {
        const { body } = await call("GET", "/stats", flags)
        if (flags.json) return console.log(JSON.stringify(body, null, 2)) ?? 0
        console.log(`tracks ${body.totals.tracks} · saved ${body.totals.saved} · heard ${body.totals.heard}` +
            ` · playlist-added ${body.totals.playlistAdded}`)
        console.log(`last full sync: ${body.lastFullLikesSync ?? "never"} · last reconcile: ${body.lastReconcile ?? "never"}\n`)
        printTable(body.likesPerMonth, ["month", "likes"])
        console.log("")
        printTable(body.topArtists, ["artist", "likes"])
        return 0
    },

    "events": async (flags) => {
        const { body } = await call("GET", "/events", flags)
        if (flags.json) return console.log(JSON.stringify(body, null, 2)) ?? 0
        printTable(body.events.map((e) => ({
            when: e.triggered_at,
            kind: e.kind,
            title: e.title ?? e.track_uri,
            artists: e.artists ? JSON.parse(e.artists).join(", ") : "",
        })), ["when", "kind", "title", "artists"])
        return 0
    },
}

function usage() {
    console.log(`🦔 spike - spotify watchdog

usage: spike <command> [flags]

commands:
  sync-likes                       rebuild/refresh likes from the spotify api
  reconcile [--dry-run] [--prune] [--month YYYY-MM] [--since YYYY-MM]
            [--include-bulk] [--refresh]
                                   sync monthly playlists to liked songs
  verify [--strict] [--deep]       consistency + integrity checks (exit 2 on drift)
  import-history --path <dir>      import a spotify gdpr extended streaming history
  hydrate                          backfill track metadata + album artwork
  stats                            totals, likes per month, top artists
  events [--month] [--kind] [--limit]
                                   inspect the event log

env: SPIKE_URL (default http://127.0.0.1:8888)`)
    return 1
}

const [command, ...rest] = process.argv.slice(2)
const handler = commands[command]
process.exitCode = handler ? await handler(parseFlags(rest)) : usage()
