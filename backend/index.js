import "./src/bugle.js"
import { safeIcons } from "./src/bugle.js"

import Auth from "./src/auth.js"
import Liked from "./src/liked.js"
import Playlists from "./src/playlists.js"
import History from "./src/history.js"
import Observer from "./src/observer.js"

import { HistoryWatcher, LikesWatcher } from "./src/watcher.js"

import express from "express"
import cors from "cors"

import * as dotenv from "dotenv"
dotenv.config();

const PORT = process.env.PORT || 8888;
const STARTUP_FETCH_ALL = process.env.STARTUP_FETCH_ALL || false;

const app = express();
app.use( cors() );
app.use( "/", Auth.router );


app.get( "/user", async ( req, res ) => {

    const headers = Auth.getHeader();
    const data = await fetch( "https://api.spotify.com/v1/me", { headers });
    const user = await data.json();
    console.log( user );
    res.send( user );

});


app.get( "/playlists", async ( req, res ) => {
    const names = Playlists.playlists.map( p => p.name );
    res.send( names );
});


app.get( "/liked", async ( req, res ) => {
    res.send( Liked.liked.length.toFixed() + " liked songs" );
});


app.get( "/monthlies", async ( req, res ) => {
    res.send( Object.keys( Playlists.monthlies ) );
});


app.get( "/fetch/liked", async ( req, res ) => {
    Liked.fetch();
    res.sendStatus( 202 );
});


app.get( "/fetch/playlists", async ( req, res ) => {
    Playlists.fetch();
    res.sendStatus( 202 );
});


app.listen( PORT, async () => {

    console.log( safeIcons.started, "spike 🦔 listening on", PORT, "..." );

    const authenticated = await Auth.init();

    if ( ! authenticated ) {
        console.error( safeIcons.failure, `authentication failed. did you call http://127.0.0.1:${PORT}/login already?` );
        return;
    }

    let history = new HistoryWatcher();
    let likes = new LikesWatcher();

    history.on( "tracksAdded", tracks => {
        console.log( "new tracks:", tracks[0].played_at );
    });

    likes.on( "tracksAdded", tracks => {
        console.log( "new likes: ",  tracks[0].added_at );
    });

    history.start();
    likes.start();
    return;


    if ( STARTUP_FETCH_ALL ) {
        await Liked.fetch();
        await Playlists.fetch();
    } else {
        await Liked.load();
        await Playlists.load();
    }

    await History.load();
    Observer.start();

});