import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

// Request interceptor - add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('scl_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Track refresh in progress to avoid multiple concurrent refreshes
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

function addRefreshSubscriber(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

// Response interceptor - handle auth errors with token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const url = originalRequest?.url || 'unknown';

    // On 401, try refresh token before logging out
    if (
      error.response?.status === 401 &&
      !url.includes('/auth/login') &&
      !url.includes('/auth/refresh') &&
      !originalRequest._retry
    ) {
      const refreshToken = localStorage.getItem('scl_refresh_token');

      if (refreshToken) {
        if (isRefreshing) {
          // Queue this request until refresh completes
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
          // Refresh failed — clear tokens and redirect
          localStorage.removeItem('scl_token');
          localStorage.removeItem('scl_refresh_token');
          localStorage.removeItem('scl_user');
          window.location.href = '/login';
          return Promise.reject(error);
        } finally {
          isRefreshing = false;
        }
      }

      // No refresh token available
      localStorage.removeItem('scl_token');
      localStorage.removeItem('scl_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export default api;

// ─── Phase 2: Deal API helpers ───

export const dealApi = {
  getBoard: (params?: Record<string, string>) => api.get('/deals/board', { params }),
  getDeals: (params?: Record<string, string>) => api.get('/deals', { params }),
  getDeal: (id: string) => api.get(`/deals/${id}`),
  getStats: (params?: Record<string, string>) => api.get('/deals/stats', { params }),
  getReviveQueue: (params?: Record<string, string>) => api.get('/deals/revive-queue', { params }),
  createDeal: (data: any) => api.post('/deals', data),
  updateDeal: (id: string, data: any) => api.put(`/deals/${id}`, data),
  moveDeal: (id: string, data: any) => api.put(`/deals/${id}/move`, data),
  addOffer: (id: string, data: any) => api.post(`/deals/${id}/offers`, data),
  deleteOffer: (dealId: string, offerId: string) => api.delete(`/deals/${dealId}/offers/${offerId}`),
  markFunded: (id: string, data: any) => api.post(`/deals/${id}/fund`, data),
  completeAction: (id: string, data: any) => api.post(`/deals/${id}/complete-action`, data),
  shareDeal: (id: string, data: any) => api.put(`/deals/${id}/share`, data),
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

// ─── Phase 1: SMS Inbox API helpers ───

export const inboxApi = {
  // Базовые
  listConversations: (params?: Record<string, string>) => api.get('/inbox', { params }),
  getConversation: (id: string, params?: Record<string, string>) => api.get(`/inbox/${id}`, { params }),
  getOrCreateByLead: (leadId: string) => api.get(`/inbox/by-lead/${leadId}`),
  markRead: (id: string) => api.post(`/inbox/${id}/read`),
  sendReply: (id: string, body: string) => api.post(`/inbox/${id}/reply`, { body }),
  assignRep: (id: string, repId: string) => api.put(`/inbox/${id}/assign`, { repId }),

  // Phase 1: Статус разговора
  updateStatus: (
    id: string,
    data: {
      hotLead?: boolean;
      leadStatus?: string;
      emailReceived?: boolean;
      nextFollowupAt?: string | null;
    },
  ) => api.patch(`/inbox/${id}/status`, data),

  // Phase 1: Заметки
  listNotes: (id: string) => api.get(`/inbox/${id}/notes`),
  createNote: (id: string, body: string, dealId?: string) => api.post(`/inbox/${id}/notes`, { body, dealId }),
  deleteNote: (id: string, noteId: string) => api.delete(`/inbox/${id}/notes/${noteId}`),

  // Phase 1: Шаблоны
  listTemplates: (params?: Record<string, string>) => api.get('/inbox/templates/list', { params }),
  createTemplate: (data: { name: string; body: string; category?: string; visibility?: string }) =>
    api.post('/inbox/templates', data),
  updateTemplate: (id: string, data: any) => api.put(`/inbox/templates/${id}`, data),
  deleteTemplate: (id: string) => api.delete(`/inbox/templates/${id}`),
  toggleFavorite: (id: string) => api.post(`/inbox/templates/${id}/favorite`),
  logTemplateUsage: (id: string, conversationId?: string) => api.post(`/inbox/templates/${id}/use`, { conversationId }),

  // Phase 1: Отложенные сообщения
  listScheduled: (id: string) => api.get(`/inbox/${id}/scheduled`),
  createScheduled: (data: { conversationId: string; body: string; scheduledAt: string }) =>
    api.post('/inbox/scheduled', data),
  cancelScheduled: (scheduledId: string) => api.delete(`/inbox/scheduled/${scheduledId}`),

  // Phase 1: Pipeline интеграция
  addToPipeline: (id: string, stageId?: string, dealStage?: string) =>
    api.post(`/inbox/${id}/add-to-pipeline`, { stageId, dealStage }),
};
