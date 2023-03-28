import fs from "fs/promises"
import { existsSync } from "fs";
import Auth from "./auth.js";
import { safeIcons } from "./bugle.js";

const LIKED_FILE = "db/liked.json";

let liked = [];


async function load() {

    console.log( "loading liked ..." );

    if ( ! existsSync( LIKED_FILE ) ) {
        console.error( "couldn't find", LIKED_FILE );
        return;
    }

    const buffer = await fs.readFile( LIKED_FILE );

    if ( buffer.length === 0 ) {
        console.warn( "empty", LIKED_FILE );
        return;
    }

    liked = JSON.parse( buffer );
    Liked.liked = liked;

    console.log( safeIcons.success, "read", liked.length, "liked" );

}


async function fetchLiked() {

    console.log( "fetching liked ..." );

    let result = [];
    let cursor = { next: "https://api.spotify.com/v1/me/tracks?limit=50" };
    const headers = await Auth.getHeader();

    while ( cursor.next !== null ) {
        const data = await fetch( cursor.next, { headers } );
        cursor = await data.json();
        result.push( ...cursor.items );
    }

    liked = result;
    fs.writeFile( LIKED_FILE, JSON.stringify( liked ) );
    Liked.liked = liked;

    console.log( safeIcons.love, "fetched", liked.length, "liked" );

}


async function addTracks( tracks ) {
    if ( ! tracks || tracks.length === 0 ) return;
    console.log( "add liked", tracks.length, "..." );
    liked.splice( 0, 0, ...tracks );
    fs.writeFile( LIKED_FILE, JSON.stringify( liked ) );
}


let Liked = {
    liked,
    load,
    fetch: fetchLiked,
    addTracks
};

export default Liked;