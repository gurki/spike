import { createHash } from "node:crypto"

// Deterministic ULIDs, Journey-style: 48 time bits from the event timestamp,
// 80 "random" bits from sha256 of the natural key. Same observation always
// yields the same id, so rebuilds and re-imports are idempotent.

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

function crockfordBase32(bytes) {
    // 16 bytes = 128 bits -> 26 chars (2 zero pad bits, most significant first)
    let value = 0n
    for (const byte of bytes) value = (value << 8n) | BigInt(byte)
    let out = ""
    for (let i = 0; i < 26; i++) {
        out = ALPHABET[Number(value & 31n)] + out
        value >>= 5n
    }
    return out
}

export function deterministicUlid(triggeredAt, naturalKey) {
    const timeMs = Date.parse(triggeredAt)
    if (Number.isNaN(timeMs)) throw new Error(`invalid timestamp: ${triggeredAt}`)

    const bytes = Buffer.alloc(16)
    bytes.writeUIntBE(timeMs, 0, 6)
    createHash("sha256").update(naturalKey).digest().copy(bytes, 6, 0, 10)
    return crockfordBase32(bytes)
}

// Entities (tracks) have no event time; all 128 bits come from the hash so
// the id is recomputable from the natural key alone.
export function entityUlid(naturalKey) {
    const bytes = createHash("sha256").update(naturalKey).digest().subarray(0, 16)
    return crockfordBase32(bytes)
}

// Natural keys use the provider timestamp VERBATIM as returned by the API,
// never a normalized or derived value - see architecture/core/longevity.md.
export const savedKey = (addedAt, uri) => `spotify|saved|${addedAt}|${uri}`
export const listenKey = (playedAt, uri) => `spotify|${playedAt}|${uri}`
export const playlistAddedKey = (addedAt, uri) => `spotify|playlist-added|${addedAt}|${uri}`
