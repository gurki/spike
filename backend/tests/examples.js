const RECENTLY_PLAYED = {
  track: TRACK,
  played_at: '2023-10-06T21:15:53.359Z',
  context: {
    type: 'playlist',
    href: 'https://api.spotify.com/v1/playlists/2VzULKG8pguMsYxNsJZVfq',
    external_urls: {
      spotify: 'https://open.spotify.com/playlist/2VzULKG8pguMsYxNsJZVfq'
    },
    uri: 'spotify:playlist:2VzULKG8pguMsYxNsJZVfq'
  }
}


//  https://developer.spotify.com/documentation/web-api/reference/get-track

const TRACK = {
  album: ALBUM,
  artists: [ [Object], [Object] ],
  available_markets: [
    'AR', 'AU', 'AT', 'BE', 'BO', 'BR', 'BG', 'CA', 'CL', 'CO',
    'CR', 'CY', 'CZ', 'DK', 'DO', 'DE', 'EC', 'EE', 'SV', 'FI',
    'FR', 'GR', 'GT', 'HN', 'HK', 'HU', 'IS', 'IE', 'IT', 'LV',
    'LT', 'LU', 'MY', 'MT', 'MX', 'NL', 'NZ', 'NI', 'NO', 'PA',
    'PY', 'PE', 'PH', 'PL', 'PT', 'SG', 'SK', 'ES', 'SE', 'CH',
    'TW', 'TR', 'UY', 'US', 'GB', 'AD', 'LI', 'MC', 'ID', 'JP',
    'TH', 'VN', 'RO', 'IL', 'ZA', 'SA', 'AE', 'BH', 'QA', 'OM',
    'KW', 'EG', 'MA', 'DZ', 'TN', 'LB', 'JO', 'PS', 'IN', 'BY',
    'KZ', 'MD', 'UA', 'AL', 'BA', 'HR', 'ME', 'MK', 'RS', 'SI',
    'KR', 'BD', 'PK', 'LK', 'GH', 'KE', 'NG', 'TZ', 'UG', 'AG',
  ],
  disc_number: 1,
  duration_ms: 47685,
  explicit: false,
  external_ids: { isrc: 'FRX762200233' },
  external_urls: {
    spotify: 'https://open.spotify.com/track/6CYTU9j44LQtmJkKZzlDFq'
  },
  href: 'https://api.spotify.com/v1/tracks/6CYTU9j44LQtmJkKZzlDFq',
  id: '6CYTU9j44LQtmJkKZzlDFq',
  is_local: false,
  name: 'LUDE',
  popularity: 19,
  preview_url: 'https://p.scdn.co/mp3-preview/35a30313273752f2300dd6e8cbd78923909e16c5?cid=114e4ed20a1d4468a99f44b572bf5b9b',
  track_number: 8,
  type: 'track',
  uri: 'spotify:track:6CYTU9j44LQtmJkKZzlDFq'
}


const ALBUM = {
  album_type: 'album',
  artists: [
    {
      external_urls: [Object],
      href: 'https://api.spotify.com/v1/artists/24OnVX6EYwtu7P3jpMenPY',
      id: '24OnVX6EYwtu7P3jpMenPY',
      name: 'The Kount',
      type: 'artist',
      uri: 'spotify:artist:24OnVX6EYwtu7P3jpMenPY'
    },
    {
      external_urls: [Object],
      href: 'https://api.spotify.com/v1/artists/0QalUUx2C9F1PGbfQVcHAd',
      id: '0QalUUx2C9F1PGbfQVcHAd',
      name: 'Kaelin Ellis',
      type: 'artist',
      uri: 'spotify:artist:0QalUUx2C9F1PGbfQVcHAd'
    }
  ],
  available_markets: [
    'AR', 'AU', 'AT', 'BE', 'BO', 'BR', 'BG', 'CA', 'CL', 'CO',
    'CR', 'CY', 'CZ', 'DK', 'DO', 'DE', 'EC', 'EE', 'SV', 'FI',
    'FR', 'GR', 'GT', 'HN', 'HK', 'HU', 'IS', 'IE', 'IT', 'LV',
    'LT', 'LU', 'MY', 'MT', 'MX', 'NL', 'NZ', 'NI', 'NO', 'PA',
    'PY', 'PE', 'PH', 'PL', 'PT', 'SG', 'SK', 'ES', 'SE', 'CH',
    'TW', 'TR', 'UY', 'US', 'GB', 'AD', 'LI', 'MC', 'ID', 'JP',
    'TH', 'VN', 'RO', 'IL', 'ZA', 'SA', 'AE', 'BH', 'QA', 'OM',
    'KW', 'EG', 'MA', 'DZ', 'TN', 'LB', 'JO', 'PS', 'IN', 'BY',
    'KZ', 'MD', 'UA', 'AL', 'BA', 'HR', 'ME', 'MK', 'RS', 'SI',
    'KR', 'BD', 'PK', 'LK', 'GH', 'KE', 'NG', 'TZ', 'UG', 'AG',
  ],
  external_urls: { spotify: 'https://open.spotify.com/album/2FsL8EEjgrmyyHwe9FLxXA' },
  href: 'https://api.spotify.com/v1/albums/2FsL8EEjgrmyyHwe9FLxXA',
  id: '2FsL8EEjgrmyyHwe9FLxXA',
  images: [
    {
      height: 640,
      url: 'https://i.scdn.co/image/ab67616d0000b273a7b55b922cde8ca3368c2d6e',
      width: 640
    },
    {
      height: 300,
      url: 'https://i.scdn.co/image/ab67616d00001e02a7b55b922cde8ca3368c2d6e',
      width: 300
    },
    {
      height: 64,
      url: 'https://i.scdn.co/image/ab67616d00004851a7b55b922cde8ca3368c2d6e',
      width: 64
    }
  ],
  name: 'Vignette',
  release_date: '2022-09-23',
  release_date_precision: 'day',
  total_tracks: 13,
  type: 'album',
  uri: 'spotify:album:2FsL8EEjgrmyyHwe9FLxXA'
}