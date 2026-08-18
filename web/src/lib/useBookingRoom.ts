'use client';

import { useEffect } from 'react';
import { useSocket } from './socket';

/**
 * Joins a booking's socket room for as long as the component is mounted.
 *
 * `booking:location` and `chat:message` are broadcast to that room, so a page
 * that listens without joining receives nothing at all. This used to happen as a
 * side effect of rendering the chat component, which meant live tracking
 * silently stopped whenever chat was not on screen — before a mechanic was
 * assigned, and again once the job was completed. Joining is the page's own
 * concern, so it lives here rather than inside a UI component.
 *
 * Joining twice is harmless: Socket.IO rooms are a set.
 */
export function useBookingRoom(bookingId?: string) {
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket || !bookingId) return;
    socket.emit('booking:join', bookingId, () => {});
    return () => {
      socket.emit('booking:leave', bookingId);
    };
  }, [socket, bookingId]);
}
