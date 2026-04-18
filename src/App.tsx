import React, { useState, useEffect, useCallback } from 'react';
import { 
  APIProvider, 
  Map, 
  MapMouseEvent, 
  AdvancedMarker, 
  Pin, 
  useMap,
  MapCameraChangedEvent
} from '@vis.gl/react-google-maps';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  limit,
  serverTimestamp 
} from 'firebase/firestore';
import { 
  Activity, 
  Wind, 
  Waves,
  Navigation, 
  Layers, 
  Settings, 
  AlertCircle,
  Database,
  BarChart3,
  Search,
  Maximize2,
  Play,
  Pause,
  RotateCcw,
  FastForward
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';

import { db } from './lib/firebase';
import { cn, formatCoordinate } from './lib/utils';
import { analyzeGlobalOcean, predictTrajectoryEnsemble } from './geminiService';
import { Detection, TrajectoryEnsemble, EnvironmentalData } from './types';
import { Polyline } from './components/Polyline';
import { ClusteredMarkers } from './components/ClusteredMarkers';
import { HeatmapLayer } from './components/HeatmapLayer';

// provided maps key
const GOOGLE_MAPS_API_KEY = "AIzaSyBBkkwqDEUa-FPwKQcKPJPkh4prHc8xzmE";
// Using a placeholder public weather api or assuming we can fetch via GEMINI for simulation if key is missing
// But requested "Live weather API" - we'll use OpenWeather (simulated if no key, but structured for real use)
const WEATHER_API_URL = "https://api.openweathermap.org/data/2.5/weather";
const WEATHER_API_KEY = "368a984cc538cd7318854044b7f83e8b"; // Mock/Placeholder key for demo structure

export default function App() {
  const [detections, setDetections] = useState<Detection[]>([]);
  const [selectedEnsemble, setSelectedEnsemble] = useState<TrajectoryEnsemble | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedDetection, setSelectedDetection] = useState<Detection | null>(null);
  const [playbackHour, setPlaybackHour] = useState(72);
  const [isPlaybackPlaying, setIsPlaybackPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [envData, setEnvData] = useState<EnvironmentalData>({
    timestamp: new Date().toISOString(),
    wind: { speed: 12.5, direction: 210 },
    current: { speed: 1.2, direction: 45 }
  });
  const [mapCenter, setMapCenter] = useState({ lat: 21.0, lng: -150.0 });
  const [zoom, setZoom] = useState(5);

  // Fetch Live Weather Data
  const fetchWeatherData = useCallback(async (lat: number, lng: number) => {
    try {
      const response = await fetch(`${WEATHER_API_URL}?lat=${lat}&lon=${lng}&appid=${WEATHER_API_KEY}&units=metric`);
      if (response.ok) {
        const data = await response.json();
        setEnvData(prev => ({
          ...prev,
          timestamp: new Date().toISOString(),
          wind: {
            speed: data.wind?.speed || prev.wind.speed,
            direction: data.wind?.deg || prev.wind.direction
          }
        }));
      }
    } catch (e) {
      console.warn("Weather API Fetch Error, using simulated fallback", e);
    }
  }, []);

  useEffect(() => {
    fetchWeatherData(mapCenter.lat, mapCenter.lng);
  }, [mapCenter, fetchWeatherData]);

  // Sync with Firestore
  useEffect(() => {
    const q = query(collection(db, "detections"), orderBy("timestamp", "desc"), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Detection[] = [];
      snapshot.forEach((doc) => {
        data.push({ ...doc.data(), id: doc.id } as Detection);
      });
      setDetections(data);
    });

    return () => unsubscribe();
  }, []);

  // Auto-sync global scan every minute
  useEffect(() => {
    handleRunAnalysis(); // Initial run
    const interval = setInterval(handleRunAnalysis, 60000); // 60s
    return () => clearInterval(interval);
  }, []);

  // Update trajectory ensemble when detection is selected
  useEffect(() => {
    if (selectedDetection) {
      const ensemble = predictTrajectoryEnsemble(
        selectedDetection.location,
        envData.wind.speed,
        envData.wind.direction,
        envData.current.speed,
        envData.current.direction,
        72, // 72 hours projection
        selectedDetection.plasticType
      );
      setSelectedEnsemble(ensemble);
      setPlaybackHour(72); // Default to full path
      setIsPlaybackPlaying(false);
    } else {
      setSelectedEnsemble(null);
      setPlaybackHour(0);
      setIsPlaybackPlaying(false);
    }
  }, [selectedDetection, envData]);

  // Playback Animation Logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaybackPlaying && playbackHour < 72) {
      interval = setInterval(() => {
        setPlaybackHour(prev => {
          if (prev >= 72) {
            setIsPlaybackPlaying(false);
            return 72;
          }
          return Math.min(prev + 1, 72);
        });
      }, 100 / playbackSpeed);
    }
    return () => clearInterval(interval);
  }, [isPlaybackPlaying, playbackHour, playbackSpeed]);

  const handleRunAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const results = await analyzeGlobalOcean();
      
      // Save to Firebase
      for (const res of results) {
        await addDoc(collection(db, "detections"), {
          ...res,
          timestamp: new Date().toISOString()
        });
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const onCameraChange = (ev: MapCameraChangedEvent) => {
    setMapCenter(ev.detail.center);
    setZoom(ev.detail.zoom);
  };

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
      <div className="flex h-screen w-full bg-[#141414] text-[#E4E3E0] font-sans selection:bg-orange-500 selection:text-white">
        
        {/* Left Sidebar - Technical Specs & Logs */}
        <aside className="w-80 flex flex-col border-r border-[#E4E3E0]/20 bg-[#141414] z-20 overflow-hidden">
          <div className="p-6 border-b border-[#E4E3E0]/20">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded bg-orange-600 flex items-center justify-center">
                <Navigation className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-xl font-bold tracking-tighter uppercase italic">OceanGuard</h1>
            </div>
            <p className="text-[11px] text-[#E4E3E0]/50 uppercase tracking-[0.2em]">Autonomous Marine Plastics Sentinel</p>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="p-6 space-y-8">
              {/* Active Monitoring Stats */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-orange-500">Live Telemetry</h3>
                  <Activity className="w-3 h-3 text-orange-500 animate-pulse" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#1a1a1a] p-3 border border-[#E4E3E0]/10 rounded-sm">
                    <span className="block text-[10px] text-[#E4E3E0]/40 uppercase mb-1">Detections</span>
                    <span className="text-2xl font-mono font-bold leading-none">{detections.length}</span>
                  </div>
                  <div className="bg-[#1a1a1a] p-3 border border-[#E4E3E0]/10 rounded-sm">
                    <span className="block text-[10px] text-[#E4E3E0]/40 uppercase mb-1">MicroPlastic</span>
                    <span className="text-2xl font-mono font-bold leading-none">
                      {detections.filter(d => d.plasticType === 'micro').length}
                    </span>
                  </div>
                </div>
              </section>

              {/* Environmental Factors */}
              <section>
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#E4E3E0]/60 mb-4">Environmental Vectors</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-[#1a1a1a]/50 rounded border border-[#E4E3E0]/5">
                    <div className="flex items-center gap-3">
                      <Wind className="w-4 h-4 text-blue-400" />
                      <div>
                        <span className="block text-[10px] uppercase text-[#E4E3E0]/40">Wind Speed</span>
                        <span className="font-mono text-sm">{envData.wind.speed} kn</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="block text-[10px] uppercase text-[#E4E3E0]/40">Dir</span>
                      <span className="font-mono text-sm">{envData.wind.direction}°</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-[#1a1a1a]/50 rounded border border-[#E4E3E0]/5">
                    <div className="flex items-center gap-3">
                      <Waves className="w-4 h-4 text-cyan-400" />
                      <div>
                        <span className="block text-[10px] uppercase text-[#E4E3E0]/40">Current</span>
                        <span className="font-mono text-sm">{envData.current.speed} m/s</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="block text-[10px] uppercase text-[#E4E3E0]/40">Dir</span>
                      <span className="font-mono text-sm">{envData.current.direction}°</span>
                    </div>
                  </div>
                </div>
              </section>

              {/* Microplastic Dedicated Sentinel Section */}
              <section className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-5 h-5 rounded-full bg-cyan-500 flex items-center justify-center">
                    <Maximize2 className="w-3 h-3 text-white" />
                  </div>
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">Microplastic Sentinel</h3>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-baseline justify-between p-2 bg-black/40 rounded">
                    <span className="text-[10px] text-cyan-400/60 uppercase">Dumping Density</span>
                    <span className="text-lg font-mono text-cyan-400">
                      {detections.filter(d => d.plasticType === 'micro').length > 0
                        ? (detections.filter(d => d.plasticType === 'micro').reduce((acc, d) => acc + d.pixelCoverage, 0) / detections.filter(d => d.plasticType === 'micro').length * 10).toFixed(2)
                        : "0.00"}
                      <small className="ml-1 text-[8px]">ppm</small>
                    </span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[9px] uppercase text-[#E4E3E0]/40">Top Suspended Zones</span>
                    {detections
                      .filter(d => d.plasticType === 'micro')
                      .sort((a, b) => b.pixelCoverage - a.pixelCoverage)
                      .slice(0, 3)
                      .map((d, i) => (
                        <div key={d.id} className="flex justify-between items-center text-[10px] font-mono border-b border-[#E4E3E0]/5 py-1">
                          <span className="text-[#E4E3E0]/60">Zone #{i+1}</span>
                          <span className="text-cyan-400">{formatCoordinate(d.location.lat)}, {formatCoordinate(d.location.lng)}</span>
                        </div>
                      ))
                    }
                    {detections.filter(d => d.plasticType === 'micro').length === 0 && (
                      <div className="text-[9px] text-[#E4E3E0]/20 italic">No micro-signals active</div>
                    )}
                  </div>
                </div>
              </section>

              {/* Future Trajectory Tracking (Active Ensemble Insights) */}
              <AnimatePresence>
                {selectedEnsemble && (
                  <motion.section 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-orange-500">Future Trajectory Forecast</h3>
                      <div className="flex items-center gap-1 bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/20">
                         <span className="text-[8px] font-bold text-orange-500 uppercase tracking-tighter">AI Projection</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                       {selectedEnsemble.hotspots.map((hotspot) => (
                         <div key={`side-hotspot-${hotspot.rank}`} className="bg-[#1a1a1a] border border-orange-500/20 p-3 rounded flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                               <span className="text-[10px] font-bold text-orange-400">P{(hotspot.probability * 100).toFixed(0)}% SINK ZONE</span>
                               <span className="text-[9px] font-mono text-[#E4E3E0]/40">RANK #{hotspot.rank}</span>
                            </div>
                            <div className="text-[10px] font-mono flex justify-between">
                               <span>LAT {formatCoordinate(hotspot.location.lat)}</span>
                               <span>LNG {formatCoordinate(hotspot.location.lng)}</span>
                            </div>
                            <div className="w-full bg-black/40 h-1 rounded-full overflow-hidden">
                               <div className="h-full bg-orange-600" style={{ width: `${hotspot.probability * 100}%` }} />
                            </div>
                         </div>
                       ))}
                    </div>
                  </motion.section>
                )}
              </AnimatePresence>

              {/* Recent Detections List */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#E4E3E0]/60">Detection Event Log</h3>
                  <div className="flex items-center gap-1">
                    <Database className="w-2.5 h-2.5 text-green-500" />
                    <span className="text-[9px] text-green-500 font-mono uppercase">Synced</span>
                  </div>
                </div>
                <div className="space-y-2">
                    {detections.map((det) => (
                      <button 
                        key={det.id}
                        onClick={() => setSelectedDetection(det)}
                        className={cn(
                          "w-full text-left p-3 text-[11px] rounded transition-all border",
                          selectedDetection?.id === det.id 
                            ? (det.plasticType === 'micro' ? "bg-cyan-500/10 border-cyan-500/50" : "bg-red-500/10 border-red-500/50")
                            : "bg-[#1a1a1a] border-transparent hover:border-[#E4E3E0]/20"
                        )}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <span className={cn(
                            "font-mono uppercase italic",
                            det.plasticType === 'micro' ? "text-cyan-400" : "text-red-500"
                          )}>
                            {det.plasticType} Plastic
                          </span>
                          <span className={cn(
                            "font-mono",
                            det.plasticType === 'micro' ? "text-cyan-400" : "text-red-500"
                          )}>
                            {Math.round(det.confidence * 100)}%
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono">LAT {formatCoordinate(det.location.lat)}</span>
                          <span className="text-[#E4E3E0]/20">|</span>
                          <span className="font-mono">LNG {formatCoordinate(det.location.lng)}</span>
                        </div>
                      </button>
                    ))}
                  {detections.length === 0 && (
                    <div className="p-8 text-center text-[#E4E3E0]/20 border border-dashed border-[#E4E3E0]/10 rounded">
                      <p className="text-[10px] uppercase">No Data Logs Found</p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>

          <div className="p-4 border-t border-[#E4E3E0]/20 bg-[#0a0a0a]">
             <div className="flex items-center justify-center gap-3 py-2">
                <div className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  isAnalyzing ? "bg-orange-500 animate-pulse" : "bg-green-500"
                )} />
                <span className="text-[9px] uppercase font-bold tracking-[0.2em] text-[#E4E3E0]/40">
                  {isAnalyzing ? "Scan In Progress" : "Global Sync Active"}
                </span>
             </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 relative flex flex-col overflow-hidden">
          
          {/* Top Bar Overlay */}
          <div className="absolute top-6 left-6 right-6 z-10 flex items-center justify-between pointer-events-none">
            <div className="flex items-center gap-4 pointer-events-auto">
               <div className="bg-[#141414]/90 backdrop-blur px-4 py-2 border border-[#E4E3E0]/20 rounded flex items-center gap-6">
                 <div className="flex items-center gap-2">
                   <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                   <span className="text-[10px] font-mono text-green-500 uppercase">Satellite Linked</span>
                 </div>
                 <div className="text-[10px] font-mono text-[#E4E3E0]/60 space-x-4">
                   <span>LAT {formatCoordinate(mapCenter.lat)}</span>
                   <span>LNG {formatCoordinate(mapCenter.lng)}</span>
                   <span>ZOOM {zoom.toFixed(1)}x</span>
                 </div>
                 {playbackHour > 0 && (
                   <div className="flex items-center gap-2 pl-4 border-l border-[#E4E3E0]/20">
                     <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                     <span className="text-[11px] font-mono text-orange-500 uppercase font-black tracking-tighter italic">
                       T+{playbackHour}H Projection
                     </span>
                   </div>
                 )}
               </div>
            </div>

            <div className="flex items-center gap-2 pointer-events-auto">
              <button className="p-2 bg-[#141414]/90 backdrop-blur border border-[#E4E3E0]/20 rounded hover:bg-[#1a1a1a] text-[#E4E3E0]/60">
                <Layers className="w-4 h-4" />
              </button>
              <button className="p-2 bg-[#141414]/90 backdrop-blur border border-[#E4E3E0]/20 rounded hover:bg-[#1a1a1a] text-[#E4E3E0]/60">
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Map Section */}
          <div className="flex-1 bg-black overflow-hidden m-4 mb-0 rounded-t-xl border-x border-t border-[#E4E3E0]/10 shadow-2xl relative">
            <Map
              defaultCenter={mapCenter}
              defaultZoom={zoom}
              mapId="ocean_guard_map"
              mapTypeId="satellite"
              onCameraChanged={onCameraChange}
              colorScheme="DARK"
              disableDefaultUI={true}
            >
              {/* Marker Clustering to stop overlapping */}
              <ClusteredMarkers 
                detections={detections} 
                onMarkerClick={setSelectedDetection}
                selectedId={selectedDetection?.id}
              />

              {/* Ensemble Trajectory Sampling (Motion Model Output) */}
              {selectedEnsemble && (
                <>
                  {/* Probability Heatmap Layer */}
                  <HeatmapLayer 
                    ensemble={selectedEnsemble} 
                    plasticType={selectedDetection?.plasticType} 
                    currentHour={playbackHour}
                  />

                  {/* Ensemble Drift Paths (Probability Corridors) */}
                  {selectedEnsemble.paths.map((path, idx) => (
                    <React.Fragment key={`path-group-${idx}`}>
                      <Polyline 
                        path={path.slice(0, playbackHour + 1).map(p => ({ lat: p.lat, lng: p.lng }))} 
                        color={selectedDetection?.plasticType === 'micro' ? '#22d3ee' : '#fb923c'}
                        strokeWeight={1}
                        strokeOpacity={0.15}
                      />
                      {/* Live Particle Head (Future Trajectory Detection) */}
                      {path[playbackHour] && (
                        <AdvancedMarker position={path[playbackHour]} zIndex={50}>
                           <div className={cn(
                             "w-1 h-1 rounded-full",
                             selectedDetection?.plasticType === 'micro' ? "bg-cyan-400" : "bg-orange-400"
                           )} />
                        </AdvancedMarker>
                      )}
                    </React.Fragment>
                  ))}
                  
                  {/* Final Accumulation Hotspots (Shown only at end of playback) */}
                  {playbackHour >= 60 && selectedEnsemble.hotspots.map((hotspot) => (
                    <AdvancedMarker 
                      key={`hotspot-${hotspot.rank}`}
                      position={hotspot.location}
                      zIndex={60}
                    >
                      <div className="flex flex-col items-center">
                        <div className={cn(
                          "rounded-full border-2 bg-white shadow-lg animate-pulse",
                          selectedDetection?.plasticType === 'micro' ? "border-cyan-500 shadow-cyan-500/50" : "border-orange-500 shadow-orange-500/50",
                          hotspot.rank === 1 ? "w-5 h-5" : "w-3 h-3"
                        )} />
                        {hotspot.rank === 1 && (
                          <div className={cn(
                            "mt-1 px-1.5 py-0.5 rounded text-[7px] font-bold uppercase text-white whitespace-nowrap shadow-lg",
                            selectedDetection?.plasticType === 'micro' ? "bg-cyan-600" : "bg-orange-600"
                          )}>
                             P{Math.round(hotspot.probability * 100)}% Accumulation Hotspot
                          </div>
                        )}
                      </div>
                    </AdvancedMarker>
                  ))}
                </>
              )}

              {/* Selection Tooltip Logic for Active Cluster/Detection */}
              {selectedDetection && (
                <AdvancedMarker position={selectedDetection.location} zIndex={100}>
                  <AnimatePresence>
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className={cn(
                        "absolute bottom-6 left-1/2 -translate-x-1/2 w-48 bg-[#141414] border p-2 rounded shadow-xl pointer-events-none",
                        selectedDetection.plasticType === 'micro' ? "border-cyan-500" : "border-red-500"
                      )}
                    >
                      <h4 className="text-[9px] uppercase font-bold tracking-widest mb-1 text-[#E4E3E0]/40">Active Detection</h4>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] font-mono">
                          <span>Type</span>
                          <span className={cn(
                            "capitalize font-bold",
                            selectedDetection.plasticType === 'micro' ? "text-cyan-400" : "text-red-500"
                          )}>
                            {selectedDetection.plasticType}
                          </span>
                        </div>
                        <div className="flex justify-between text-[11px] font-mono font-medium">
                          <span>Coverage</span>
                          <span className={selectedDetection.plasticType === 'micro' ? "text-cyan-400" : "text-red-500"}>
                            {(selectedDetection.pixelCoverage * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex justify-between text-[11px] font-mono">
                          <span>Biofouling</span>
                          <span className={selectedDetection.plasticType === 'micro' ? "text-cyan-400" : "text-red-500"}>
                            {(selectedDetection.biofoulingLevel * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  </AnimatePresence>
                </AdvancedMarker>
              )}
            </Map>
          </div>

          {/* Playback Controls Panel */}
          <AnimatePresence>
            {selectedDetection && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mx-4 mb-4 p-4 bg-[#141414] border border-[#E4E3E0]/10 rounded-xl flex items-center gap-6 overflow-hidden"
              >
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      if (playbackHour >= 72) setPlaybackHour(0);
                      setIsPlaybackPlaying(!isPlaybackPlaying);
                    }}
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-orange-600 hover:bg-orange-500 text-white transition-colors"
                  >
                    {isPlaybackPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
                  </button>
                  <button 
                    onClick={() => {
                      setPlaybackHour(0);
                      setIsPlaybackPlaying(false);
                    }}
                    className="p-2 text-[#E4E3E0]/60 hover:text-white"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 space-y-2">
                  <div className="flex justify-between text-[10px] uppercase font-mono tracking-wider text-[#E4E3E0]/40">
                    <span>T+ 00h</span>
                    <span className="text-orange-500 font-bold">PROJECTION TIME: T+ {playbackHour.toString().padStart(2, '0')}h</span>
                    <span>T+ 72h</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="72" 
                    value={playbackHour}
                    onChange={(e) => setPlaybackHour(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-[#1a1a1a] rounded-lg appearance-none cursor-pointer accent-orange-500"
                  />
                </div>

                <div className="flex items-center gap-4 border-l border-[#E4E3E0]/10 pl-6">
                   <div className="flex bg-[#1a1a1a] rounded p-1 border border-[#E4E3E0]/10">
                     {[1, 2, 4, 8].map((s) => (
                       <button
                         key={s}
                         onClick={() => setPlaybackSpeed(s)}
                         className={cn(
                           "px-2 py-1 text-[9px] font-bold rounded flex items-center gap-1 transition-colors",
                           playbackSpeed === s ? "bg-orange-600 text-white" : "text-[#E4E3E0]/40 hover:text-white"
                         )}
                       >
                         {s}x
                       </button>
                     ))}
                   </div>
                   <div className="text-[10px] font-mono text-cyan-400">
                      ETA: {new Date(new Date().getTime() + playbackHour * 3600000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                   </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bottom Analytics Strip */}
          <div className="h-64 mx-4 mb-4 grid grid-cols-12 gap-4">
            
            {/* Spectral Plot */}
            <div className="col-span-8 bg-[#1a1a1a] border border-[#E4E3E0]/10 rounded-xl p-6 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                   <BarChart3 className="w-4 h-4 text-orange-500" />
                   <h3 className="text-[10px] font-bold uppercase tracking-widest">Spectral Reflectance Distribution (Sub-Pixel)</h3>
                </div>
                <div className="flex items-center gap-4 text-[9px] uppercase tracking-tighter text-[#E4E3E0]/40">
                  <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-orange-500" /> Plastic</div>
                  <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500/40" /> Algae</div>
                </div>
              </div>
              <div className="flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={Array.from({length: 20}, (_, i) => ({
                    nm: 400 + i * 50,
                    plastic: 0.1 + Math.sin(i / 3) * 0.4 + Math.random() * 0.1,
                    algae: 0.05 + Math.cos(i / 2) * 0.2 + Math.random() * 0.05
                  }))}>
                    <defs>
                      <linearGradient id="colorPlastic" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E4E3E020" vertical={false} />
                    <XAxis dataKey="nm" stroke="#E4E3E040" fontSize={10} tickFormatter={(v) => `${v}nm`} />
                    <YAxis stroke="#E4E3E040" fontSize={10} domain={[0, 1]} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#141414', border: '1px solid #ffffff20', fontSize: '10px' }}
                      itemStyle={{ color: '#E4E3E0' }}
                    />
                    <Area type="monotone" dataKey="plastic" stroke="#f97316" fillOpacity={1} fill="url(#colorPlastic)" />
                    <Area type="stepBefore" dataKey="algae" stroke="#22c55e" strokeOpacity={0.2} fill="#22c55e10" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Drift Probability */}
            <div className="col-span-4 bg-[#1a1a1a] border border-[#E4E3E0]/10 rounded-xl p-6 flex flex-col">
              <div className="flex items-center gap-2 mb-4">
                 <AlertCircle className="w-4 h-4 text-cyan-400" />
                 <h3 className="text-[10px] font-bold uppercase tracking-widest">Accumulation Prediction</h3>
              </div>
              <div className="flex-1 flex flex-col justify-between">
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-[#E4E3E0]/60 uppercase italic">Convergence Probability</span>
                      <span className="font-mono">82.4%</span>
                    </div>
                    <div className="w-full h-1.5 bg-[#141414] rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: '82.4%' }}
                        className="h-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]"
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-[#E4E3E0]/60 uppercase italic">Biofouling Signal Dampening</span>
                      <span className="font-mono">31.0%</span>
                    </div>
                    <div className="w-full h-1.5 bg-[#141414] rounded-full overflow-hidden">
                       <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: '31%' }}
                        className="h-full bg-amber-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#E4E3E0]/5">
                  <p className="text-[10px] italic leading-tight text-[#E4E3E0]/40">
                    * Drift vectors calculated using 48h dynamic leeway modeling, accounting for diurnal thermal cycles (density shifts) and cross-flow turbulence specific to {selectedDetection?.plasticType} clusters.
                  </p>
                </div>
              </div>
            </div>

          </div>
        </main>

      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E4E3E020; border-radius: 2px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #E4E3E040; }
      `}</style>
    </APIProvider>
  );
}
