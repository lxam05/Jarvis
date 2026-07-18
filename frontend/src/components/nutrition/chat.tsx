"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Send, Check } from "lucide-react";
import { useState } from "react";
import { api, type ChatResponse, type Meal } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Message = { role: "user" | "assistant"; content: string };

export function NutritionChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string>();
  const [pendingDraft, setPendingDraft] = useState<ChatResponse["meal_draft"]>();
  const [saveTemplate, setSaveTemplate] = useState(false);
  const queryClient = useQueryClient();

  const { data: meals = [] } = useQuery({
    queryKey: ["meals"],
    queryFn: api.mealsToday,
  });

  const { data: dashboard } = useQuery({
    queryKey: ["dashboard", "today"],
    queryFn: api.dashboardToday,
  });

  const chatMutation = useMutation({
    mutationFn: (msg: string) => api.chat(msg, conversationId),
    onSuccess: (res) => {
      setConversationId(res.conversation_id);
      setMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);
      if (res.state === "confirming" && res.meal_draft) {
        setPendingDraft(res.meal_draft);
      } else {
        setPendingDraft(undefined);
      }
    },
  });

  const confirmMutation = useMutation({
    mutationFn: () =>
      api.confirmMeal(pendingDraft!.id, saveTemplate, pendingDraft?.parsed ? "Saved meal" : undefined),
    onSuccess: () => {
      setPendingDraft(undefined);
      setSaveTemplate(false);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Meal saved successfully." },
      ]);
      queryClient.invalidateQueries({ queryKey: ["meals"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const send = () => {
    if (!input.trim()) return;
    const msg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: msg }]);
    chatMutation.mutate(msg);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card className="flex h-[600px] flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto pr-2">
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <p className="hud-title text-sm">Nutrition console</p>
                <p className="mt-3 max-w-sm font-mono text-xs text-[var(--muted)]">
                  Try &quot;I had 6 Weetabix with milk and honey&quot; or &quot;my usual breakfast&quot;
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "max-w-[85%] border px-4 py-3 font-mono text-sm",
                  m.role === "user"
                    ? "ml-auto border-[rgba(0,212,255,0.4)] bg-[rgba(0,212,255,0.12)] text-[#c8f0ff]"
                    : "border-[rgba(0,212,255,0.18)] bg-[rgba(0,30,50,0.5)] text-[#a8d4e8]"
                )}
              >
                <div className="whitespace-pre-wrap">{m.content}</div>
              </motion.div>
            ))}
            {chatMutation.isPending && (
              <div className="font-mono text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
                Processing…
              </div>
            )}
          </div>

          {pendingDraft && (
            <div className="my-4 border border-[rgba(0,212,255,0.35)] bg-[rgba(0,212,255,0.06)] p-4">
              <p className="hud-label text-[var(--accent)]">Confirm this meal?</p>
              <p className="mt-1 font-mono text-xs text-[var(--muted)]">
                {pendingDraft.parsed.total_calories} kcal · P {pendingDraft.parsed.total_protein_g}g ·
                Confidence {(pendingDraft.parsed.confidence * 100).toFixed(0)}%
              </p>
              <label className="mt-3 flex items-center gap-2 font-mono text-xs text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={saveTemplate}
                  onChange={(e) => setSaveTemplate(e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                Save as meal memory
              </label>
              <button
                onClick={() => confirmMutation.mutate()}
                disabled={confirmMutation.isPending}
                className="hud-btn hud-btn-solid mt-3"
              >
                <Check className="h-4 w-4" />
                Confirm meal
              </button>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
              placeholder="Describe what you ate..."
              className="hud-input flex-1"
            />
            <button
              onClick={send}
              disabled={chatMutation.isPending}
              className="hud-btn hud-btn-solid px-4"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card title="Today's Log">
          {meals.length === 0 ? (
            <p className="font-mono text-sm text-[var(--muted)]">No meals logged today</p>
          ) : (
            <ul className="space-y-4">
              {meals.map((meal: Meal) => (
                <li
                  key={meal.id}
                  className="border-b border-[rgba(0,212,255,0.15)] pb-3 last:border-0"
                >
                  <p className="line-clamp-2 font-mono text-sm text-[#c8f0ff]">{meal.raw_input}</p>
                  <p className="mt-1 font-mono text-xs text-[var(--muted)]">
                    {meal.calories} kcal · P {meal.protein_g}g
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Macros">
          <MacroBars
            calories={dashboard?.macros.calories ?? meals.reduce((s, m) => s + m.calories, 0)}
            protein={dashboard?.macros.protein_g ?? meals.reduce((s, m) => s + Number(m.protein_g), 0)}
            carbs={dashboard?.macros.carbs_g ?? meals.reduce((s, m) => s + Number(m.carbs_g), 0)}
            fat={dashboard?.macros.fat_g ?? meals.reduce((s, m) => s + Number(m.fat_g), 0)}
            calorieGoal={dashboard?.macros.calorie_goal ?? null}
            proteinGoal={dashboard?.macros.protein_goal_g ?? null}
          />
        </Card>
      </div>
    </div>
  );
}

function MacroBars({
  calories,
  protein,
  carbs,
  fat,
  calorieGoal,
  proteinGoal,
}: {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  calorieGoal: number | null;
  proteinGoal: number | null;
}) {
  const rows = [
    {
      label: "Calories",
      value: calories,
      goal: calorieGoal,
      unit: "kcal",
      color: "bg-[var(--accent)]",
    },
    {
      label: "Protein",
      value: protein,
      goal: proteinGoal,
      unit: "g",
      color: "bg-emerald-400",
    },
    {
      label: "Carbs",
      value: carbs,
      goal: null,
      unit: "g",
      color: "bg-sky-400",
    },
    {
      label: "Fat",
      value: fat,
      goal: null,
      unit: "g",
      color: "bg-amber-400",
    },
  ];

  return (
    <div className="space-y-4">
      {rows.map((row) => {
        const pct =
          row.goal && row.goal > 0 ? Math.min(100, (row.value / row.goal) * 100) : null;
        return (
          <div key={row.label}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2 font-mono text-xs">
              <span className="text-[var(--muted)]">{row.label}</span>
              <span className="tabular-nums text-[#c8f0ff]">
                {Math.round(row.value).toLocaleString()}
                {row.unit}
                {row.goal != null ? (
                  <span className="text-[var(--muted)]">
                    {" "}
                    / {row.goal.toLocaleString()}
                    {row.unit}
                  </span>
                ) : null}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[rgba(0,212,255,0.12)]">
              <div
                className={cn("h-full rounded-full transition-all", row.color)}
                style={{ width: `${pct ?? Math.min(100, row.value > 0 ? 12 : 0)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
