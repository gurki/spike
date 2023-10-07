export function getTrackInfo( track ) {

    return {
        uri: track.uri,
        name: track.name,
        artists: track.artists.map( artist => artist.name ).join( ', ' ),
        album: track.album.name,
        durationMs: track.duration_ms,
        cover: track.album.images[ 0 ].url,
        preview: track.preview_url,
        external: track.external_urls.spotify,
    }

}


export function toCsv( object ) {
    return Object.values( object ).map(
        value => typeof value === "string" ? '\"' + value + '\"' : value
    ).join( ',' );
}