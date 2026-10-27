"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Panel, Spinner } from "@/components/ui/card";
import { api, type SportKey } from "@/lib/api";
import { SPORTS, SPORT_COLOR, SPORT_NAME } from "@/lib/sport";
import { cn } from "@/lib/utils";

const CONNECT_MESSAGES: Record<string, string> = {
  connected: "Strava connected. Your activities are imported.",
  connected_sync_failed: "Strava connected, but the first import failed. Select Sync now.",
  denied: "Strava connection was cancelled.",
  missing_scope: "Strava needs the “View data about your activities” permission. Connect again and keep it ticked.",
};

function formatTime(iso: string | null | undefined) {
  return iso
    ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "Never";
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
  const [sportsDraft, setSports] = useState<SportKey[]>();
  const [profileDraft, setProfile] = useState<string>();
  const sports = sportsDraft ?? userSettings?.sports ?? ["running", "cycling", "swimming"];
  const profile = profileDraft ?? userSettings?.coach_profile ?? "";

  const toggleSport = (sport: SportKey) => {
    const next = sports.includes(sport) ? sports.filter((s) => s !== sport) : [...sports, sport];
    if (next.length) setSports(next);
  };

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

  const saveProfile = useMutation({
    mutationFn: () => api.updateSettings({ sports, coach_profile: profile.trim() || null }),
    onSuccess: () => {
      setNotice("Coach profile saved. Today's plan will use it.");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
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

  const mutationError = [connectMutation, syncMutation, disconnectMutation, saveRace, saveProfile].find((m) => m.isError)
    ?.error;

  return (
    <div className="max-w-[860px]">
      <h1 className="display text-[clamp(2.6rem,6vw,4rem)]">Settings</h1>

      {notice || mutationError ? (
        <p
          role="status"
          className={
            mutationError
              ? "mt-8 rounded-[16px] border border-danger/30 px-5 py-3 text-[0.95rem] text-danger"
              : "mt-8 rounded-[16px] bg-haze px-5 py-3 text-[0.95rem]"
          }
        >
          {mutationError instanceof Error ? mutationError.message.slice(0, 200) : notice}
        </p>
      ) : null}

      <div className="mt-10 space-y-4">
        <Panel className="md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0">
              <h2 className="display-sm text-[1.5rem]">Strava</h2>
              <p className="mt-1 text-slate">Your activities: runs, rides and swims.</p>
            </div>
            {strava?.configured && !stravaError ? (
              <div className="flex flex-wrap gap-2">
                {strava.connected ? (
                  <>
                    <button
                      onClick={() => syncMutation.mutate()}
                      disabled={syncMutation.isPending}
                      className="btn btn-primary"
                    >
                      {syncMutation.isPending ? "Syncing…" : "Sync now"}
                    </button>
                    <button
                      onClick={() => disconnectMutation.mutate()}
                      disabled={disconnectMutation.isPending}
                      className="btn btn-quiet"
                    >
                      Disconnect
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => connectMutation.mutate()}
                    disabled={connectMutation.isPending}
                    className="btn btn-primary"
                  >
                    Connect Strava
                  </button>
                )}
              </div>
            ) : null}
          </div>

          {stravaError ? (
            <p className="mt-6 text-danger">Can&apos;t reach the server to check Strava. Refresh to try again.</p>
          ) : !strava ? (
            <Spinner className="mt-6" />
          ) : !strava.configured ? (
            <p className="mt-6 text-slate">
              Strava isn&apos;t set up on the server yet. Add STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET to the backend.
            </p>
          ) : (
            <dl className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-3">
              <div>
                <dt className="text-[0.85rem] text-slate">Account</dt>
                <dd className="mt-1 font-semibold">
                  {strava.connected ? strava.athlete_name ?? "Connected" : "Not connected"}
                </dd>
              </div>
              <div>
                <dt className="text-[0.85rem] text-slate">Last sync</dt>
                <dd className="num mt-1 font-semibold">{formatTime(strava.last_synced_at)}</dd>
              </div>
              <div>
                <dt className="text-[0.85rem] text-slate">Activities</dt>
                <dd className="num mt-1 font-semibold">{strava.activity_count}</dd>
              </div>
            </dl>
          )}
        </Panel>

        <Panel className="md:p-8">
          <h2 className="display-sm text-[1.5rem]">Coach profile</h2>
          <p className="mt-1 max-w-[56ch] text-slate">
            What the coach should know about you. It reads this before every plan and answer, on top of your Strava
            and Garmin data.
          </p>
          <form
            className="mt-6 space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              saveProfile.mutate();
            }}
          >
            <fieldset>
              <legend className="text-[0.85rem] text-slate">Sports you train</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {SPORTS.map((sport) => {
                  const on = sports.includes(sport);
                  return (
                    <button
                      key={sport}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleSport(sport)}
                      className={cn(
                        "flex items-center gap-2 rounded-full border px-4 py-2 text-[0.92rem] font-medium transition-colors",
                        on ? "border-ink bg-paper" : "border-transparent bg-haze-strong text-slate hover:text-ink"
                      )}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: on ? SPORT_COLOR[sport] : "var(--line)" }}
                        aria-hidden
                      />
                      {SPORT_NAME[sport]}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <label className="block">
              <span className="text-[0.85rem] text-slate">About you</span>
              <textarea
                value={profile}
                onChange={(e) => setProfile(e.target.value)}
                rows={10}
                maxLength={4000}
                placeholder="Goal race and target time, injuries or niggles, which days you can train, session types you like, how blunt the coach should be…"
                className="field mt-1.5 resize-y leading-relaxed"
              />
            </label>
            <button type="submit" disabled={saveProfile.isPending} className="btn btn-primary">
              Save profile
            </button>
          </form>
        </Panel>

        <Panel className="md:p-8">
          <h2 className="display-sm text-[1.5rem]">Race goal</h2>
          <p className="mt-1 max-w-[56ch] text-slate">
            Your race date sets the training phase: base, build, peak, then taper. Leave it empty for general base
            training.
          </p>
          <form
            className="mt-6 grid gap-4 sm:grid-cols-[1fr_200px_auto] sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              saveRace.mutate();
            }}
          >
            <label className="block">
              <span className="text-[0.85rem] text-slate">Race name</span>
              <input
                value={raceName}
                onChange={(e) => setRaceName(e.target.value)}
                placeholder="Ironman 70.3 Dublin"
                className="field mt-1.5"
              />
            </label>
            <label className="block">
              <span className="text-[0.85rem] text-slate">Race date</span>
              <input
                type="date"
                value={raceDate}
                onChange={(e) => setRaceDate(e.target.value)}
                className="field mt-1.5"
              />
            </label>
            <button type="submit" disabled={saveRace.isPending} className="btn btn-primary h-[46px]">
              Save race
            </button>
          </form>
        </Panel>

        <Panel className="md:p-8">
          <h2 className="display-sm text-[1.5rem]">Garmin recovery</h2>
          <p className="mt-1 max-w-[56ch] text-slate">
            Sleep, HRV and body battery are sent by the sync agent on your Mac. Setup steps are in docs/mac-setup.md.
          </p>
          <dl className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-3">
            <div>
              <dt className="text-[0.85rem] text-slate">Last sync</dt>
              <dd className="num mt-1 font-semibold">{formatTime(syncStatus?.last_sync_at)}</dd>
            </div>
            <div>
              <dt className="text-[0.85rem] text-slate">Status</dt>
              <dd className="mt-1 font-semibold capitalize">{syncStatus?.last_status ?? "—"}</dd>
            </div>
          </dl>
        </Panel>
      </div>
    </div>
  );
}
