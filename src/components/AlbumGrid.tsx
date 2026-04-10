import { useState, useRef, useCallback } from 'react';
import { X, Plus, Music, ArrowLeft, Trash2, Upload } from 'lucide-react';
import type { OptimisticPhotoPreview, PhotoPin, UploadBatchSummary, UploadItemProgress } from '../App';

interface AlbumGridProps {
  pin: PhotoPin;
  onClose: () => void;
  onAddSong: () => void;
  onAddPhotos: (pinId: string, files: File[]) => void;
  onRemovePhoto: (pinId: string, photoIndex: number) => void;
  isSyncing?: boolean;
  syncProgress?: number | null;
  uploadItems?: UploadItemProgress[];
  uploadStatusLabel?: string | null;
  uploadSummary?: UploadBatchSummary | null;
  optimisticPhotos?: OptimisticPhotoPreview[];
  onCancelUpload?: (itemId: string) => void;
  onRetryFailedUploads?: (pinId: string) => void;
}

const AlbumGrid = ({
  pin,
  onClose,
  onAddSong,
  onAddPhotos,
  onRemovePhoto,
  isSyncing = false,
  syncProgress = null,
  uploadItems = [],
  uploadStatusLabel = null,
  uploadSummary = null,
  optimisticPhotos = [],
  onCancelUpload,
  onRetryFailedUploads,
}: AlbumGridProps) => {
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
      if (imageFiles.length > 0) {
        onAddPhotos(pin.id, imageFiles);
      }
    }
  }, [pin.id, onAddPhotos]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length > 0) {
      onAddPhotos(pin.id, imageFiles);
    }
  }, [pin.id, onAddPhotos]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const optimisticUrls = new Set(
    optimisticPhotos
      .map((photo) => photo.remoteUrl || photo.displayUrl)
      .filter((url): url is string => Boolean(url))
  );

  const persistedPhotos = pin.photos
    .map((photo, index) => ({ photo, index }))
    .filter((item) => !optimisticUrls.has(item.photo));
  const hasFailedUploads = uploadItems.some((item) => item.stage === 'error');

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
            disabled={isSyncing}
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

      {isSyncing && (
        <div className="album-sync-status">
          <span>{uploadStatusLabel || `Syncing upload${syncProgress !== null ? ` (${syncProgress}%)` : '...'}`}</span>
          {syncProgress !== null && <span>Overall progress: {syncProgress}%</span>}
          {uploadItems.length > 0 && (
            <div className="album-upload-list">
              {uploadItems.map((item) => (
                <div key={item.id} className="album-upload-item">
                  <span>{item.name}</span>
                  <span>
                    {item.stage === 'error'
                      ? `Failed: ${item.error || 'unknown error'}`
                      : `${item.stage} ${item.progress}%`}
                  </span>
                  {onCancelUpload && item.stage !== 'done' && item.stage !== 'error' && (
                    <button
                      type="button"
                      className="album-cancel-upload-btn"
                      onClick={() => onCancelUpload(item.id)}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {uploadSummary?.completed && (
        <div className="album-sync-status">
          <span>{uploadSummary.succeeded} uploaded, {uploadSummary.failed} failed</span>
          {hasFailedUploads && onRetryFailedUploads && (
            <button
              type="button"
              className="album-cancel-upload-btn"
              onClick={() => onRetryFailedUploads(pin.id)}
            >
              Retry Failed
            </button>
          )}
        </div>
      )}

      {pin.song && (
        <div className="album-song-bar">
          <div className="song-info">
            <Music size={16} />
            <span>{pin.song.title}</span>
            <span className="song-artist">— {pin.song.artist}</span>
          </div>
          {pin.song.id && (
            <a
              className="song-open-link"
              href={pin.song.spotifyUrl || `https://open.spotify.com/track/${pin.song.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Spotify
            </a>
          )}
        </div>
      )}

      <div 
        className={`album-dropzone ${isDragging ? 'dragging' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {optimisticPhotos.length === 0 && persistedPhotos.length === 0 ? (
          <div className="album-empty">
            <Upload size={48} />
            <p>Drop photos here to build your album</p>
            <span>or click "Add Photos" to browse</span>
          </div>
        ) : (
          <div className="album-grid">
            {optimisticPhotos.map((photo) => (
              <div
                key={photo.id}
                className="album-grid-item"
                onClick={() => setSelectedPhoto(photo.displayUrl)}
              >
                <img src={photo.displayUrl} alt={photo.name} />
                <span className="album-optimistic-badge">{photo.status}</span>
              </div>
            ))}
            {persistedPhotos.map((item) => (
              <div 
                key={`${item.photo}-${item.index}`}
                className="album-grid-item"
                onClick={() => setSelectedPhoto(item.photo)}
              >
                <img src={item.photo} alt={`Photo ${item.index + 1}`} />
                <button 
                  className="photo-delete-btn"
                  disabled={isSyncing}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemovePhoto(pin.id, item.index);
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