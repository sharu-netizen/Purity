import { useEffect, useState } from 'react';
import { useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { TrajectoryEnsemble, PlasticType } from '../types';

interface Props {
  ensemble: TrajectoryEnsemble | null;
  plasticType?: PlasticType;
  currentHour?: number;
}

export const HeatmapLayer = ({ ensemble, plasticType, currentHour = 72 }: Props) => {
  const map = useMap();
  const visualization = useMapsLibrary('visualization');
  const [heatmap, setHeatmap] = useState<google.maps.visualization.HeatmapLayer | null>(null);

  useEffect(() => {
    if (!map || !visualization) return;

    const newHeatmap = new visualization.HeatmapLayer({
      map: map,
      radius: 40,
      opacity: 0.7,
      dissipating: true
    });

    setHeatmap(newHeatmap);

    return () => {
      newHeatmap.setMap(null);
    };
  }, [map, visualization]);

  useEffect(() => {
    if (!heatmap || !ensemble) {
      heatmap?.setData([]);
      return;
    }

    const heatmapData: google.maps.visualization.WeightedLocation[] = [];

    // Medium Probability Drift Corridors
    // We sample the ensemble paths up to currentHour
    ensemble.paths.forEach(path => {
      const activePath = path.slice(0, currentHour + 1);
      // Step sample to avoid too many points, but enough for a smooth cloud
      for (let i = 0; i < activePath.length; i += 2) {
        const point = activePath[i];
        // Fade in weight as we move along the path
        const weight = (i / path.length) * 1.5;
        heatmapData.push({
          location: new google.maps.LatLng(point.lat, point.lng),
          weight: weight
        });
      }
    });

    // High Probability Accumulation Hotspots
    // Only show hotspots if we are near the end of the simulation
    if (currentHour >= 60) {
      const alpha = (currentHour - 60) / 12; // Fade in during the last 12 hours
      ensemble.hotspots.forEach(hotspot => {
        heatmapData.push({
          location: new google.maps.LatLng(hotspot.location.lat, hotspot.location.lng),
          weight: hotspot.probability * 15 * alpha
        });
      });
    }

    heatmap.setData(heatmapData);

    // Precision Gradients matching OceanGuard Sentinel Aesthetics
    const macroGradient = [
      'rgba(0, 255, 255, 0)',
      'rgba(251, 146, 60, 0.4)',  // Orange-400
      'rgba(249, 115, 22, 0.6)',  // Orange-500
      'rgba(239, 68, 68, 0.8)',   // Red-500
      'rgba(185, 28, 28, 1)'      // Red-700
    ];

    const microGradient = [
      'rgba(0, 255, 255, 0)',
      'rgba(103, 232, 249, 0.4)', // Cyan-300
      'rgba(34, 211, 238, 0.6)',  // Cyan-400
      'rgba(6, 182, 212, 0.8)',   // Cyan-500
      'rgba(8, 145, 178, 1)'      // Cyan-600
    ];

    heatmap.set('gradient', plasticType === 'micro' ? microGradient : macroGradient);

  }, [heatmap, ensemble, plasticType]);

  return null;
};
