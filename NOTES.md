## Knowledge
- tracks get added to history when they end, independent of playtime before that (i.e. you can skip to a second before the end of a song, let it play out, and it'll be added to history)

## Known limitations
- **play history is live-capture only** beyond spotify's ~50-item recently-played window. keep the daemon running; the gdpr *extended streaming history* export (`import-history`) fills in the past.
- **like/unlike history is unrecoverable from the api** - spotify only exposes the *current* liked set, no history. going forward the append-only event log records every like it observes; reconcile is additive-only, so unliking a song never removes it from a monthly playlist (a track liked-then-unliked before spike saw it simply leaves no trace).
- **playlist folders are not exposed by the web api** - grouping monthly playlists into a `YYYY` folder stays a manual drag in the spotify client, invisible to spike.

## Resolved
- **playlist renames / stale entries** no longer cause wrong-playlist adds: reconcile compares desired state (liked songs by month) against the *actual* playlist contents (snapshot-cached, refetched when spotify's `snapshot_id` changes), so the db never drifts from reality.
- **removed / unliked songs**: additive-only reconcile keeps them (never silently removed; `--prune` opts into exact matching).
- **watchers = trigger + action**: events drive reconcile, hydrate, and journey sync.
- **endpoints to view state / history frontend**: `/browse`, `/stats`, `/events`, `/tracks` on the daemon.

## Ideas
- watch arbitrary playlists (e.g. add shazam songs to monthlies; own or others' playlists - mind recursion)
- multi-user (file/folder based; client id/secret at runtime)
- statistical sorting (e.g. push often-listened songs to top)
- save discover weekly snapshots
- podcasts (differentiate from songs in history; saved podcasts)
- create a playlist with all albums for specific songs
- move to PKCE auth flow

## References
- https://developer.spotify.com/documentation/web-api/tutorials/code-flow
- https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide
