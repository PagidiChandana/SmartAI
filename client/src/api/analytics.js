import client from './client';

export const analyticsOverview = () => client.get('/analytics/overview').then((r) => r.data);
export const studyTime = (days = 14) => client.get('/analytics/time', { params: { days } }).then((r) => r.data);
export const taskStats = () => client.get('/analytics/tasks').then((r) => r.data);
export const syllabusProgress = () => client.get('/analytics/syllabus').then((r) => r.data);
export const scoreTrend = (limit = 30) => client.get('/analytics/scores', { params: { limit } }).then((r) => r.data);
export const topicMastery = () => client.get('/analytics/topics').then((r) => r.data);
export const adaptiveRecs = () => client.get('/analytics/recommendations').then((r) => r.data);
export const applyBoost = (payload) => client.post('/analytics/boost', payload).then((r) => r.data);
export const aiInsights = () => client.get('/analytics/insights').then((r) => r.data);
