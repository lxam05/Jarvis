"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  CaloriesCard,
  BodyBatteryCard,
  GoalsCard,
  HrvCard,
  InsightsCard,
  MacrosCard,
  RecentActivitiesCard,
  RemainingCard,
  SleepCard,
  StreaksCard,
  SyncBadge,
  TrainingCard,
  WeightCard,
} from "@/components/dashboard/cards";
import { api } from "@/lib/api";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard", "today"],
    queryFn: api.dashboardToday,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-red-400">
        Failed to load dashboard. Is the API running?
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Good evening</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {new Date(data.date).toLocaleDateString("en-GB", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        <SyncBadge lastSync={data.last_garmin_sync} />
      </div>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        <motion.div variants={item}>
          <CaloriesCard data={data.macros} />
        </motion.div>
        <motion.div variants={item}>
          <MacrosCard data={data.macros} />
        </motion.div>
        <motion.div variants={item}>
          <RemainingCard data={data.macros} />
        </motion.div>
        <motion.div variants={item}>
          <WeightCard data={data.weight} />
        </motion.div>

        <motion.div variants={item}>
          <SleepCard data={data.recovery} />
        </motion.div>
        <motion.div variants={item}>
          <HrvCard data={data.recovery} />
        </motion.div>
        <motion.div variants={item}>
          <BodyBatteryCard data={data.recovery} />
        </motion.div>

        <motion.div variants={item} className="xl:col-span-1">
          <TrainingCard data={data.training} />
        </motion.div>
        <motion.div variants={item}>
          <StreaksCard data={data.streaks} />
        </motion.div>
        <motion.div variants={item}>
          <GoalsCard data={data.goals} />
        </motion.div>

        <motion.div variants={item} className="xl:col-span-2">
          <InsightsCard insights={data.insights} />
        </motion.div>
        <motion.div variants={item} className="xl:col-span-2">
          <RecentActivitiesCard activities={data.recent_activities} />
        </motion.div>
      </motion.div>
    </div>
  );
}
