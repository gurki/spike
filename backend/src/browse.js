// Self-contained inspection page: a searchable cover grid over /tracks and
// /artwork. No build, no dependencies - the daemon serves this one string.

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
    header { position: sticky; top: 0; display: flex; gap: 12px; align-items: baseline;
             padding: 14px 20px; background: #121212ee; backdrop-filter: blur(4px); }
    h1 { font-size: 16px; margin: 0; }
    input { flex: 1; max-width: 420px; padding: 7px 12px; border-radius: 18px;
            border: 1px solid #333; background: #1e1e1e; color: #eee; outline: none; }
    #count { color: #888; font-size: 12px; }
    main { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
           gap: 16px; padding: 8px 20px 40px; }
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
    <span id="count"></span>
</header>
<main id="grid"></main>
<script>
    const grid = document.getElementById("grid")
    const count = document.getElementById("count")
    const input = document.getElementById("q")
    let timer

    async function load() {
        const q = input.value.trim()
        const res = await fetch("/tracks?limit=500" + (q ? "&q=" + encodeURIComponent(q) : ""))
        const { tracks, total } = await res.json()
        count.textContent = tracks.length + " / " + total + " tracks"
        grid.innerHTML = tracks.map(t => {
            const artists = t.artists ? JSON.parse(t.artists).join(", ") : ""
            const art = t.artwork_sha256
                ? '<img loading="lazy" src="/artwork/' + t.artwork_sha256 + '" alt="">'
                : '<div class="noart">♪</div>'
            const saved = t.saved_at ? t.saved_at.slice(0, 10) : "–"
            const heard = t.heard_count ? " · ♫ " + t.heard_count : ""
            return '<div class="card">' + art +
                '<div class="t">' + esc(t.title ?? t.uri) + '</div>' +
                '<div class="a">' + esc(artists) + '</div>' +
                '<div class="m">' + esc(t.album_name ?? "") + '</div>' +
                '<div class="m">❤ ' + saved + heard + '</div></div>'
        }).join("")
    }

    const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))
    input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(load, 250) })
    load()
</script>
</body>
</html>`
