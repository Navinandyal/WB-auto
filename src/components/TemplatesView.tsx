import React, { useState, useEffect } from 'react';
import { MessageTemplate } from '../types.ts';
import { useAuth } from '../context/AuthContext.tsx';
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Layers,
  AlertCircle,
  FileText,
} from 'lucide-react';

export const TemplatesView: React.FC = () => {
  const { fetchWithAuth } = useAuth();
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/whatsapp/templates');
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
      }
    } catch (err) {
      console.error('Failed to load templates:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleSyncTemplates = async () => {
    setSyncing(true);
    setNotification(null);
    try {
      const res = await fetchWithAuth('/api/whatsapp/templates/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to sync templates from Meta');
      }
      setNotification({ type: 'success', text: data.message || 'Templates synced successfully from Meta!' });
      await loadTemplates();
    } catch (err: any) {
      setNotification({
        type: 'error',
        text: `${err.message}. If you do not have live templates on Meta yet, you can click "Load Approved Starter Templates" below.`,
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleSeedStarterTemplates = async () => {
    setSeeding(true);
    setNotification(null);
    try {
      const res = await fetchWithAuth('/api/whatsapp/templates/seed-defaults', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNotification({ type: 'success', text: 'Approved starter templates loaded successfully.' });
      await loadTemplates();
    } catch (err: any) {
      setNotification({ type: 'error', text: err.message || 'Failed to load starter templates' });
    } finally {
      setSeeding(false);
    }
  };

  const getBodyText = (components: any[]) => {
    if (!Array.isArray(components)) return '';
    const body = components.find((c) => c && c.type === 'BODY');
    return body?.text || '';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">WhatsApp Message Templates</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Displaying official Meta templates. Only <span className="text-emerald-400 font-medium">APPROVED</span> templates can be scheduled for business-initiated conversations.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            id="seed-templates-button"
            onClick={handleSeedStarterTemplates}
            disabled={seeding}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Load Starter Templates</span>
          </button>
          <button
            id="sync-templates-button"
            onClick={handleSyncTemplates}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition cursor-pointer shadow-md shadow-emerald-950/40 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Syncing with Meta...' : 'Sync Templates'}</span>
          </button>
        </div>
      </div>

      {notification && (
        <div
          className={`p-4 rounded-xl text-xs flex items-start gap-3 border ${
            notification.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800 text-rose-300'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
          )}
          <span>{notification.text}</span>
        </div>
      )}

      {/* Meta WhatsApp Template Explainer Notice */}
      <div className="rounded-2xl border border-sky-500/20 bg-sky-950/30 p-4 text-xs text-sky-200/90 flex items-start gap-3.5">
        <div className="p-2 rounded-xl bg-sky-500/20 text-sky-300 shrink-0 mt-0.5">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="space-y-1.5 leading-relaxed">
          <div className="font-semibold text-white text-sm">Meta WhatsApp Template Rules & Auto-Fallback</div>
          <p className="text-slate-300">
            WhatsApp Business Cloud API requires outbound messages outside the 24-hour service window to use a registered template.
            Meta provides <span className="font-mono text-emerald-300 font-semibold bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/60">hello_world</span> (en_US) as the universal pre-approved template that functions immediately without needing manual review.
          </p>
          <p className="text-slate-400 text-[11px]">
            Custom template names (e.g. <code className="text-amber-300">happy_birthday_wishes</code>) produce Meta Error <strong>#132001 (Template does not exist in translation)</strong> if they are not yet created in your Meta account. Our background worker automatically falls back to <strong className="text-white">hello_world</strong> if a custom template is missing on Meta. To register custom templates with your exact wording, create them in <a href="https://business.facebook.com/wa/manage/message-templates/" target="_blank" rel="noreferrer" className="text-emerald-400 underline hover:text-emerald-300">Meta WhatsApp Manager</a> and click <strong>Sync Templates</strong>.
          </p>
        </div>
      </div>

      {/* Templates List */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase bg-slate-900/80">
                <th className="py-3 px-4 font-medium">Template Name</th>
                <th className="py-3 px-4 font-medium">Language</th>
                <th className="py-3 px-4 font-medium">Category</th>
                <th className="py-3 px-4 font-medium">Status</th>
                <th className="py-3 px-4 font-medium">Preview & Variables</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {templates.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500 text-sm">
                    {loading ? (
                      'Loading templates from database...'
                    ) : (
                      <div className="space-y-3">
                        <FileText className="w-8 h-8 mx-auto text-slate-600" />
                        <p>No message templates found.</p>
                        <p className="text-xs text-slate-500 max-w-sm mx-auto">
                          Click <strong>Sync Templates</strong> to pull templates approved in Meta WhatsApp Business Manager, or click <strong>Load Starter Templates</strong> to seed standard templates.
                        </p>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                templates.map((tpl) => {
                  const isApproved = tpl.status === 'APPROVED';
                  const isDefaultHelloWorld = tpl.name === 'hello_world';
                  const bodyText = getBodyText(tpl.components);

                  return (
                    <tr key={tpl.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm font-semibold text-white">{tpl.name}</span>
                          {isDefaultHelloWorld ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold tracking-wide">
                              WhatsApp Built-in Pre-Approved
                            </span>
                          ) : isApproved ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium tracking-wide">
                              Meta Approved
                            </span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium tracking-wide">
                              Needs Meta Approval
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">ID: {tpl.metaTemplateId || `#${tpl.id}`}</div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-300">
                        {tpl.language}
                      </td>
                      <td className="py-3.5 px-4 text-xs">
                        <span className="px-2.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-medium">
                          {tpl.category}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                            isApproved
                              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                              : tpl.status === 'REJECTED'
                              ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                              : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                          }`}
                        >
                          {isApproved ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : tpl.status === 'REJECTED' ? (
                            <XCircle className="w-3 h-3" />
                          ) : (
                            <Clock className="w-3 h-3" />
                          )}
                          {tpl.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 max-w-md">
                        <div className="text-xs text-slate-300 bg-slate-950 p-2.5 rounded-xl border border-slate-800 font-mono leading-relaxed break-words">
                          {bodyText || 'No body text specified'}
                        </div>
                        {tpl.variableCount > 0 && (
                          <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                            <Layers className="w-3 h-3" />
                            <span>{tpl.variableCount} parameter variable(s) required</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
