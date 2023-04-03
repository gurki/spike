import Auth from "./auth.js"
import Liked from "./liked.js";
import Playlists from "./playlists.js";
import History from "./history.js";
import { safeIcons } from "./bugle.js";


async function updateLiked() {

    console.log( "updating liked ..." );

    const headers = await Auth.getHeader();
    const data = await fetch( "https://api.spotify.com/v1/me/tracks?limit=20", { headers } );

    if ( data.status !== 200 ) {
        console.error( data.statusText );
        return;
    }

    const recent = await data.json();
    const trackUris = new Set( Liked.liked.map( item => item.track.uri ) );
    const newLiked = recent.items.filter( item => ! trackUris.has( item.track.uri ) );

    if ( newLiked.length === 0 ) return;

    console.log( safeIcons.love, "found", newLiked.length, "new liked track(s)" );
    handleNewLiked( newLiked );

}


function handleNewLiked( newLiked ) {

    for ( const item of newLiked ) {

        const month = item.added_at.substring( 0, 7 );
        const trackUri = item.track.uri;
        const playlist = Playlists.find( month );
        let playlistId;

        if ( ! playlist ) {
            console.log( "playlist", month, "doesn't exist yet" );
            const newPlaylist = Playlists.create( month );
            playlistId = newPlaylist.id;
        }

        playlistId = playlist.id;
        Playlists.addTrack( trackUri, playlistId );

    }

    Liked.addTracks( newLiked );

}


function start() {

    setInterval( updateLiked, 1 * 60 * 1000 );
    console.log( safeIcons.started, "watching out for new likes ..." );

    setInterval( History.fetch, 1 * 60 * 1000 )
    console.log( safeIcons.started, "tracking history ..." );

    updateLiked();
    History.fetch();

}


const Observer = {
    start
};

export default Observer;