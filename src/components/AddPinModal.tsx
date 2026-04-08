import { useState, useRef, useCallback } from 'react';
import { X, Upload, MapPin } from 'lucide-react';
import type { PhotoPin } from '../App';

interface AddPinModalProps {
  lat: number;
  lng: number;
  onAdd: (pin: PhotoPin) => void;
  onCancel: () => void;
}

const AddPinModal = ({ lat, lng, onAdd, onCancel }: AddPinModalProps) => {
  const [placeName, setPlaceName] = useState('');
  const [subtitle, setSubtitle] = useState('');
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
    
    if (!placeName.trim()) return;

    const newPin: PhotoPin = {
      id: Date.now().toString(),
      lat,
      lng,
      name: placeName.trim(),
      subtitle: subtitle.trim() || 'New Location',
      photoCount: thumbnail ? 1 : 0,
      thumbnail: thumbnail || `https://picsum.photos/200/200?random=${Date.now()}`,
      photos: thumbnail ? [thumbnail] : [],
    };

    onAdd(newPin);
  }, [placeName, subtitle, thumbnail, lat, lng, onAdd]);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <MapPin size={24} />
            <h2>Add New Location</h2>
          </div>
          <button className="modal-close" onClick={onCancel}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="add-pin-form">
          {/* Coordinates Display */}
          <div className="coordinates-display">
            <span>Lat: {lat.toFixed(4)}</span>
            <span>Lng: {lng.toFixed(4)}</span>
          </div>

          {/* Photo Upload */}
          <div 
            className={`photo-upload-area ${isDragging ? 'dragging' : ''} ${thumbnail ? 'has-image' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => !thumbnail && fileInputRef.current?.click()}
          >
            {thumbnail ? (
              <div className="thumbnail-preview">
                <img src={thumbnail} alt="Location thumbnail" />
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

          {/* Location Name */}
          <div className="form-group">
            <label htmlFor="placeName">Location Name *</label>
            <input
              id="placeName"
              type="text"
              placeholder="e.g., Table Mountain"
              value={placeName}
              onChange={e => setPlaceName(e.target.value)}
              required
              autoFocus
            />
          </div>

          {/* Subtitle */}
          <div className="form-group">
            <label htmlFor="subtitle">Subtitle (optional)</label>
            <input
              id="subtitle"
              type="text"
              placeholder="e.g., Cape Town, South Africa"
              value={subtitle}
              onChange={e => setSubtitle(e.target.value)}
            />
          </div>

          {/* Actions */}
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn-primary"
              disabled={!placeName.trim()}
            >
              Add Location
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddPinModal;