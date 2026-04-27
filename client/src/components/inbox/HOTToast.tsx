// © BuyReadySite.com — HOT Lead Toast (top-right) + 3-pulse Web Audio звук (pixel-perfect)
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWebSocketStore } from '../../stores/webSocketStore';

interface HotEvent {
  id: string;
  conversationId: string;
  leadName: string;
  preview: string;
  receivedAt: number;
}

interface HotPayload {
  conversationId: string;
  leadName?: string;
  preview?: string;
}

const AUDIO_PULSES = [600, 800, 1050];
const PULSE_INTERVAL_MS = 170;
const TOAST_TTL_MS = 8000;
const INBOX_SOUND_MUTE_KEY = 'scl_inbox_sound_muted';

function playHotPulse() {
  if (localStorage.getItem(INBOX_SOUND_MUTE_KEY) === '1') return;
  try {
    const Ctx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
    setTimeout(() => ctx.close().catch(() => {}), AUDIO_PULSES.length * PULSE_INTERVAL_MS + 300);
  } catch {
    // autoplay blocked
  }
}

export default function HOTToast() {
  const socket = useWebSocketStore((s) => s.socket);
  const navigate = useNavigate();
  const [items, setItems] = useState<HotEvent[]>([]);
  const [isMuted, setIsMuted] = useState(() => localStorage.getItem(INBOX_SOUND_MUTE_KEY) === '1');

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    if (next) {
      localStorage.setItem(INBOX_SOUND_MUTE_KEY, '1');
    } else {
      localStorage.removeItem(INBOX_SOUND_MUTE_KEY);
    }
  };

  useEffect(() => {
    if (!socket) return;
    const handler = (payload: HotPayload) => {
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
    <div className="hot-toast-stack" aria-live="assertive">
      {items.map((ev) => (
        <div
          key={ev.id}
          className="hot-toast"
          role="alert"
          onClick={() => {
            navigate(`/inbox?conv=${ev.conversationId}`);
            setItems((prev) => prev.filter((x) => x.id !== ev.id));
          }}
        >
          <div className="ht-head">🔥 HOT Lead Reply</div>
          <button
            type="button"
            className="ht-mute"
            aria-label={isMuted ? 'Unmute inbox sounds' : 'Mute inbox sounds'}
            onClick={(e) => {
              e.stopPropagation();
              toggleMute();
            }}
          >
            {isMuted ? '🔇 Mute' : '🔊 Sound'}
          </button>
          <div className="ht-name">{ev.leadName}</div>
          {ev.preview && <div className="ht-preview">&ldquo;{ev.preview}&rdquo;</div>}
          <button
            type="button"
            className="ht-close"
            aria-label="Dismiss"
            onClick={(e) => {
              e.stopPropagation();
              setItems((prev) => prev.filter((x) => x.id !== ev.id));
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
