import { useState, useRef, useCallback } from 'react';
import { MapPin, Upload, Plus, X } from 'lucide-react';
import type { PhotoPin } from '../App';

interface AddPinSectionProps {
  onAddPin: (pin: PhotoPin) => void;
  pins: PhotoPin[];
}

const AddPinSection = ({ onAddPin, pins }: AddPinSectionProps) => {
  const [placeName, setPlaceName] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setThumbnail(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setThumbnail(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    
    if (!placeName || !lat || !lng) return;

    const newPin: PhotoPin = {
      id: Date.now().toString(),
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      name: placeName,
      subtitle: subtitle || 'New Location',
      photoCount: thumbnail ? 1 : 0,
      thumbnail: thumbnail || 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=200&h=200&fit=crop',
      photos: thumbnail ? [thumbnail] : [],
    };

    onAddPin(newPin);
    
    // Reset form
    setPlaceName('');
    setSubtitle('');
    setLat('');
    setLng('');
    setThumbnail(null);
  }, [placeName, subtitle, lat, lng, thumbnail, onAddPin]);

  const getCurrentLocation = useCallback(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLat(position.coords.latitude.toFixed(4));
          setLng(position.coords.longitude.toFixed(4));
        },
        () => {
          // Fallback to random location near South Africa
          setLat((-30 + Math.random() * 10).toFixed(4));
          setLng((25 + Math.random() * 10).toFixed(4));
        }
      );
    }
  }, []);

  return (
    <section id="add-pin" className="add-pin-section">
      <div className="add-pin-container">
        <div className="add-pin-left">
          <div className="add-pin-globe-preview">
            <div className="preview-globe">
              <div className="globe-sphere">
                {pins.map((pin) => (
                  <div
                    key={pin.id}
                    className="preview-pin"
                    style={{
                      left: `${50 + (pin.lng - 25) * 2}%`,
                      top: `${50 + (pin.lat + 30) * 2}%`,
                    }}
                    title={pin.name}
                  >
                    <img src={pin.thumbnail} alt={pin.name} />
                  </div>
                ))}
                {lat && lng && (
                  <div
                    className="preview-pin new"
                    style={{
                      left: `${50 + (parseFloat(lng) - 25) * 2}%`,
                      top: `${50 + (parseFloat(lat) + 30) * 2}%`,
                    }}
                  >
                    <MapPin size={20} />
                  </div>
                )}
              </div>
            </div>
            <p className="preview-hint">
              Your pins appear on the globe
            </p>
          </div>
        </div>

        <div className="add-pin-right">
          <div className="add-pin-header">
            <MapPin size={24} />
            <h2>Add a new place</h2>
          </div>
          
          <p className="add-pin-description">
            Enter coordinates or use your current location to drop a pin on the globe.
          </p>

          <form onSubmit={handleSubmit} className="add-pin-form">
            <div className="form-group">
              <label>Place Name</label>
              <input
                type="text"
                placeholder="e.g., Cape Town"
                value={placeName}
                onChange={e => setPlaceName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Subtitle (optional)</label>
              <input
                type="text"
                placeholder="e.g., Western Cape"
                value={subtitle}
                onChange={e => setSubtitle(e.target.value)}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Latitude</label>
                <input
                  type="number"
                  step="0.0001"
                  placeholder="-33.9249"
                  value={lat}
                  onChange={e => setLat(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Longitude</label>
                <input
                  type="number"
                  step="0.0001"
                  placeholder="18.4241"
                  value={lng}
                  onChange={e => setLng(e.target.value)}
                  required
                />
              </div>
            </div>

            <button 
              type="button" 
              className="location-btn"
              onClick={getCurrentLocation}
            >
              <MapPin size={16} />
              Use my location
            </button>

            <div 
              className={`photo-dropzone ${isDragging ? 'dragging' : ''} ${thumbnail ? 'has-image' : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => !thumbnail && fileInputRef.current?.click()}
            >
              {thumbnail ? (
                <div className="thumbnail-preview">
                  <img src={thumbnail} alt="Thumbnail preview" />
                  <button 
                    type="button"
                    className="remove-thumbnail"
                    onClick={(e) => {
                      e.stopPropagation();
                      setThumbnail(null);
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <Upload size={32} />
                  <p>Drop a photo here</p>
                  <span>or click to browse</span>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
              />
            </div>

            <button 
              type="submit" 
              className="submit-btn"
              disabled={!placeName || !lat || !lng}
            >
              <Plus size={18} />
              Save Pin
            </button>
          </form>
        </div>
      </div>
    </section>
  );
};

export default AddPinSection;