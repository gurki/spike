import Auth from "./auth.js"
import State from "./state.js";
import Playlists from "./playlists.js";


async function updateLiked() {

    console.log( "updating liked ..." );

    const headers = await Auth.getHeader();
    const data = await fetch( "https://api.spotify.com/v1/me/tracks?limit=20", { headers } );
    const recent = await data.json();
    const trackUris = new Set( State.state.liked.map( item => item.track.uri ) );
    const newLiked = recent.items.filter( item => ! trackUris.has( item.track.uri ) );

    if ( newLiked.length === 0 ) return;

    console.log( "found", newLiked.length, "new liked track(s)" );
    handleNewLiked( newLiked );

}


function playlistForMonth( date ) {
    return State.state.playlists.find( playlist => playlist.name === date );
}


function handleNewLiked( newLiked ) {

    for ( const item of newLiked ) {

        const month = item.added_at.substring( 0, 7 );
        const trackUri = item.track.uri;
        const playlist = playlistForMonth( month );
        let playlistId;

        if ( ! playlist ) {
            console.error( "playlist", month, "doesn't exist yet" );
            continue;
        }

        playlistId = playlist.id;
        Playlists.addTrack( trackUri, playlistId );

    }

    State.addLiked( newLiked );

}

setInterval( updateLiked, 60 * 1000 );
console.log( "keeping an eye out for new likes ..." );