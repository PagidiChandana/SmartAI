import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import { Notification } from '../models/Notification.js';

export const inbox = asyncHandler(async (req, res) => {
  const items = await Notification.find({ user: req.user._id })
    .populate('from', 'name role')
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  const unread = await Notification.countDocuments({ user: req.user._id, read: false });
  new ApiResponse('Inbox ready', { items, unread }).send(res);
});

export const markRead = asyncHandler(async (req, res) => {
  const note = await Notification.findOne({ _id: req.params.id, user: req.user._id });
  if (!note) throw new ApiError(404, 'Notification not found');
  note.read = true;
  await note.save();
  new ApiResponse('Marked as read', { id: note._id }).send(res);
});

export const markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
  new ApiResponse('All marked as read', null).send(res);
});
