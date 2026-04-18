export type PlasticType = 'macro' | 'micro';
export type TrajectoryType = 'historical' | 'predicted';

export interface Location {
  lat: number;
  lng: number;
}

export interface Detection {
  id: string;
  timestamp: string;
  location: Location;
  plasticType: PlasticType;
  confidence: number;
  spectralSignature: string;
  biofoulingLevel: number;
  pixelCoverage: number;
}

export interface TrajectoryPoint {
  lat: number;
  lng: number;
  timestamp: string;
  type: TrajectoryType;
}

export interface Trajectory {
  id: string;
  detectionId: string;
  path: TrajectoryPoint[];
  currentSpeed: number;
  windEffect: number;
}

export interface EnvironmentalData {
  timestamp: string;
  wind: {
    speed: number;
    direction: number;
  };
  current: {
    speed: number;
    direction: number;
  };
}

export interface Hotspot {
  location: Location;
  probability: number;
  rank: number;
}

export interface TrajectoryEnsemble {
  paths: TrajectoryPoint[][];
  hotspots: Hotspot[];
}
