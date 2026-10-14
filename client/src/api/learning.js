import client from './client';

export const getProfile = () => client.get('/learning/profile').then((r) => r.data);
export const saveProfile = (payload) => client.put('/learning/profile', payload).then((r) => r.data);

export const listSubjects = () => client.get('/learning/subjects').then((r) => r.data);
export const createSubject = (payload) => client.post('/learning/subjects', payload).then((r) => r.data);
export const deleteSubject = (id) => client.delete(`/learning/subjects/${id}`).then((r) => r.data);

export const listTopics = (params) => client.get('/learning/topics', { params }).then((r) => r.data);
export const createTopic = (payload) => client.post('/learning/topics', payload).then((r) => r.data);
export const bulkTopics = (payload) => client.post('/learning/topics/bulk', payload).then((r) => r.data);
export const patchTopic = (id, payload) => client.patch(`/learning/topics/${id}`, payload).then((r) => r.data);
export const deleteTopic = (id) => client.delete(`/learning/topics/${id}`).then((r) => r.data);

export const uploadSyllabus = (formData) =>
  client.post('/learning/uploads', formData, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);

export const listGoals = () => client.get('/learning/goals').then((r) => r.data);
export const createGoal = (payload) => client.post('/learning/goals', payload).then((r) => r.data);
export const deleteGoal = (id) => client.delete(`/learning/goals/${id}`).then((r) => r.data);

export const startDiagnostic = (payload) => client.post('/learning/diagnostics/start', payload).then((r) => r.data);
export const submitDiagnostic = (id, answers) =>
  client.post(`/learning/diagnostics/${id}/submit`, { answers }).then((r) => r.data);
export const listDiagnostics = () => client.get('/learning/diagnostics').then((r) => r.data);

export const getChecklist = () => client.get('/learning/checklist').then((r) => r.data);

export const ACADEMIC_LEVELS = ['school', 'higher-secondary', 'undergraduate', 'postgraduate', 'other'];
export const LEARNING_STYLES = ['visual', 'auditory', 'reading', 'kinesthetic', 'mixed'];
export const EXAM_TYPES = ['college', 'gate', 'cat', 'upsc', 'competitive', 'other'];
