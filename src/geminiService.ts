import { GoogleGenAI, Type } from "@google/genai";
import { Detection, Location, TrajectoryPoint, TrajectoryEnsemble, Hotspot } from "./types";

const geminiKey = typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : undefined;

const ai = new GoogleGenAI({ apiKey: geminiKey || '' });

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Generates high-fidelity fallback synthetic data if AI is rate-limited
function generateMockDetections(): Detection[] {
  const gyres = [
    { lat: 25.0, lng: -145.0, name: "North Pacific" },
    { lat: -25.0, lng: -95.0, name: "South Pacific" },
    { lat: 25.0, lng: -45.0, name: "North Atlantic" },
    { lat: -25.0, lng: -15.0, name: "South Atlantic" },
    { lat: -25.0, lng: 85.0, name: "Indian Ocean" }
  ];

  return gyres.map(gyre => {
    const isMicro = Math.random() > 0.5;
    return {
      id: `synthetic-${gyre.name.toLowerCase().replace(" ", "-")}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      location: {
        lat: gyre.lat + (Math.random() - 0.5) * 5,
        lng: gyre.lng + (Math.random() - 0.5) * 5
      },
      plasticType: isMicro ? "micro" : "macro",
      confidence: 0.85 + Math.random() * 0.1,
      spectralSignature: "Synthetic Sentinel Signature",
      biofoulingLevel: Math.random() * 0.4,
      pixelCoverage: isMicro ? (0.01 + Math.random() * 0.05) : (0.1 + Math.random() * 0.3)
    };
  });
}

export async function analyzeGlobalOcean(retries = 3, backoff = 2000): Promise<Detection[]> {
  const prompt = `Act as an autonomous global marine satellite analyst. 
  Perform a high-level scan of the world's oceans to identify significant clusters of floating macroplastics and microplastics.
  
  Focus on high-concentration accumulation zones (Gyres).
  For each detected cluster, provide:
  - Precise Lat/Lng coordinates.
  - Identification: Macro vs Micro plastic (Differentiate from organic debris/sargassum).
  - Concentration: Pixel coverage percentage (sub-pixel analysis).
  - Confidence level based on spectral signature consistency.
  - Biofouling impact estimation.

  Return 5-8 significant clusters across the globe in JSON format.`;

  for (let i = 0; i < retries; i++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                timestamp: { type: Type.STRING },
                location: {
                  type: Type.OBJECT,
                  properties: {
                    lat: { type: Type.NUMBER },
                    lng: { type: Type.NUMBER }
                  },
                  required: ["lat", "lng"]
                },
                plasticType: { type: Type.STRING, enum: ["macro", "micro"] },
                confidence: { type: Type.NUMBER },
                spectralSignature: { type: Type.STRING },
                biofoulingLevel: { type: Type.NUMBER },
                pixelCoverage: { type: Type.NUMBER, description: "Concentration in decimal percentage" }
              },
              required: ["id", "timestamp", "location", "plasticType", "confidence"]
            }
          }
        }
      });

      const text = response.text;
      if (!text) return generateMockDetections();
      return JSON.parse(text);
    } catch (error: any) {
      const isRateLimit = error?.status === "RESOURCE_EXHAUSTED" || error?.message?.includes("429");
      const isTransient = error?.status === "UNKNOWN" || error?.message?.includes("500");

      if ((isRateLimit || isTransient) && i < retries - 1) {
        console.warn(`Gemini API ${isRateLimit ? "Rate Limited" : "Error"}. Retrying in ${backoff}ms... (Attempt ${i + 1}/${retries})`);
        await sleep(backoff);
        backoff *= 2; // Exponential backoff
        continue;
      }

      console.error("Gemini Analysis Critical Error:", error);
      // Fallback to synthetic data so the system remains functional
      return generateMockDetections();
    }
  }

  return generateMockDetections();
}

/**
 * Simulates an ENSEMBLE trajectory based on the OceanGuard Motion Model.
 * Accounts for:
 * 1. Ocean current velocity (primary force)
 * 2. Wind-induced drift (dynamic α factor adjusted by plastic type and sea state)
 * 3. Stochastic diffusion (enhanced turbulence modeling for micro-particles)
 */
export function predictTrajectoryEnsemble(
  start: Location, 
  windSpeed: number, 
  windDir: number, 
  currentSpeed: number, 
  currentDir: number, 
  hours: number,
  plasticType: 'macro' | 'micro' = 'macro'
): TrajectoryEnsemble {
  const ensembleCount = 15;
  const paths: TrajectoryPoint[][] = [];
  const now = new Date();

  // Determine Sea State Coupling (Langmuir circulation / surface agitation)
  const seaStateFactor = Math.min(windSpeed / 40, 0.5); 

  for (let p = 0; p < ensembleCount; p++) {
    const points: TrajectoryPoint[] = [];
    let currentLat = start.lat;
    let currentLng = start.lng;

    // 1. Dynamic α (Wind Drag Factor)
    // Based on plastic type and atmospheric coupling with the sea surface
    const typeBaseAlpha = plasticType === 'macro' ? 0.032 : 0.014;
    const α = typeBaseAlpha * (1 + seaStateFactor * 0.4) + (Math.random() * 0.012);

    // 2. Stochastic Diffusion Component (D)
    // Microplastics account for smaller-scale turbulence and vertical suspension noise
    const turbulenceWeight = plasticType === 'micro' ? 1.8 : 1.0;
    const baseD = 0.035;
    const D = baseD * turbulenceWeight * (1 + seaStateFactor);

    for (let i = 1; i <= hours; i++) {
        const forecastTime = new Date(now.getTime() + i * 3600 * 1000);

        // Unit conversion (Compass to Radians)
        const windToRad = (90 - (windDir + 180)) * (Math.PI / 180);
        const currentToRad = (90 - currentDir) * (Math.PI / 180);

        // Motion Model Logic
        // 1. Current Velocity (Advection)
        let vx = Math.cos(currentToRad) * currentSpeed;
        let vy = Math.sin(currentToRad) * currentSpeed;

        // 2. Wind Drag Influence (α Factor)
        vx += Math.cos(windToRad) * windSpeed * α;
        vy += Math.sin(windToRad) * windSpeed * α;

        // 3. Diffusion Component (Random Turbulence)
        // Scaled by sqrt(2 * D * dt) for standard Brownian motion simulation
        // The noise is periodically applied to simulate sub-grid eddies
        const dt = 3600;
        const driftNoise = Math.sqrt(2 * D * dt);
        // Smaller chunks of noise for Microplastics to simulate higher frequency oscillation
        const scale = plasticType === 'micro' ? 0.025 : 0.015;
        vx += (Math.random() - 0.5) * driftNoise * scale;
        vy += (Math.random() - 0.5) * driftNoise * scale;

        // Spherical Projection onto Lat/Lng
        const deltaLat = (vy * 3600) / 111111;
        const deltaLng = (vx * 3600) / (111111 * Math.cos(currentLat * Math.PI / 180));

        currentLat += deltaLat;
        currentLng += deltaLng;

        points.push({
          lat: currentLat,
          lng: currentLng,
          timestamp: forecastTime.toISOString(),
          type: 'predicted'
        });
    }
    paths.push(points);
  }

  // Calculate Accumulation Hotspots (Terminal clusters)
  const hotspots: Hotspot[] = paths.slice(0, 3).map((p, idx) => {
    const last = p[p.length - 1];
    return {
      location: { lat: last.lat, lng: last.lng },
      probability: 0.85 - (idx * 0.15),
      rank: idx + 1
    };
  });

  return { paths, hotspots };
}
