let tokenCache = {
  accessToken: null,
  expiresAt: 0,
};

const getSpotifyAccessToken = async () => {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Spotify credentials are missing in server environment');
  }

  const now = Date.now();
  if (tokenCache.accessToken && now < tokenCache.expiresAt) {
    return tokenCache.accessToken;
  }

  const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (!tokenResponse.ok) {
    throw new Error('Failed to fetch Spotify access token');
  }

  const tokenData = await tokenResponse.json();
  tokenCache = {
    accessToken: tokenData.access_token,
    expiresAt: now + (tokenData.expires_in - 60) * 1000,
  };

  return tokenCache.accessToken;
};

export default async function handler(req, res) {
  const q = String(req.query.q || '').trim();
  const limit = Number(req.query.limit || 10);

  if (!q) {
    return res.status(400).json({ message: 'Missing query parameter q.' });
  }

  try {
    const accessToken = await getSpotifyAccessToken();
    const response = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=${Math.min(Math.max(limit, 1), 20)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      return res.status(response.status).json({ message: 'Spotify search failed.' });
    }

    const data = await response.json();
    const tracks = (data?.tracks?.items || []).map((track) => ({
      id: track.id,
      title: track.name,
      artist: (track.artists || []).map((a) => a.name).join(', '),
      album: track.album?.name || '',
      previewUrl: track.preview_url,
      spotifyUrl: track.external_urls?.spotify || `https://open.spotify.com/track/${track.id}`,
      image: track.album?.images?.[0]?.url || 'https://via.placeholder.com/100',
      duration: Math.floor((track.duration_ms || 0) / 1000),
    }));

    return res.status(200).json({ tracks });
  } catch (error) {
    return res.status(500).json({
      message: 'Unable to connect to Spotify.',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
