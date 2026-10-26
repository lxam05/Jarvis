"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

const STALE_MS = 15 * 60 * 1000;

/** Pull new Strava activities when the app opens and the last sync is stale. */
export function useStravaAutoSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const status = await api.stravaStatus();
        if (!status.connected) return;
        const last = status.last_synced_at ? new Date(status.last_synced_at).getTime() : 0;
        if (Date.now() - last < STALE_MS) return;
        await api.stravaSync();
        if (cancelled) return;
        for (const key of ["dashboard", "activities", "training", "coaching", "strava"]) {
          queryClient.invalidateQueries({ queryKey: [key] });
        }
      } catch {
        // Settings shows sync errors; a failed background sync shouldn't break the page.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [queryClient]);
}
