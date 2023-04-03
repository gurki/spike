# spike 🦔
a spotify like and history watchdog

## Install
```sh
yarn
yarn dev
```

## Usage
`spike🦔` stores everything locally, files are your database.

- `auth.json`: persistent spotify api [access tokens](https://developer.spotify.com/documentation/web-api/tutorials/code-flow)
- `liked.json`: list of all [saved tracks](https://developer.spotify.com/documentation/web-api/reference/get-users-saved-tracks)
- `playlists.json`: list of all [playlists](https://developer.spotify.com/documentation/web-api/reference/get-playlist)
- `history.csv`: history of [tracks](https://developer.spotify.com/documentation/web-api/reference/get-recently-played) since start

The history is saved as follows.

```csv
startedAt,trackUri,contextUri
```

## API
Visit `/login` to connect to spotify.