import React, { useState, useEffect } from 'react';
import { WhatsAppAccountSettings } from '../types.ts';
import { useAuth } from '../context/AuthContext.tsx';
import {
  ShieldCheck,
  Save,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Copy,
  ExternalLink,
  Lock,
  RefreshCw,
} from 'lucide-react';

interface WhatsAppSettingsViewProps {
  onSettingsUpdated: () => void;
}

export const WhatsAppSettingsView: React.FC<WhatsAppSettingsViewProps> = ({ onSettingsUpdated }) => {
  const { fetchWithAuth } = useAuth();
  const [settings, setSettings] = useState<WhatsAppAccountSettings>({
    configured: false,
    metaAppId: '',
    metaAppSecretMasked: '',
    businessAccountId: '',
    phoneNumberId: '',
    accessTokenMasked: '',
    webhookVerifyToken: 'wa_verify_secret',
    apiVersion: 'v21.0',
    status: 'DISCONNECTED',
  });

  // Inputs for editing credentials
  const [metaAppId, setMetaAppId] = useState('');
  const [metaAppSecret, setMetaAppSecret] = useState('');
  const [businessAccountId, setBusinessAccountId] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [webhookVerifyToken, setWebhookVerifyToken] = useState('wa_verify_secret');
  const [apiVersion, setApiVersion] = useState('v21.0');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const webhookCallbackUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/webhooks/whatsapp` : '/api/webhooks/whatsapp';

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/whatsapp/account');
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        setMetaAppId(data.metaAppId || '');
        setBusinessAccountId(data.businessAccountId || '');
        setPhoneNumberId(data.phoneNumberId || '');
        setWebhookVerifyToken(data.webhookVerifyToken || 'wa_verify_secret');
        setApiVersion(data.apiVersion || 'v21.0');
        // Secrets are not exposed; set placeholders if already configured
        setMetaAppSecret(data.metaAppSecretMasked || '');
        setAccessToken(data.accessTokenMasked || '');
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMessage(null);

    try {
      const res = await fetchWithAuth('/api/whatsapp/account', {
        method: 'POST',
        body: JSON.stringify({
          metaAppId,
          metaAppSecret,
          businessAccountId,
          phoneNumberId,
          accessToken,
          webhookVerifyToken,
          apiVersion,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save configuration');
      }

      setStatusMessage({ type: 'success', text: 'Settings saved securely. Credentials encrypted in database.' });
      await loadSettings();
      onSettingsUpdated();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Error saving settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setStatusMessage(null);

    try {
      const res = await fetchWithAuth('/api/whatsapp/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumberId: phoneNumberId.trim(),
          accessToken: accessToken.trim(),
          apiVersion: apiVersion.trim(),
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Connection test failed. Please verify your Meta credentials.');
      }

      setStatusMessage({
        type: 'success',
        text: `Success! Connected to Meta Cloud API: ${data.verifiedName || 'WhatsApp Business Account'} (${data.phoneNumber || phoneNumberId})`,
      });
      await loadSettings();
      onSettingsUpdated();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `Connection test failed: ${err.message}`,
      });
    } finally {
      setTesting(false);
    }
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookCallbackUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2500);
  };


  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-white tracking-tight">WhatsApp Cloud API Settings</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Configure credentials from the Meta App Dashboard (WhatsApp Business Platform).
        </p>
      </div>

      {settings.hasToken && (
        <div className={`p-4 rounded-xl text-sm border flex items-start gap-3 ${
          settings.configured
            ? 'bg-emerald-950/30 border-emerald-800 text-emerald-200'
            : 'bg-amber-950/30 border-amber-800 text-amber-200'
        }`}>
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-400" />
          <div className="space-y-1">
            <p className="font-medium text-white">
              Permanent Access Token detected from {settings.tokenSource || '.env'}
            </p>
            <p className="text-xs text-slate-300">
              {settings.configured
                ? 'Your WhatsApp Cloud API credentials are fully configured and active. Scheduled automations will send automatically on time.'
                : 'Permanent Access Token is loaded. Please enter your WhatsApp Phone Number ID below and click "Save Configuration" to enable automatic messaging.'}
            </p>
          </div>
        </div>
      )}

      {statusMessage && (
        <div
          className={`p-4 rounded-xl text-sm flex items-start gap-3 border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800 text-rose-300'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-400" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2 text-white font-medium">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <span>Meta WhatsApp Business Account Credentials</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled
                className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-medium transition cursor-pointer"
              >
                Auto-Fill Meta Sandbox Preset
              </button>
              <span className="text-xs font-mono text-slate-500 flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-emerald-400" /> Masked & Secure
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Meta App ID */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <span>Meta App ID</span>
                <span className="text-slate-500 text-[11px]">(Optional)</span>
              </label>
              <input
                id="meta-app-id-input"
                type="text"
                value={metaAppId}
                onChange={(e) => setMetaAppId(e.target.value)}
                placeholder="e.g. 109283746592837"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono transition"
              />
            </div>

            {/* Meta App Secret */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <span>Meta App Secret</span>
                <span className="text-slate-500 text-[11px]">(Optional)</span>
              </label>
              <input
                id="meta-app-secret-input"
                type="password"
                value={metaAppSecret}
                onChange={(e) => setMetaAppSecret(e.target.value)}
                placeholder={settings.metaAppSecretMasked || 'Enter app secret'}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono transition"
              />
            </div>

            {/* WhatsApp Business Account ID */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <span>WhatsApp Business Account ID (WABA ID)</span>
                <span className="text-slate-500 text-[11px]">(Optional - Auto-discovered)</span>
              </label>
              <input
                id="meta-waba-id-input"
                type="text"
                value={businessAccountId}
                onChange={(e) => setBusinessAccountId(e.target.value)}
                placeholder="e.g. 102938475610293 (optional)"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono transition"
              />
            </div>

            {/* Phone Number ID */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <span className="text-emerald-300 font-semibold">WhatsApp Phone Number ID *</span>
                <span className="text-slate-500 text-[11px]">(Required to send to real phones)</span>
              </label>
              <input
                id="meta-phone-id-input"
                type="text"
                required
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                placeholder="e.g. 583920194829104"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono transition shadow-inner"
              />
            </div>

            {/* Access Token */}
            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <span>WhatsApp System User / Permanent Access Token *</span>
                <span className="text-slate-500 text-[11px]">(Masked on save)</span>
              </label>
              <input
                id="meta-access-token-input"
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder={settings.accessTokenMasked || 'EAAG... (Meta Cloud API System User token)'}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono transition"
              />
              <p className="text-[11px] text-slate-500">
                Generated from Meta Business Manager &rarr; System Users with <code className="text-slate-400 font-mono">whatsapp_business_messaging</code> and <code className="text-slate-400 font-mono">whatsapp_business_management</code> permissions.
              </p>
            </div>

            {/* Webhook Verify Token */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300">Webhook Verify Token</label>
              <input
                id="meta-webhook-verify-token-input"
                type="text"
                value={webhookVerifyToken}
                onChange={(e) => setWebhookVerifyToken(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono transition"
              />
            </div>

            {/* Meta Graph API Version */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-300">Meta Graph API Version</label>
              <input
                id="meta-api-version-input"
                type="text"
                value={apiVersion}
                onChange={(e) => setApiVersion(e.target.value)}
                placeholder="v21.0"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-emerald-500 font-mono transition"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-800">
            <button
              id="test-whatsapp-connection-button"
              type="button"
              onClick={handleTestConnection}
              disabled={testing || !phoneNumberId}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium border border-slate-700 transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 text-emerald-400 ${testing ? 'animate-spin' : ''}`} />
              <span>{testing ? 'Testing Connection...' : 'Test Connection'}</span>
            </button>

            <button
              id="save-whatsapp-settings-button"
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition cursor-pointer shadow-md shadow-emerald-950/40 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save Settings'}</span>
            </button>
          </div>
        </div>
      </form>

      {/* Webhook Configuration Guide */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h3 className="text-sm font-semibold text-white">Meta WhatsApp Webhook Configuration</h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          To receive real-time delivery confirmations (<code className="text-slate-300">SENT</code>, <code className="text-slate-300">DELIVERED</code>, <code className="text-slate-300">READ</code>, and <code className="text-slate-300">FAILED</code> statuses), configure this webhook in your Meta App Dashboard under WhatsApp &rarr; Configuration:
        </p>

        <div className="space-y-3">
          <div>
            <span className="text-xs text-slate-400 block mb-1">Callback URL:</span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={webhookCallbackUrl}
                className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-emerald-300"
              />
              <button
                type="button"
                onClick={copyWebhookUrl}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs text-slate-200 flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{copiedWebhook ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>
          </div>

          <div>
            <span className="text-xs text-slate-400 block mb-1">Verify Token:</span>
            <input
              type="text"
              readOnly
              value={webhookVerifyToken}
              className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-300"
            />
          </div>
        </div>
      </div>

      {/* Meta Developer Whitelist Guide */}
      <div className="bg-slate-900 border border-emerald-900/50 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">How to Receive Messages on Your Mobile Phone</h3>
            <p className="text-xs text-slate-400 mt-0.5">Requirements for Meta WhatsApp Cloud API delivery</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="font-semibold text-emerald-300">Case A: Using Meta Free Test Number</div>
            <p className="text-slate-400 leading-relaxed">
              When testing with Meta's developer test phone number (e.g. +1 555...):
            </p>
            <ol className="list-decimal list-inside space-y-1 text-slate-300 pl-1">
              <li>Open your Meta App &rarr; WhatsApp &rarr; <strong>API Setup</strong>.</li>
              <li>Under <strong>To</strong>, click <strong>Manage phone number list</strong>.</li>
              <li>Add your personal number (e.g. <span className="font-mono text-emerald-400">+918605083060</span>) and verify the 6-digit OTP.</li>
              <li>Meta will now deliver automated messages to your phone!</li>
            </ol>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="font-semibold text-emerald-300">Case B: Using Live Registered Business Number</div>
            <p className="text-slate-400 leading-relaxed">
              When using a live registered WhatsApp Business phone number:
            </p>
            <ol className="list-decimal list-inside space-y-1 text-slate-300 pl-1">
              <li>Add a Permanent System User Token with <code className="font-mono text-emerald-400">whatsapp_business_messaging</code>.</li>
              <li>Messages can be delivered to any customer phone who has opted in.</li>
              <li>Templates must be approved by Meta before dispatch.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};
