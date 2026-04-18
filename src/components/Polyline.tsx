import { useEffect, useState } from 'react';
import { useMap } from '@vis.gl/react-google-maps';

interface Props {
  path: google.maps.LatLngLiteral[];
  color?: string;
  strokeWeight?: number;
  strokeOpacity?: number;
  key?: string | number;
}

export const Polyline = ({ 
  path, 
  color = '#f97316', 
  strokeWeight = 2,
  strokeOpacity = 0.8 
}: Props) => {
  const map = useMap();
  const [polyline, setPolyline] = useState<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map) return;

    const newPolyline = new google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: color,
      strokeOpacity: strokeOpacity,
      strokeWeight: strokeWeight,
      map: map
    });

    setPolyline(newPolyline);

    return () => {
      newPolyline.setMap(null);
    };
  }, [map, path, color]);

  return null;
};
