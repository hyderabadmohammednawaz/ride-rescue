'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

interface Turn {
  from: 'user' | 'bot';
  text: string;
  suggestions?: string[];
}

const OPENING: Turn = {
  from: 'bot',
  text: "Hi! I'm the RideRescue assistant. Ask me about your booking, service prices, nearby mechanics or what your bike needs next.",
  suggestions: ['What is my booking status?', 'How much is a general service?', 'Find a mechanic near me', 'What maintenance is due?'],
};

export function Chatbot() {
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([OPENING]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, open]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setInput('');
    setTurns((t) => [...t, { from: 'user', text: message }]);
    setBusy(true);
    try {
      const answer = await api<{ reply: string; suggestions?: string[] }>('/assistant/ask', {
        method: 'POST',
        body: { message },
      });
      setTurns((t) => [...t, { from: 'bot', text: answer.reply, suggestions: answer.suggestions }]);
    } catch (err: any) {
      setTurns((t) => [...t, { from: 'bot', text: err.message || 'Something went wrong. Try again.' }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-2xl text-white shadow-lg transition hover:scale-105 hover:bg-brand-700 no-print"
        aria-label="Open AI assistant"
      >
        {open ? '✕' : '🤖'}
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-40 flex h-[520px] w-[min(380px,calc(100vw-3rem))] animate-slideUp flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 no-print">
          <div className="flex items-center gap-3 border-b border-slate-100 bg-brand-600 px-4 py-3 text-white dark:border-slate-800">
            <span className="text-xl">🤖</span>
            <div>
              <p className="text-sm font-semibold">RideRescue Assistant</p>
              <p className="text-[11px] text-brand-100">Answers from your live account data</p>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {turns.map((turn, i) => (
              <div key={i}>
                <div
                  className={`max-w-[88%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm ${
                    turn.from === 'user'
                      ? 'ml-auto bg-brand-600 text-white'
                      : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100'
                  }`}
                >
                  {turn.text.replace(/\*\*/g, '')}
                </div>
                {turn.suggestions && i === turns.length - 1 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {turn.suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 transition hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="w-16 rounded-2xl bg-slate-100 px-3.5 py-2.5 text-sm dark:bg-slate-800">•••</div>}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex gap-2 border-t border-slate-100 p-3 dark:border-slate-800"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask something…"
              className="input"
            />
            <button type="submit" disabled={busy || !input.trim()} className="btn-primary px-3">
              ➤
            </button>
          </form>
        </div>
      )}
    </>
  );
}
