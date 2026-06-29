"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

const MapView = dynamic(() => import("./MapView"), { ssr: false });

const WEATHER_API_KEY = "51388b9c52982b6a9bda162f069cdc77";
const ORS_API_KEY =
  "eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6IjFkYjhkYWVmMmFlMzQ5NmNhOTQ2NzllODhhMWU3YjU2IiwiaCI6Im11cm11cjY0In0=";

const VEHICLE_LIMITS = {
  bike: 10,
  auto: 15,
  car: 25,
  bus: 40,
};

const VEHICLE_ORDER = ["bike", "auto", "car", "bus"];

/* ===============================
   TRAFFIC AGENT (ADD-ON)
   =============================== */
function classifyTraffic(distanceMeters, durationSeconds) {
  const distanceKm = distanceMeters / 1000;
  const durationHr = durationSeconds / 3600;

  if (durationHr === 0) return "FREE";

  const speed = distanceKm / durationHr;

  if (speed < 20) return "HEAVY";
  if (speed < 35) return "MODERATE";
  return "FREE";
}


/* ===============================
   FEATURE 8 — ROUTE COMPARISON AGENT
   =============================== */
function compareRoutes(routes, floodDepthBase, drainageTime) {
  return routes.map((r) => {
    const distanceKm = r.properties.summary.distance / 1000;
    const durationMin = r.properties.summary.duration / 60;

    

    const trafficPenalty =
  r._traffic === "HEAVY" ? 15 :
  r._traffic === "MODERATE" ? 7 : 0;

const score =
  r._floodDepth * 0.5 +
  drainageTime * 0.3 +
  distanceKm * 0.2 +
  trafficPenalty;


    return {
      ...r,
      _distanceKm: distanceKm.toFixed(2),
      _durationMin: durationMin.toFixed(1),
      _score: score,
    };
  });
}

