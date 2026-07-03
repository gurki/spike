// Month bucketing for monthly playlists. A like belongs to the calendar month
// in Europe/Berlin local time, not UTC - a like at 00:30 CEST on July 1st
// counts as July.

const TIME_ZONE = process.env.SPIKE_TZ || "Europe/Berlin"

// en-CA formats as YYYY-MM, which sorts correctly as a string
const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
})

export function localMonth(isoTimestamp) {
    const date = new Date(isoTimestamp)
    if (Number.isNaN(date.getTime())) throw new Error(`invalid timestamp: ${isoTimestamp}`)
    return fmt.format(date)
}
