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
      <div className="hud-panel flex h-[360px] items-center justify-center border-dashed font-mono text-sm text-[var(--muted)]">
        No GPS for this activity
      </div>
    );
  }

  const center = route[Math.floor(route.length / 2)] as [number, number];

  return (
    <div className="hud-panel hud-map hud-corners h-[360px] overflow-hidden">
      <span className="hud-corner-tr" aria-hidden />
      <span className="hud-corner-bl" aria-hidden />
      <MapContainer center={center} zoom={13} className="h-full w-full" scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <Polyline positions={route} pathOptions={{ color: "#00d4ff", weight: 4, opacity: 0.9 }} />
        <FitBounds route={route} />
      </MapContainer>
    </div>
  );
}
