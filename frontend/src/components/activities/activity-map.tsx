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

export function ActivityMap({ route }: { route: [number, number][] }) {
  if (route.length === 0) {
    return (
      <div className="flex h-[360px] items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-950 text-sm text-zinc-500">
        No GPS for this activity
      </div>
    );
  }

  const center = route[Math.floor(route.length / 2)] as [number, number];

  return (
    <div className="h-[360px] overflow-hidden rounded-2xl border border-zinc-800">
      <MapContainer center={center} zoom={13} className="h-full w-full" scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline positions={route} pathOptions={{ color: "#34d399", weight: 4, opacity: 0.9 }} />
        <FitBounds route={route} />
      </MapContainer>
    </div>
  );
}
