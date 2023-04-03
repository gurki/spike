# spike 🦔
a spotify **watchdog** and **database** for **likes ❤️** and track **history ⏳**.

## Setup
create `.env` file in `/backend`, add your [spotify api tokens](https://developer.spotify.com/documentation/web-api) and define settings.

```env
CLIENT_ID="YOUR_SPOTIFY_CLIENT_ID"
CLIENT_SECRET="YOUR_SPOTIFY_CLIENT_SECRET"

LIKES_INTERVAL_S=60
HISTORY_INTERVAL_S=60

LIKES_LIMIT=10
HISTORY_LIMIT=10
```

install and run.

```sh
cd backend
yarn
yarn dev
```


## Overview
everything is stored **locally**.
the database lives as **files** in `/backend/db`.

- `auth.json`: persistent spotify api [access tokens](https://developer.spotify.com/documentation/web-api/tutorials/code-flow)
- `liked.json`: list of all [saved tracks](https://developer.spotify.com/documentation/web-api/reference/get-users-saved-tracks)
- `playlists.json`: list of all [playlists](https://developer.spotify.com/documentation/web-api/reference/get-playlist)
- `history.csv`: history of [tracks](https://developer.spotify.com/documentation/web-api/reference/get-recently-played) since start

the **history** is saved in the following csv format.

```csv
startedAt,trackUri,contextUri
```

### Observer
the **observer** runs queries every `*_INTERVAL_S` seconds. it fetches the last `*_LIMIT` entries.

newly discovered **saved tracks** are automatically added to the according monthly playlist `YYYY-mm`, based on their `added_at` field. if the playlist doesn't exist, it will be created first.

newly discovered **recently played tracks** are automatically appended to the **history**.


## Endpoints
visit `/login` to connect to spotify.