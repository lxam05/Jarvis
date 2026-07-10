"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Send, Check, BookmarkPlus } from "lucide-react";
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
                <p className="text-lg font-medium text-zinc-300">Log your food naturally</p>
                <p className="mt-2 max-w-sm text-sm text-zinc-500">
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
                  "max-w-[85%] rounded-2xl px-4 py-3 text-sm",
                  m.role === "user"
                    ? "ml-auto bg-emerald-500/20 text-emerald-100"
                    : "bg-zinc-900 text-zinc-300"
                )}
              >
                <div className="whitespace-pre-wrap">{m.content}</div>
              </motion.div>
            ))}
            {chatMutation.isPending && (
              <div className="text-sm text-zinc-500">Thinking...</div>
            )}
          </div>

          {pendingDraft && (
            <div className="my-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
              <p className="text-sm font-medium text-emerald-400">Confirm this meal?</p>
              <p className="mt-1 text-xs text-zinc-400">
                {pendingDraft.parsed.total_calories} kcal · P {pendingDraft.parsed.total_protein_g}g ·
                Confidence {(pendingDraft.parsed.confidence * 100).toFixed(0)}%
              </p>
              <label className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={saveTemplate}
                  onChange={(e) => setSaveTemplate(e.target.checked)}
                  className="rounded"
                />
                Save as meal memory
              </label>
              <button
                onClick={() => confirmMutation.mutate()}
                disabled={confirmMutation.isPending}
                className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
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
              className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/50 focus:outline-none"
            />
            <button
              onClick={send}
              disabled={chatMutation.isPending}
              className="rounded-xl bg-emerald-500 px-4 py-3 text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </Card>
      </div>

      <div>
        <Card title="Today's Log">
          {meals.length === 0 ? (
            <p className="text-sm text-zinc-500">No meals logged today</p>
          ) : (
            <ul className="space-y-4">
              {meals.map((meal: Meal) => (
                <li key={meal.id} className="border-b border-zinc-800/60 pb-3 last:border-0">
                  <p className="text-sm text-zinc-300 line-clamp-2">{meal.raw_input}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {meal.calories} kcal · P {meal.protein_g}g
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
