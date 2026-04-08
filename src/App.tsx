import { useState, useCallback, useEffect, useMemo } from 'react';
import Map from './components/Map';
import AlbumGrid from './components/AlbumGrid';
import Slideshow from './components/Slideshow';
import OptionCard from './components/OptionCard';
import AddPinModal from './components/AddPinModal';
import SpotifyPanel from './components/SpotifyPanel';
import { MapPin, Image, Play, Plus, X } from 'lucide-react';
import { onAuthStateChanged, signInWithEmailAndPassword, type User, signOut } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, db, storage, storageFallback, STORAGE_BUCKET_CANDIDATES } from './lib/firebase';
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

const ALLOWED_EMAILS = new Set([
  'jeanlabus.jl65@gmail.com',
  'ankesmith0@gmail.com',
]);

const getFallbackThumbnail = (seed: string) => `https://picsum.photos/seed/${seed}/200/200`;

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'object' && error !== null) {
    const maybeCode = (error as { code?: string }).code;
    const maybeMessage = (error as { message?: string }).message;
    if (maybeCode && maybeMessage) {
      return `${maybeCode}: ${maybeMessage}`;
    }
    if (maybeMessage) {
      return maybeMessage;
    }
  }
  return 'Unknown error';
};

const uploadBytesWithTimeout = async (
  storageRef: ReturnType<typeof ref>,
  file: File,
  timeoutMs = 8000
) => {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error('Upload timed out while waiting for storage response.'));
      }, timeoutMs);
    });

    await Promise.race([uploadBytes(storageRef, file), timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

const uploadPinImage = async (pinId: string, file: File, prefix: 'thumb' | 'photo') => {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const objectPath = `pins/${pinId}/${prefix}-${Date.now()}-${safeName}`;

  const candidates = storageFallback ? [storage, storageFallback] : [storage];
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      const candidateRef = ref(candidate, objectPath);
      await uploadBytesWithTimeout(candidateRef, file);
      return getDownloadURL(candidateRef);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    const bucketNames = STORAGE_BUCKET_CANDIDATES.join(', ');
    throw new Error(`${getErrorMessage(lastError)} (Buckets tried: ${bucketNames})`);
  }

  throw new Error('No storage bucket candidates available.');
};

function App() {
  const [pins, setPins] = useState<PhotoPin[]>([]);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [showAlbum, setShowAlbum] = useState(false);
  const [showSlideshow, setShowSlideshow] = useState(false);
  const [showSpotifyPanel, setShowSpotifyPanel] = useState(false);
  const [isAddingPin, setIsAddingPin] = useState(false);
  const [showAddPinModal, setShowAddPinModal] = useState(false);
  const [newPinLocation, setNewPinLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [appError, setAppError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const selectedPin = useMemo(
    () => pins.find((pin) => pin.id === selectedPinId) || null,
    [pins, selectedPinId]
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (nextUser && nextUser.email && !ALLOWED_EMAILS.has(nextUser.email)) {
        await signOut(auth);
        setUser(null);
        setAuthError('This account is not authorized for this app.');
        setAuthReady(true);
        return;
      }

      setUser(nextUser);
      setAuthReady(true);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
      setPins([]);
      setSelectedPinId(null);
      return;
    }

    const pinsQuery = query(collection(db, 'pins'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      pinsQuery,
      (snapshot) => {
        const nextPins: PhotoPin[] = snapshot.docs.map((pinDoc) => {
          const data = pinDoc.data() as any;
          const photos = Array.isArray(data.photos) ? data.photos : [];
          const fallbackThumbnail = getFallbackThumbnail(pinDoc.id);

          return {
            id: pinDoc.id,
            lat: Number(data.lat || 0),
            lng: Number(data.lng || 0),
            name: data.name || 'Untitled',
            subtitle: data.subtitle || 'New Location',
            photoCount: Number(data.photoCount || photos.length || 0),
            thumbnail: data.thumbnail || photos[0] || fallbackThumbnail,
            photos,
            song: data.song || undefined,
          };
        });

        setPins(nextPins);

        if (selectedPinId && !nextPins.find((pin) => pin.id === selectedPinId)) {
          setSelectedPinId(null);
          setShowAlbum(false);
          setShowSlideshow(false);
        }
      },
      () => {
        setAppError('Unable to load locations from Firebase. Check Firestore rules and indexes.');
      }
    );

    return unsubscribe;
  }, [user, selectedPinId]);

  const handleSignIn = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      setPassword('');
    } catch {
      setAuthError('Sign-in failed. Check your email and password.');
    }
  }, [email, password]);

  const handlePinClick = useCallback((pin: PhotoPin) => {
    setSelectedPinId(pin.id);
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
    if (!selectedPinId) return;

    updateDoc(doc(db, 'pins', selectedPinId), {
      song,
      updatedAt: serverTimestamp(),
    }).catch(() => {
      setAppError('Failed to save song. Please try again.');
    });

    setShowSpotifyPanel(false);
  }, [selectedPinId]);

  const handleAddPinClick = useCallback(() => {
    setIsAddingPin(true);
    setSelectedPinId(null);
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

  const handleAddPin = useCallback(async (pinInput: {
    lat: number;
    lng: number;
    name: string;
    subtitle: string;
    thumbnailFile: File | null;
  }) => {
    if (!user) return;

    setIsSaving(true);
    setAppError(null);

    try {
      const pinRef = doc(collection(db, 'pins'));
      const fallbackThumbnail = getFallbackThumbnail(pinRef.id);
      let thumbnail = fallbackThumbnail;
      const photos: string[] = [];

      if (pinInput.thumbnailFile) {
        const thumbUrl = await uploadPinImage(pinRef.id, pinInput.thumbnailFile, 'thumb');
        thumbnail = thumbUrl;
        photos.push(thumbUrl);
      }

      await setDoc(pinRef, {
        lat: pinInput.lat,
        lng: pinInput.lng,
        name: pinInput.name,
        subtitle: pinInput.subtitle,
        photoCount: photos.length,
        thumbnail,
        photos,
        song: null,
        createdBy: user.email || 'unknown',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setSelectedPinId(pinRef.id);
      setShowAddPinModal(false);
      setNewPinLocation(null);
    } catch (error) {
      setAppError(`Failed to add location. ${getErrorMessage(error)}`);
    } finally {
      setIsSaving(false);
    }
  }, [user]);

  const handleCancelAddPin = useCallback(() => {
    setShowAddPinModal(false);
    setNewPinLocation(null);
    setIsAddingPin(false);
  }, []);

  const handleAddPhoto = useCallback(async (pinId: string, file: File) => {
    setIsSaving(true);
    setAppError(null);

    try {
      const photoUrl = await uploadPinImage(pinId, file, 'photo');
      const pin = pins.find((item) => item.id === pinId);
      if (!pin) return;

      const nextPhotos = [...pin.photos, photoUrl];
      await updateDoc(doc(db, 'pins', pinId), {
        photos: nextPhotos,
        photoCount: nextPhotos.length,
        thumbnail: pin.thumbnail || photoUrl,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      setAppError(`Photo upload failed. ${getErrorMessage(error)}`);
    } finally {
      setIsSaving(false);
    }
  }, [pins]);

  const handleRemovePhoto = useCallback(async (pinId: string, photoIndex: number) => {
    const pin = pins.find((item) => item.id === pinId);
    if (!pin) return;

    const removedPhotoUrl = pin.photos[photoIndex];
    const nextPhotos = pin.photos.filter((_, index) => index !== photoIndex);

    setIsSaving(true);
    setAppError(null);

    try {
      await updateDoc(doc(db, 'pins', pinId), {
        photos: nextPhotos,
        photoCount: nextPhotos.length,
        thumbnail: nextPhotos[0] || getFallbackThumbnail(pinId),
        updatedAt: serverTimestamp(),
      });

      if (removedPhotoUrl?.includes('firebasestorage.googleapis.com')) {
        try {
          await deleteObject(ref(storage, removedPhotoUrl));
        } catch {
          // Ignore storage delete failures after Firestore update succeeds.
        }
      }
    } catch (error) {
      setAppError(`Failed to remove photo. ${getErrorMessage(error)}`);
    } finally {
      setIsSaving(false);
    }
  }, [pins]);

  const handleBackToMap = useCallback(() => {
    setSelectedPinId(null);
    setShowAlbum(false);
    setShowSlideshow(false);
  }, []);

  if (!authReady) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h1>PhotoGlobe</h1>
          <p>Preparing your private album...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="auth-screen">
        <form className="auth-card" onSubmit={handleSignIn}>
          <h1>PhotoGlobe</h1>
          <p>Sign in to your shared album.</p>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {authError && <p className="auth-error">{authError}</p>}
          <button type="submit">Sign In</button>
        </form>
      </div>
    );
  }

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
        {isSaving && <span className="save-indicator">Syncing...</span>}
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
        {appError && <div className="app-error-banner">{appError}</div>}
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