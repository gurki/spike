import fs from "fs/promises"
import { existsSync } from "fs";
import Auth from "./auth.js";

const PLAYLISTS_FILE = "db/playlists.json";
const LIKED_FILE = "db/liked.json";

let state = {
    playlists: [],
    liked: []
};


async function loadPlaylists() {

    if ( ! existsSync( PLAYLISTS_FILE ) ) {
        console.error( "couldn't find", PLAYLISTS_FILE );
        return;
    }

    const fin = await fs.readFile( PLAYLISTS_FILE );
    const data = JSON.parse( fin );

    if ( data === undefined ) {
        console.error( "invalid", PLAYLISTS_FILE );
        return;
    }

    state.playlists = data;
    console.log( "read", state.playlists.length, "playlists" );

}


async function loadLiked() {

    if ( ! existsSync( LIKED_FILE ) ) {
        console.error( "couldn't find", LIKED_FILE );
        return;
    }

    const fin = await fs.readFile( LIKED_FILE );
    const data = JSON.parse( fin );

    if ( data === undefined ) {
        console.error( "invalid", LIKED_FILE );
        return;
    }

    state.liked = data;
    console.log( "read", state.liked.length, "liked" );

}


async function fetchPlaylists() {

    console.log( "fetching playlists ..." );

    let playlists = [];
    let cursor = { next: "https://api.spotify.com/v1/me/playlists?limit=50" };
    const headers = await Auth.getHeader();

    while ( cursor.next !== null ) {
        const data = await fetch( cursor.next, { headers } );
        cursor = await data.json();
        playlists.push( ...cursor.items );
    }

    fs.writeFile( PLAYLISTS_FILE, JSON.stringify( playlists ) );
    state.playlists = playlists;
    console.log( "fetched", playlists.length, "playlists" );

}


async function fetchLiked() {

    console.log( "fetching liked ..." );

    let liked = [];
    let cursor = { next: "https://api.spotify.com/v1/me/tracks?limit=50" };
    const headers = await Auth.getHeader();

    while ( cursor.next !== null ) {
        const data = await fetch( cursor.next, { headers } );
        cursor = await data.json();
        liked.push( ...cursor.items );
    }

    fs.writeFile( LIKED_FILE, JSON.stringify( liked ) );
    state.liked = liked;
    console.log( "fetched", liked.length, "liked" );

}


async function addLiked( newLiked ) {
    if ( ! newLiked || newLiked.length === 0 ) return;
    console.log( "add liked", newLiked.length, "..." );
    state.liked.splice( 0, 0, ...newLiked );
    fs.writeFile( LIKED_FILE, JSON.stringify( state.liked ) );
}


async function load() {
    loadPlaylists();
    loadLiked();
}


function getMonthlyPlaylists() {

    const re = /^\d{4}-\d{2}$/;
    const items = state.playlists.filter( p => re.test( p.name ) );

    const monthlies = {};

    for ( const item of items ) {
        monthlies[ item.name ] = item;
    }

    return monthlies;

}


const State = {
    load,
    state,
    fetchPlaylists,
    fetchLiked,
    addLiked,
    monthlies: getMonthlyPlaylists
};

export default State;