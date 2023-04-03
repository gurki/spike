import "./src/bugle.js"
import { safeIcons } from "./src/bugle.js";

import Auth from "./src/auth.js"
import Liked from "./src/liked.js";
import Playlists from "./src/playlists.js";
import History from "./src/history.js";
import Observer from "./src/observer.js"

import express from "express"
import cors from "cors"

import * as dotenv from "dotenv"
dotenv.config();

const PORT = process.env.PORT || 8888;

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

    console.log( safeIcons.started, "listening on", PORT, "..." );

    await Auth.init();
    await Liked.load();
    await Playlists.load();
    await History.load();

    Observer.start();

});