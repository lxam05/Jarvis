"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowUp } from "lucide-react";
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
  const endRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  const chatMutation = useMutation({
    mutationFn: (history: CoachMessage[]) => api.coachChat(history),
    onSuccess: (res, history) => {
      const next = [...history, { role: "assistant" as const, content: res.reply }];
      setMessages(next);
      saveHistory(next);
    },
  });

  const send = (text: string, history: CoachMessage[] = messages) => {
    const msg = text.trim();
    if (!msg || chatMutation.isPending) return;
    setInput("");
    const next = [...history, { role: "user" as const, content: msg }];
    setMessages(next);
    saveHistory(next);
    chatMutation.mutate(next);
  };

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    // localStorage only exists in the browser, so restore after mount to keep hydration stable.
    const history = loadHistory();
    setMessages(history);
    // A question typed on the Today page arrives as ?q=.
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) {
      window.history.replaceState(null, "", window.location.pathname);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      send(q, history);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, chatMutation.isPending]);

  const clear = () => {
    setMessages([]);
    saveHistory([]);
    chatMutation.reset();
  };

  const empty = messages.length === 0;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-[760px] flex-col">
      <div className="flex items-end justify-between gap-4">
        <h1 className="display text-[clamp(2.6rem,6vw,4rem)]">Coach</h1>
        {!empty ? (
          <button onClick={clear} className="btn btn-quiet">
            New conversation
          </button>
        ) : null}
      </div>

      <div className="flex-1 pb-6 pt-8">
        {empty ? (
          <div>
            <p className="max-w-[52ch] text-[1.1rem] leading-relaxed text-slate">
              Ask anything about your training. Answers draw on your Strava activities and your Garmin sleep, HRV
              and body battery.
            </p>
            <ul className="mt-8 grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button
                    onClick={() => send(s)}
                    className="h-full w-full rounded-[18px] bg-haze px-5 py-4 text-left transition-colors hover:bg-haze-strong"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ol className="space-y-6">
            {messages.map((m, i) => (
              <li key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                {m.role === "user" ? (
                  <p className="max-w-[80%] whitespace-pre-wrap rounded-[22px] rounded-br-md bg-ink px-5 py-3 text-paper">
                    {m.content}
                  </p>
                ) : (
                  <div className="max-w-[62ch]">
                    <p className="mb-1.5 text-[0.82rem] font-medium text-slate">Coach</p>
                    <p className="whitespace-pre-wrap text-[1.02rem] leading-relaxed">{m.content}</p>
                  </div>
                )}
              </li>
            ))}
            {chatMutation.isPending ? (
              <li aria-live="polite">
                <p className="mb-1.5 text-[0.82rem] font-medium text-slate">Coach</p>
                <div className="flex gap-1.5" aria-label="Coach is writing">
                  <span className="skeleton h-2.5 w-2.5 rounded-full" />
                  <span className="skeleton h-2.5 w-2.5 rounded-full" />
                  <span className="skeleton h-2.5 w-2.5 rounded-full" />
                </div>
              </li>
            ) : null}
            {chatMutation.isError ? (
              <li role="alert" className="rounded-[16px] border border-danger/30 px-5 py-3 text-[0.92rem] text-danger">
                {chatMutation.error instanceof Error
                  ? chatMutation.error.message.slice(0, 200)
                  : "The coach didn't respond. Send your question again."}
              </li>
            ) : null}
          </ol>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="sticky bottom-24 flex md:bottom-4 items-center gap-2 rounded-full border border-line bg-paper py-1.5 pl-5 pr-1.5 shadow-[0_10px_30px_rgba(14,34,54,0.08)] focus-within:border-ink"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <label htmlFor="coach-input" className="sr-only">
          Message your coach
        </label>
        <input
          id="coach-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about training, recovery or your race plan…"
          className="min-w-0 flex-1 bg-transparent py-2 outline-none placeholder:text-[#8fa1b0]"
        />
        <button
          type="submit"
          disabled={chatMutation.isPending || !input.trim()}
          className="btn btn-primary btn-icon"
          aria-label="Send"
        >
          <ArrowUp className="h-[18px] w-[18px]" />
        </button>
      </form>
    </div>
  );
}
