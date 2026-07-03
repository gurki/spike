// Self-contained inspection page: a searchable cover grid over /tracks,
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
    header { position: sticky; top: 0; display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
             padding: 14px 20px; background: #121212ee; backdrop-filter: blur(4px); }
    h1 { font-size: 16px; margin: 0; }
    input, select { padding: 7px 12px; border-radius: 18px; border: 1px solid #333;
                    background: #1e1e1e; color: #eee; outline: none; }
    input { flex: 1; max-width: 360px; }
    .lens { display: flex; border: 1px solid #333; border-radius: 18px; overflow: hidden; }
    .lens button { padding: 7px 12px; border: 0; background: #1e1e1e; color: #999; cursor: pointer; }
    .lens button.on { background: #2e5c3f; color: #eee; }
    #count { color: #888; font-size: 12px; }
    main { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
           gap: 16px; padding: 8px 20px 40px; }
    .card { display: block; color: inherit; text-decoration: none; }
    .card[href]:hover img, .card[href]:hover .noart { outline: 2px solid #2e5c3f; }
    .card img, .card .noart { width: 100%; aspect-ratio: 1; border-radius: 6px;
           background: #1e1e1e; object-fit: cover; display: block; }
    .noart { display: grid; place-items: center; color: #444; font-size: 32px; }
    .t { margin-top: 6px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .a, .m { color: #999; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .m { color: #666; }
</style>
</head>
<body>
<header>
    <h1>spike 🦔</h1>
    <input id="q" type="search" placeholder="search title, artist, album ..." autofocus>
    <select id="month"><option value="">all months</option></select>
    <span class="lens" id="lens" hidden>
        <button id="lensLiked" class="on" title="tracks liked this month">❤ liked</button>
        <button id="lensPlaylist" title="cached contents of the monthly playlist">▶ playlist</button>
    </span>
    <span id="count"></span>
</header>
<main id="grid"></main>
<script>
    const grid = document.getElementById("grid")
    const count = document.getElementById("count")
    const input = document.getElementById("q")
    const monthSel = document.getElementById("month")
    const lens = document.getElementById("lens")
    const lensLiked = document.getElementById("lensLiked")
    const lensPlaylist = document.getElementById("lensPlaylist")
    let timer
    let mode = "liked"
    let playlists = new Map()

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

    async function load() {
        const q = input.value.trim()
        const month = monthSel.value
        lens.hidden = !month
        const params = new URLSearchParams({ limit: 500 })
        if (q) params.set("q", q)
        if (month && mode === "playlist") params.set("playlist", month)
        else if (month) params.set("month", month)
        const { tracks, total } = await fetch("/tracks?" + params).then(r => r.json())
        count.textContent = month ? tracks.length + " tracks" : tracks.length + " / " + total + " tracks"
        grid.innerHTML = tracks.map(t => {
            const artists = t.artists ? JSON.parse(t.artists).join(", ") : ""
            const art = t.artwork_sha256
                ? '<img loading="lazy" src="/artwork/' + t.artwork_sha256 + '" alt="">'
                : '<div class="noart">♪</div>'
            const saved = t.saved_at ? t.saved_at.slice(0, 10) : "–"
            const heard = t.listen_count ? " · ♫ " + t.listen_count : ""
            const id = t.uri.startsWith("spotify:track:") ? t.uri.split(":")[2] : null
            const open = id ? ' href="https://open.spotify.com/track/' + id + '" target="_blank" rel="noopener"' : ""
            return '<a class="card"' + open + '>' + art +
                '<div class="t">' + esc(t.title ?? t.uri) + '</div>' +
                '<div class="a">' + esc(artists) + '</div>' +
                '<div class="m">' + esc(t.album_name ?? "") + '</div>' +
                '<div class="m">' + (mode === "playlist" && monthSel.value ? "▶ " : "❤ ") + saved + heard + '</div></a>'
        }).join("")
    }

    function setMode(next) {
        mode = next
        lensLiked.classList.toggle("on", mode === "liked")
        lensPlaylist.classList.toggle("on", mode === "playlist")
        load()
    }

    const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))
    input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(load, 250) })
    monthSel.addEventListener("change", load)
    lensLiked.addEventListener("click", () => setMode("liked"))
    lensPlaylist.addEventListener("click", () => setMode("playlist"))
    init()
</script>
</body>
</html>`
