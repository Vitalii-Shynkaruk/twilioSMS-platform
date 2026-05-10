import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('scl_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

function addRefreshSubscriber(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const url = originalRequest?.url || 'unknown';

    if (
      error.response?.status === 401 &&
      !url.includes('/auth/login') &&
      !url.includes('/auth/tester-login') &&
      !url.includes('/auth/request-otp') &&
      !url.includes('/auth/verify-otp') &&
      !url.includes('/auth/dev-login') &&
      !url.includes('/auth/refresh') &&
      !originalRequest._retry
    ) {
      const refreshToken = localStorage.getItem('scl_refresh_token');

      if (refreshToken) {
        if (isRefreshing) {
          return new Promise((resolve) => {
            addRefreshSubscriber((newToken: string) => {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              resolve(api(originalRequest));
            });
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const { data } = await axios.post('/api/auth/refresh', { refreshToken });
          localStorage.setItem('scl_token', data.token);
          localStorage.setItem('scl_refresh_token', data.refreshToken);
          api.defaults.headers.common.Authorization = `Bearer ${data.token}`;
          onRefreshed(data.token);
          originalRequest.headers.Authorization = `Bearer ${data.token}`;
          return api(originalRequest);
        } catch {
          localStorage.removeItem('scl_token');
          localStorage.removeItem('scl_refresh_token');
          localStorage.removeItem('scl_user');
          window.location.href = '/login';
          return Promise.reject(error);
        } finally {
          isRefreshing = false;
        }
      }

      localStorage.removeItem('scl_token');
      localStorage.removeItem('scl_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export default api;


export const dealApi = {
  getBoard: (params?: Record<string, string>) => api.get('/deals/board', { params }),
  getDeals: (params?: Record<string, string>) => api.get('/deals', { params }),
  getDeal: (id: string) => api.get(`/deals/${id}`),
  getStats: (params?: Record<string, string>) => api.get('/deals/stats', { params }),
  getOutboundGate: () => api.get('/deals/outbound-gate'),
  getReviveQueue: (params?: Record<string, string>) => api.get('/deals/revive-queue', { params }),
  createDeal: (data: any) => api.post('/deals', data),
  updateDeal: (id: string, data: any) => api.put(`/deals/${id}`, data),
  moveDeal: (id: string, data: any) => api.put(`/deals/${id}/move`, data),
  addOffer: (id: string, data: any) => api.post(`/deals/${id}/offers`, data),
  deleteOffer: (dealId: string, offerId: string) => api.delete(`/deals/${dealId}/offers/${offerId}`),
  markFunded: (id: string, data: any) => api.post(`/deals/${id}/fund`, data),
  completeAction: (id: string, data: any) => api.post(`/deals/${id}/complete-action`, data),
  shareDeal: (id: string, data: any) => api.put(`/deals/${id}/share`, data),
  logAttempt: (id: string, data: { kind: string; note?: string }) => api.post(`/deals/${id}/log-attempt`, data),
  logCall: (id: string, data: any) => api.post(`/deals/${id}/call-log`, data),
  getSms: (id: string) => api.get(`/deals/${id}/sms`),
  sendSms: (id: string, body: string) => api.post(`/deals/${id}/sms/send`, { body }),
  importCSV: (file: File, assignToRepId?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (assignToRepId) form.append('assignToRepId', assignToRepId);
    return api.post('/deals/import-csv', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  importLeads: (file: File, options?: { assignToRepId?: string; duplicateMode?: 'skip' | 'add_to_existing' }) => {
    const form = new FormData();
    form.append('file', file);
    if (options?.assignToRepId) form.append('assignToRepId', options.assignToRepId);
    if (options?.duplicateMode) form.append('duplicateMode', options.duplicateMode);
    return api.post('/deals/import-leads', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  getImportBatches: () => api.get('/deals/import-batches'),
  deleteImportBatch: (batchId: string) => api.delete(`/deals/import-batch/${encodeURIComponent(batchId)}`),
  deleteDeal: (id: string) => api.delete(`/deals/${id}`),
  completeRenewalTask: (taskId: string, data?: { note?: string }) =>
    api.put(`/deals/renewal-tasks/${taskId}/complete`, data || {}),
};

export const aiApi = {
  previewPipeline: (data: { inputType: 'rep_note' | 'client_sms'; text: string }) =>
    api.post('/ai/preview-pipeline', data),
  extractPipeline: (data: { dealId: string; inputType: 'rep_note' | 'client_sms'; text: string }) =>
    api.post('/ai/extract-pipeline', data),
};

export const commandCenterApi = {
  getMetrics: (params?: Record<string, string>) => api.get('/command-center/metrics', { params }),
  getOperatorQueue: (params?: Record<string, string>) => api.get('/command-center/operator-queue', { params }),
  getHotLeads: (params?: Record<string, string>) => api.get('/command-center/hot-leads', { params }),
  getStaleDeals: (params?: Record<string, string>) => api.get('/command-center/stale-deals', { params }),
  getOverdueTasks: (params?: Record<string, string>) => api.get('/command-center/overdue-tasks', { params }),
  getIntelligence: () => api.get('/command-center/intelligence'),
  getExecutionScores: () => api.get('/command-center/execution-scores'),
  getProductMix: (params?: Record<string, string>) => api.get('/command-center/product-mix', { params }),
  getActivityFeed: (params?: Record<string, string>) => api.get('/command-center/activity-feed', { params }),
  getSmsMetrics: () => api.get('/command-center/sms-metrics'),
};

export const repApi = {
  getReps: (params?: Record<string, string>) => api.get('/reps', { params }),
  getRep: (id: string) => api.get(`/reps/${id}`),
  getTeamGoals: () => api.get('/reps/team-goals'),
  createRep: (data: any) => api.post('/reps', data),
  updateRep: (id: string, data: any) => api.put(`/reps/${id}`, data),
  updateGoals: (id: string, data: any) => api.put(`/reps/${id}/goals`, data),
  updateTeamGoals: (data: any) => api.put('/reps/team-goals', data),
};

export const importApi = {
  importCsv: (data: any) => api.post('/import/csv', data),
  getBatches: () => api.get('/import/batches'),
  rollbackBatch: (batchId: string) => api.delete(`/import/batches/${batchId}`),
};


export const inboxApi = {
  listConversations: (params?: Record<string, string>) => api.get('/inbox', { params }),
  getConversation: (id: string, params?: Record<string, string>) => api.get(`/inbox/${id}`, { params }),
  getOrCreateByLead: (leadId: string) => api.get(`/inbox/by-lead/${leadId}`),
  markRead: (id: string) => api.post(`/inbox/${id}/read`),
  markUnread: (id: string) => api.post(`/inbox/${id}/unread`),
  sendReply: (id: string, body: string) => api.post(`/inbox/${id}/reply`, { body }),
  assignRep: (id: string, repId: string) => api.put(`/inbox/${id}/assign`, { repId }),

  updateStatus: (
    id: string,
    data: {
      hotLead?: boolean;
      leadStatus?: string;
      emailReceived?: boolean;
      nextFollowupAt?: string | null;
      followupTime?: string | null;
      followupReason?: string | null;
      followupStatus?: 'scheduled' | 'due_now' | 'completed' | 'cleared';
    },
  ) => api.patch(`/inbox/${id}/status`, data),

  listNotes: (id: string) => api.get(`/inbox/${id}/notes`),
  createNote: (id: string, body: string, dealId?: string) => api.post(`/inbox/${id}/notes`, { body, dealId }),
  deleteNote: (id: string, noteId: string) => api.delete(`/inbox/${id}/notes/${noteId}`),
  createClassificationFeedback: (
    id: string,
    payload: { action: 'skip' | 'use' | 'override'; suggestionText?: string; reason?: string },
  ) => api.post(`/inbox/${id}/classification-feedback`, payload),

  listTemplates: (params?: Record<string, string>) => api.get('/inbox/templates/list', { params }),
  createTemplate: (data: { name: string; body: string; category?: string; visibility?: string }) =>
    api.post('/inbox/templates', data),
  updateTemplate: (id: string, data: any) => api.put(`/inbox/templates/${id}`, data),
  deleteTemplate: (id: string) => api.delete(`/inbox/templates/${id}`),
  toggleFavorite: (id: string) => api.post(`/inbox/templates/${id}/favorite`),
  logTemplateUsage: (id: string, conversationId?: string) => api.post(`/inbox/templates/${id}/use`, { conversationId }),

  listScheduled: (id: string) => api.get(`/inbox/${id}/scheduled`),
  createScheduled: (data: { conversationId: string; body: string; scheduledAt: string }) =>
    api.post('/inbox/scheduled', data),
  cancelScheduled: (scheduledId: string) => api.delete(`/inbox/scheduled/${scheduledId}`),

  addToPipeline: (id: string, stageId?: string, dealStage?: string) =>
    api.post(`/inbox/${id}/add-to-pipeline`, { stageId, dealStage }),
};
