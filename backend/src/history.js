import fs from "fs/promises"
import { existsSync } from "fs";
import Auth from "./auth.js";

const HISTORY_FILE = "db/history.csv";

let history = [];
let timestamps = new Set();


async function loadHistory() {

    if ( ! existsSync( HISTORY_FILE ) ) {
        console.error( "couldn't find", HISTORY_FILE );
        return;
    }

    const buffer = await fs.readFile( HISTORY_FILE );

    if ( buffer.length === 0 ) {
        console.error( "empty", HISTORY_FILE );
        return;
    }

    history = buffer.toString().split( "\n" );
    history.forEach( line => timestamps.add( line.split( ',', 1 )[ 0 ] ) );

    console.log( "read", history.length, "tracks" );

}


async function fetchRecent() {

    console.log( "fetching recent ..." );

    const headers = await Auth.getHeader();
    const data = await fetch( "https://api.spotify.com/v1/me/player/recently-played?limit=20", { headers } );

    if ( data.status !== 200 ) {
        console.error( data.statusText );
        return;
    }

    const cursor = await data.json();
    const items = cursor.items;
    const newTracks = items.filter( item => ! timestamps.has( item.played_at ) );

    if ( newTracks.length === 0 ) {
        return;
    }

    const values = newTracks.map( item => {
        return [ item.played_at, item.track.uri, item.context.uri ].join( ',' );
    });

    values.reverse();   //  old to new to append

    history.push( ...values );
    newTracks.forEach( item => timestamps.add( item.played_at ) );
    fs.appendFile( HISTORY_FILE, "\n" + values.join( "\n" ) );

    console.log( "found", newTracks.length, "new tracks" );

}


const History = {
    history,
    timestamps,
    load: loadHistory,
    fetchRecent
};

export default History;