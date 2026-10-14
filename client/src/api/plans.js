import client from './client';

export const generatePlan = (payload) => client.post('/plans/generate', payload).then((r) => r.data);
export const regeneratePlan = (id) => client.post(`/plans/${id}/regenerate`).then((r) => r.data);
export const listPlans = () => client.get('/plans').then((r) => r.data);
export const getPlan = (id) => client.get(`/plans/${id}`).then((r) => r.data);
export const getPlanSummary = (id) => client.get(`/plans/${id}/summary`).then((r) => r.data);
export const patchPlan = (id, payload) => client.patch(`/plans/${id}`, payload).then((r) => r.data);
export const listPlanTasks = (id, params) => client.get(`/plans/${id}/tasks`, { params }).then((r) => r.data);
export const patchTask = (taskId, payload) => client.patch(`/plans/tasks/${taskId}`, payload).then((r) => r.data);
export const completeTask = (taskId) => client.post(`/plans/tasks/${taskId}/complete`).then((r) => r.data);
export const skipTask = (taskId) => client.post(`/plans/tasks/${taskId}/skip`).then((r) => r.data);
export const rescheduleTask = (taskId, payload) => client.post(`/plans/tasks/${taskId}/reschedule`, payload).then((r) => r.data);
export const deleteTask = (taskId) => client.delete(`/plans/tasks/${taskId}`).then((r) => r.data);

export const KIND_LABEL = { learn: 'Learn', revision: 'Revision', 'practice-test': 'Practice test', break: 'Break' };
export const STATUS_LABEL = { pending: 'Pending', completed: 'Completed', skipped: 'Skipped' };

export const fmtTime = (startMin) => {
  const h = Math.floor(startMin / 60);
  const m = startMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
