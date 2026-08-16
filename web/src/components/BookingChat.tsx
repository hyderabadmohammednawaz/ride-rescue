'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useSocket, useSocketEvent } from '@/lib/socket';
import { useAuth } from '@/lib/auth';
import type { ChatMessage } from '@/lib/types';

export function BookingChat({ bookingId, otherPartyName }: { bookingId: string; otherPartyName?: string }) {
  const { socket } = useSocket();
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ messages: ChatMessage[] }>(`/bookings/${bookingId}/messages`)
      .then((d) => setMessages(d.messages))
      .catch(() => {});
  }, [bookingId]);

  useEffect(() => {
    if (!socket) return;
    socket.emit('booking:join', bookingId, () => {});
    return () => {
      socket.emit('booking:leave', bookingId);
    };
  }, [socket, bookingId]);

  useSocketEvent<ChatMessage>('chat:message', (msg) => {
    if (msg.booking !== bookingId) return;
    setMessages((current) => (current.some((m) => m._id === msg._id) ? current : [...current, msg]));
    setTyping(false);
  });

  useSocketEvent<{ userId: string; isTyping: boolean }>('typing', (payload) => {
    if (payload.userId !== user?._id) setTyping(payload.isTyping);
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || !socket) return;
    socket.emit('chat:send', { bookingId, text: body }, () => {});
    setText('');
  };

  const isMine = (m: ChatMessage) => String(m.sender?._id || m.sender) === String(user?._id);

  return (
    <div className="card flex h-[420px] flex-col p-0">
      <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <h3 className="font-bold">💬 Chat{otherPartyName ? ` with ${otherPartyName}` : ''}</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">Messages are delivered instantly over the live connection</p>
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            No messages yet. Say hello or share a landmark to help them find you.
          </p>
        )}
        {messages.map((m) => (
          <div key={m._id} className={`flex ${isMine(m) ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                isMine(m) ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100'
              }`}
            >
              {m.text}
              <div className={`mt-0.5 text-[10px] ${isMine(m) ? 'text-brand-100' : 'text-slate-400'}`}>
                {new Date(m.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
        {typing && <p className="text-xs italic text-slate-500 dark:text-slate-400">typing…</p>}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="flex gap-2 border-t border-slate-100 p-3 dark:border-slate-800">
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            socket?.emit('typing', { bookingId, isTyping: e.target.value.length > 0 });
          }}
          placeholder="Type a message…"
          className="input"
        />
        <button type="submit" disabled={!text.trim()} className="btn-primary px-4">
          Send
        </button>
      </form>
    </div>
  );
}
