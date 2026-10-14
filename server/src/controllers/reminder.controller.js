import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ApiError } from '../utils/ApiError.js';
import * as reminders from '../services/reminder.service.js';

export const listReminders = asyncHandler(async (req, res) => {
  new ApiResponse('Reminders fetched', await reminders.listReminders(req.user, req.query)).send(res);
});

export const createReminder = asyncHandler(async (req, res) => {
  new ApiResponse('Reminder scheduled', await reminders.createReminder(req.user, req.body), 201).send(res);
});

export const patchReminder = asyncHandler(async (req, res) => {
  new ApiResponse('Reminder updated', await reminders.patchReminder(req.user, req.params.id, req.body)).send(res);
});

export const setReminderStatus = asyncHandler(async (req, res) => {
  new ApiResponse(`Reminder ${req.body.status}`, await reminders.setReminderStatus(req.user, req.params.id, req.body.status)).send(res);
});

export const deleteReminder = asyncHandler(async (req, res) => {
  new ApiResponse('Reminder deleted', await reminders.deleteReminder(req.user, req.params.id)).send(res);
});

export const getPrefs = asyncHandler(async (req, res) => {
  new ApiResponse('Reminder preferences ready', await reminders.getPrefs(req.user)).send(res);
});

export const setPrefs = asyncHandler(async (req, res) => {
  new ApiResponse('Preferences saved', await reminders.setPrefs(req.user, req.body)).send(res);
});

export const pushSubscribe = asyncHandler(async (req, res) => {
  // Honest stub: Web Push needs VAPID keys + service worker + provider.
  // Nothing is stored or faked; live delivery is NOT VERIFIED.
  const status = reminders.pushStatus();
  throw new ApiError(501, `Push not configured. ${status.message}`);
});
