import { useState, useRef, useCallback } from 'react';
import { X, Plus, Music, ArrowLeft, Trash2, Upload } from 'lucide-react';
import type { PhotoPin } from '../App';

interface AlbumGridProps {
  pin: PhotoPin;
  onClose: () => void;
  onAddSong: () => void;
  onAddPhoto: (pinId: string, photoUrl: string) => void;
  onRemovePhoto: (pinId: string, photoIndex: number) => void;
}

const AlbumGrid = ({ pin, onClose, onAddSong, onAddPhoto, onRemovePhoto }: AlbumGridProps) => {
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            onAddPhoto(pin.id, event.target.result as string);
          }
        };
        reader.readAsDataURL(file);
      });
    }
  }, [pin.id, onAddPhoto]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    Array.from(files).forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            onAddPhoto(pin.id, event.target.result as string);
          }
        };
        reader.readAsDataURL(file);
      }
    });
  }, [pin.id, onAddPhoto]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  return (
    <section className="album-section">
      <div className="album-header">
        <div className="album-header-left">
          <button className="album-back-btn" onClick={onClose}>
            <ArrowLeft size={20} />
          </button>
          <div className="album-title">
            <h2>{pin.name}</h2>
            <p>{pin.photoCount} photos · Last updated 2 days ago</p>
          </div>
        </div>
        <div className="album-header-right">
          <button className="album-action-btn" onClick={onAddSong}>
            <Music size={18} />
            {pin.song ? 'Change Song' : 'Add Song'}
          </button>
          <button 
            className="album-action-btn primary"
            onClick={() => fileInputRef.current?.click()}
          >
            <Plus size={18} />
            Add Photos
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
        </div>
      </div>

      {pin.song && (
        <div className="album-song-bar">
          <div className="song-info">
            <Music size={16} />
            <span>{pin.song.title}</span>
            <span className="song-artist">— {pin.song.artist}</span>
          </div>
        </div>
      )}

      <div 
        className={`album-dropzone ${isDragging ? 'dragging' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {pin.photos.length === 0 ? (
          <div className="album-empty">
            <Upload size={48} />
            <p>Drop photos here to build your album</p>
            <span>or click "Add Photos" to browse</span>
          </div>
        ) : (
          <div className="album-grid">
            {pin.photos.map((photo, index) => (
              <div 
                key={index} 
                className="album-grid-item"
                onClick={() => setSelectedPhoto(photo)}
              >
                <img src={photo} alt={`Photo ${index + 1}`} />
                <button 
                  className="photo-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemovePhoto(pin.id, index);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Photo Lightbox */}
      {selectedPhoto && (
        <div className="photo-lightbox" onClick={() => setSelectedPhoto(null)}>
          <button className="lightbox-close" onClick={() => setSelectedPhoto(null)}>
            <X size={24} />
          </button>
          <img src={selectedPhoto} alt="Selected photo" />
        </div>
      )}
    </section>
  );
};

export default AlbumGrid;