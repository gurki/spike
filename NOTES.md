## Knowledge
- tracks get added to history when they end, independent of playtime before that (i.e. you can skip to a second before the end of a song, let it play out, and it'll be added to history)

## Issues
- playlists don't update automatically
    - e.g. rename playlist
    - db still has old entry and thinks it's the correct one
    - song gets added to "wrong" playlist
    - maybe re-fetch every day or so?
- how to handle removed songs?
  - e.g. like and unlike again
  - detect and remove from playlist?
  - probably just ignore and leave in

## Ideas
- refactor to watchers = trigger + action
- watch arbitrary playlists
    - e.g. add soundhound songs to monthlies
    - your own playlists
    - and other users playlist
    - how to deal with recursion lol
- multi-user
    - file/folder based
    - store client id/secret
    - at runtime
- history frontend
    - c.f. https://amie.so/
- endpoints to view state (e.g. history)
- statistical sorting (e.g. push often listened songs to top)
- save discover weekly snapshots
- podcasts?
    - differentiate to songs in history
    - saved podcasts
- create playlist with all albums for specific songs
- move to PKCE auth flow

## References
- https://developer.spotify.com/documentation/web-api/tutorials/code-flow
- https://ifttt.com/spotify/details