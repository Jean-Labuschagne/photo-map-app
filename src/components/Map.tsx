import { useEffect, useRef, useCallback, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { PhotoPin } from '../App';

interface MapProps {
  pins: PhotoPin[];
  onPinClick: (pin: PhotoPin) => void;
  selectedPin?: PhotoPin | null;
  isAddingPin?: boolean;
  onMapClick?: (lng: number, lat: number) => void;
}

// South Africa center coordinates
const SA_CENTER: [number, number] = [24.5, -29.0];
const DEFAULT_ZOOM = 5;

const Map = ({ 
  pins, 
  onPinClick, 
  selectedPin, 
  isAddingPin = false,
  onMapClick 
}: MapProps) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const tempMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          'osm': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap Contributors'
          }
        },
        layers: [
          {
            id: 'osm-layer',
            type: 'raster',
            source: 'osm',
            minzoom: 0,
            maxzoom: 22
          }
        ]
      },
      center: SA_CENTER,
      zoom: DEFAULT_ZOOM,
      pitch: 0,
      bearing: 0,
      attributionControl: false
    });

    // Add attribution control in compact mode
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    // Add navigation controls
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    map.on('load', () => {
      setIsLoaded(true);
    });

    mapRef.current = map;

    return () => {
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      tempMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Handle map click for adding pins
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      if (isAddingPin && onMapClick) {
        onMapClick(e.lngLat.lng, e.lngLat.lat);
      }
    };

    map.on('click', handleClick);

    // Update cursor style
    map.getCanvas().style.cursor = isAddingPin ? 'crosshair' : '';

    return () => {
      map.off('click', handleClick);
    };
  }, [isAddingPin, onMapClick]);

  // Create custom marker element - FIXED: No jumping on hover
  const createMarkerElement = useCallback((pin: PhotoPin, isSelected: boolean) => {
    // Outer container for positioning (no transform here)
    const container = document.createElement('div');
    container.style.cssText = `
      position: relative;
      width: 48px;
      height: 48px;
      cursor: pointer;
    `;

    // Inner element for the pin shape and rotation
    const pinElement = document.createElement('div');
    pinElement.className = `custom-marker ${isSelected ? 'selected' : ''}`;
    pinElement.style.cssText = `
      width: 100%;
      height: 100%;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 3px solid ${isSelected ? '#FF6A3D' : '#fff'};
      box-shadow: 0 4px 15px rgba(0,0,0,0.4), 0 0 20px ${isSelected ? 'rgba(255,106,61,0.5)' : 'transparent'};
      overflow: hidden;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      background: #0B0D10;
    `;

    const img = document.createElement('img');
    img.src = pin.thumbnail;
    img.alt = pin.name;
    img.style.cssText = `
      width: 100%;
      height: 100%;
      object-fit: cover;
      transform: rotate(45deg);
      pointer-events: none;
    `;

    pinElement.appendChild(img);
    container.appendChild(pinElement);

    // Add hover effect - scale the inner element only
    container.addEventListener('mouseenter', () => {
      pinElement.style.transform = 'rotate(-45deg) scale(1.12)';
      pinElement.style.zIndex = '100';
      pinElement.style.boxShadow = `0 6px 20px rgba(0,0,0,0.5), 0 0 25px ${isSelected ? 'rgba(255,106,61,0.7)' : 'rgba(255,255,255,0.3)'}`;
    });
    container.addEventListener('mouseleave', () => {
      pinElement.style.transform = 'rotate(-45deg) scale(1)';
      pinElement.style.zIndex = '1';
      pinElement.style.boxShadow = `0 4px 15px rgba(0,0,0,0.4), 0 0 20px ${isSelected ? 'rgba(255,106,61,0.5)' : 'transparent'}`;
    });

    return container;
  }, []);

  // Update markers when pins change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Add markers for each pin
    pins.forEach(pin => {
      const isSelected = selectedPin?.id === pin.id;
      const el = createMarkerElement(pin, isSelected);

      const marker = new maplibregl.Marker({
        element: el,
        anchor: 'bottom'
      })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map);

      // Add click handler to the container
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onPinClick(pin);
      });

      // Add popup on hover
      const popup = new maplibregl.Popup({
        offset: 30,
        closeButton: false,
        closeOnClick: false
      }).setHTML(`
        <div style="
          background: rgba(11, 13, 16, 0.95);
          padding: 10px 14px;
          border-radius: 10px;
          color: #F2F4F8;
          font-family: Inter, sans-serif;
          font-size: 13px;
          border: 1px solid rgba(255, 106, 61, 0.3);
          min-width: 140px;
        ">
          <strong style="display: block; margin-bottom: 4px; font-size: 14px;">${pin.name}</strong>
          <span style="opacity: 0.7; font-size: 12px;">${pin.photoCount} photos</span>
        </div>
      `);

      el.addEventListener('mouseenter', () => {
        marker.setPopup(popup);
        popup.addTo(map);
      });

      el.addEventListener('mouseleave', () => {
        popup.remove();
      });

      markersRef.current.push(marker);
    });
  }, [pins, isLoaded, selectedPin, onPinClick, createMarkerElement]);

  // Fly to selected pin
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded) return;

    if (selectedPin) {
      map.flyTo({
        center: [selectedPin.lng, selectedPin.lat],
        zoom: 12,
        pitch: 45,
        bearing: 0,
        duration: 1500,
        essential: true
      });
    } else {
      // Reset to South Africa view
      map.flyTo({
        center: SA_CENTER,
        zoom: DEFAULT_ZOOM,
        pitch: 0,
        bearing: 0,
        duration: 1500,
        essential: true
      });
    }
  }, [selectedPin, isLoaded]);

  // Show temporary marker when adding pin
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded) return;

    if (isAddingPin) {
      // Remove existing temp marker
      tempMarkerRef.current?.remove();

      // Create temp marker at center
      const el = document.createElement('div');
      el.className = 'temp-marker';
      el.style.cssText = `
        width: 40px;
        height: 40px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        background: #FF6A3D;
        border: 3px solid #fff;
        box-shadow: 0 4px 15px rgba(255,106,61,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        animation: tempMarkerPulse 1.5s infinite;
      `;

      const icon = document.createElement('span');
      icon.innerHTML = '+';
      icon.style.cssText = `
        color: white;
        font-size: 24px;
        font-weight: bold;
        transform: rotate(45deg);
      `;
      el.appendChild(icon);

      tempMarkerRef.current = new maplibregl.Marker({
        element: el,
        anchor: 'bottom'
      })
        .setLngLat(map.getCenter())
        .addTo(map);
    } else {
      tempMarkerRef.current?.remove();
      tempMarkerRef.current = null;
    }
  }, [isAddingPin, isLoaded]);

  return (
    <div 
      ref={mapContainerRef} 
      style={{ 
        width: '100%', 
        height: '100%',
        position: 'relative',
        borderRadius: '16px',
        overflow: 'hidden'
      }} 
    />
  );
};

export default Map;