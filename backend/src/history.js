import fs from "fs"
import { icons } from "./bugle.js";
import { getTrackInfo, toCsv } from "./util.js"

const HISTORY_FILE = "db/history.csv";


export class History {

    KEYS = [
        "timestamp",
        "uri",
        "name",
        "artists",
        "album",
        "durationMs",
        "cover",
        "preview",
        "external",
        "context",
    ]

    constructor() {
        this.items = [];
    }

    load() {

        if ( ! fs.existsSync( HISTORY_FILE ) ) {
            fs.writeFileSync( HISTORY_FILE, this.KEYS.join( ',' ) );
            return;
        }

        const buffer = fs.readFileSync( HISTORY_FILE );

        if ( buffer.length === 0 ) {
            console.error( "empty", HISTORY_FILE );
            return;
        }

        this.items = buffer.toString().split( "\n" ).slice( 1 );
        console.success( icons.file, `read ${this.items.length} tracks` );

    }

    append( item ) {

        const info = getTrackInfo( item.track );
        console.success( icons.audio, `played '${info.artists} - ${info.name}'` );

        const value = `${item.played_at},${toCsv( info )},${item.context?.uri}`;
        this.items.push( value );
        fs.appendFileSync( HISTORY_FILE, '\n' + value );

    }

}