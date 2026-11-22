import mongoose from 'mongoose';
import { Notification } from '../models/Notification.js';
import { notificationView } from '../services/notifications.js';
import { ApiError } from '../utils/ApiError.js';

// GET /api/notifications?filter=all|unread&page&limit — FR-39
export async function list(req, res) {
  const { filter, page, limit } = req.query;
  const userId = new mongoose.Types.ObjectId(req.user.id);
  const q = { userId, ...(filter === 'unread' ? { isRead: false } : {}) };
  const [items, total, unreadCount] = await Promise.all([
    Notification.find(q).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Notification.countDocuments(q),
    Notification.countDocuments({ userId, isRead: false }),
  ]);
  res.json({ items: items.map(notificationView), total, unreadCount, page, pages: Math.max(1, Math.ceil(total / limit)) });
}

// PATCH /api/notifications/:id/read
export async function markRead(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) throw ApiError.notFound('Notification not found');
  const n = await Notification.findOneAndUpdate({ _id: req.params.id, userId: req.user.id }, { isRead: true, readAt: new Date() }, { new: true });
  if (!n) throw ApiError.notFound('Notification not found');
  res.json({ notification: notificationView(n), unreadCount: await Notification.countDocuments({ userId: req.user.id, isRead: false }) });
}

// PATCH /api/notifications/read-all
export async function markAllRead(req, res) {
  const { modifiedCount } = await Notification.updateMany({ userId: req.user.id, isRead: false }, { isRead: true, readAt: new Date() });
  res.json({ updated: modifiedCount, unreadCount: 0 });
}
