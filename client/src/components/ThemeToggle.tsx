import { Sun, Moon, Monitor } from 'lucide-react';
import { useThemeStore, ThemeMode } from '../stores/themeStore';
import { clsx } from 'clsx';

const options: { mode: ThemeMode; icon: typeof Sun; label: string }[] = [
  { mode: 'light', icon: Sun, label: 'Light' },
  { mode: 'dark', icon: Moon, label: 'Dark' },
  { mode: 'system', icon: Monitor, label: 'System' },
];

export default function ThemeToggle() {
  const { mode, setMode } = useThemeStore();

  return (
    <div className="flex items-center bg-dark-800 light:bg-gray-100 rounded-lg p-0.5 border border-dark-700/50"
      style={{ backgroundColor: 'var(--bg-input)', borderColor: 'var(--border-subtle)' }}>
      {options.map(({ mode: m, icon: Icon, label }) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          className={clsx(
            'p-1.5 rounded-md transition-all duration-150 flex items-center gap-1',
            mode === m
              ? 'bg-scl-600 text-white shadow-sm'
              : 'hover:text-dark-200'
          )}
          style={{ color: mode !== m ? 'var(--text-faint)' : undefined }}
          title={label}
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  );
}