export default function Home() {
  const [start, setStart] = useState(null);
  const [end, setEnd] = useState(null);
  const [showComparison, setShowComparison] = useState(false);


  // 🔹 FEATURE 3
  const [vehicle, setVehicle] = useState("auto");

  const [data, setData] = useState(null);
  const [routes, setRoutes] = useState(null);
  const [recommendedVehicle, setRecommendedVehicle] = useState(null);
  const [isAIRecommended, setIsAIRecommended] = useState(false);


  const [drainageNote, setDrainageNote] = useState("");
  const [rejectedRoutes, setRejectedRoutes] = useState([]);
  const [routeExplanation, setRouteExplanation] = useState("");


  /* UI ONLY */
  const [showMap, setShowMap] = useState(false);
  const [startName, setStartName] = useState("");
  const [endName, setEndName] = useState("");
  const [rainDrops, setRainDrops] = useState([]);

  /* -------------------------
     CLIENT-ONLY UI EFFECTS
  ------------------------- */
  useEffect(() => {
    const drops = Array.from({ length: 60 }).map(() => ({
      left: Math.random() * 100 + "%",
      duration: 0.8 + Math.random() * 0.7 + "s",
      delay: Math.random() * 5 + "s",
    }));
    setRainDrops(drops);

    const cursor = document.getElementById("cursor");
    const dot = document.getElementById("cursor-dot");

    const move = (e) => {
      if (!cursor || !dot) return;
      cursor.style.left = e.clientX - 9 + "px";
      cursor.style.top = e.clientY - 9 + "px";
      dot.style.left = e.clientX - 3 + "px";
      dot.style.top = e.clientY - 3 + "px";
    };

    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, []);

  /* -------------------------
     REVERSE GEOCODING (UI ONLY)
  ------------------------- */
  useEffect(() => {
    if (start) {
      fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${start[0]}&lon=${start[1]}`
      )
        .then((r) => r.json())
        .then((d) => setStartName(d.display_name || ""));
    }

    if (end) {
      fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${end[0]}&lon=${end[1]}`
      )
        .then((r) => r.json())
        .then((d) => setEndName(d.display_name || ""));
    }
  }, [start, end]);

  /* -------------------------
     FLOOD PREDICTION
  ------------------------- */
  const predictFlood = async () => {
    if (!start) return alert("Select START location");

    const [lat, lon] = start;

    const rainRes = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${WEATHER_API_KEY}`
    );
    const rainJson = await rainRes.json();
    const rainfall = rainJson?.rain?.["1h"] || 0;

    const elevRes = await fetch(
      `https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`
    );
    const elevJson = await elevRes.json();
    const elevation = elevJson.results[0].elevation;

    const slope = Math.min(Math.max((elevation % 50) / 300, 0.03), 0.15);

    const res = await fetch(
      `/api/predict?rainfall=${rainfall}&slope=${slope}&lat=${lat}&lon=${lon}`
    );
    const result = await res.json();

    let best = "bus";
    for (const v of VEHICLE_ORDER) {
      if (result.flood_depth_cm <= VEHICLE_LIMITS[v]) {
        best = v;
        break;
      }
    }

    setRecommendedVehicle(best);
    setDrainageNote(result.drainage_note || "");
    setData(result);
setVehicle(best);
setIsAIRecommended(true);


  };

  /* -------------------------
     SAFE ROUTE (FEATURE 2 + 3 + 8)
  ------------------------- */
  const findSafeRoute = async () => {
    if (!start || !end || !data) return alert("Predict flood first");

    const activeVehicle =
      vehicle === "auto" ? recommendedVehicle : vehicle;

    const res = await fetch(
      "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
      {
        method: "POST",
        headers: {
          Authorization: ORS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          coordinates: [
            [start[1], start[0]],
            [end[1], end[0]],
          ],
          alternative_routes: {
            target_count: 3,
            weight_factor: 1.4,
          },
        }),
      }
    );

    const json = await res.json();
    if (!json.features) return alert("No routes returned");
const enriched = json.features.map((r) => {
  const distKm = r.properties.summary.distance / 1000;

  // ➕ ADD TRAFFIC CLASSIFICATION
  const traffic = classifyTraffic(
    r.properties.summary.distance,
    r.properties.summary.duration
  );

  return {
    ...r,
    _floodDepth: Math.round(data.flood_depth_cm + distKm * 0.6),

    // ➕ ADD THIS LINE
    _traffic: traffic,
  };
});


    const valid = enriched.filter(
      (r) => r._floodDepth <= VEHICLE_LIMITS[activeVehicle]
    );

    const rejected = enriched.filter(
      (r) => r._floodDepth > VEHICLE_LIMITS[activeVehicle]
    );

    setRejectedRoutes(rejected);

    const usableRoutes = valid.length > 0 ? valid : enriched;

    const compared = compareRoutes(
      usableRoutes,
      data.flood_depth_cm,
      data.drainage_time_hr
    );

    const ranked = compared.sort((a, b) => a._score - b._score);

    const finalRoutes = ranked.map((r, i) => ({
      ...r,
      _best: i === 0,
      _safety:
        i === 0 ? "SAFE" : i === 1 ? "RISKY" : "NOT SAFE",
    }));

    setRoutes({
      type: "FeatureCollection",
      features: finalRoutes,
    });

    setShowMap(true);
  };

  return (
    <main style={{ padding: 20, position: "relative" }}>
      {/* 🌧️ RAIN */}
      <div className="rain">
        {rainDrops.map((d, i) => (
          <span
            key={i}
            style={{
              left: d.left,
              animationDuration: d.duration,
              animationDelay: d.delay,
            }}
          />
        ))}
      </div>

      {/* 🖱️ CURSOR */}
      <div id="cursor" className="cursor"></div>
      <div id="cursor-dot" className="cursor-dot"></div>

      <div className="panel">
        <h2>AI Flood Prediction Dashboard</h2>

        <select
          value={vehicle}
          onChange={(e) => {
  setVehicle(e.target.value);
  setIsAIRecommended(false); // user manually overrides AI
}}

          style={{ padding: 10, width: "100%", marginBottom: 10 }}
        >
         <option value="bike">
  Bike {isAIRecommended && vehicle === "bike" ? "(AI Recommended)" : ""}
</option>
<option value="auto">
  Auto {isAIRecommended && vehicle === "auto" ? "(AI Recommended)" : ""}
</option>
<option value="car">
  Car {isAIRecommended && vehicle === "car" ? "(AI Recommended)" : ""}
</option>
<option value="bus">
  Bus {isAIRecommended && vehicle === "bus" ? "(AI Recommended)" : ""}
</option>

        </select>

        <button className="btn" onClick={predictFlood}>
          Predict Flood
        </button>

        <button
          className="btn"
          style={{ marginTop: 10 }}
          onClick={() => setShowMap(true)}
        >
          📍 Select Location
        </button>

        {startName && (
          <div style={{ marginTop: 8, fontSize: 13, color: "#94a3b8" }}>
            📍 <b>Start:</b> {startName}
          </div>
        )}

        {endName && (
          <div style={{ marginTop: 4, fontSize: 13, color: "#94a3b8" }}>
            🎯 <b>End:</b> {endName}
          </div>
        )}

        {data && (
          <div className="panel soft" style={{ marginTop: 12 }}>
            Flood Depth: <b>{data.flood_depth_cm} cm</b> <br />
            Drainage Time: <b>{data.drainage_time_hr} hrs</b> <br />
            <span style={{ fontSize: 12, color: "#94a3b8" }}>
              Drainage note: {drainageNote}
            </span>
            <br />
            Recommended Vehicle:{" "}
            <b>{recommendedVehicle?.toUpperCase()}</b>
          </div>
        )}

       <button
          className="btn"
          style={{ marginTop: 10 }}
          onClick={  findSafeRoute}
        >
          Find Safe Route
        </button>
        {routes && (
  <button
    className="btn"
    style={{ marginTop: 10, background: "#6366f1" }}
    onClick={() => setShowComparison(true)}
  >
    📊 Compare Routes
  </button>
)}


        {rejectedRoutes.length > 0 && (
          <div style={{ marginTop: 10, color: "#f87171", fontSize: 13 }}>
            <b>Routes rejected for selected vehicle:</b>
            <ul>
              {rejectedRoutes.map((_, i) => (
                <li key={i}>
                  Route {i + 1} exceeds vehicle flood tolerance
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {showComparison && routes && routes.features.length >= 2 && (() => {
  const best = routes.features.find(r => r._best);
  const second = routes.features.find(r => !r._best);

  return (
    <div className="panel soft" style={{ marginTop: 20 }}>
      <h3 style={{ marginBottom: 12 }}>Route Comparison (Top 2)</h3>

      {/* BEST ROUTE */}
      <div
        style={{
          border: "2px solid #22c55e",
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
          background: "rgba(34,197,94,0.08)",
        }}
      >
        <b>✅ Selected Route (SAFE)</b>
        <div style={{ fontSize: 13, marginTop: 6 }}>
          🚗 Distance: {best._distanceKm} km <br />
          ⏱️ Duration: {best._durationMin} min <br />
          🌊 Flood Depth: {best._floodDepth} cm <br />
          🚦 Traffic: {best._traffic} <br />
          📉 Score: {best._score.toFixed(2)}
        </div>
      </div>

      {/* SECOND BEST ROUTE */}
      <div
        style={{
          border: "1px solid #f59e0b",
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <b>⚠️ Alternative Route (RISKY)</b>
        <div style={{ fontSize: 13, marginTop: 6 }}>
          🚗 Distance: {second._distanceKm} km <br />
          ⏱️ Duration: {second._durationMin} min <br />
          🌊 Flood Depth: {second._floodDepth} cm <br />
          🚦 Traffic: {second._traffic} <br />
          📉 Score: {second._score.toFixed(2)}
        </div>
      </div>

      {/* JUSTIFICATION */}
      <div style={{ fontSize: 13, color: "#94a3b8" }}>
        <b>Why the selected route was chosen:</b>
        <ul style={{ marginLeft: 18 }}>
          {best._floodDepth < second._floodDepth && (
            <li>Lower flood depth reduces risk of vehicle stalling.</li>
          )}
          {best._traffic !== "HEAVY" && second._traffic === "HEAVY" && (
            <li>Less traffic congestion ensures smoother evacuation.</li>
          )}
          {best._distanceKm < second._distanceKm && (
            <li>Shorter distance reduces exposure to flooded segments.</li>
          )}
          <li>
            Overall risk score is lower (
            {best._score.toFixed(2)} vs {second._score.toFixed(2)}).
          </li>
        </ul>
      </div>

      <button
        className="btn"
        style={{ marginTop: 10 }}
        onClick={() => setShowComparison(false)}
      >
        Close Comparison
      </button>
    </div>
  );
})()}



      {showMap && (
        <MapView
          start={start}
          end={end}
          setStart={setStart}
          setEnd={setEnd}
          routes={routes}
          startName={startName}
          endName={endName}
        />
      )}
    </main>
  );
}
