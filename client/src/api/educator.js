import client from './client';

export const educatorProfile = () => client.get('/educator/profile').then((r) => r.data);
export const updateEducatorProfile = (payload) => client.patch('/educator/profile', payload).then((r) => r.data);
export const educatorOverview = () => client.get('/educator/overview').then((r) => r.data);
export const educatorStudents = () => client.get('/educator/students').then((r) => r.data);
export const educatorStudentDetail = (id) => client.get(`/educator/students/${id}`).then((r) => r.data);
export const educatorClassSummary = () => client.get('/educator/class-summary').then((r) => r.data);
export const sendStudentNote = (payload) => client.post('/educator/notes', payload).then((r) => r.data);
