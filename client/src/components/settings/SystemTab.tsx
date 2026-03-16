import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import {
  Save, Radio, Shield, FlaskConical, TrendingUp, Zap, Brain,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

export default function SystemTab() {
  const queryClient = useQueryClient();
  const [localSettings, setLocalSettings] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  const { data } = useQuery({
    queryKey: ['systemSettings'],
    queryFn: async () => {
      const { data } = await api.get('/settings/settings');
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      await api.put(`/settings/settings/${key}`, { value });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['systemSettings'] });
      setDirty(prev => { const next = new Set(prev); next.delete(variables.key); return next; });
      toast.success('Setting saved');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to save'),
  });

  const settings = data?.settings || {};

  const fields = [
    { label: 'Max Messages / Number / Day', key: 'maxPerNumberPerDay', defaultValue: '300' },
    { label: 'Global Daily Limit', key: 'globalDailyLimit', defaultValue: '20000' },
    { label: 'Quiet Hours Start (24h)', key: 'quietHoursStart', defaultValue: '21' },
    { label: 'Quiet Hours End (24h)', key: 'quietHoursEnd', defaultValue: '9' },
    { label: 'Quiet Hours Timezone', key: 'quietHoursTimezone', defaultValue: 'America/New_York' },
    { label: 'Default Send Speed (msg/min)', key: 'defaultSpeed', defaultValue: '4' },
    { label: 'Opt-Out Reply', key: 'optOutReply', defaultValue: 'You have been unsubscribed.' },
    { label: 'Help Reply', key: 'helpReply', defaultValue: 'Reply STOP to opt-out.' },
  ];

  const getValue = (key: string, defaultValue: string) =>
    localSettings[key] !== undefined ? localSettings[key] : (settings[key] || defaultValue);

  const smsMode = (settings.smsMode as string) || 'live';
  const isRampUp = settings.rampUpEnabled === true || settings.rampUpEnabled === 'true';

  const handleSmsModeChange = (mode: string) => {
    saveMutation.mutate({ key: 'smsMode', value: mode });
  };

  const handleRampUpToggle = () => {
    const newValue = !isRampUp;
    saveMutation.mutate({ key: 'rampUpEnabled', value: newValue as any });
  };

  const smsModes = [
    {
      value: 'live',
      label: 'Live',
      desc: 'Real SMS sent via production Twilio credentials',
      icon: <Radio className="w-4 h-4" />,
      color: 'green',
    },
    {
      value: 'twilio_test',
      label: 'Twilio Test',
      desc: 'API calls via test credentials — Twilio accepts but doesn\'t deliver',
      icon: <Shield className="w-4 h-4" />,
      color: 'cyan',
    },
    {
      value: 'simulation',
      label: 'Simulation',
      desc: 'No API calls at all — messages are simulated locally',
      icon: <FlaskConical className="w-4 h-4" />,
      color: 'amber',
    },
  ] as const;

  const currentMode = smsModes.find(m => m.value === smsMode) || smsModes[0];
  const colorMap: Record<string, { border: string; bg: string; text: string; dot: string }> = {
    green: { border: 'border-green-500/50', bg: 'bg-green-500/10', text: 'text-green-400', dot: 'bg-green-500' },
    cyan: { border: 'border-cyan-500/50', bg: 'bg-cyan-500/10', text: 'text-cyan-400', dot: 'bg-cyan-500' },
    amber: { border: 'border-amber-500/50', bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-500' },
  };

  return (
    <div className="space-y-6">
      {/* SMS Mode Selector */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className={clsx(
            'w-10 h-10 rounded-lg flex items-center justify-center',
            colorMap[currentMode.color].bg, colorMap[currentMode.color].text
          )}>
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-dark-100 flex items-center gap-2">
              SMS Sending Mode
              <span className={clsx(
                'badge text-[10px] uppercase tracking-wider',
                colorMap[currentMode.color].bg, colorMap[currentMode.color].text
              )}>
                {currentMode.label}
              </span>
            </h4>
            <p className="text-xs text-dark-400 mt-0.5">{currentMode.desc}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {smsModes.map((mode) => {
            const active = smsMode === mode.value;
            const c = colorMap[mode.color];
            return (
              <button
                key={mode.value}
                onClick={() => handleSmsModeChange(mode.value)}
                disabled={saveMutation.isPending}
                className={clsx(
                  'relative rounded-lg p-4 border-2 text-left transition-all duration-200 focus:outline-none',
                  active
                    ? [c.border, c.bg]
                    : 'border-dark-700/50 hover:border-dark-600 bg-dark-800/30'
                )}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className={clsx(active ? c.text : 'text-dark-400')}>
                    {mode.icon}
                  </span>
                  <span className={clsx('text-sm font-medium', active ? 'text-dark-100' : 'text-dark-300')}>
                    {mode.label}
                  </span>
                </div>
                <p className="text-xs text-dark-400 leading-relaxed">{mode.desc}</p>
                {active && (
                  <div className={clsx('absolute top-3 right-3 w-2.5 h-2.5 rounded-full', c.dot)} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="card p-6 space-y-6">
        <h3 className="text-base font-semibold text-dark-100">System Configuration</h3>
        <p className="text-sm text-dark-400">
          Edit settings below and click Save to apply changes in real-time.
        </p>

        <div className="grid grid-cols-2 gap-4">
          {fields.map((item) => (
            <div key={item.key}>
              <label className="label">{item.label}</label>
              <div className="flex items-center gap-2">
                <input
                  className="input flex-1"
                  value={getValue(item.key, item.defaultValue)}
                  onChange={(e) => {
                    setLocalSettings(prev => ({ ...prev, [item.key]: e.target.value }));
                    setDirty(prev => new Set(prev).add(item.key));
                  }}
                />
                {dirty.has(item.key) && (
                  <button
                    onClick={() => saveMutation.mutate({ key: item.key, value: getValue(item.key, item.defaultValue) })}
                    disabled={saveMutation.isPending}
                    className="btn-primary py-2 px-3 text-xs"
                  >
                    <Save className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Ramp-Up */}
      <div className="card p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={clsx(
              'w-10 h-10 rounded-lg flex items-center justify-center',
              isRampUp ? 'bg-green-500/20 text-green-400' : 'bg-dark-700 text-dark-400'
            )}>
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-dark-100 flex items-center gap-2">
                Number Ramp-Up
                {isRampUp && (
                  <span className="badge bg-green-500/20 text-green-400 text-[10px] uppercase tracking-wider">Active</span>
                )}
              </h4>
              <p className="text-xs text-dark-400 mt-0.5">
                {isRampUp
                  ? 'New numbers gradually increase daily sending limits to build reputation'
                  : 'Enable to warm up new numbers and avoid carrier flags'}
              </p>
            </div>
          </div>
          <button
            onClick={handleRampUpToggle}
            disabled={saveMutation.isPending}
            className={clsx(
              'relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 focus:outline-none',
              isRampUp ? 'bg-green-500' : 'bg-dark-600'
            )}
          >
            <span className={clsx(
              'inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200',
              isRampUp ? 'translate-x-6' : 'translate-x-1'
            )} />
          </button>
        </div>

        {isRampUp && (
          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-dark-700/50">
            <div>
              <label className="label">Start Limit (msgs/day)</label>
              <div className="flex items-center gap-2">
                <input
                  className="input flex-1"
                  type="number"
                  min={1}
                  max={1000}
                  value={getValue('rampUpStartLimit', '10')}
                  onChange={(e) => {
                    setLocalSettings(prev => ({ ...prev, rampUpStartLimit: e.target.value }));
                    setDirty(prev => new Set(prev).add('rampUpStartLimit'));
                  }}
                />
                {dirty.has('rampUpStartLimit') && (
                  <button
                    onClick={() => saveMutation.mutate({ key: 'rampUpStartLimit', value: getValue('rampUpStartLimit', '10') })}
                    disabled={saveMutation.isPending}
                    className="btn-primary py-2 px-3 text-xs"
                  >
                    <Save className="w-3 h-3" />
                  </button>
                )}
              </div>
              <p className="text-xs text-dark-500 mt-1">How many messages a new number can send on day 1</p>
            </div>
            <div>
              <label className="label">Daily Increase</label>
              <div className="flex items-center gap-2">
                <input
                  className="input flex-1"
                  type="number"
                  min={1}
                  max={500}
                  value={getValue('rampUpDailyIncrease', '5')}
                  onChange={(e) => {
                    setLocalSettings(prev => ({ ...prev, rampUpDailyIncrease: e.target.value }));
                    setDirty(prev => new Set(prev).add('rampUpDailyIncrease'));
                  }}
                />
                {dirty.has('rampUpDailyIncrease') && (
                  <button
                    onClick={() => saveMutation.mutate({ key: 'rampUpDailyIncrease', value: getValue('rampUpDailyIncrease', '5') })}
                    disabled={saveMutation.isPending}
                    className="btn-primary py-2 px-3 text-xs"
                  >
                    <Save className="w-3 h-3" />
                  </button>
                )}
              </div>
              <p className="text-xs text-dark-500 mt-1">Additional messages allowed each day</p>
            </div>
          </div>
        )}
      </div>

      {/* Anti-Blocking Engine */}
      <AntiBlockingSection
        settings={settings}
        getValue={getValue}
        localSettings={localSettings}
        setLocalSettings={setLocalSettings}
        dirty={dirty}
        setDirty={setDirty}
        saveMutation={saveMutation}
      />
    </div>
  );
}

/* ─── Anti-Blocking Section ─── */
function AntiBlockingSection({
  settings, getValue, localSettings, setLocalSettings, dirty, setDirty, saveMutation,
}: {
  settings: Record<string, any>;
  getValue: (key: string, def: string) => string;
  localSettings: Record<string, string>;
  setLocalSettings: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  dirty: Set<string>;
  setDirty: React.Dispatch<React.SetStateAction<Set<string>>>;
  saveMutation: any;
}) {
  const isSpintax = settings.spintaxEnabled === true || settings.spintaxEnabled === 'true';
  const isTimeDist = settings.timeDistributionEnabled === true || settings.timeDistributionEnabled === 'true';

  const toggleSetting = (key: string, current: boolean) => {
    saveMutation.mutate({ key, value: (!current).toString() });
  };

  const ToggleRow = ({ label, desc, isOn, settingKey }: { label: string; desc: string; isOn: boolean; settingKey: string }) => (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-sm font-medium text-dark-200">{label}</p>
        <p className="text-xs text-dark-500 mt-0.5">{desc}</p>
      </div>
      <button
        onClick={() => toggleSetting(settingKey, isOn)}
        disabled={saveMutation.isPending}
        className={clsx(
          'relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 focus:outline-none',
          isOn ? 'bg-scl-500' : 'bg-dark-600'
        )}
      >
        <span className={clsx(
          'inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200',
          isOn ? 'translate-x-6' : 'translate-x-1'
        )} />
      </button>
    </div>
  );

  const NumericField = ({ label, desc, settingKey, defaultValue, min, max, unit }: {
    label: string; desc: string; settingKey: string; defaultValue: string; min: number; max: number; unit?: string;
  }) => (
    <div>
      <label className="label">{label} {unit && <span className="text-dark-500">({unit})</span>}</label>
      <div className="flex items-center gap-2">
        <input
          className="input flex-1"
          type="number"
          min={min}
          max={max}
          value={getValue(settingKey, defaultValue)}
          onChange={(e) => {
            setLocalSettings(prev => ({ ...prev, [settingKey]: e.target.value }));
            setDirty(prev => new Set(prev).add(settingKey));
          }}
        />
        {dirty.has(settingKey) && (
          <button
            onClick={() => saveMutation.mutate({ key: settingKey, value: getValue(settingKey, defaultValue) })}
            disabled={saveMutation.isPending}
            className="btn-primary py-2 px-3 text-xs"
          >
            <Save className="w-3 h-3" />
          </button>
        )}
      </div>
      <p className="text-xs text-dark-500 mt-1">{desc}</p>
    </div>
  );

  return (
    <div className="card p-5 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-purple-500/15 text-purple-400">
          <Brain className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-dark-100 flex items-center gap-2">
            Anti-Blocking Engine
            <span className="badge bg-purple-500/15 text-purple-400 text-[10px] uppercase tracking-wider">25k/day</span>
          </h4>
          <p className="text-xs text-dark-400 mt-0.5">Advanced settings to avoid carrier filtering and improve deliverability</p>
        </div>
      </div>

      <div className="divide-y divide-dark-700/50">
        <ToggleRow
          label="Spintax Content Variation"
          desc='Randomize messages using {Hello|Hi|Hey} syntax to avoid fingerprinting'
          isOn={isSpintax}
          settingKey="spintaxEnabled"
        />
        <ToggleRow
          label="Time Distribution"
          desc="Spread bulk sends evenly across business hours instead of sending all at once"
          isOn={isTimeDist}
          settingKey="timeDistributionEnabled"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 pt-2 border-t border-dark-700/50">
        <NumericField label="Delay Jitter" desc="Random variation applied to delay between messages" settingKey="jitterPercent" defaultValue="40" min={0} max={100} unit="%" />
        <NumericField label="Circuit Breaker Threshold" desc="Auto-pause campaign if this % of last 50 messages failed" settingKey="circuitBreakerThreshold" defaultValue="30" min={5} max={100} unit="%" />
        <NumericField label="Delivery Rate Throttle" desc="Slow down numbers with delivery rate below this value" settingKey="deliveryRateThrottleAt" defaultValue="80" min={50} max={100} unit="%" />
        <NumericField label="Business Hours" desc="Start hour for time-distributed sends (24h format)" settingKey="businessHoursStart" defaultValue="9" min={0} max={23} unit="start hour" />
        <NumericField label="Business Hours End" desc="End hour for time-distributed sends (24h format)" settingKey="businessHoursEnd" defaultValue="18" min={0} max={23} unit="end hour" />
      </div>

      {isSpintax && (
        <div className="rounded-lg p-4 border border-purple-500/20 bg-purple-500/5 space-y-2">
          <p className="text-xs font-semibold text-purple-300">Spintax Template Examples</p>
          <div className="text-xs text-dark-400 space-y-1 font-mono">
            <p>{'{Hello|Hi|Hey}'} {'{{firstName}}'}, {'{'} this is|I\'m{'}'} calling about your credit application.</p>
            <p>{'{'} Please call us|Give us a call|Reach out{'}'} at {'{{companyPhone}}'}.</p>
          </div>
          <p className="text-xs text-dark-500">Each recipient receives a uniquely varied message, reducing carrier pattern detection.</p>
        </div>
      )}
    </div>
  );
}
