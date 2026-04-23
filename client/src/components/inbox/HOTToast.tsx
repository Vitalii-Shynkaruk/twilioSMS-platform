// © BuyReadySite.com — HOT Lead Toast (top-right) + 3-pulse Web Audio звук
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, X } from 'lucide-react';
import { useWebSocketStore } from '../../stores/webSocketStore';

interface HotEvent {
  id: string; // уникальный ключ для дедупликации
  conversationId: string;
  leadName: string;
  preview: string;
  receivedAt: number;
}

const AUDIO_PULSES = [600, 800, 1050]; // Hz
const PULSE_INTERVAL_MS = 170;
const TOAST_TTL_MS = 8000;

function playHotPulse() {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    AUDIO_PULSES.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + (i * PULSE_INTERVAL_MS) / 1000;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.16);
    });
    // Закрываем контекст после последнего звука
    setTimeout(() => ctx.close().catch(() => {}), AUDIO_PULSES.length * PULSE_INTERVAL_MS + 300);
  } catch {
    // Браузер заблокировал autoplay — игнорируем
  }
}

export default function HOTToast() {
  const socket = useWebSocketStore((s) => s.socket);
  const navigate = useNavigate();
  const [items, setItems] = useState<HotEvent[]>([]);

  useEffect(() => {
    if (!socket) return;
    const handler = (payload: { conversationId: string; leadName?: string; preview?: string }) => {
      const id = `${payload.conversationId}-${Date.now()}`;
      const ev: HotEvent = {
        id,
        conversationId: payload.conversationId,
        leadName: payload.leadName || 'Lead',
        preview: payload.preview || '',
        receivedAt: Date.now(),
      };
      setItems((prev) => [ev, ...prev].slice(0, 4));
      playHotPulse();
      // Авто-удаление
      setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== id));
      }, TOAST_TTL_MS);
    };
    socket.on('hot-lead-detected', handler);
    return () => {
      socket.off('hot-lead-detected', handler);
    };
  }, [socket]);

  if (items.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      {items.map((ev) => (
        <button
          key={ev.id}
          type="button"
          onClick={() => {
            navigate(`/inbox?conv=${ev.conversationId}`);
            setItems((prev) => prev.filter((x) => x.id !== ev.id));
          }}
          className="pointer-events-auto group flex items-start gap-3 max-w-sm w-[360px] bg-gradient-to-br from-red-600/95 to-red-700/95 border border-red-400/40 shadow-2xl shadow-red-900/40 rounded-lg px-4 py-3 text-left animate-in slide-in-from-right-5 fade-in duration-200"
          aria-label={`HOT lead reply from ${ev.leadName}`}
        >
          <div className="shrink-0 w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">
            <Flame className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-mono font-extrabold tracking-widest text-white/90 uppercase">
                Hot Lead
              </span>
              <span className="text-[10px] text-white/70">→ check SCL now</span>
            </div>
            <p className="text-sm font-bold text-white truncate">{ev.leadName}</p>
            {ev.preview && <p className="text-xs text-white/85 mt-0.5 line-clamp-2">{ev.preview}</p>}
          </div>
          <span
            role="button"
            aria-label="Dismiss"
            onClick={(e) => {
              e.stopPropagation();
              setItems((prev) => prev.filter((x) => x.id !== ev.id));
            }}
            className="shrink-0 p-1 -m-1 rounded hover:bg-white/15 text-white/80 hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        </button>
      ))}
    </div>
  );
}
