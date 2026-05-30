import fs from "fs/promises"
import { existsSync } from "fs";
import Auth from "./auth.js";
import { icons } from "./bugle.js"

const PLAYLISTS_FILE = "db/playlists.json";

let playlists = [];
let monthlies = new Set();


async function load() {

    if ( ! existsSync( PLAYLISTS_FILE ) ) {
        console.error( "couldn't find", PLAYLISTS_FILE );
        return;
    }

    const buffer = await fs.readFile( PLAYLISTS_FILE );

    if ( buffer.length === 0 ) {
        console.warn( "empty", PLAYLISTS_FILE );
        return;
    }

    playlists = JSON.parse( buffer );
    didUpdate();

    console.log( icons.success, "read", playlists.length, "playlists" );

}


async function createPlaylist( name ) {

    console.log( "creating playlist", name ,"..." );

    const headers = await Auth.getHeader();
    const data = {
        name,
        public: false
    };

    const res = await fetch( "https://api.spotify.com/v1/me/playlists?limit=50", {
        method: "POST",
        headers,
        body: JSON.stringify( data )
    });

    if ( res.status != 201 ) {
        console.error( res.status, res.statusText );
        return undefined;
    }

    const playlist = await res.json();

    playlists.push( playlist );
    fs.writeFile( PLAYLISTS_FILE, JSON.stringify( playlists ) );
    didUpdate();

    return playlist;

}


async function fetchPlaylists() {

    console.log( "fetching playlists ..." );

    let result = [];
    let cursor = { next: "https://api.spotify.com/v1/me/playlists?limit=50" };
    const headers = await Auth.getHeader();

    while ( cursor.next !== null ) {
        const data = await fetch( cursor.next, { headers } );

        if ( ! data.ok ) {
            console.error( icons.failure, "Cannot fetch playlists" )
            return;
        }

        cursor = await data.json();
        result.push( ...cursor.items );
    }

    fs.writeFile( PLAYLISTS_FILE, JSON.stringify( result ) );
    playlists = result;
    didUpdate();

    console.log( icons.cloud, `fetched ${result.length} playlists` );

}


async function addTrack( trackUri, playlistId ) {

    // console.log( "adding", trackUri, "to", playlistId, "..." );

    const playlistUrl = "https://api.spotify.com/v1/playlists/" + playlistId + "/tracks";
    const headers = await Auth.getHeader();
    const data = await fetch( playlistUrl + "?fields=items.track.uri", { headers } );

    if ( data.status !== 200 ) {
        console.error( data.statusText );
        return false;
    }

    const uriJson = await data.json()
    const uris = uriJson.items.map( item => item.track.uri );

    if ( uris.includes( trackUri ) ) {
        console.info( "🤷 track already exists" );
        return false;
    }

    const postData = await fetch( playlistUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ uris: [ trackUri ] })
    });

    if ( postData.status != 201 ) {
        console.error( icons.failure, "couldn't add track" );
        console.error( postData.status, postData.statusText );
        return false;
    }

    return true;

}


function find( date ) {
    return playlists.find( playlist => playlist.name === date );
}


function didUpdate() {

    monthlies = new Set();
    const re = /^\d{4}-\d{2}$/;
    const items = playlists.filter( p => re.test( p.name ) );
    items.forEach( item => monthlies.add( item.name ) );

    Playlists.playlists = playlists;
    Playlists.monthlies = monthlies;

}


async function addMonthly( item ) {

    const month = item.added_at.substring( 0, 7 );
    const trackUri = item.track.uri;
    let playlist = Playlists.find( month );

    if ( ! playlist ) {
        console.log( icons.writing, `creating playlist ${month}`, "..." );
        playlist = await Playlists.create( month );
    }

    Playlists.addTrack( trackUri, playlist.id );
    console.success( `📅 added ${trackUri} to ${playlist.id}` );

}


const Playlists = {
    playlists,
    monthlies,
    load,
    fetch: fetchPlaylists,
    find,
    addTrack,
    create: createPlaylist,
    addMonthly
};

export default Playlists;