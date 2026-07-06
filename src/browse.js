// Self-contained inspection page: a searchable cover grid over /tracks
// (Library) and a day-grouped listen timeline over /events (History), plus
// /playlists and /artwork. No build, no dependencies - the daemon serves
// this one string.

export const BROWSE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>spike 🦔</title>
<style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #121212; color: #eee; font: 14px/1.4 -apple-system, system-ui, sans-serif; }
    header { position: sticky; top: 0; z-index: 2; display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
             padding: 14px 20px; background: #121212ee; backdrop-filter: blur(4px); }
    h1 { font-size: 16px; margin: 0; }
    input, select { padding: 7px 12px; border-radius: 18px; border: 1px solid #333;
                    background: #1e1e1e; color: #eee; outline: none; }
    input { flex: 1; max-width: 360px; }
    .toggle { display: flex; border: 1px solid #333; border-radius: 18px; overflow: hidden; }
    .toggle button { padding: 7px 12px; border: 0; background: #1e1e1e; color: #999; cursor: pointer; }
    .toggle button.on { background: #2e5c3f; color: #eee; }
    [hidden] { display: none !important; }
    #count { color: #888; font-size: 12px; margin-left: auto; }

    /* Library: cover grid */
    main.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
                gap: 16px; padding: 8px 20px 40px; }
    .card { display: block; color: inherit; text-decoration: none; }
    .card[href]:hover img, .card[href]:hover .noart { outline: 2px solid #2e5c3f; }
    .card img, .card .noart { width: 100%; aspect-ratio: 1; border-radius: 6px;
           background: #1e1e1e; object-fit: cover; display: block; }
    .noart { display: grid; place-items: center; color: #444; font-size: 32px; }
    .t { margin-top: 6px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .a, .m { color: #999; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .m { color: #666; }

    /* History: linear day-grouped timeline */
    main.timeline { max-width: 640px; margin: 0 auto; padding: 8px 16px 60px; }
    .day { position: sticky; top: 56px; padding: 12px 6px 6px; font-size: 12px; font-weight: 600;
           color: #9b9b9b; background: #121212ee; backdrop-filter: blur(4px); }
    .row { display: flex; align-items: center; gap: 12px; padding: 7px 6px; border-radius: 8px;
           color: inherit; text-decoration: none; }
    .row:hover { background: #1c1c1c; }
    .row .thumb, .row .noart { width: 44px; height: 44px; border-radius: 4px; flex: 0 0 44px;
           background: #1e1e1e; object-fit: cover; }
    .row .noart { display: grid; place-items: center; color: #444; }
    .row .meta { min-width: 0; flex: 1; }
    .row .rt { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .row .ra { color: #999; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .row .time { color: #888; font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
    #more { display: block; margin: 20px auto; padding: 8px 18px; border-radius: 18px;
            border: 1px solid #333; background: #1e1e1e; color: #eee; cursor: pointer; }
</style>
</head>
<body>
<header>
    <h1>spike 🦔</h1>
    <span class="toggle" id="view">
        <button id="viewLibrary" class="on">library</button>
        <button id="viewHistory">history</button>
    </span>
    <input id="q" type="search" placeholder="search title, artist ...">
    <select id="month"><option value="">all months</option></select>
    <span class="toggle" id="lens" hidden>
        <button id="lensLiked" class="on" title="tracks liked this month">❤ liked</button>
        <button id="lensPlaylist" title="cached contents of the monthly playlist">▶ playlist</button>
    </span>
    <span id="count"></span>
</header>
<main id="main" class="grid"></main>
<script>
    const main = document.getElementById("main")
    const count = document.getElementById("count")
    const input = document.getElementById("q")
    const monthSel = document.getElementById("month")
    const lens = document.getElementById("lens")
    const lensLiked = document.getElementById("lensLiked")
    const lensPlaylist = document.getElementById("lensPlaylist")
    const viewLibrary = document.getElementById("viewLibrary")
    const viewHistory = document.getElementById("viewHistory")

    const HISTORY_PAGE = 200
    let timer
    let view = "library"
    let mode = "liked"          // library lens
    let playlists = new Map()
    let historyOffset = 0
    let lastDay = null          // day-divider tracking across pages

    const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))
    const trackId = (uri) => uri && uri.startsWith("spotify:track:") ? uri.split(":")[2] : null
    const openAttr = (uri) => { const id = trackId(uri); return id ? ' href="https://open.spotify.com/track/' + id + '" target="_blank" rel="noopener"' : "" }

    async function init() {
        const [stats, pls] = await Promise.all([
            fetch("/stats").then(r => r.json()),
            fetch("/playlists").then(r => r.json()),
        ])
        playlists = new Map(pls.playlists.map(p => [p.month, p]))
        const months = new Set(stats.likesPerMonth.map(r => r.month))
        for (const p of pls.playlists) months.add(p.month)
        for (const m of [...months].sort().reverse()) {
            const liked = stats.likesPerMonth.find(r => r.month === m)?.likes ?? 0
            const present = playlists.get(m)?.present
            const opt = document.createElement("option")
            opt.value = m
            opt.textContent = m + "  (❤ " + liked + (present != null ? " · ▶ " + present : " · no playlist") + ")"
            monthSel.appendChild(opt)
        }
        load()
    }

    function setView(next) {
        view = next
        viewLibrary.classList.toggle("on", view === "library")
        viewHistory.classList.toggle("on", view === "history")
        input.placeholder = view === "history" ? "search title, artist ..." : "search title, artist, album ..."
        load()
    }

    function load() {
        if (view === "history") { historyOffset = 0; lastDay = null; loadHistory(false) }
        else loadLibrary()
    }

    // --- Library (grid) ---
    async function loadLibrary() {
        main.className = "grid"
        lens.hidden = !monthSel.value
        const q = input.value.trim()
        const month = monthSel.value
        const params = new URLSearchParams({ limit: 500 })
        if (q) params.set("q", q)
        if (month && mode === "playlist") params.set("playlist", month)
        else if (month) params.set("month", month)
        const { tracks, total } = await fetch("/tracks?" + params).then(r => r.json())
        count.textContent = month ? tracks.length + " tracks" : tracks.length + " / " + total + " tracks"
        main.innerHTML = tracks.map(t => {
            const artists = t.artists ? JSON.parse(t.artists).join(", ") : ""
            const art = t.artwork_sha256
                ? '<img loading="lazy" src="/artwork/' + t.artwork_sha256 + '" alt="">'
                : '<div class="noart">♪</div>'
            const saved = t.saved_at ? t.saved_at.slice(0, 10) : "–"
            const heard = t.listen_count ? " · ♫ " + t.listen_count : ""
            return '<a class="card"' + openAttr(t.uri) + '>' + art +
                '<div class="t">' + esc(t.title ?? t.uri) + '</div>' +
                '<div class="a">' + esc(artists) + '</div>' +
                '<div class="m">' + esc(t.album_name ?? "") + '</div>' +
                '<div class="m">' + (mode === "playlist" && month ? "▶ " : "❤ ") + saved + heard + '</div></a>'
        }).join("")
    }

    // --- History (timeline) ---
    const DAY_MS = 86400000
    function dayLabel(isoDate) {
        const today = new Date(); today.setHours(0, 0, 0, 0)
        const d = new Date(isoDate + "T00:00:00")
        const diff = Math.round((today - d) / DAY_MS)
        if (diff === 0) return "Today"
        if (diff === 1) return "Yesterday"
        return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric",
            year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" })
    }

    function historyParams() {
        const params = new URLSearchParams({ kind: "listen", limit: HISTORY_PAGE, offset: historyOffset })
        const q = input.value.trim()
        if (q) params.set("q", q)
        if (monthSel.value) params.set("month", monthSel.value)
        return params
    }

    async function loadHistory(append) {
        main.className = "timeline"
        lens.hidden = true
        const { events } = await fetch("/events?" + historyParams()).then(r => r.json())

        let html = ""
        for (const e of events) {
            const local = e.local_time ?? e.triggered_at
            const day = local.slice(0, 10)
            const time = local.slice(11, 16)
            if (day !== lastDay) { html += '<div class="day">' + esc(dayLabel(day)) + '</div>'; lastDay = day }
            const artists = e.artists ? JSON.parse(e.artists).join(", ") : ""
            const thumb = e.artwork_sha256
                ? '<img class="thumb" loading="lazy" src="/artwork/' + e.artwork_sha256 + '" alt="">'
                : '<div class="noart">♪</div>'
            const from = e.context_type ? " · from " + esc(e.context_type) : ""
            html += '<a class="row"' + openAttr(e.track_uri) + '>' + thumb +
                '<div class="meta"><div class="rt">' + esc(e.title ?? e.track_uri) + '</div>' +
                '<div class="ra">' + esc(artists) + from + '</div></div>' +
                '<div class="time">' + time + '</div></a>'
        }

        const moreBtn = events.length === HISTORY_PAGE ? '<button id="more">load more</button>' : ""
        if (append) {
            document.getElementById("more")?.remove()
            main.insertAdjacentHTML("beforeend", html + moreBtn)
        } else {
            main.innerHTML = html || '<div class="day">no listens</div>'
            if (moreBtn) main.insertAdjacentHTML("beforeend", moreBtn)
        }
        historyOffset += events.length
        count.textContent = historyOffset + " listens"
        document.getElementById("more")?.addEventListener("click", () => loadHistory(true))
    }

    function setMode(next) {
        mode = next
        lensLiked.classList.toggle("on", mode === "liked")
        lensPlaylist.classList.toggle("on", mode === "playlist")
        loadLibrary()
    }

    input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(load, 250) })
    monthSel.addEventListener("change", load)
    lensLiked.addEventListener("click", () => setMode("liked"))
    lensPlaylist.addEventListener("click", () => setMode("playlist"))
    viewLibrary.addEventListener("click", () => setView("library"))
    viewHistory.addEventListener("click", () => setView("history"))
    init()
</script>
</body>
</html>`
