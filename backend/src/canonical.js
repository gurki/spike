// Spotify track relinking substitutes market-specific replacement tracks.
// The original is in linked_from; keying on the replacement would split the
// same song across markets. Local files (spotify:local:...) have stable URIs
// but no catalog metadata.

export const canonicalUri = (track) => track?.linked_from?.uri ?? track?.uri
