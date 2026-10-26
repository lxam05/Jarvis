"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";

const CONNECT_MESSAGES: Record<string, string> = {
  connected: "Strava connected — activities imported.",
  connected_sync_failed: "Strava connected, but the first import failed. Try Sync now.",
  denied: "Strava connection was cancelled.",
  missing_scope: "Strava needs the “View data about your activities” permission. Connect again and keep it ticked.",
};

function formatTime(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleString("en-GB") : "Never";
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);

  const { data: strava, isError: stravaError } = useQuery({
    queryKey: ["strava", "status"],
    queryFn: api.stravaStatus,
    retry: 1,
  });
  const { data: syncStatus } = useQuery({ queryKey: ["sync", "status"], queryFn: api.syncStatus });
  const { data: userSettings } = useQuery({ queryKey: ["settings"], queryFn: api.getSettings });

  // Unedited fields fall back to the saved values.
  const [raceNameDraft, setRaceName] = useState<string>();
  const [raceDateDraft, setRaceDate] = useState<string>();
  const raceName = raceNameDraft ?? userSettings?.race_name ?? "";
  const raceDate = raceDateDraft ?? userSettings?.race_date ?? "";

  useEffect(() => {
    // The Strava OAuth callback lands here with ?strava=<outcome>.
    const outcome = new URLSearchParams(window.location.search).get("strava");
    if (outcome) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotice(CONNECT_MESSAGES[outcome] ?? null);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const refreshAll = () => {
    for (const key of ["strava", "dashboard", "activities", "training", "coaching"]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };

  const connectMutation = useMutation({
    mutationFn: api.stravaConnectUrl,
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
  });

  const syncMutation = useMutation({
    mutationFn: api.stravaSync,
    onSuccess: (res) => {
      setNotice(`Synced ${res.activities_upserted} activities from Strava.`);
      refreshAll();
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: api.stravaDisconnect,
    onSuccess: () => {
      setNotice("Strava disconnected. Imported activities are kept.");
      refreshAll();
    },
  });

  const saveRace = useMutation({
    mutationFn: () =>
      api.updateSettings({ race_name: raceName.trim() || null, race_date: raceDate || null }),
    onSuccess: () => {
      setNotice("Race goal saved.");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      refreshAll();
    },
  });

  const mutationError = [connectMutation, syncMutation, disconnectMutation, saveRace].find((m) => m.isError)
    ?.error;

  return (
    <div>
      <h1 className="hud-title mb-6 text-xl">Settings</h1>

      {notice || mutationError ? (
        <div
          className={
            mutationError
              ? "mb-4 border border-[rgba(255,77,109,0.4)] px-4 py-3 font-mono text-xs text-[var(--danger)]"
              : "mb-4 border border-[rgba(0,212,255,0.35)] bg-[rgba(0,212,255,0.06)] px-4 py-3 font-mono text-xs text-[#c8f0ff]"
          }
        >
          {mutationError instanceof Error ? mutationError.message.slice(0, 200) : notice}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Strava">
          {stravaError ? (
            <p className="font-mono text-xs text-[var(--danger)]">
              Couldn&apos;t reach the Strava API — is the latest backend deployed?
            </p>
          ) : !strava ? (
            <div className="hud-spinner" />
          ) : !strava.configured ? (
            <p className="font-mono text-xs text-[var(--muted)]">
              Strava isn&apos;t configured on the server yet. Set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET on
              the backend.
            </p>
          ) : (
            <>
              <dl className="space-y-2 font-mono text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--muted)]">Account</dt>
                  <dd className="text-[#c8f0ff]">
                    {strava.connected ? strava.athlete_name ?? "Connected" : "Not connected"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--muted)]">Last sync</dt>
                  <dd className="text-[#c8f0ff]">{formatTime(strava.last_synced_at)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--muted)]">Activities</dt>
                  <dd className="text-[#c8f0ff]">{strava.activity_count}</dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                {strava.connected ? (
                  <>
                    <button
                      onClick={() => syncMutation.mutate()}
                      disabled={syncMutation.isPending}
                      className="hud-btn hud-btn-solid"
                    >
                      {syncMutation.isPending ? "Syncing…" : "Sync now"}
                    </button>
                    <button
                      onClick={() => disconnectMutation.mutate()}
                      disabled={disconnectMutation.isPending}
                      className="hud-btn"
                    >
                      Disconnect
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => connectMutation.mutate()}
                    disabled={connectMutation.isPending}
                    className="hud-btn hud-btn-solid"
                  >
                    Connect Strava
                  </button>
                )}
              </div>
            </>
          )}
        </Card>

        <Card title="Race goal">
          <div className="space-y-4">
            <label className="block">
              <span className="hud-label">Race name</span>
              <input
                value={raceName}
                onChange={(e) => setRaceName(e.target.value)}
                placeholder="e.g. Ironman 70.3 Dublin"
                className="hud-input mt-1.5"
              />
            </label>
            <label className="block">
              <span className="hud-label">Race date</span>
              <input
                type="date"
                value={raceDate}
                onChange={(e) => setRaceDate(e.target.value)}
                className="hud-input mt-1.5"
              />
            </label>
            <p className="font-mono text-xs text-[var(--muted)]">
              Sets the training phase (base → build → peak → taper). Leave empty for general base training.
            </p>
            <button onClick={() => saveRace.mutate()} disabled={saveRace.isPending} className="hud-btn hud-btn-solid">
              Save race
            </button>
          </div>
        </Card>

        <Card title="Garmin recovery sync">
          <dl className="space-y-2 font-mono text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--muted)]">Last sync</dt>
              <dd className="text-[#c8f0ff]">{formatTime(syncStatus?.last_sync_at)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[var(--muted)]">Status</dt>
              <dd className="text-[#c8f0ff]">{syncStatus?.last_status ?? "—"}</dd>
            </div>
          </dl>
          <p className="mt-4 font-mono text-xs text-[var(--muted)]">
            Sleep, HRV and body battery come from the Mac sync agent. See docs/mac-setup.md.
          </p>
        </Card>
      </div>
    </div>
  );
}
