import { create } from 'zustand';
import { User } from '../types';
import api from '../services/api';

export type OtpChannel = 'sms' | 'email';

export interface RequestOtpResponse {
  channel: 'SMS' | 'EMAIL';
  maskedDestination: string;
  expiresInSeconds: number;
  retryAfterSeconds?: number;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isLoginLoading: boolean;
  initialized: boolean;
  login: (email: string, password: string) => Promise<void>;
  testerLogin: (email: string, password: string, testerCode: string) => Promise<User>;
  requestOtp: (email: string, channel?: OtpChannel) => Promise<RequestOtpResponse>;
  verifyOtp: (email: string, code: string) => Promise<User>;
  devModeLogin: (email: string) => Promise<User>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

function persistSession(
  data: { token: string; refreshToken: string; user: User },
  set: (state: Partial<AuthState>) => void,
) {
  localStorage.setItem('scl_token', data.token);
  localStorage.setItem('scl_refresh_token', data.refreshToken);
  localStorage.setItem('scl_user', JSON.stringify(data.user));
  set({
    user: data.user,
    token: data.token,
    isAuthenticated: true,
    isLoading: false,
    isLoginLoading: false,
    initialized: true,
  });
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem('scl_token'),
  isAuthenticated: false,
  isLoading: true,
  isLoginLoading: false,
  initialized: false,

  login: async (email: string, password: string) => {
    set({ isLoginLoading: true });
    try {
      const { data } = await api.post('/auth/login', { email, password });
      persistSession(data, set);
    } catch (err) {
      set({ isLoginLoading: false });
      throw err;
    }
  },

  testerLogin: async (email: string, password: string, testerCode: string) => {
    set({ isLoginLoading: true });
    try {
      const { data } = await api.post<{ token: string; refreshToken: string; user: User }>('/auth/tester-login', {
        email,
        password,
        testerCode,
      });
      persistSession(data, set);
      return data.user;
    } catch (err) {
      set({ isLoginLoading: false });
      throw err;
    }
  },

  requestOtp: async (email: string, channel: OtpChannel = 'sms') => {
    set({ isLoginLoading: true });
    try {
      const { data } = await api.post<RequestOtpResponse>('/auth/request-otp', { email, channel });
      set({ isLoginLoading: false });
      return data;
    } catch (err) {
      set({ isLoginLoading: false });
      throw err;
    }
  },

  verifyOtp: async (email: string, code: string) => {
    set({ isLoginLoading: true });
    try {
      const { data } = await api.post<{ token: string; refreshToken: string; user: User }>('/auth/verify-otp', {
        email,
        code,
      });
      persistSession(data, set);
      return data.user;
    } catch (err) {
      set({ isLoginLoading: false });
      throw err;
    }
  },

  devModeLogin: async (email: string) => {
    set({ isLoginLoading: true });
    try {
      const { data } = await api.post<{ token: string; refreshToken: string; user: User }>('/auth/dev-login', {
        email,
      });
      persistSession(data, set);
      return data.user;
    } catch (err) {
      set({ isLoginLoading: false });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem('scl_token');
    localStorage.removeItem('scl_refresh_token');
    localStorage.removeItem('scl_user');
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      isLoginLoading: false,
    });
  },

  checkAuth: async () => {
    // Prevent multiple calls
    if (get().initialized) return;

    const token = localStorage.getItem('scl_token');
    const userStr = localStorage.getItem('scl_user');

    if (token && userStr) {
      try {
        // Verify token is still valid with the server
        const { data } = await api.get('/auth/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        set({
          user: data.user,
          token,
          isAuthenticated: true,
          isLoading: false,
          initialized: true,
        });
      } catch (err: any) {
        const status = err?.response?.status;
        // 5xx или 429 = серверная проблема / rate limit, сохраняем токен и кешированного юзера
        if (!status || status >= 500 || status === 429) {
          try {
            const cachedUser = JSON.parse(userStr);
            set({
              user: cachedUser,
              token,
              isAuthenticated: true,
              isLoading: false,
              initialized: true,
            });
          } catch {
            set({ user: null, token: null, isAuthenticated: false, isLoading: false, initialized: true });
          }
        } else {
          // 401/403 = token invalid, clear and redirect to login
          localStorage.removeItem('scl_token');
          localStorage.removeItem('scl_refresh_token');
          localStorage.removeItem('scl_user');
          set({ user: null, token: null, isAuthenticated: false, isLoading: false, initialized: true });
        }
      }
    } else {
      set({ isLoading: false, initialized: true });
    }
  },
}));

// Reset initialized on HMR so checkAuth re-fires
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    useAuthStore.setState({ initialized: false });
  });
}
