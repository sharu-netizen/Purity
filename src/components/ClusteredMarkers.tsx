import React, { useEffect, useState, useRef } from 'react';
import { useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { MarkerClusterer, DefaultRenderer } from '@googlemaps/markerclusterer';
import { Detection } from '../types';

interface Props {
  detections: Detection[];
  onMarkerClick: (detection: Detection) => void;
  selectedId?: string;
}

export const ClusteredMarkers = ({ detections, onMarkerClick, selectedId }: Props) => {
  const map = useMap();
  const markerLibrary = useMapsLibrary('marker');
  const [markers, setMarkers] = useState<{[key: string]: google.maps.marker.AdvancedMarkerElement}>({});
  const clusterer = useRef<MarkerClusterer | null>(null);

  useEffect(() => {
    if (!map || !markerLibrary) return;
    
    if (!clusterer.current) {
      clusterer.current = new MarkerClusterer({ 
        map,
        renderer: {
          render: ({ count, position, markers }) => {
            // Check if this cluster predominantly contains macroplastics
            // For simplicity in a sentinel app, macro clusters are high-priority
            const container = document.createElement('div');
            container.className = 'relative flex items-center justify-center cursor-pointer group';
            
            // Pulse effect for macro-heavy clusters
            const pulse = document.createElement('div');
            pulse.className = 'absolute inset-0 rounded-full bg-red-500/30 animate-ping group-hover:bg-red-500/50';
            
            const circle = document.createElement('div');
            circle.className = 'w-9 h-9 rounded-full bg-red-600 border-2 border-white flex items-center justify-center text-white text-[10px] font-bold shadow-2xl transition-transform group-hover:scale-110';
            circle.innerText = `${count}`;
            
            const label = document.createElement('div');
            label.className = 'absolute -bottom-4 bg-red-700 text-[7px] text-white px-1 py-0.5 rounded-sm uppercase font-black tracking-tighter opacity-0 group-hover:opacity-100 transition-opacity';
            label.innerText = 'Macro Cluster';

            container.appendChild(pulse);
            container.appendChild(circle);
            container.appendChild(label);

            return new markerLibrary.AdvancedMarkerElement({
              position,
              content: container,
              zIndex: 1000 + count
            });
          }
        }
      });
    }
  }, [map, markerLibrary]);

  useEffect(() => {
    if (!clusterer.current || !map || !markerLibrary) return;

    // Clean up old markers
    (Object.values(markers) as google.maps.marker.AdvancedMarkerElement[]).forEach(m => m.map = null);
    clusterer.current.clearMarkers();

    const newMarkers: {[key: string]: google.maps.marker.AdvancedMarkerElement} = {};

    detections.forEach((det) => {
      const isSelected = det.id === selectedId;
      const isMicro = det.plasticType === 'micro';
      const baseColor = isMicro ? 'bg-cyan-500' : 'bg-red-600';
      const shadowColor = isMicro ? 'rgba(6, 182, 212, 0.8)' : 'rgba(255, 0, 0, 0.8)';
      
      const container = document.createElement('div');
      container.className = 'relative group cursor-pointer';
      
      const pin = document.createElement('div');
      pin.className = `w-4 h-4 rounded-full border-2 border-white ${baseColor} shadow-lg transition-transform`;
      
      if (isSelected) {
        pin.style.transform = 'scale(1.25)';
        pin.style.boxShadow = `0 0 15px ${shadowColor}`;
        pin.classList.remove('bg-red-600', 'bg-cyan-500');
        pin.classList.add(isMicro ? 'bg-cyan-400' : 'bg-red-500');
      }
      
      container.appendChild(pin);

      const marker = new markerLibrary.AdvancedMarkerElement({
        map,
        position: det.location,
        content: container,
        zIndex: isSelected ? 100 : 1
      });

      marker.addListener('click', () => {
        onMarkerClick(det);
      });

      newMarkers[det.id] = marker;
    });

    setMarkers(newMarkers);
    clusterer.current.addMarkers(Object.values(newMarkers));

    return () => {
      clusterer.current?.clearMarkers();
    };
  }, [detections, map, onMarkerClick, selectedId, markerLibrary]);

  return null;
};
