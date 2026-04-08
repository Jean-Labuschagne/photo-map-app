import { useState, useCallback } from 'react';
import Map from './components/Map';
import AlbumGrid from './components/AlbumGrid';
import Slideshow from './components/Slideshow';
import OptionCard from './components/OptionCard';
import AddPinModal from './components/AddPinModal';
import SpotifyPanel from './components/SpotifyPanel';
import { MapPin, Image, Play, Plus, X } from 'lucide-react';
import './App.css';

export interface PhotoPin {
  id: string;
  lat: number;
  lng: number;
  name: string;
  subtitle: string;
  photoCount: number;
  thumbnail: string;
  photos: string[];
  song?: {
    id: string;
    title: string;
    artist: string;
    previewUrl: string | null;
    spotifyUrl: string;
    startTime: number;
  };
}

const initialPins: PhotoPin[] = [
  {
    id: '1',
    lat: -33.9249,
    lng: 18.4241,
    name: 'Cape Town',
    subtitle: 'Western Cape, South Africa',
    photoCount: 12,
    thumbnail: 'https://images.unsplash.com/photo-1580060839134-75a5edca2e99?w=200&h=200&fit=crop',
    photos: [
      'https://images.unsplash.com/photo-1580060839134-75a5edca2e99?w=800&fit=crop',
      'https://images.unsplash.com/photo-1576485290814-1c72aa4bbb8e?w=800&fit=crop',
      'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=800&fit=crop',
      'https://images.unsplash.com/photo-1506953823976-52e1fdc0149a?w=800&fit=crop',
      'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800&fit=crop',
      'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800&fit=crop',
    ],
  },
  {
    id: '2',
    lat: -25.7461,
    lng: 28.1881,
    name: 'Pretoria',
    subtitle: 'Gauteng, South Africa',
    photoCount: 8,
    thumbnail: 'https://images.unsplash.com/photo-1596325066347-68b32d207327?w=200&h=200&fit=crop',
    photos: [
      'https://images.unsplash.com/photo-1596325066347-68b32d207327?w=800&fit=crop',
      'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&fit=crop',
      'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&fit=crop',
    ],
  },
  {
    id: '3',
    lat: -26.2041,
    lng: 28.0473,
    name: 'Johannesburg',
    subtitle: 'Gauteng, South Africa',
    photoCount: 15,
    thumbnail: 'https://images.unsplash.com/photo-1615112836250-9a4f492b45e8?w=200&h=200&fit=crop',
    photos: [
      'https://images.unsplash.com/photo-1615112836250-9a4f492b45e8?w=800&fit=crop',
      'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=800&fit=crop',
      'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=800&fit=crop',
    ],
  },
];

