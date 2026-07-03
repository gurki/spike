import { test } from "node:test"
import assert from "node:assert/strict"

process.env.SPIKE_DB_PATH = ":memory:"

const { localMonth } = await import("../src/time.js")
const { deterministicUlid, savedKey, heardKey } = await import("../src/ids.js")
const { canonicalUri } = await import("../src/canonical.js")
const { diffMonth, desiredByMonth } = await import("../src/reconcile.js")
const { recordSaved, recordHeard, recordAllSaved, trackRow } = await import("../src/eventstore.js")
const { getDb } = await import("../src/db/init.js")

// --- month bucketing (Europe/Berlin) ---------------------------------------

test("month bucketing across DST and midnight", () => {
    assert.equal(localMonth("2024-06-15T12:00:00Z"), "2024-06")
    assert.equal(localMonth("2024-03-31T23:30:00Z"), "2024-04")   // 01:30 CEST next day
    assert.equal(localMonth("2023-12-31T23:30:00Z"), "2024-01")   // new year in Berlin
    assert.equal(localMonth("2024-10-26T23:30:00Z"), "2024-10")   // CEST->CET fall-back weekend
    assert.equal(localMonth("2024-01-31T22:59:59Z"), "2024-01")   // 23:59 CET, still january
    assert.equal(localMonth("2024-01-31T23:00:00Z"), "2024-02")   // 00:00 CET, february
})

// --- deterministic ULIDs ----------------------------------------------------

test("deterministic ulid: stable, valid, time-ordered", () => {
    const key = savedKey("2023-10-15T16:33:17Z", "spotify:track:abc")
    const a = deterministicUlid("2023-10-15T16:33:17Z", key)
    const b = deterministicUlid("2023-10-15T16:33:17Z", key)
    assert.equal(a, b)
    assert.match(a, /^[0-9A-HJKMNP-TV-Z]{26}$/)

    const later = deterministicUlid("2024-10-15T16:33:17Z", key)
    assert.ok(later > a, "later timestamp sorts after")

    const other = deterministicUlid("2023-10-15T16:33:17Z", savedKey("2023-10-15T16:33:17Z", "spotify:track:xyz"))
    assert.notEqual(a, other)
})

test("natural keys use verbatim timestamps", () => {
    assert.equal(savedKey("2023-10-15T16:33:17Z", "u"), "spotify|saved|2023-10-15T16:33:17Z|u")
    assert.equal(heardKey("2023-10-15T17:06:50.427Z", "u"), "spotify|2023-10-15T17:06:50.427Z|u")
})

// --- relinking canonicalization ----------------------------------------------

test("canonical uri prefers linked_from", () => {
    assert.equal(canonicalUri({ uri: "spotify:track:REPL", linked_from: { uri: "spotify:track:ORIG" } }), "spotify:track:ORIG")
    assert.equal(canonicalUri({ uri: "spotify:track:PLAIN" }), "spotify:track:PLAIN")
})

test("trackRow keeps stable fields only", () => {
    const row = trackRow({
        uri: "spotify:track:x", name: "T", explicit: true, duration_ms: 1000,
        artists: [{ name: "A" }], popularity: 93, available_markets: ["DE"], preview_url: "http://x",
        album: { name: "Al", album_type: "single", total_tracks: 1, release_date: "1981" },
    })
    assert.equal(row.explicit, 1)
    assert.equal(row.album_type, "single")
    assert.equal(row.album_release_date, "1981")
    assert.ok(!("popularity" in row) && !("preview_url" in row))
})

// --- reconcile diff (pure) ----------------------------------------------------

test("diffMonth computes missing and extra", () => {
    const desired = new Map([["a", "t1"], ["b", "t2"]])
    const { missing, extra } = diffMonth(desired, ["b", "c"])
    assert.deepEqual(missing, ["a"])
    assert.deepEqual(extra, ["c"])
})

// --- eventstore idempotence -----------------------------------------------------

const fixture = (uri, addedAt, extra = {}) => ({
    added_at: addedAt,
    track: { uri, name: "Song", artists: [{ name: "A" }], ...extra },
})

test("recordSaved is idempotent by natural key", () => {
    const item = fixture("spotify:track:idem", "2024-05-01T10:00:00Z")
    assert.equal(recordSaved(item.added_at, item.track).inserted, true)
    assert.equal(recordSaved(item.added_at, item.track).inserted, false)

    // same track, different like time -> distinct event
    assert.equal(recordSaved("2024-06-01T10:00:00Z", item.track).inserted, true)
})

test("recordAllSaved bulk rebuild is idempotent", () => {
    const items = [
        fixture("spotify:track:bulk1", "2024-07-01T10:00:00Z"),
        fixture("spotify:track:bulk2", "2024-07-02T10:00:00Z"),
        fixture("spotify:track:relink", "2024-07-03T10:00:00Z", { linked_from: { uri: "spotify:track:bulkORIG" } }),
    ]
    assert.equal(recordAllSaved(items).inserted, 3)
    assert.equal(recordAllSaved(items).inserted, 0)

    const stored = getDb().prepare("SELECT track_uri FROM events WHERE triggered_at = ?").get("2024-07-03T10:00:00Z")
    assert.equal(stored.track_uri, "spotify:track:bulkORIG")
})

test("heard events dedupe on played_at", () => {
    const track = { uri: "spotify:track:heard", name: "H", artists: [{ name: "B" }] }
    assert.equal(recordHeard("2024-07-04T08:00:00.123Z", track, { type: "album", uri: "spotify:album:1" }).inserted, true)
    assert.equal(recordHeard("2024-07-04T08:00:00.123Z", track).inserted, false)
})

// --- artwork store -----------------------------------------------------------------

test("artworkPath uses journey-style two-level sharding, no extension", async () => {
    const { artworkPath } = await import("../src/hydrate.js")
    const hash = "ab" + "cd" + "e".repeat(60)
    const path = artworkPath(hash)
    assert.ok(path.endsWith(`sha256/ab/cd/${hash}`))
    assert.ok(!path.includes("."), "no file extension")
})

// --- desired state ----------------------------------------------------------------

test("desiredByMonth groups by berlin month and sets aside local files", () => {
    recordSaved("2024-08-31T23:30:00Z", { uri: "spotify:track:sept", name: "S", artists: [{ name: "A" }] }) // 01:30 CEST sept 1
    recordSaved("2024-09-02T10:00:00Z", { uri: "spotify:local:a:b:c:1", is_local: true, name: "L", artists: [{ name: "A" }] })

    const months = desiredByMonth("2024-09")
    const bucket = months.get("2024-09")
    assert.ok(bucket.desired.has("spotify:track:sept"))
    assert.deepEqual(bucket.localSkipped, ["spotify:local:a:b:c:1"])
})
