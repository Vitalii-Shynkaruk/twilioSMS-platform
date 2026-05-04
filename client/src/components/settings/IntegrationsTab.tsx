import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { Phone, Brain, Shield, Webhook, Eye, EyeOff, Save, CheckCircle2, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { PHASE1_LEAN } from '../../config/featureFlags';

const isMasked = (val: string) => typeof val === 'string' && val.startsWith('****');

function IntegrationField({
  label,
  settingKey,
  defaultValue = '',
  isSecret = false,
  showSecret = false,
  onToggle,
  settings,
  local,
  dirty,
  getVal,
  handleChange,
  handleSave,
  savePending,
}: {
  label: string;
  settingKey: string;
  defaultValue?: string;
  isSecret?: boolean;
  showSecret?: boolean;
  onToggle?: () => void;
  settings: Record<string, unknown>;
  local: Record<string, string>;
  dirty: Set<string>;
  getVal: (key: string, def?: string, secret?: boolean) => string;
  handleChange: (key: string, value: string) => void;
  handleSave: (key: string) => void;
  savePending: boolean;
}) {
  const serverVal = settings[settingKey] || '';
  const hasExisting = isSecret && isMasked(String(serverVal));
  return (
    <div>
      <label className="label flex items-center gap-2">
        {label}
        {hasExisting && local[settingKey] === undefined && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
            <CheckCircle2 className="w-3 h-3" />
            Saved ••••{String(serverVal).slice(-4)}
          </span>
        )}
      </label>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            className="input pr-10 font-mono text-sm"
            type={isSecret && !showSecret ? 'password' : 'text'}
            value={getVal(settingKey, defaultValue, isSecret)}
            onChange={(e) => handleChange(settingKey, e.target.value)}
            placeholder={
              hasExisting && local[settingKey] === undefined ? 'Enter new value to replace' : `Enter ${label}...`
            }
          />
          {isSecret && onToggle && (
            <button
              type="button"
              onClick={onToggle}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-dark-400 hover:text-dark-200"
            >
              {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}
        </div>
        {dirty.has(settingKey) && (
          <button
            onClick={() => handleSave(settingKey)}
            disabled={savePending}
            className="btn-primary py-2 px-3 text-xs"
          >
            <Save className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function IntegrationsTab() {
  const queryClient = useQueryClient();
  const [showTwilioToken, setShowTwilioToken] = useState(false);
  const [showTestToken, setShowTestToken] = useState(false);
  const [showSmtpPassword, setShowSmtpPassword] = useState(false);
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);

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
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['systemSettings'] });
      // Clear local & dirty only after successful save
      setLocal((prev) => {
        const next = { ...prev };
        delete next[variables.key];
        return next;
      });
      setDirty((prev) => {
        const next = new Set(prev);
        next.delete(variables.key);
        return next;
      });
      toast.success('Setting saved');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to save'),
  });

  const settings: Record<string, unknown> = data?.settings || {};
  const [local, setLocal] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  const getVal = (key: string, def: string = '', secret = false) => {
    if (local[key] !== undefined) return local[key];
    const serverVal = settings[key] || def;
    if (secret && isMasked(String(serverVal))) return '';
    return String(serverVal);
  };

  const handleChange = (key: string, value: string) => {
    setLocal((prev) => ({ ...prev, [key]: value }));
    setDirty((prev) => new Set(prev).add(key));
  };

  const handleSave = (key: string) => {
    const val = getVal(key);
    if (!val && val !== '0') {
      toast.error('Enter a value before saving');
      return;
    }
    saveMutation.mutate({ key, value: val });
  };

  const fieldProps = { settings, local, dirty, getVal, handleChange, handleSave, savePending: saveMutation.isPending };

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
          <IntegrationField {...fieldProps} label="Account SID" settingKey="twilioAccountSid" />
          <IntegrationField
            {...fieldProps}
            label="Auth Token"
            settingKey="twilioAuthToken"
            isSecret
            showSecret={showTwilioToken}
            onToggle={() => setShowTwilioToken(!showTwilioToken)}
          />
          <IntegrationField {...fieldProps} label="Messaging Service SID" settingKey="twilioMessagingServiceSid" />
          <IntegrationField
            {...fieldProps}
            label="Webhook Base URL"
            settingKey="webhookBaseUrl"
            defaultValue="https://yourdomain.com"
          />
        </div>

        {/* Test Credentials */}
        <div
          className={clsx(
            'rounded-lg p-4 border transition-colors duration-200',
            smsMode === 'twilio_test' ? 'border-cyan-500/40 bg-cyan-500/5' : 'border-dark-700/50 bg-dark-800/30',
          )}
        >
          <div className="flex items-center gap-2 mb-2">
            <Shield className={clsx('w-4 h-4', smsMode === 'twilio_test' ? 'text-cyan-400' : 'text-dark-400')} />
            <span className="text-sm font-medium text-dark-200">Test Credentials</span>
            {smsMode === 'twilio_test' && (
              <span className="badge bg-cyan-500/20 text-cyan-400 text-[10px] uppercase tracking-wider">In Use</span>
            )}
          </div>
          <p className="text-xs text-dark-400 mb-3">
            Used when SMS Mode is set to &ldquo;Twilio Test&rdquo; in System settings. API calls work but no real SMS
            delivered.
          </p>
          <div className="grid grid-cols-1 gap-3">
            <IntegrationField {...fieldProps} label="Test Account SID" settingKey="twilioTestAccountSid" />
            <IntegrationField
              {...fieldProps}
              label="Test Auth Token"
              settingKey="twilioTestAuthToken"
              isSecret
              showSecret={showTestToken}
              onToggle={() => setShowTestToken(!showTestToken)}
            />
          </div>
        </div>
      </div>

      {/* Email Sign-in */}
      <div className="card p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
            <Mail className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-dark-100">Email Sign-in</h3>
            <p className="text-xs text-dark-400">
              SMTP fallback for OTP login. Uses the server SMTP relay by default; external SMTP can be connected here.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-dark-700/50 bg-dark-800/30 p-4 space-y-4">
          <p className="text-xs text-dark-400">
            Leave host as <span className="font-mono text-dark-200">127.0.0.1</span> and port{' '}
            <span className="font-mono text-dark-200">25</span> to send through the server SMTP relay. For an external
            provider, enter its SMTP host, port, username, and password.
          </p>
          <IntegrationField
            {...fieldProps}
            label="From Email"
            settingKey="smtpFromEmail"
            defaultValue="login@sclcapital.io"
          />
          <IntegrationField {...fieldProps} label="SMTP Host" settingKey="smtpHost" defaultValue="127.0.0.1" />
          <IntegrationField {...fieldProps} label="SMTP Port" settingKey="smtpPort" defaultValue="25" />
          <IntegrationField {...fieldProps} label="SMTP Username" settingKey="smtpUser" />
          <IntegrationField
            {...fieldProps}
            label="SMTP Password"
            settingKey="smtpPassword"
            isSecret
            showSecret={showSmtpPassword}
            onToggle={() => setShowSmtpPassword(!showSmtpPassword)}
          />
          <div>
            <label className="label">Secure TLS</label>
            <div className="flex items-center gap-2">
              <select
                className="input flex-1"
                value={getVal('smtpSecure', 'false')}
                onChange={(e) => handleChange('smtpSecure', e.target.value)}
              >
                <option value="false">Disabled / STARTTLS optional (25 or 587)</option>
                <option value="true">Enabled (465)</option>
              </select>
              {dirty.has('smtpSecure') && (
                <button
                  onClick={() => handleSave('smtpSecure')}
                  disabled={saveMutation.isPending}
                  className="btn-primary py-2 px-3 text-xs"
                >
                  <Save className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* AI Provider (Anthropic / OpenAI) — скрыто в PHASE1_LEAN по директиве клиента 23.04 (defer в Phase 2) */}
      {!PHASE1_LEAN && (
        <div className="card p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
              <Brain className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-dark-100">AI Provider</h3>
              <p className="text-xs text-dark-400">
                Lead classification, AI suggestions, scoring. The active provider is used for all AI requests.
              </p>
            </div>
          </div>

          {/* Provider switcher */}
          <div>
            <label className="label">Provider</label>
            <div className="flex items-center gap-2">
              <select
                className="input flex-1"
                value={getVal('aiProvider', 'anthropic')}
                onChange={(e) => handleChange('aiProvider', e.target.value)}
              >
                <option value="anthropic">Anthropic (Claude) — recommended</option>
                <option value="openai">OpenAI (GPT)</option>
              </select>
              {dirty.has('aiProvider') && (
                <button
                  onClick={() => handleSave('aiProvider')}
                  disabled={saveMutation.isPending}
                  className="btn-primary py-2 px-3 text-xs"
                >
                  <Save className="w-3 h-3" />
                </button>
              )}
            </div>
            <p className="text-[11px] text-dark-400 mt-1">
              Current: <span className="text-dark-200 font-mono">{getVal('aiProvider', 'anthropic')}</span>
            </p>
          </div>

          {/* Anthropic block */}
          {getVal('aiProvider', 'anthropic') === 'anthropic' && (
            <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-4 space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-orange-300">Anthropic Claude</span>
                <span className="badge bg-orange-500/20 text-orange-400 text-[10px] uppercase tracking-wider">
                  Active
                </span>
              </div>
              <IntegrationField
                {...fieldProps}
                label="Anthropic API Key"
                settingKey="anthropicApiKey"
                isSecret
                showSecret={showAnthropicKey}
                onToggle={() => setShowAnthropicKey(!showAnthropicKey)}
              />
              <div>
                <label className="label">Claude Model</label>
                <div className="flex items-center gap-2">
                  <select
                    className="input flex-1"
                    value={getVal('anthropicModel', 'claude-sonnet-4-5')}
                    onChange={(e) => handleChange('anthropicModel', e.target.value)}
                  >
                    <option value="claude-sonnet-4-5">Claude Sonnet 4.5 (recommended)</option>
                    <option value="claude-opus-4-1">Claude Opus 4.1 (highest quality)</option>
                    <option value="claude-haiku-4-5">Claude Haiku 4.5 (fast, cheap)</option>
                  </select>
                  {dirty.has('anthropicModel') && (
                    <button
                      onClick={() => handleSave('anthropicModel')}
                      disabled={saveMutation.isPending}
                      className="btn-primary py-2 px-3 text-xs"
                    >
                      <Save className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* OpenAI block */}
          {getVal('aiProvider', 'anthropic') === 'openai' && (
            <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-4 space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-green-300">OpenAI GPT</span>
                <span className="badge bg-green-500/20 text-green-400 text-[10px] uppercase tracking-wider">
                  Active
                </span>
              </div>
              <IntegrationField
                {...fieldProps}
                label="OpenAI API Key"
                settingKey="openaiApiKey"
                isSecret
                showSecret={showOpenAIKey}
                onToggle={() => setShowOpenAIKey(!showOpenAIKey)}
              />
              <div>
                <label className="label">OpenAI Model</label>
                <div className="flex items-center gap-2">
                  <select
                    className="input flex-1"
                    value={getVal('openaiModel', 'gpt-4.1-mini')}
                    onChange={(e) => handleChange('openaiModel', e.target.value)}
                  >
                    <option value="gpt-4.1-mini">GPT-4.1 Mini (recommended)</option>
                    <option value="gpt-4.1">GPT-4.1 (balanced)</option>
                    <option value="gpt-4.1-nano">GPT-4.1 Nano (fastest)</option>
                    <option value="o3-mini">o3-mini (reasoning)</option>
                    <option value="o4-mini">o4-mini (reasoning, latest)</option>
                  </select>
                  {dirty.has('openaiModel') && (
                    <button
                      onClick={() => handleSave('openaiModel')}
                      disabled={saveMutation.isPending}
                      className="btn-primary py-2 px-3 text-xs"
                    >
                      <Save className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Hot Alert From Number — shared across AI workflow */}
          <div className="rounded-lg border border-dark-700/50 bg-dark-800/30 p-4 space-y-3">
            <p className="text-xs font-semibold text-dark-200">HOT Alerts (mobile SMS notifications)</p>
            <p className="text-[11px] text-dark-400">
              Number used to send hot lead notifications to managers. If empty — the first active platform number is
              used.
            </p>
            <IntegrationField
              {...fieldProps}
              label="Hot Alert From Number (E.164, e.g. +13105551234)"
              settingKey="hotAlertFromNumber"
            />
          </div>
        </div>
      )}

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
            <li>
              When an event fires, we send a <span className="text-dark-200 font-mono">POST</span> request to your URL
              with a JSON payload
            </li>
            <li>
              Each payload includes <span className="text-dark-200 font-mono">event</span>,{' '}
              <span className="text-dark-200 font-mono">timestamp</span>, and{' '}
              <span className="text-dark-200 font-mono">{'source: "scl-sms-platform"'}</span>
            </li>
            <li>
              Requests timeout after <strong className="text-dark-200">10 seconds</strong>. Non-200 responses are logged
              but not retried
            </li>
            <li>
              Use services like <strong className="text-dark-200">Zapier Webhooks</strong>,{' '}
              <strong className="text-dark-200">Make (Integromat)</strong>,{' '}
              <strong className="text-dark-200">n8n</strong>, or your own API endpoint
            </li>
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
            <p>
              <strong className="text-dark-200">Zapier:</strong> Create a &ldquo;Webhooks by Zapier&rdquo; trigger
              &rarr; &ldquo;Catch Hook&rdquo; and paste the URL here
            </p>
            <p>
              <strong className="text-dark-200">Make.com:</strong> Add a &ldquo;Webhooks&rdquo; module &rarr;
              &ldquo;Custom webhook&rdquo; and paste the generated URL
            </p>
            <p>
              <strong className="text-dark-200">n8n:</strong> Add a &ldquo;Webhook&rdquo; node, set method to POST, and
              use the production URL
            </p>
            <p>
              <strong className="text-dark-200">Custom API:</strong> Create a POST endpoint that accepts JSON body with
              Content-Type: application/json
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Webhook Field Sub-Component ─── */
function WebhookField({
  label,
  settingKey,
  description,
  examplePayload,
  exampleUrl,
  getVal,
  handleChange,
  handleSave,
  dirty,
  isSaving,
}: {
  label: string;
  settingKey: string;
  description: string;
  examplePayload: string;
  exampleUrl: string;
  getVal: (key: string, def?: string) => string;
  handleChange: (key: string, val: string) => void;
  handleSave: (key: string) => void;
  dirty: Set<string>;
  isSaving: boolean;
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
          <p className="text-[10px] text-dark-500 uppercase tracking-wider mb-1.5 font-semibold">
            Example JSON Payload (POST)
          </p>
          <pre className="text-[11px] text-dark-300 font-mono leading-relaxed whitespace-pre">{examplePayload}</pre>
        </div>
      )}
    </div>
  );
}