function App() {
  const [pins, setPins] = useState<PhotoPin[]>(initialPins);
  const [selectedPin, setSelectedPin] = useState<PhotoPin | null>(null);
  const [showAlbum, setShowAlbum] = useState(false);
  const [showSlideshow, setShowSlideshow] = useState(false);
  const [showSpotifyPanel, setShowSpotifyPanel] = useState(false);
  const [isAddingPin, setIsAddingPin] = useState(false);
  const [showAddPinModal, setShowAddPinModal] = useState(false);
  const [newPinLocation, setNewPinLocation] = useState<{ lat: number; lng: number } | null>(null);

  const handlePinClick = useCallback((pin: PhotoPin) => {
    setSelectedPin(pin);
    setShowAlbum(false);
    setShowSlideshow(false);
  }, []);

  const handleViewAlbum = useCallback(() => {
    setShowAlbum(true);
    setShowSlideshow(false);
  }, []);

  const handlePlaySlideshow = useCallback(() => {
    setShowSlideshow(true);
    setShowAlbum(false);
  }, []);

  const handleCloseAlbum = useCallback(() => {
    setShowAlbum(false);
  }, []);

  const handleCloseSlideshow = useCallback(() => {
    setShowSlideshow(false);
  }, []);

  const handleAddSong = useCallback(() => {
    setShowSpotifyPanel(true);
  }, []);

  const handleSongSelect = useCallback((song: { id: string; title: string; artist: string; previewUrl: string | null; spotifyUrl: string; startTime: number }) => {
    if (selectedPin) {
      setPins(prev => prev.map(p => 
        p.id === selectedPin.id 
          ? { ...p, song }
          : p
      ));
      setSelectedPin(prev => prev ? { ...prev, song } : null);
    }
    setShowSpotifyPanel(false);
  }, [selectedPin]);

  const handleAddPinClick = useCallback(() => {
    setIsAddingPin(true);
    setSelectedPin(null);
    setShowAlbum(false);
    setShowSlideshow(false);
  }, []);

  const handleMapClick = useCallback((lng: number, lat: number) => {
    if (isAddingPin) {
      setNewPinLocation({ lat, lng });
      setShowAddPinModal(true);
      setIsAddingPin(false);
    }
  }, [isAddingPin]);

  const handleAddPin = useCallback((newPin: PhotoPin) => {
    setPins(prev => [...prev, newPin]);
    setShowAddPinModal(false);
    setNewPinLocation(null);
    setSelectedPin(newPin);
  }, []);

  const handleCancelAddPin = useCallback(() => {
    setShowAddPinModal(false);
    setNewPinLocation(null);
    setIsAddingPin(false);
  }, []);

  const handleAddPhoto = useCallback((pinId: string, photoUrl: string) => {
    setPins(prev => prev.map(p => 
      p.id === pinId 
        ? { ...p, photos: [...p.photos, photoUrl], photoCount: p.photoCount + 1 }
        : p
    ));
    if (selectedPin?.id === pinId) {
      setSelectedPin(prev => prev ? { 
        ...prev, 
        photos: [...prev.photos, photoUrl],
        photoCount: prev.photoCount + 1 
      } : null);
    }
  }, [selectedPin]);

  const handleRemovePhoto = useCallback((pinId: string, photoIndex: number) => {
    setPins(prev => prev.map(p => {
      if (p.id === pinId) {
        const newPhotos = p.photos.filter((_, i) => i !== photoIndex);
        return { ...p, photos: newPhotos, photoCount: newPhotos.length };
      }
      return p;
    }));
    if (selectedPin?.id === pinId) {
      setSelectedPin(prev => {
        if (!prev) return null;
        const newPhotos = prev.photos.filter((_, i) => i !== photoIndex);
        return { ...prev, photos: newPhotos, photoCount: newPhotos.length };
      });
    }
  }, [selectedPin]);

  const handleBackToMap = useCallback(() => {
    setSelectedPin(null);
    setShowAlbum(false);
    setShowSlideshow(false);
  }, []);

  return (
    <div className="app">
      {/* Grain overlay */}
      <div className="grain-overlay" />
      
      {/* Navigation */}
      <nav className="nav">
        <div className="nav-logo">
          <MapPin className="nav-logo-icon" />
          <span>PhotoGlobe</span>
        </div>
        <div className="nav-links">
          <button onClick={handleBackToMap} className={!selectedPin && !showAlbum && !showSlideshow ? 'active' : ''}>
            <MapPin size={16} />
            Map
          </button>
          <button 
            onClick={() => selectedPin && handleViewAlbum()} 
            className={showAlbum ? 'active' : ''}
            disabled={!selectedPin}
          >
            <Image size={16} />
            Album
          </button>
          <button 
            onClick={() => selectedPin && handlePlaySlideshow()}
            className={showSlideshow ? 'active' : ''}
            disabled={!selectedPin}
          >
            <Play size={16} />
            Movie
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="main-content">
        {/* Map View */}
        {!showAlbum && !showSlideshow && (
          <div className="map-view">
            <Map 
              pins={pins}
              onPinClick={handlePinClick}
              selectedPin={selectedPin}
              isAddingPin={isAddingPin}
              onMapClick={handleMapClick}
            />

            {/* Add Location Button */}
            <button 
              className={`add-location-btn ${isAddingPin ? 'active' : ''}`}
              onClick={isAddingPin ? () => setIsAddingPin(false) : handleAddPinClick}
            >
              {isAddingPin ? <X size={20} /> : <Plus size={20} />}
              {isAddingPin ? 'Cancel' : 'Add Location'}
            </button>

            {/* Adding Pin Hint */}
            {isAddingPin && (
              <div className="adding-pin-hint">
                Click anywhere on the map to place a pin
              </div>
            )}

            {/* Option Card for Selected Pin */}
            {selectedPin && !isAddingPin && (
              <div className="option-card-container">
                <OptionCard
                  pin={selectedPin}
                  onViewAlbum={handleViewAlbum}
                  onPlaySlideshow={handlePlaySlideshow}
                  onBack={handleBackToMap}
                />
              </div>
            )}
          </div>
        )}

        {/* Album View */}
        {showAlbum && selectedPin && (
          <AlbumGrid
            pin={selectedPin}
            onClose={handleCloseAlbum}
            onAddSong={handleAddSong}
            onAddPhoto={handleAddPhoto}
            onRemovePhoto={handleRemovePhoto}
          />
        )}

        {/* Slideshow View */}
        {showSlideshow && selectedPin && (
          <Slideshow
            pin={selectedPin}
            onClose={handleCloseSlideshow}
          />
        )}
      </main>

      {/* Spotify Panel */}
      {showSpotifyPanel && (
        <SpotifyPanel
          onClose={() => setShowSpotifyPanel(false)}
          onSelect={handleSongSelect}
        />
      )}

      {/* Add Pin Modal */}
      {showAddPinModal && newPinLocation && (
        <AddPinModal
          lat={newPinLocation.lat}
          lng={newPinLocation.lng}
          onAdd={handleAddPin}
          onCancel={handleCancelAddPin}
        />
      )}
    </div>
  );
}

export default App;