import "./src/bugle.js"
import { icons } from "./src/bugle.js"

import Auth from "./src/auth.js"
import Playlists from "./src/playlists.js"

import { History } from "./src/history.js"
import { HistoryWatcher, LikesWatcher } from "./src/watcher.js"

import express from "express"
import cors from "cors"

import * as dotenv from "dotenv"
dotenv.config();

const CLIENT_ID = process.env.CLIENT_ID || "n/a";
const PORT = process.env.PORT || 8888;

const app = express();
app.use( cors() );
app.use( "/", Auth.router );


app.get( "/user", async ( _, res ) => {

    const headers = Auth.getHeader();
    const data = await fetch( "https://api.spotify.com/v1/me", { headers });
    const user = await data.json();
    console.log( user );
    res.send( user );

});


app.get( "/playlists", async ( _, res ) => {
    const names = Playlists.playlists.map( p => p.name );
    res.send( names );
});


app.get( "/liked", async ( _, res ) => {
    res.send( Liked.liked.length.toFixed() + " liked songs" );
});


app.get( "/monthlies", async ( _, res ) => {
    res.send( Object.keys( Playlists.monthlies ) );
});


app.get( "/fetch/liked", async ( _, res ) => {
    Liked.fetch();
    res.sendStatus( 202 );
});


app.get( "/fetch/playlists", async ( _, res ) => {
    Playlists.fetch();
    res.sendStatus( 202 );
});


let history = new History();
let historyWatcher = new HistoryWatcher();
let likesWatcher = new LikesWatcher();


app.listen( PORT, async () => {

    console.log( "🦔 spike listening on", PORT, "..." );

    const authenticated = await Auth.init();

    if ( ! authenticated ) {
        console.error( icons.failure, `authentication failed. 😢 visit http://127.0.0.1:${PORT}/login to log in 👋` );
        return;
    }

    console.success( icons.request, `authenticated as ${CLIENT_ID}` );

    history.load();
    historyWatcher.on( "trackAdded", item => history.append( item ) );
    likesWatcher.on( "trackAdded", item => Playlists.addMonthly( item ) );

    setInterval( () => {
        historyWatcher.update();
        likesWatcher.update();
    }, 10 * 1000 );

});