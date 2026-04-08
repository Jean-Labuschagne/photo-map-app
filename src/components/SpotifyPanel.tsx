import { useState, useCallback, useRef, useEffect } from 'react';
import { X, Search, Music, Loader2, Play, Pause } from 'lucide-react';

interface SpotifyTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  previewUrl: string | null;
  spotifyUrl: string;
  image: string;
  duration: number;
}

interface SpotifyPanelProps {
  onClose: () => void;
  onSelect: (song: { id: string; title: string; artist: string; previewUrl: string | null; spotifyUrl: string; startTime: number }) => void;
}

const SPOTIFY_PROXY_URL = 'http://localhost:8787';

const SpotifyPanel = ({ onClose, onSelect }: SpotifyPanelProps) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SpotifyTrack[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<SpotifyTrack | null>(null);
  const [startTime, setStartTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSpotifyReady, setIsSpotifyReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Verify the server-side proxy has Spotify credentials configured.
  useEffect(() => {
    const checkSpotifyHealth = async () => {
      try {
        const response = await fetch(`${SPOTIFY_PROXY_URL}/api/spotify/health`);

        if (!response.ok) {
          throw new Error('Spotify proxy is not configured');
        }

        setIsSpotifyReady(true);
        setAuthError(null);
      } catch (error) {
        setIsSpotifyReady(false);
        setAuthError('Spotify is not ready. Start the proxy server and configure server credentials.');
      }
    };

    checkSpotifyHealth();
  }, []);

  // Search tracks via the secure server-side proxy.
  const searchTracks = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || !isSpotifyReady) {
      if (!isSpotifyReady) {
        setAuthError('Spotify proxy is unavailable');
      }
      setResults([]);
      return;
    }

    setIsLoading(true);
    setAuthError(null);

    try {
      const response = await fetch(`${SPOTIFY_PROXY_URL}/api/spotify/search?q=${encodeURIComponent(searchQuery)}&limit=10`);

      if (!response.ok) {
        setAuthError('Spotify search failed. Check proxy server logs.');
        throw new Error('Search failed');
      }

      const data = await response.json();
      
      const tracks: SpotifyTrack[] = data.tracks.map((track: any) => ({
        id: track.id,
        title: track.title,
        artist: track.artist,
        album: track.album,
        previewUrl: track.previewUrl,
        spotifyUrl: track.spotifyUrl,
        image: track.image,
        duration: track.duration,
      }));

      setResults(tracks);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [isSpotifyReady]);

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    searchTracks(query);
  }, [query, searchTracks]);

  const handleTrackSelect = useCallback((track: SpotifyTrack) => {
    // Stop any playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlaying(false);

    setSelectedTrack(track);
    setStartTime(0);

    // Play preview if available
    if (track.previewUrl) {
      const audio = new Audio(track.previewUrl);
      audioRef.current = audio;
      audio.play()
        .then(() => setIsPlaying(true))
        .catch(() => {
          // Preview might not be available or autoplay blocked
          setIsPlaying(false);
        });

      audio.onended = () => setIsPlaying(false);
    }
  }, []);

  const togglePlay = useCallback(() => {
    if (!selectedTrack?.previewUrl) return;

    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else if (audioRef.current) {
      audioRef.current.play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    } else if (selectedTrack.previewUrl) {
      const audio = new Audio(selectedTrack.previewUrl);
      audioRef.current = audio;
      audio.play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
      audio.onended = () => setIsPlaying(false);
    }
  }, [isPlaying, selectedTrack]);

  const handleConfirm = useCallback(() => {
    if (selectedTrack) {
      onSelect({
        id: selectedTrack.id,
        title: selectedTrack.title,
        artist: selectedTrack.artist,
        previewUrl: selectedTrack.previewUrl,
        spotifyUrl: selectedTrack.spotifyUrl,
        startTime,
      });
    }
  }, [selectedTrack, startTime, onSelect]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  return (
    <div className="spotify-panel-overlay" onClick={onClose}>
      <div className="spotify-panel" onClick={e => e.stopPropagation()}>
        <div className="spotify-panel-header">
          <h3>
            <Music size={20} />
            Add a Song
          </h3>
          <button className="spotify-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Auth Error Message */}
        {authError && (
          <div className="spotify-auth-error">
            <p>{authError}</p>
            <div className="auth-instructions">
              <p><strong>To enable Spotify search:</strong></p>
              <ol>
                <li>Create <strong>app/.env</strong> from <strong>app/.env.example</strong></li>
                <li>Add <strong>SPOTIFY_CLIENT_ID</strong> and <strong>SPOTIFY_CLIENT_SECRET</strong></li>
                <li>Run <strong>npm run dev</strong> so the Spotify proxy starts</li>
              </ol>
            </div>
          </div>
        )}

        <form onSubmit={handleSearch} className="spotify-search">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search for a song or artist..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            disabled={!isSpotifyReady}
          />
          <button type="submit" disabled={isLoading || !isSpotifyReady}>
            {isLoading ? <Loader2 size={18} className="spin" /> : 'Search'}
          </button>
        </form>

        {results.length > 0 && !selectedTrack && (
          <div className="spotify-results">
            {results.map(track => (
              <div
                key={track.id}
                className={`spotify-track ${!track.previewUrl ? 'no-preview' : ''}`}
                onClick={() => handleTrackSelect(track)}
              >
                <img src={track.image} alt={track.album} />
                <div className="track-info">
                  <h4>{track.title}</h4>
                  <p>{track.artist}</p>
                  {!track.previewUrl && <span className="no-preview-badge">No preview</span>}
                </div>
                <span className="track-duration">{formatDuration(track.duration)}</span>
              </div>
            ))}
          </div>
        )}

        {selectedTrack && (
          <div className="spotify-selected">
            <div className="selected-track">
              <div className="selected-track-image">
                <img src={selectedTrack.image} alt={selectedTrack.album} />
                {selectedTrack.previewUrl && (
                  <button className="play-preview-btn" onClick={togglePlay}>
                    {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                  </button>
                )}
              </div>
              <div className="selected-info">
                <h4>{selectedTrack.title}</h4>
                <p>{selectedTrack.artist}</p>
                {!selectedTrack.previewUrl && (
                  <span className="no-preview-warning">No preview available. You can still add it and open in Spotify.</span>
                )}
                <a
                  className="spotify-open-link"
                  href={selectedTrack.spotifyUrl || `https://open.spotify.com/track/${selectedTrack.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open in Spotify
                </a>
              </div>
            </div>

            {selectedTrack.previewUrl && (
              <div className="start-time-control">
                <label>Start from:</label>
                <input
                  type="range"
                  min={0}
                  max={30}
                  value={startTime}
                  onChange={e => {
                    setStartTime(Number(e.target.value));
                    if (audioRef.current) {
                      audioRef.current.currentTime = Number(e.target.value);
                    }
                  }}
                />
                <span>{startTime}s</span>
              </div>
            )}

            <div className="spotify-actions">
              <button className="secondary" onClick={() => {
                if (audioRef.current) {
                  audioRef.current.pause();
                  audioRef.current = null;
                }
                setIsPlaying(false);
                setSelectedTrack(null);
              }}>
                Back
              </button>
              <button 
                className="primary" 
                onClick={handleConfirm}
              >
                Add to Album
              </button>
            </div>
          </div>
        )}

        {query && results.length === 0 && !isLoading && (
          <div className="spotify-empty">
            <p>No songs found</p>
            <span>Try a different search term</span>
          </div>
        )}

        {!query && !authError && (
          <div className="spotify-hint">
            <p>Search for songs to add to your slideshow</p>
            <span>Powered by Spotify</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default SpotifyPanel;