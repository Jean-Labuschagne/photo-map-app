import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Play, Pause, Volume2, VolumeX } from 'lucide-react';
import type { PhotoPin } from '../App';

interface SlideshowProps {
  pin: PhotoPin;
  onClose: () => void;
}

const Slideshow = ({ pin, onClose }: SlideshowProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const photoDuration = 5000; // 5 seconds per photo

  // Initialize audio
  useEffect(() => {
    if (pin.song?.previewUrl) {
      audioRef.current = new Audio(pin.song.previewUrl);
      audioRef.current.currentTime = pin.song.startTime || 0;
      audioRef.current.volume = isMuted ? 0 : 1;
      
      if (isPlaying) {
        audioRef.current.play().catch(() => {
          // Auto-play blocked, user needs to interact
        });
      }
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [pin.song]);

  // Handle mute toggle
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : 1;
    }
  }, [isMuted]);

  // Slideshow progression
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setProgress(prev => {
          const newProgress = prev + (100 / (photoDuration / 100));
          if (newProgress >= 100) {
            setCurrentIndex(idx => (idx + 1) % pin.photos.length);
            return 0;
          }
          return newProgress;
        });
      }, 100);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, pin.photos.length]);

  // Handle play/pause
  const togglePlay = useCallback(() => {
    setIsPlaying(prev => !prev);
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(() => {});
      }
    }
  }, [isPlaying]);

  // Handle mute toggle
  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev);
  }, []);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          onClose();
          break;
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
          setCurrentIndex(idx => (idx + 1) % pin.photos.length);
          setProgress(0);
          break;
        case 'ArrowLeft':
          setCurrentIndex(idx => (idx - 1 + pin.photos.length) % pin.photos.length);
          setProgress(0);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, togglePlay, pin.photos.length]);

  return (
    <section className="slideshow-section">
      {/* Background Photos */}
      <div className="slideshow-backgrounds">
        {pin.photos.map((photo, index) => (
          <div
            key={index}
            className={`slideshow-bg ${index === currentIndex ? 'active' : ''}`}
            style={{ backgroundImage: `url(${photo})` }}
          />
        ))}
      </div>

      {/* Overlay */}
      <div className="slideshow-overlay" />

      {/* Top Bar */}
      <div className="slideshow-top-bar">
        <div className="slideshow-location">
          <h3>{pin.name}</h3>
          <span>{currentIndex + 1} / {pin.photos.length}</span>
        </div>
        <div className="slideshow-controls">
          <button onClick={togglePlay}>
            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
          </button>
          <button onClick={toggleMute}>
            {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
          <button onClick={onClose}>
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Song Info */}
      {pin.song && (
        <div className="slideshow-song">
          <MusicIcon />
          <span>{pin.song.title}</span>
          <span className="song-artist">— {pin.song.artist}</span>
        </div>
      )}

      {/* Progress Bar */}
      <div className="slideshow-progress">
        <div 
          className="progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Navigation Hints */}
      <div className="slideshow-hints">
        <span>Use arrow keys to navigate</span>
        <span>Space to pause</span>
        <span>ESC to exit</span>
      </div>
    </section>
  );
};

const MusicIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

export default Slideshow;