import { Heart, MapPin } from 'lucide-react';

const ClosingSection = () => {
  return (
    <section className="closing-section">
      <div className="closing-content">
        <div className="closing-icon">
          <MapPin size={48} />
        </div>
        <h2>Thanks for visiting.</h2>
        <p>Build your own globe at photoglobe.app</p>
        <button 
          className="closing-cta"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          Start your map
        </button>
      </div>
      
      <footer className="footer">
        <div className="footer-links">
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
          <a href="#">Support</a>
        </div>
        <div className="footer-copyright">
          <span>© 2026 PhotoGlobe</span>
          <span className="footer-heart">
            Made with <Heart size={14} fill="#FF6A3D" /> for travelers
          </span>
        </div>
      </footer>
    </section>
  );
};

export default ClosingSection;