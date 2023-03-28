import chalk from "chalk";


let log = console.log;
let info = console.info;
let debug = console.debug;
let warn = console.warn;
let error = console.error;

console.log = function() {

    let args = [];
    const time = new Date().toISOString().substring( 11, 19 );
    args.push( chalk.gray( "[" + time + "] " ) );

    for( var i = 0; i < arguments.length; i++ ) {
        args.push( arguments[i] );
    }

    log.apply( console, args );

}

console.error = function() {

    let args = [];
    const time = new Date().toISOString().substring( 11, 19 );
    args.push( chalk.redBright( "[" + time + "] " ) );

    for( var i = 0; i < arguments.length; i++ ) {
        args.push( arguments[i] );
    }

    error.apply( console, args );

}

console.warn = function() {

    let args = [];
    const time = new Date().toISOString().substring( 11, 19 );
    args.push( chalk.yellowBright( "[" + time + "] " ) );

    for( var i = 0; i < arguments.length; i++ ) {
        args.push( arguments[i] );
    }

    warn.apply( console, args );

}

console.info = function() {

    let args = [];
    const time = new Date().toISOString().substring( 11, 19 );
    args.push( chalk.cyanBright( "[" + time + "] " ) );

    for( var i = 0; i < arguments.length; i++ ) {
        args.push( arguments[i] );
    }

    info.apply( console, args );

}

console.debug = function() {

    let args = [];
    const time = new Date().toISOString().substring( 11, 19 );
    args.push( chalk.cyan( "[" + time + "] " ) );

    for( var i = 0; i < arguments.length; i++ ) {
        args.push( arguments[i] );
    }

    debug.apply( console, args );

}


const icons = {
    success: "✔️",
    failure: "❌",
    started: "⏳",
    stopped: "✋",
    watching: "👁️",
    listening: "👂",
    running: "🏃",
    timing: "⏱️",
    writing: "✏️",
    bug: "🐞",

    debug: "🛠️",
    info: "💡",
    hot: "🌡️",
    invalid: "⛔",
    inspect: "🔍",
    settings: "⚙️",
    link: "🔗",

    brotli: "🥦",
    zlib: "🗜️",
    yarn: "🧶",
    vite: "⚡",

    file: "📝",
    folder: "📁",
    home: "🏠",
    label: "🏷️",
    bookmark: "🔖",
    star: "⭐",
    add: "➕",
    remove: "➖",
    layer: "🧅",
    lock: "🔒",
    unlock: "🔓",

    cloud: "☁️",
    message: "✉️",
    notification: "💬",
    incoming: "📩",
    packet: "📦",

    statistics: "📋",
    data: "📊",
    increase: "📈",
    decrease: "📉",
    slow: "🐌",
    fast: "🐆",
    speed: "🏇",
    performance: "🏎️",

    world: "🌍",
    audio: "🎵",
    sound: "🔊",
    room: "🚪",
    user: "🧑",
    request: "🙋",
    media: "📺",
    video: "🎥",
    audio: "🎧",
    save: "💾",
    call: "🤙",

    tree: "🌳",
    leaf: "🍃",
    unreachable: "🍂",
    root: "🌱",
    dead: "💀",

    reward: "🍰",
    snapshot: "📷",
    sad: "😢",
    love: "❤️",
    power: "🔌",
    approve: "👍",
    disapprove: "👎",
    location: "📍",
    color: "🌈",
    component: "🔩",
    vanilla: "🍦",
};


export const safeIcons = {
    success: "✔️",
    failure: "❌",
    started: "⏳",
    stopped: "✋",
    timing: "⏱️",
    writing: "✏️",

    invalid: "⛔",
    settings: "⚙️",
    vite: "⚡",

    add: "➕",
    remove: "➖",
    cloud: "☁️",
    message: "✉️",
    love: "❤️"
};


const Bugle = {
    icons,
    safeIcons
};

export default Bugle;