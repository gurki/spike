import { Router } from "express";
import fs from "fs/promises"
import { existsSync } from "fs";

import * as dotenv from "dotenv"
dotenv.config();

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const PORT = Number( process.env.PORT ) || 8888;
const AUTH_FILE = "db/auth.json";
const LOCAL_URL = "http://localhost:" + PORT;
const REDIRECT_URI = LOCAL_URL + "/callback";

const router = Router();
let tokens = {};

const SCOPE = [
    "user-read-private",
    "user-read-email",
    "user-library-read",
    "user-read-recently-played",
    "playlist-read-private",
    "playlist-modify-private",
    "playlist-modify-public",
].join( ' ' );


async function updateTokens( newTokens ) {

    console.log( "updating auth tokens ..." );

    tokens = Object.assign( {}, tokens, newTokens );
    tokens.created_at = Date.now();
    fs.writeFile( AUTH_FILE, JSON.stringify( tokens, null, 2 ) );

    console.log( "new token expires at", new Date( tokens.created_at ).toISOString() );

}


async function restoreTokens() {

    console.log( "loading auth tokens ..." );

    if ( ! existsSync( AUTH_FILE ) ) return;
    tokens = JSON.parse( await fs.readFile( AUTH_FILE ) );

    if ( isExpired( tokens ) ) {
        console.warn( "token expired" );
        await fetch( `http://localhost:${PORT}/refresh` );
    }

}

function isExpired( tokens ) {
    return new Date( tokens.created_at + ( tokens.expires_in - 10 ) * 1000 ) < Date.now();
}

async function authorizationHeader() {
    if ( isExpired( tokens ) ) await fetch( "http://localhost:8888/refresh" );
    return { "Authorization": tokens.token_type + " " + tokens.access_token };
}


function generateRandomString( length ) {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for ( let i = 0; i < length; i++ ) {
        text += possible.charAt( Math.floor( Math.random() * possible.length ) );
    }
    return text;
};


router.get( "/login", ( req, res ) => {

    console.log( "login ..." );

    const state = generateRandomString( 16 );
    const params = new URLSearchParams({
        response_type: "code",
        client_id: CLIENT_ID,
        scope: SCOPE,
        redirect_uri: REDIRECT_URI,
        state: state
    });

    res.redirect( "https://accounts.spotify.com/authorize?" + params.toString() );

});


router.get( "/callback", async ( req, res ) => {

    console.log( "callback ..." );

    const code = req.query.code || null;
    const result = await fetch( "https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
            "Authorization": "Basic " + ( new Buffer.from( CLIENT_ID + ':' + CLIENT_SECRET ).toString( "base64" ) ),
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
            code: code,
            redirect_uri: REDIRECT_URI,
            grant_type: "authorization_code"
        })
    });

    if ( result.status !== 200 ) {
        console.log( result.status, result.statusText );
        res.sendStatus( result.status );
        return;
    }

    updateTokens( await result.json() );
    res.sendStatus( result.status );

});


router.get( "/refresh", async ( req, res ) => {

    console.log( "refresh ..." );

    const data = await fetch( "https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
            "Authorization": "Basic " + ( new Buffer.from( CLIENT_ID + ':' + CLIENT_SECRET ).toString( "base64" ) ),
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: tokens.refresh_token
        })
    });

    if ( data.status !== 200 ) {
        console.log( data.status, data.statusText );
        res.sendStatus( data.status );
        return;
    }

    updateTokens( await data.json() );
    res.sendStatus( data.status );

});


const Auth = {
    router,
    tokens,
    getHeader: authorizationHeader,
    init: restoreTokens
};

export default Auth;