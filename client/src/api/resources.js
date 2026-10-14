import client from './client';

export const submitResource = (formData) =>
  client.post('/resources', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
export const listMine = () => client.get('/resources/mine').then((r) => r.data);
export const patchResource = (id, payload) => client.patch(`/resources/${id}`, payload).then((r) => r.data);
export const archiveResource = (id) => client.post(`/resources/${id}/archive`).then((r) => r.data);
export const unarchiveResource = (id) => client.post(`/resources/${id}/unarchive`).then((r) => r.data);
export const deleteResource = (id) => client.delete(`/resources/${id}`).then((r) => r.data);

export const reviewQueue = () => client.get('/resources/review/queue').then((r) => r.data);
export const approveResource = (id, note) => client.post(`/resources/${id}/approve`, { note }).then((r) => r.data);
export const rejectResource = (id, note) => client.post(`/resources/${id}/reject`, { note }).then((r) => r.data);

export const listLibrary = (params) => client.get('/resources', { params }).then((r) => r.data);
export const getResource = (id) => client.get(`/resources/${id}`).then((r) => r.data);
export const resourceFileUrl = (id) =>
  `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/resources/${id}/file`;

export const toggleBookmark = (id) => client.post(`/resources/${id}/bookmark`).then((r) => r.data);
export const listBookmarks = () => client.get('/resources/bookmarks').then((r) => r.data);
export const setCompleted = (id, completed) => client.patch(`/resources/${id}/completed`, { completed }).then((r) => r.data);

export const getRecommendations = (limit = 10) =>
  client.get('/resources/recommendations', { params: { limit } }).then((r) => r.data);

export const FORMATS = ['pdf', 'note', 'article', 'video', 'link', 'other'];
export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
export const EXAM_TYPES = ['college', 'gate', 'cat', 'upsc', 'competitive', 'other'];

export const STATUS_STYLE = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  archived: 'bg-slate-200 text-slate-600',
};
