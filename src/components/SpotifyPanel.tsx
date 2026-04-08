import { useState, useCallback, useRef, useEffect } from 'react';
import { X, Search, Music, Loader2, Play, Pause } from 'lucide-react';

interface SpotifyTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  previewUrl: string | null;
  image: string;
  duration: number;
}

interface SpotifyPanelProps {
  onClose: () => void;
  onSelect: (song: { id: string; title: string; artist: string; previewUrl: string; startTime: number }) => void;
}

// Spotify API credentials - REPLACE THESE WITH YOUR OWN
// Get yours free at: https://developer.spotify.com/dashboard
const SPOTIFY_CLIENT_ID = '';
const SPOTIFY_CLIENT_SECRET = '';

const SpotifyPanel = ({ onClose, onSelect }: SpotifyPanelProps) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SpotifyTrack[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<SpotifyTrack | null>(null);
  const [startTime, setStartTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Get Spotify access token on mount
  useEffect(() => {
    const getAccessToken = async () => {
      if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
        setAuthError('Spotify API credentials not configured');
        return;
      }

      try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + btoa(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET)
          },
          body: 'grant_type=client_credentials'
        });

        if (!response.ok) {
          throw new Error('Failed to authenticate with Spotify');
        }

        const data = await response.json();
        setAccessToken(data.access_token);
      } catch (error) {
        setAuthError('Failed to connect to Spotify. Please check your API credentials.');
      }
    };

    getAccessToken();
  }, []);

  // Search tracks using Spotify API
  const searchTracks = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || !accessToken) {
      if (!accessToken) {
        setAuthError('Not connected to Spotify');
      }
      setResults([]);
      return;
    }

    setIsLoading(true);
    setAuthError(null);

    try {
      const response = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=10`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          setAuthError('Spotify session expired. Please refresh.');
          setAccessToken(null);
        }
        throw new Error('Search failed');
      }

      const data = await response.json();
      
      const tracks: SpotifyTrack[] = data.tracks.items.map((track: any) => ({
        id: track.id,
        title: track.name,
        artist: track.artists.map((a: any) => a.name).join(', '),
        album: track.album.name,
        previewUrl: track.preview_url,
        image: track.album.images[0]?.url || 'https://via.placeholder.com/100',
        duration: Math.floor(track.duration_ms / 1000)
      }));

      setResults(tracks);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

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
        previewUrl: selectedTrack.previewUrl || '',
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
                <li>Go to <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer">Spotify Developer Dashboard</a></li>
                <li>Create a free app</li>
                <li>Copy your <strong>Client ID</strong> and <strong>Client Secret</strong></li>
                <li>Add them to the SpotifyPanel.tsx file</li>
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
            disabled={!accessToken}
          />
          <button type="submit" disabled={isLoading || !accessToken}>
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
                  <span className="no-preview-warning">No preview available</span>
                )}
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
                disabled={!selectedTrack.previewUrl}
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