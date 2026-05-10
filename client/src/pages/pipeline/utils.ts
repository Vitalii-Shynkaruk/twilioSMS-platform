import type { ViewMode } from './types';

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getStoredViewMode(): ViewMode {
  try {
    const stored = localStorage.getItem('pipeline-view-mode');
    if (stored && ['board', 'grid-2', 'grid-3', 'grid-4'].includes(stored)) return stored as ViewMode;
  } catch {
  }
  return 'board';
}
