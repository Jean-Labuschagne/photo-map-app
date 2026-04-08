import { Image, Play, ArrowLeft } from 'lucide-react';
import type { PhotoPin } from '../App';

interface OptionCardProps {
  pin: PhotoPin;
  onViewAlbum: () => void;
  onPlaySlideshow: () => void;
  onBack: () => void;
}

const OptionCard = ({ pin, onViewAlbum, onPlaySlideshow, onBack }: OptionCardProps) => {
  return (
    <div className="option-card">
      <div className="option-card-header">
        <img 
          src={pin.thumbnail} 
          alt={pin.name}
          className="option-card-thumbnail"
        />
        <div className="option-card-info">
          <h2>{pin.name}</h2>
          <p>{pin.subtitle}</p>
          <span className="photo-count">{pin.photoCount} photos</span>
        </div>
      </div>
      
      <div className="option-buttons">
        <button 
          className="option-button primary"
          onClick={onViewAlbum}
        >
          <Image size={20} />
          View Album
        </button>
        <button 
          className="option-button secondary"
          onClick={onPlaySlideshow}
        >
          <Play size={20} />
          Play Slideshow
        </button>
      </div>
      
      <button 
        className="option-back-link"
        onClick={onBack}
      >
        <ArrowLeft size={16} />
        Choose another place
      </button>
    </div>
  );
};

export default OptionCard;