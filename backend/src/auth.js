import { Router } from "express"
import fs from "node:fs/promises"
import { existsSync } from "node:fs"

import * as dotenv from "dotenv"
dotenv.config()

const CLIENT_ID = process.env.CLIENT_ID
const CLIENT_SECRET = process.env.CLIENT_SECRET
const PORT = Number(process.env.PORT) || 8888
const AUTH_FILE = "db/auth.json"
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`

const TOKEN_URL = "https://accounts.spotify.com/api/token"

const SCOPE = [
    "user-read-private",
    "user-read-email",
    "user-library-read",
    "user-read-recently-played",
    "playlist-read-private",
    "playlist-modify-private",
    "playlist-modify-public",
].join(" ")

const router = Router()
let tokens = {}

function basicAuthHeader() {
    return "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")
}

function isExpired(tokens) {
    if (!tokens.created_at || !tokens.expires_in) return true
    return tokens.created_at + (tokens.expires_in - 10) * 1000 < Date.now()
}

async function updateTokens(newTokens) {
    tokens = Object.assign({}, tokens, newTokens)
    tokens.created_at = Date.now()

    if (!existsSync("db")) await fs.mkdir("db")
    await fs.writeFile(AUTH_FILE, JSON.stringify(tokens, null, 2))

    const expiresAt = new Date(tokens.created_at + tokens.expires_in * 1000)
    console.log("🔑 tokens updated, expire at", expiresAt.toISOString())
}

async function tokenRequest(params) {
    const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: {
            "Authorization": basicAuthHeader(),
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(params),
    })

    if (!res.ok) {
        throw new Error(`token request failed: ${res.status} ${res.statusText}`)
    }

    await updateTokens(await res.json())
}

export async function refreshTokens() {
    if (!tokens.refresh_token) throw new Error("no refresh token - log in via /login")
    await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refresh_token })
}

async function restoreTokens() {
    if (!existsSync(AUTH_FILE)) return false
    tokens = JSON.parse(await fs.readFile(AUTH_FILE))

    if (isExpired(tokens)) {
        try {
            await refreshTokens()
        } catch (error) {
            console.error("🔑 token refresh failed:", error.message)
            return false
        }
    }

    return true
}

async function authorizationHeader() {
    if (isExpired(tokens)) await refreshTokens()
    return { "Authorization": `${tokens.token_type} ${tokens.access_token}` }
}

function generateRandomString(length) {
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    let text = ""
    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length))
    }
    return text
}

router.get("/login", (req, res) => {
    const params = new URLSearchParams({
        response_type: "code",
        client_id: CLIENT_ID,
        scope: SCOPE,
        redirect_uri: REDIRECT_URI,
        state: generateRandomString(16),
    })
    res.redirect("https://accounts.spotify.com/authorize?" + params.toString())
})

router.get("/callback", async (req, res) => {
    const code = req.query.code || null
    try {
        await tokenRequest({ code, redirect_uri: REDIRECT_URI, grant_type: "authorization_code" })
        res.send("🦔 logged in")
    } catch (error) {
        console.error("🔑 login failed:", error.message)
        res.status(502).send(error.message)
    }
})

const Auth = {
    router,
    getHeader: authorizationHeader,
    refreshTokens,
    init: restoreTokens,
}

export default Auth
