import Auth from "./auth.js"
import { safeIcons } from "./bugle.js";
import { EventEmitter } from "node:events"

import * as dotenv from "dotenv"
dotenv.config();

const HISTORY_INTERVAL_S = Number( process.env.HISTORY_INTERVAL_S ) || 60;
const HISTORY_LIMIT = Number( process.env.HISTORY_LIMIT ) || 10;


class TrackWatcher extends EventEmitter {

    constructor() {
        super();
    }

    endpoint() {};
    filter() {};

    async update() {

        const url = `${this.endpoint()}limit=${HISTORY_LIMIT}`;
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
        super();
        this.after = Date.now();
    }

    endpoint() {
        const base = "https://api.spotify.com/v1/me/player/recently-played?";
        if ( this.after == 0 ) return base;
        return base + `after=${this.after}&`;
    }

    filter( items ) {
        const added = items.filter( item => new Date( item.played_at ).getTime() > this.after );
        if ( added.length === 0 ) return;
        this.after = Date.now();
        this.emit( "tracksAdded", added );
    }

}


export class LikesWatcher extends TrackWatcher {

    //  https://developer.spotify.com/documentation/web-api/reference/get-users-saved-tracks
    //  returns [ track, added_at ]
    constructor() {
        super();
        this.latest = Date.now();
    }

    endpoint() {
        return `https://api.spotify.com/v1/me/tracks?`;
    }

    filter( items ) {
        const added = items.filter( item => new Date( item.added_at ).getTime() > this.latest );
        if ( added.length === 0 ) return;
        this.latest = new Date( added[ 0 ].added_at ).getTime();
        this.emit( "tracksAdded", added );
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