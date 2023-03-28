import Auth from "./auth.js";


async function addTrack( trackUri, playlistId ) {

    console.log( "add", trackUri, "to", playlistId, "..." );

    const playlistUrl = "https://api.spotify.com/v1/playlists/" + playlistId + "/tracks";
    const headers = await Auth.getHeader();
    const data = await fetch( playlistUrl + "?fields=items.track.uri", { headers } );

    if ( data.status !== 200 ) {
        console.error( data.statusText );
        return;
    }

    const uriJson = await data.json()
    const uris = uriJson.items.map( item => item.track.uri );

    if ( uris.includes( trackUri ) ) {
        console.info( "track already exists" );
        return;
    }

    const postData = await fetch( playlistUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ uris: [ trackUri ] })
    });

    console.log( postData.status, postData.statusText );

}


const Playlists = {
    addTrack
};

export default Playlists;