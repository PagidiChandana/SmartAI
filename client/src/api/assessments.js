import client from './client';

export const createAssessment = (payload) => client.post('/assessments', payload).then((r) => r.data);
export const listOwned = () => client.get('/assessments/mine').then((r) => r.data);
export const patchAssessment = (id, payload) => client.patch(`/assessments/${id}`, payload).then((r) => r.data);
export const setAssessmentStatus = (id, status) => client.post(`/assessments/${id}/status`, { status }).then((r) => r.data);
export const setAssignees = (id, emails) => client.post(`/assessments/${id}/assignees`, { emails }).then((r) => r.data);
export const addAssignee = (id, email) => client.post(`/assessments/${id}/assignees/add`, { email }).then((r) => r.data);
export const releaseResults = (id, released) => client.post(`/assessments/${id}/release`, { released }).then((r) => r.data);

export const addQuestion = (id, payload) => client.post(`/assessments/${id}/questions`, payload).then((r) => r.data);
export const patchQuestion = (id, qid, payload) => client.patch(`/assessments/${id}/questions/${qid}`, payload).then((r) => r.data);
export const deleteQuestion = (id, qid) => client.delete(`/assessments/${id}/questions/${qid}`).then((r) => r.data);
export const reviewQuestion = (id, qid, payload) => client.post(`/assessments/${id}/questions/${qid}/review`, payload).then((r) => r.data);
export const draftQuestions = (id, payload) => client.post(`/assessments/${id}/draft`, payload).then((r) => r.data);

export const gradingQueue = (id) => client.get(`/assessments/${id}/grading`).then((r) => r.data);
export const ownerQuestions = (id) => client.get(`/assessments/${id}/questions`).then((r) => r.data);
export const gradeShort = (attemptId, qid, payload) => client.patch(`/assessments/attempts/${attemptId}/grade/${qid}`, payload).then((r) => r.data);
export const assessmentAnalytics = (id) => client.get(`/assessments/${id}/analytics`).then((r) => r.data);

export const listAvailable = () => client.get('/assessments/available').then((r) => r.data);
export const startAttempt = (id) => client.post(`/assessments/${id}/start`).then((r) => r.data);
export const autosaveAttempt = (attemptId, answers) => client.patch(`/assessments/attempts/${attemptId}/autosave`, { answers }).then((r) => r.data);
export const submitAttempt = (attemptId, answers) => client.post(`/assessments/attempts/${attemptId}/submit`, { answers }).then((r) => r.data);
export const attemptResult = (attemptId) => client.get(`/assessments/attempts/${attemptId}`).then((r) => r.data);
export const attemptHistory = (id) => client.get(`/assessments/${id}/history`).then((r) => r.data);
export const myPerformance = () => client.get('/assessments/my/performance').then((r) => r.data);
