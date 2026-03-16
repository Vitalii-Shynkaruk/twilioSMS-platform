import React from 'react';

interface SmsCounterProps {
  text: string;
  className?: string;
}

/**
 * SMS character counter.
 * GSM-7: 160 chars / segment (70 if UCS-2 unicode).
 * Multipart: 153 chars/segment (67 if UCS-2).
 */
export function SmsCounter({ text, className = '' }: SmsCounterProps) {
  const isUnicode = /[^\x00-\x7F\u00A0-\u00FF]/.test(text);
  const len = text.length;

  const singleMax = isUnicode ? 70 : 160;
  const multiMax = isUnicode ? 67 : 153;

  const segments = len === 0 ? 0 : len <= singleMax ? 1 : Math.ceil(len / multiMax);
  const remaining = len === 0 ? singleMax : (segments === 1 ? singleMax - len : (segments * multiMax) - len);

  const colorClass =
    segments >= 3 ? 'text-red-400' :
    segments === 2 ? 'text-yellow-400' :
    'text-dark-500';

  return (
    <span className={`text-xs ${colorClass} ${className}`}>
      {len}/{segments === 1 ? singleMax : segments * multiMax} · {segments} SMS{segments !== 1 ? 's' : ''}
      {isUnicode && ' · Unicode'}
    </span>
  );
}
