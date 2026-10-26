"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Send, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { api, type CoachMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "jarvis_coach_chat";

const SUGGESTIONS = [
  "How did my training go this week?",
  "Am I recovered enough for a hard session today?",
  "How has my running pace changed over the last month?",
  "What should my next 7 days look like?",
];

function loadHistory(): CoachMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CoachMessage[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(messages: CoachMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)));
  } catch {
    // Private mode / storage full — the chat still works for this visit.
  }
}

export default function CoachPage() {
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // localStorage only exists in the browser, so restore after mount to keep hydration stable.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages(loadHistory());
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const chatMutation = useMutation({
    mutationFn: (history: CoachMessage[]) => api.coachChat(history),
    onSuccess: (res, history) => {
      const next = [...history, { role: "assistant" as const, content: res.reply }];
      setMessages(next);
      saveHistory(next);
    },
  });

  const send = (text: string) => {
    const msg = text.trim();
    if (!msg || chatMutation.isPending) return;
    setInput("");
    const next = [...messages, { role: "user" as const, content: msg }];
    setMessages(next);
    saveHistory(next);
    chatMutation.mutate(next);
  };

  const clear = () => {
    setMessages([]);
    saveHistory([]);
    chatMutation.reset();
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="hud-title text-xl">Coach</h1>
        {messages.length > 0 ? (
          <button onClick={clear} className="hud-btn">
            <Trash2 className="h-4 w-4" />
            New chat
          </button>
        ) : null}
      </div>

      <Card className="flex h-[calc(100vh-11rem)] min-h-[420px] flex-col">
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto pr-2">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <p className="hud-title text-sm">Ask your coach</p>
              <p className="mt-3 max-w-md font-mono text-xs text-[var(--muted)]">
                Answers use your Strava activities and Garmin sleep, HRV and body battery.
              </p>
              <div className="mt-6 flex max-w-xl flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="border border-[rgba(0,212,255,0.25)] px-3 py-2 text-left font-mono text-xs text-[#a8d4e8] transition-colors hover:border-[rgba(0,212,255,0.55)] hover:text-[var(--accent)]"
                  >
                    {s}
                  </button>
                ))}
              </div>
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
              Coach is thinking…
            </div>
          )}
          {chatMutation.isError && (
            <div className="border border-[rgba(255,77,109,0.4)] px-4 py-3 font-mono text-xs text-[var(--danger)]">
              {chatMutation.error instanceof Error
                ? chatMutation.error.message.slice(0, 200)
                : "Coach unavailable"}
            </div>
          )}
        </div>

        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your training, recovery, race plan…"
            className="hud-input flex-1"
          />
          <button type="submit" disabled={chatMutation.isPending} className="hud-btn hud-btn-solid px-4">
            <Send className="h-4 w-4" />
          </button>
        </form>
      </Card>
    </div>
  );
}
