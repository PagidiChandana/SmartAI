import client from './client';

export const healthCheck = () => client.get('/health').then((r) => r.data);
export const register = (payload) => client.post('/auth/register', payload).then((r) => r.data);
export const login = (payload) => client.post('/auth/login', payload).then((r) => r.data);
export const logoutApi = () => client.post('/auth/logout').then((r) => r.data);
export const fetchMe = () => client.get('/auth/me').then((r) => r.data);
export const updateMe = (payload) => client.patch('/auth/me', payload).then((r) => r.data);
export const changePassword = (payload) => client.patch('/auth/me/password', payload).then((r) => r.data);
export const forgotPassword = (payload) => client.post('/auth/forgot-password', payload).then((r) => r.data);
export const resetPassword = (payload) => client.post('/auth/reset-password', payload).then((r) => r.data);

// Admin
export const listUsers = (params) => client.get('/auth/users', { params }).then((r) => r.data);
export const fetchUserById = (id) => client.get(`/auth/users/${id}`).then((r) => r.data);
export const updateUserRole = (id, role) => client.patch(`/auth/users/${id}/role`, { role }).then((r) => r.data);
export const deleteUser = (id) => client.delete(`/auth/users/${id}`).then((r) => r.data);
