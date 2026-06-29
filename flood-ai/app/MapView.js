"use client";

import { useEffect, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/* ---------------- CLICK HANDLER (UNCHANGED) ---------------- */
function ClickHandler({ start, end, setStart, setEnd }) {
  useMapEvents({
    click(e) {
      if (start && end) return;
      const { lat, lng } = e.latlng;
      if (!start) setStart([lat, lng]);
      else if (!end) setEnd([lat, lng]);
    },
  });
  return null;
}

/* ---------------- CUSTOM MARKERS (UNCHANGED) ---------------- */
const startIcon = L.divIcon({
  html: `<div style="
    width:18px;height:18px;border-radius:50%;
    background:#22c55e;
    box-shadow:0 0 0 rgba(34,197,94,.6);
    animation:pulseGreen 1.5s infinite;">
  </div>`,
  className: "",
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const endIcon = L.divIcon({
  html: `<div style="
    width:18px;height:18px;border-radius:50%;
    background:#ef4444;
    box-shadow:0 0 0 rgba(239,68,68,.6);
    animation:pulseRed 1.5s infinite;">
  </div>`,
  className: "",
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

/* ---------------- CHENNAI GIS LOADER (VISUAL ONLY) ---------------- */
async function loadChennaiGIS(map) {
  try {
    const drains = await fetch("/gis/chennai/chennai_drains.geojson").then(r =>
      r.json()
    );

    L.geoJSON(drains, {
      pointToLayer: (_f, latlng) =>
        L.circleMarker(latlng, {
          radius: 5,
          color: "#00e5ff",
          fillColor: "#00e5ff",
          fillOpacity: 1,
          weight: 1,
        }),
    }).addTo(map);

    const canals = await fetch("/gis/chennai/chennai_canals.geojson").then(r =>
      r.json()
    );

    L.geoJSON(canals, {
      style: {
        color: "#2196f3",
        weight: 4,
        opacity: 1,
      },
    }).addTo(map);
  } catch (e) {
    console.error("Failed to load Chennai GIS layers", e);
  }
}

/* ---------------- MAP ACCESS ---------------- */
function GISLayerLoader() {
  const map = useMapEvents({});
  useEffect(() => {
    loadChennaiGIS(map);
  }, [map]);
  return null;
}

/* ---------------- DISTANCE UTILITY ---------------- */
function haversine(a, b) {
  const R = 6371e3;
  const φ1 = (a[0] * Math.PI) / 180;
  const φ2 = (b[0] * Math.PI) / 180;
  const Δφ = ((b[0] - a[0]) * Math.PI) / 180;
  const Δλ = ((b[1] - a[1]) * Math.PI) / 180;

  const x =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/* ---------------- FIXED: DRAIN ANALYSIS (REAL GIS SAFE) ---------------- */
function countDrainsNearRoute(route, drains, buffer = 60) {
  let count = 0;

  if (!drains?.features) return 0;

  drains.features.forEach(f => {
    if (!f.geometry || !f.geometry.coordinates) return;

    // Point drains
    if (f.geometry.type === "Point") {
      const [lng, lat] = f.geometry.coordinates;
      route.forEach(p => {
        if (haversine([lat, lng], p) <= buffer) count++;
      });
    }

    // LineString drains
    if (f.geometry.type === "LineString") {
      f.geometry.coordinates.forEach(([lng, lat]) => {
        route.forEach(p => {
          if (haversine([lat, lng], p) <= buffer) count++;
        });
      });
    }
  });

  return count;
}

/* ---------------- CANAL ANALYSIS (SAFE) ---------------- */
function analyzeCanals(route, canals, buffer = 40) {
  let near = false;
  let crossings = 0;

  if (!canals?.features) return { near: false, crossings: 0 };

  canals.features.forEach(f => {
    if (!f.geometry || !f.geometry.coordinates) return;

    f.geometry.coordinates.forEach(([lng, lat]) => {
      route.forEach(p => {
        const d = haversine([lat, lng], p);
        if (d <= buffer) near = true;
        if (d <= 10) crossings++;
      });
    });
  });

  return { near, crossings };
}

/* ---------------- MAP VIEW ---------------- */
export default function MapView({
  start,
  end,
  setStart,
  setEnd,
  routes,
  startName,
  endName,
}) {
  const center = [13.0827, 80.2707];
  const drainsRef = useRef(null);
  const canalsRef = useRef(null);
  // ===============================
  // TRAFFIC COLOR HELPER (ADD-ON)
  // ===============================
  const getTrafficColor = (traffic) => {
    if (traffic === "HEAVY") return "#ef4444";    // red
    if (traffic === "MODERATE") return "#f59e0b"; // orange
    return "#22c55e";                             // green
  };

  useEffect(() => {
    fetch("/gis/chennai/chennai_drains.geojson")
      .then(r => r.json())
      .then(d => (drainsRef.current = d));

    fetch("/gis/chennai/chennai_canals.geojson")
      .then(r => r.json())
      .then(c => (canalsRef.current = c));
  }, []);

  const getColor = safety =>
    safety === "SAFE"
      ? "#22c55e"
      : safety === "RISKY"
      ? "#f59e0b"
      : "#ef4444";

  return (
    <MapContainer
      center={center}
      zoom={13}
      style={{ height: 420, borderRadius: 16, overflow: "hidden", marginTop: 12 }}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

      <GISLayerLoader />

      <ClickHandler
        start={start}
        end={end}
        setStart={setStart}
        setEnd={setEnd}
      />

      {start && (
        <Marker position={start} icon={startIcon}>
          <Popup>
            <b>Start</b>
            <br />
            {startName || "Selected"}
          </Popup>
        </Marker>
      )}

      {end && (
        <Marker position={end} icon={endIcon}>
          <Popup>
            <b>Destination</b>
            <br />
            {endName || "Selected"}
          </Popup>
        </Marker>
      )}

      {routes &&
        routes.features.map((r, i) => {
          const routeCoords = r.geometry.coordinates.map(c => [c[1], c[0]]);

          let drainCount = 0;
          let canalInfo = { near: false, crossings: 0 };

          if (drainsRef.current && canalsRef.current) {
            drainCount = countDrainsNearRoute(
              routeCoords,
              drainsRef.current
            );
            canalInfo = analyzeCanals(routeCoords, canalsRef.current);
          }

          return (
            <Polyline
              key={i}
              positions={routeCoords}
              color={getColor(r._safety)}

              weight={r._safety === "SAFE" ? 7 : 4}
              opacity={r._safety === "SAFE" ? 1 : 0.6}
              dashArray={r._safety === "SAFE" ? null : "6 10"}
            >
              <Popup>
                <b>{r._safety}</b>
                <br />
                Flood Depth: {r._floodDepth} cm
                <br />
                <br />
                  Traffic: <b>{r._traffic}</b>
                <br />
                <br />
<br />
<span
  style={{
    padding: "2px 6px",
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 600,
    background:
      r._traffic === "HEAVY"
        ? "#ef4444"
        : r._traffic === "MODERATE"
        ? "#f59e0b"
        : "#22c55e",
    color: "#000",
  }}
>
  {r._traffic} TRAFFIC
</span>


                Drainage awareness:
                <br />• Surface drains nearby: {drainCount}
                <br />• Near canal: {canalInfo.near ? "Yes" : "No"}
                <br />• Canal crossings: {canalInfo.crossings}
              </Popup>
             

            </Polyline>
          );
        })}
    </MapContainer>
  );
}