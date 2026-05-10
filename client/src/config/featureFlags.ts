const raw = (import.meta.env.VITE_PHASE1_LEAN ?? 'false').toString().toLowerCase();
export const PHASE1_LEAN = raw !== 'false' && raw !== '0';
