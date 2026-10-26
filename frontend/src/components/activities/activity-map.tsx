"use client";

import { useEffect } from "react";
import { MapContainer, Polyline, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

function FitBounds({ route }: { route: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (route.length === 0) return;
    const bounds = L.latLngBounds(route.map(([lat, lng]) => [lat, lng]));
    map.fitBounds(bounds, { padding: [28, 28] });
  }, [map, route]);
  return null;
}

export function ActivityMap({ route, color = "#0e2236" }: { route: [number, number][]; color?: string }) {
  if (route.length === 0) {
    return (
      <div className="flex h-[380px] items-center justify-center rounded-[28px] bg-haze text-slate">
        No GPS track for this activity
      </div>
    );
  }

  const center = route[Math.floor(route.length / 2)] as [number, number];

  return (
    <div className="h-[380px] overflow-hidden rounded-[28px] bg-haze">
      <MapContainer center={center} zoom={13} className="h-full w-full" scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline positions={route} pathOptions={{ color, weight: 5, opacity: 0.95, lineCap: "round" }} />
        <FitBounds route={route} />
      </MapContainer>
    </div>
  );
}
