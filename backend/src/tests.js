import Auth from "./auth.js";


async function addTrackToPlaylist( trackUri, playlistId ) {

    console.log( "add", trackUri, "to", playlistId );

    const playlistUrl = "https://api.spotify.com/v1/playlists/" + playlistId + "/tracks";
    const headers = Auth.getHeader();

    const uriData = await fetch( playlistUrl + "?fields=items.track.uri", { headers } );
    const uriJson = await uriData.json()
    const uris = uriJson.items.map( item => item.track.uri );

    if ( uris.includes( trackUri ) ) {
        console.log( "duplicate" );
        return;
    }

    const postData = await fetch( playlistUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ uris: [ trackUri ] })
    });

    console.log( postData.status, postData.statusText );

}

const PLAYLIST_ID_A = "4dexja60Mu9Hi8RZ5V7XGT";
const TRACK_URI_A = "spotify:track:7sesNXHb5NdVXmCtm6f9qo";
const TRACK_URI_B = "spotify:track:5XX7abZjHJk9de0LsRJRlu";

addTrackToPlaylist( TRACK_URI_A, PLAYLIST_ID_A );
addTrackToPlaylist( TRACK_URI_B, PLAYLIST_ID_A );