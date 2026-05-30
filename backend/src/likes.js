import Auth from "./auth.js";
import Playlists from "./playlists.js";
import { safeIcons } from "./bugle.js";


export async function fetchLikes() {

    console.log( "fetching likes ..." );

    let likes = [];
    let cursor = { next: "https://api.spotify.com/v1/me/tracks?limit=50" };
    const headers = await Auth.getHeader();

    while ( cursor.next !== null ) {

        const data = await fetch( cursor.next, { headers } );

        if ( ! data.ok ) {
            console.error( safeIcons.failure, "Cannot fetch likes" )
            return;
        }

        cursor = await data.json();
        likes.push( ...cursor.items );

    }

    console.log( safeIcons.love, "fetched", likes.length, "likes" );
    return likes;

}