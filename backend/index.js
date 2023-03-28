import express from "express"
import cors from "cors"
import Auth from "./src/auth.js"
import State from "./src/state.js";
import "./src/observer.js"

const app = express();
app.use( cors() );
app.use( "/", Auth.router );

await State.load();


app.get( "/user", async ( req, res ) => {

    const headers = Auth.getHeader();
    const data = await fetch( "https://api.spotify.com/v1/me", { headers });
    const user = await data.json();
    console.log( user );
    res.send( user );

});


app.get( "/playlists", async ( req, res ) => {
    const names = State.state.playlists.map( p => p.name );
    res.send( names );
});


app.get( "/liked", async ( req, res ) => {
    res.send( State.state.liked.length.toFixed() + " liked songs" );
});


app.get( "/monthlies", async ( req, res ) => {
    res.send( Object.keys( State.monthlies() ) );
});


app.get( "/fetch/liked", async ( req, res ) => {
    State.fetchLiked();
    res.sendStatus( 202 );
});


app.get( "/fetch/playlists", async ( req, res ) => {
    State.fetchPlaylists();
    res.sendStatus( 202 );
});


app.listen( 8888, () => {
    console.log( "listening on 8888 ..." );
});