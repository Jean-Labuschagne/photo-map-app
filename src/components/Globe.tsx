import { useEffect, useRef, useCallback } from 'react';
import type { PhotoPin } from '../App';

interface GlobeProps {
  pins: PhotoPin[];
  onPinClick: (pin: PhotoPin) => void;
  focused?: boolean;
  selectedPin?: PhotoPin | null;
  autoRotate?: boolean;
}

// Declare GlobeGL as a global since we don't have types
declare const GlobeGL: any;

declare global {
  interface Window {
    GlobeGL: any;
  }
}

const Globe = ({ pins, onPinClick, focused = false, selectedPin, autoRotate = true }: GlobeProps) => {
  const globeRef = useRef<HTMLDivElement>(null);
  const globeInstanceRef = useRef<any>(null);
  const initialSetupRef = useRef(false);

  // Convert pins to globe data format
  const globeData = pins.map(pin => ({
    lat: pin.lat,
    lng: pin.lng,
    size: 0.8,
    color: '#FF6A3D',
    pin: pin,
  }));

  const handlePointClick = useCallback((point: { pin?: PhotoPin }) => {
    if (point && point.pin) {
      onPinClick(point.pin);
    }
  }, [onPinClick]);

  useEffect(() => {
    if (!globeRef.current || initialSetupRef.current) return;

    // Dynamically import Globe.GL
    import('globe.gl').then((GlobeGLModule) => {
      const GlobeGL = GlobeGLModule.default;
      
      // Initialize Globe.GL
      if (!globeRef.current) return;
      const globe = new GlobeGL(globeRef.current)
        .globeImageUrl('//unpkg.com/three-globe/example/img/earth-night.jpg')
        .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
        .backgroundColor('rgba(0,0,0,0)')
        .showAtmosphere(true)
        .atmosphereColor('#FF6A3D')
        .atmosphereAltitude(0.15)
        .pointsData(globeData)
        .pointAltitude('size')
        .pointColor('color')
        .pointRadius(0.5)
        .pointLabel((d: unknown) => {
          const data = d as { pin?: PhotoPin };
          if (!data.pin) return '';
          return `
            <div style="
              background: rgba(11, 13, 16, 0.95);
              padding: 8px 12px;
              border-radius: 8px;
              color: #F2F4F8;
              font-family: Inter, sans-serif;
              font-size: 12px;
              border: 1px solid rgba(255, 106, 61, 0.3);
            ">
              <strong>${data.pin.name}</strong><br/>
              <span style="opacity: 0.7;">${data.pin.photoCount} photos</span>
            </div>
          `;
        })
        .onPointClick(handlePointClick)
        .width(globeRef.current?.clientWidth || 600)
        .height(globeRef.current?.clientHeight || 600);

      // Configure controls
      const controls = globe.controls();
      controls.autoRotate = autoRotate;
      controls.autoRotateSpeed = 0.8;
      controls.enableZoom = true;
      controls.minDistance = 180;
      controls.maxDistance = 400;
      controls.enablePan = false;

      globeInstanceRef.current = globe;
      initialSetupRef.current = true;
    });

    // Handle resize
    const handleResize = () => {
      if (globeRef.current && globeInstanceRef.current) {
        globeInstanceRef.current
          .width(globeRef.current.clientWidth)
          .height(globeRef.current.clientHeight);
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (globeRef.current) {
        globeRef.current.innerHTML = '';
      }
      initialSetupRef.current = false;
    };
  }, []);

  // Update points data when pins change
  useEffect(() => {
    if (globeInstanceRef.current) {
      globeInstanceRef.current.pointsData(globeData);
    }
  }, [pins]);

  // Handle focus on selected pin
  useEffect(() => {
    if (globeInstanceRef.current && selectedPin && focused) {
      const controls = globeInstanceRef.current.controls();
      controls.autoRotate = false;
      
      // Smoothly transition to the selected location
      globeInstanceRef.current.pointOfView({
        lat: selectedPin.lat,
        lng: selectedPin.lng,
        altitude: 1.5
      }, 1500);
    } else if (globeInstanceRef.current && !focused) {
      const controls = globeInstanceRef.current.controls();
      controls.autoRotate = autoRotate;
      
      // Reset view
      globeInstanceRef.current.pointOfView({
        lat: -30,
        lng: 25,
        altitude: 2.5
      }, 1500);
    }
  }, [selectedPin, focused, autoRotate]);

  return (
    <div 
      ref={globeRef} 
      style={{ 
        width: '100%', 
        height: '100%',
        position: 'relative'
      }} 
    />
  );
};

export default Globe;