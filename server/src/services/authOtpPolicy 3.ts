import { OtpChannel } from '@prisma/client';

export const OTP_EXPIRY_MS = 5 * 60 * 1000;
export const OTP_SEND_LIMIT = 3;
export const OTP_SEND_WINDOW_MS = 60 * 60 * 1000;
export const OTP_FAILURE_LIMIT = 5;
export const OTP_FAILURE_WINDOW_MS = 15 * 60 * 1000;
export const OTP_LOCK_MS = 30 * 60 * 1000;

export interface OtpRateLimitStatus {
  blocked: boolean;
  retryAfterSeconds: number;
  retryAt: Date | null;
}

export function normalizeOtpEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeOtpPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  return `+${digits}`;
}

export function maskOtpDestination(channel: OtpChannel, destination: string): string {
  if (channel === OtpChannel.EMAIL) {
    const [name, domain] = destination.split('@');
    if (!name || !domain) return 'email';
    const visible = name.length <= 2 ? name[0] || '' : `${name[0]}${name[name.length - 1]}`;
    return `${visible.padEnd(Math.min(name.length, 2), '*')}***@${domain}`;
  }

  const digits = destination.replace(/\D/g, '');
  return digits.length >= 4 ? `*** *** ${digits.slice(-4)}` : 'mobile phone';
}

export function getOtpRateLimitStatus(sentAtDates: Date[], now = new Date()): OtpRateLimitStatus {
  if (sentAtDates.length < OTP_SEND_LIMIT) {
    return { blocked: false, retryAfterSeconds: 0, retryAt: null };
  }

  const sortedDates = [...sentAtDates].sort((a, b) => a.getTime() - b.getTime());
  const retryAt = new Date(sortedDates[0].getTime() + OTP_SEND_WINDOW_MS);
  const retryAfterSeconds = Math.max(1, Math.ceil((retryAt.getTime() - now.getTime()) / 1000));

  return { blocked: retryAt > now, retryAfterSeconds, retryAt };
}
