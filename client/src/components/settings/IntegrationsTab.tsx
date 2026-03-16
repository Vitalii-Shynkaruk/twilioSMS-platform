import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import {
  Phone, Brain, Shield, Webhook, Eye, EyeOff, Save,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

export default function IntegrationsTab() {
  const queryClient = useQueryClient();
  const [showTwilioToken, setShowTwilioToken] = useState(false);
  const [showTestToken, setShowTestToken] = useState(false);
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['systemSettings'] });
      toast.success('Setting saved');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to save'),
  });

  const settings = data?.settings || {};
  const [local, setLocal] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  const getVal = (key: string, def: string = '') =>
    local[key] !== undefined ? local[key] : (settings[key] || def);

  const handleChange = (key: string, value: string) => {
    setLocal(prev => ({ ...prev, [key]: value }));
    setDirty(prev => new Set(prev).add(key));
  };

  const handleSave = (key: string) => {
    saveMutation.mutate({ key, value: getVal(key) });
    setDirty(prev => { const next = new Set(prev); next.delete(key); return next; });
  };

  const IntegrationField = ({ label, settingKey, defaultValue = '', isSecret = false, showSecret = false, onToggle }: {
    label: string; settingKey: string; defaultValue?: string; isSecret?: boolean; showSecret?: boolean; onToggle?: () => void;
  }) => (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            className="input pr-10 font-mono text-sm"
            type={isSecret && !showSecret ? 'password' : 'text'}
            value={getVal(settingKey, defaultValue)}
            onChange={(e) => handleChange(settingKey, e.target.value)}
            placeholder={`Enter ${label}...`}
          />
          {isSecret && onToggle && (
            <button type="button" onClick={onToggle} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-dark-400 hover:text-dark-200">
              {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}
        </div>
        {dirty.has(settingKey) && (
          <button onClick={() => handleSave(settingKey)} disabled={saveMutation.isPending} className="btn-primary py-2 px-3 text-xs">
            <Save className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );

  const smsMode = settings.smsMode || 'live';

  return (
    <div className="space-y-6">
      {/* Twilio */}
      <div className="card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
            <Phone className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-dark-100">Twilio</h3>
            <p className="text-xs text-dark-400">SMS sending, number management, webhooks</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4">
          <IntegrationField label="Account SID" settingKey="twilioAccountSid" />
          <IntegrationField label="Auth Token" settingKey="twilioAuthToken" isSecret showSecret={showTwilioToken} onToggle={() => setShowTwilioToken(!showTwilioToken)} />
          <IntegrationField label="Messaging Service SID" settingKey="twilioMessagingServiceSid" />
          <IntegrationField label="Webhook Base URL" settingKey="webhookBaseUrl" defaultValue="https://yourdomain.com" />
        </div>

        {/* Test Credentials */}
        <div className={clsx(
          'rounded-lg p-4 border transition-colors duration-200',
          smsMode === 'twilio_test'
            ? 'border-cyan-500/40 bg-cyan-500/5'
            : 'border-dark-700/50 bg-dark-800/30'
        )}>
          <div className="flex items-center gap-2 mb-2">
            <Shield className={clsx('w-4 h-4', smsMode === 'twilio_test' ? 'text-cyan-400' : 'text-dark-400')} />
            <span className="text-sm font-medium text-dark-200">Test Credentials</span>
            {smsMode === 'twilio_test' && (
              <span className="badge bg-cyan-500/20 text-cyan-400 text-[10px] uppercase tracking-wider">In Use</span>
            )}
          </div>
          <p className="text-xs text-dark-400 mb-3">
            Used when SMS Mode is set to "Twilio Test" in System settings. API calls work but no real SMS delivered.
          </p>
          <div className="grid grid-cols-1 gap-3">
            <IntegrationField label="Test Account SID" settingKey="twilioTestAccountSid" />
            <IntegrationField label="Test Auth Token" settingKey="twilioTestAuthToken" isSecret showSecret={showTestToken} onToggle={() => setShowTestToken(!showTestToken)} />
          </div>
        </div>
      </div>

      {/* OpenAI */}
      <div className="card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
            <Brain className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-dark-100">OpenAI</h3>
            <p className="text-xs text-dark-400">AI-powered replies, lead classification, scoring</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4">
          <IntegrationField label="API Key" settingKey="openaiApiKey" isSecret showSecret={showOpenAIKey} onToggle={() => setShowOpenAIKey(!showOpenAIKey)} />
          <div>
            <label className="label">Model</label>
            <div className="flex items-center gap-2">
              <select
                className="input flex-1"
                value={getVal('openaiModel', 'gpt-4.1-mini')}
                onChange={(e) => handleChange('openaiModel', e.target.value)}
              >
                <option value="gpt-4.1-mini">GPT-4.1 Mini (fast, cheap)</option>
                <option value="gpt-4.1">GPT-4.1 (balanced)</option>
                <option value="gpt-4.1-nano">GPT-4.1 Nano (fastest, cheapest)</option>
                <option value="o3-mini">o3-mini (reasoning, compact)</option>
                <option value="o4-mini">o4-mini (reasoning, latest)</option>
              </select>
              {dirty.has('openaiModel') && (
                <button onClick={() => handleSave('openaiModel')} disabled={saveMutation.isPending} className="btn-primary py-2 px-3 text-xs">
                  <Save className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Webhooks */}
      <div className="card p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Webhook className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-dark-100">Outbound Webhooks</h3>
            <p className="text-xs text-dark-400">Send events to external services (CRM, Zapier, Make)</p>
          </div>
        </div>

        <div className="rounded-lg border border-dark-700/50 bg-dark-800/40 p-4 space-y-2">
          <p className="text-xs font-semibold text-dark-200">How Outbound Webhooks Work</p>
          <ul className="text-xs text-dark-400 space-y-1.5 list-disc list-inside">
            <li>When an event fires, we send a <span className="text-dark-200 font-mono">POST</span> request to your URL with a JSON payload</li>
            <li>Each payload includes <span className="text-dark-200 font-mono">event</span>, <span className="text-dark-200 font-mono">timestamp</span>, and <span className="text-dark-200 font-mono">source: "scl-sms-platform"</span></li>
            <li>Requests timeout after <strong className="text-dark-200">10 seconds</strong>. Non-200 responses are logged but not retried</li>
            <li>Use services like <strong className="text-dark-200">Zapier Webhooks</strong>, <strong className="text-dark-200">Make (Integromat)</strong>, <strong className="text-dark-200">n8n</strong>, or your own API endpoint</li>
          </ul>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <WebhookField
            label="New Reply Webhook URL"
            settingKey="webhookOnReply"
            description="Triggered when a lead replies to an SMS."
            examplePayload={`{
  "event": "reply",
  "leadId": "clx123...",
  "phone": "+13051234567",
  "body": "Yes, I'm interested!",
  "conversationId": "conv_456...",
  "timestamp": "2026-02-28T15:30:00Z",
  "source": "scl-sms-platform"
}`}
            exampleUrl="https://hooks.zapier.com/hooks/catch/123456/abcdef/"
            getVal={getVal}
            handleChange={handleChange}
            handleSave={handleSave}
            dirty={dirty}
            isSaving={saveMutation.isPending}
          />
          <WebhookField
            label="Opt-Out Webhook URL"
            settingKey="webhookOnOptOut"
            description="Triggered when a contact sends STOP/UNSUBSCRIBE."
            examplePayload={`{
  "event": "opt_out",
  "phone": "+13051234567",
  "leadId": "clx123...",
  "timestamp": "2026-02-28T15:30:00Z",
  "source": "scl-sms-platform"
}`}
            exampleUrl="https://hook.us1.make.com/abcdefghijk"
            getVal={getVal}
            handleChange={handleChange}
            handleSave={handleSave}
            dirty={dirty}
            isSaving={saveMutation.isPending}
          />
          <WebhookField
            label="Stage Change Webhook URL"
            settingKey="webhookOnStageChange"
            description="Triggered when a lead moves between pipeline stages."
            examplePayload={`{
  "event": "stage_change",
  "leadId": "clx123...",
  "fromStage": "New",
  "toStage": "Interested",
  "timestamp": "2026-02-28T15:30:00Z",
  "source": "scl-sms-platform"
}`}
            exampleUrl="https://n8n.yourdomain.com/webhook/stage-change"
            getVal={getVal}
            handleChange={handleChange}
            handleSave={handleSave}
            dirty={dirty}
            isSaving={saveMutation.isPending}
          />
        </div>

        <div className="rounded-lg border border-dark-700/50 bg-dark-800/40 p-4 flex items-start gap-3">
          <Brain className="w-4 h-4 text-scl-400 mt-0.5 shrink-0" />
          <div className="text-xs text-dark-400 space-y-1">
            <p><strong className="text-dark-200">Zapier:</strong> Create a "Webhooks by Zapier" trigger → "Catch Hook" and paste the URL here</p>
            <p><strong className="text-dark-200">Make.com:</strong> Add a "Webhooks" module → "Custom webhook" and paste the generated URL</p>
            <p><strong className="text-dark-200">n8n:</strong> Add a "Webhook" node, set method to POST, and use the production URL</p>
            <p><strong className="text-dark-200">Custom API:</strong> Create a POST endpoint that accepts JSON body with Content-Type: application/json</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Webhook Field Sub-Component ─── */
function WebhookField({
  label, settingKey, description, examplePayload, exampleUrl,
  getVal, handleChange, handleSave, dirty, isSaving,
}: {
  label: string; settingKey: string; description: string;
  examplePayload: string; exampleUrl: string;
  getVal: (key: string, def?: string) => string;
  handleChange: (key: string, val: string) => void;
  handleSave: (key: string) => void;
  dirty: Set<string>; isSaving: boolean;
}) {
  const [showPayload, setShowPayload] = useState(false);
  const currentVal = getVal(settingKey);
  const isConfigured = currentVal && currentVal.startsWith('http');

  return (
    <div className="rounded-lg border border-dark-700/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-dark-200">{label}</label>
          {isConfigured && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-500/15 text-green-400">
              ● Connected
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowPayload(!showPayload)}
          className="text-[11px] text-dark-500 hover:text-dark-300 transition-colors"
        >
          {showPayload ? 'Hide payload ↑' : 'Show payload ↓'}
        </button>
      </div>
      <p className="text-xs text-dark-400 leading-relaxed">{description}</p>
      <div className="flex items-center gap-2">
        <input
          className="input font-mono text-sm flex-1"
          type="url"
          value={currentVal}
          onChange={(e) => handleChange(settingKey, e.target.value)}
          placeholder={exampleUrl}
        />
        {dirty.has(settingKey) && (
          <button onClick={() => handleSave(settingKey)} disabled={isSaving} className="btn-primary py-2 px-3 text-xs">
            <Save className="w-3 h-3" />
          </button>
        )}
      </div>
      {showPayload && (
        <div className="rounded-md bg-dark-900/80 border border-dark-700/40 p-3 overflow-x-auto">
          <p className="text-[10px] text-dark-500 uppercase tracking-wider mb-1.5 font-semibold">Example JSON Payload (POST)</p>
          <pre className="text-[11px] text-dark-300 font-mono leading-relaxed whitespace-pre">{examplePayload}</pre>
        </div>
      )}
    </div>
  );
}
