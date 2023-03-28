import { Router } from "express";
import * as dotenv from "dotenv"
import fs from "fs/promises"
import { existsSync } from "fs";

dotenv.config();
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const AUTH_FILE = "db/auth.json";
const REDIRECT_URI = "http://localhost:8888/callback";

const router = Router();

let tokens = {
    access_token: 'BQCVryP8_8ZqYwivdNXZFZhIrQ44ez1bTGb1-nIUBW7NKRLWydByLN9HfUIJDD43owZcoJjaDbdbJjGOj6w_QaPFqtzPhG1oO60iMd-gkvjXi7kDaFVPSP1P5ppVZ2TXomickJ4yuPa8-07WDy8t1xE0OuLVZw30Im-T6qZwMqQOHmMGD_56ZM0yY0LsrixabirJm946n6095_fAH-VtuVycn85HFdGD3QiSx4SmrpoLvmD2lTFIjPKzsqG9Da3sNurDyEDcrPIR-v0SQMw',
    token_type: 'Bearer',
    expires_in: 3600,
    created_at: 1679962731152,
    refresh_token: 'AQCvNP4ZZ4ukDhzdo3AAkVF8NB4XhczeuZKBKuACPOZ3S_mtfPz9YpX8_Fcu4yCPyht_abU3pUtInowXFwHG_uEUTaM6aEULmty4QTs9ZXJaXnC-fVd90-FySz6VucuYuhc',
    scope: 'playlist-read-private user-library-read playlist-modify-private playlist-modify-public user-read-email user-read-private'
};

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
    console.log( tokens );
}


async function restoreTokens() {
    console.log( "loading auth tokens ..." );
    if ( ! existsSync( AUTH_FILE ) ) return;
    tokens = JSON.parse( await fs.readFile( AUTH_FILE ) );
    console.log( tokens );
}


async function authorizationHeader() {
    const tokenExpired = new Date( tokens.created_at + ( tokens.expires_in - 10 ) * 1000 ) < Date.now();
    if ( tokenExpired ) await fetch( "http://localhost:8888/refresh" );
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


await restoreTokens();


const Auth = {
    router,
    tokens,
    getHeader: authorizationHeader
};

export default Auth;