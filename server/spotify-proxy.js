import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = Number(process.env.SPOTIFY_PROXY_PORT || 8787);
const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json());

let tokenCache = {
  accessToken: null,
  expiresAt: 0,
};

const hasConfig = () => Boolean(clientId && clientSecret);

const getSpotifyAccessToken = async () => {
  const now = Date.now();

  if (tokenCache.accessToken && now < tokenCache.expiresAt) {
    return tokenCache.accessToken;
  }

  if (!hasConfig()) {
    throw new Error('Spotify credentials are missing in server environment');
  }

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch Spotify access token');
  }

  const data = await response.json();
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: now + (data.expires_in - 60) * 1000,
  };

  return tokenCache.accessToken;
};

app.get('/api/spotify/health', (_req, res) => {
  if (!hasConfig()) {
    return res.status(500).json({
      configured: false,
      message: 'Spotify credentials are not configured on the server.',
    });
  }

  return res.json({ configured: true });
});

app.get('/api/spotify/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const limit = Number(req.query.limit || 10);

  if (!q) {
    return res.status(400).json({ message: 'Missing query parameter q.' });
  }

  try {
    const token = await getSpotifyAccessToken();
    const response = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=${Math.min(Math.max(limit, 1), 20)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
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
      spotifyUrl: track.external_urls?.spotify || '',
      image: track.album?.images?.[0]?.url || 'https://via.placeholder.com/100',
      duration: Math.floor((track.duration_ms || 0) / 1000),
    }));

    return res.json({ tracks });
  } catch (error) {
    return res.status(500).json({
      message: 'Unable to connect to Spotify.',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.listen(port, () => {
  console.log(`Spotify proxy running on http://localhost:${port}`);
});
