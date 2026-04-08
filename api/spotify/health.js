export default async function handler(_req, res) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({
      configured: false,
      message: 'Spotify credentials are not configured on the server.',
    });
  }

  return res.status(200).json({ configured: true });
}
