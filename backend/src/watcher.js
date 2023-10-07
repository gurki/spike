import Auth from "./auth.js"
import { safeIcons } from "./bugle.js";
import { EventEmitter } from "node:events"

import * as dotenv from "dotenv"
dotenv.config();

const HISTORY_INTERVAL_S = Number( process.env.HISTORY_INTERVAL_S ) || 60;
const HISTORY_LIMIT = Number( process.env.HISTORY_LIMIT ) || 10;

const LIKES_INTERVAL_S = Number( process.env.LIKES_INTERVAL_S ) || 60;
const LIKES_LIMIT = Number( process.env.LIKES_LIMIT ) || 10;


class TrackWatcher extends EventEmitter {

    constructor( interval, limit ) {
        super();
        this.interval = interval || 60;
        this.limit = limit || 10;
        this.lastUpdate = 0;
    }

    // endpoint() {};
    // filter( items ) {};

    async update() {

        const timestamp = Date.now();

        if ( timestamp < this.lastUpdate + this.interval * 1000 ) {
            return;
        }

        this.lastUpdate = timestamp;

        const url = `${this.endpoint()}limit=${this.limit}`;
        const headers = await Auth.getHeader();
        const data = await fetch( url, { headers } );

        if ( data.status !== 200 ) {
            console.error( data.statusText );
            return;
        }

        const res = await data.json();
        const items = res.items;

        if ( items.length === 0 ) {
            return;
        }

        this.filter( items );

    }

}


export class HistoryWatcher extends TrackWatcher {

    //  https://developer.spotify.com/documentation/web-api/reference/get-recently-played
    //  returns [ track, played_at, context ]
    constructor() {
        super( HISTORY_INTERVAL_S, HISTORY_LIMIT );
        this.after = Date.now();
    }

    endpoint() {
        const base = "https://api.spotify.com/v1/me/player/recently-played?";
        if ( this.after == 0 ) return base;
        return base + `after=${this.after}&`;
    }

    filter( items ) {

        items.forEach( item => item.timestamp = new Date( item.played_at ).getTime() );
        let added = items.filter( item => item.timestamp > this.after );

        if ( added.length === 0 ) return;

        added.sort( ( a, b ) => a.timestamp - b.timestamp );
        this.after = added[ added.length - 1 ].timestamp;

        for ( const item of added ) {
            this.emit( "trackAdded", item );
        }

    }

}


export class LikesWatcher extends TrackWatcher {

    //  https://developer.spotify.com/documentation/web-api/reference/get-users-saved-tracks
    //  returns [ track, added_at ]
    constructor() {
        super( LIKES_INTERVAL_S, LIKES_LIMIT );
        this.latest = Date.now();
    }

    endpoint() {
        return `https://api.spotify.com/v1/me/tracks?`;
    }

    filter( items ) {

        items.forEach( item => item.timestamp = new Date( item.added_at ).getTime() );
        const added = items.filter( item => item.timestamp > this.latest );

        if ( added.length === 0 ) return;

        added.sort( ( a, b ) => a.timestamp - b.timestamp );
        this.latest = added[ added.length - 1 ].timestamp;

        for ( const item of added ) {
            this.emit( "trackAdded", item );
        }

    }

}



// history.on( "tracksAdded", ( tracks ) => {
//     historyDb.append( tracks );
// });

// likes.on( "tracksAdded", ( tracks ) => {
//     //  add tracks to monthly playlist
// });

// const playlists = new PlaylistWatcher( [ "SoundHound 2022", "SoundHound 2023", "Liked" ] );
// playlists.on( "tracksAdded", ( tracks ) => {
//     //  add tracks to monthly playlist
// });

// const discover = new PlaylistWatcher( "Discover Weekly" );
// discover.on( "changed", ( playlist ) => {
//     //  save snapshot
// });