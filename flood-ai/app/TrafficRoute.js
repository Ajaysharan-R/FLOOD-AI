"use client";

import { Polyline } from "react-leaflet";
import { getTrafficColor } from "./trafficColors";

export default function TrafficRoute({ trafficSegments }) {
  if (!trafficSegments || trafficSegments.length === 0) return null;

  return (
    <>
      {trafficSegments.map((seg, index) => (
        <Polyline
          key={index}
          positions={seg.coordinates}
          pathOptions={{
            color: getTrafficColor(seg.traffic),
            weight: 6,
            opacity: 0.9,
          }}
        />
      ))}
    </>
  );
}
