import { Notification } from '../models/Notification.js';
import { emitToUser } from '../realtime/hub.js';

/**
 * Persists a notification and pushes it live over Socket.IO.
 * In production the same call would also hand off to Firebase Cloud Messaging;
 * the socket delivery keeps the demo working without any Firebase project.
 */
export async function notify(userId, { title, body, type = 'system', link, meta }) {
  if (!userId) return null;
  const notification = await Notification.create({ user: userId, title, body, type, link, meta });
  emitToUser(userId, 'notification', notification.toObject());
  return notification;
}

export async function notifyMany(userIds, payload) {
  return Promise.all([...new Set(userIds.filter(Boolean).map(String))].map((id) => notify(id, payload)));
}
