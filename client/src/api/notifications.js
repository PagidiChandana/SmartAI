import client from './client';

export const inbox = () => client.get('/notifications').then((r) => r.data);
export const markRead = (id) => client.patch(`/notifications/${id}/read`).then((r) => r.data);
export const markAllRead = () => client.post('/notifications/read-all').then((r) => r.data);
export const reportResource = (payload) => client.post('/notifications/reports', payload).then((r) => r.data);
export const publicTaxonomy = () => client.get('/meta/taxonomy').then((r) => r.data);
