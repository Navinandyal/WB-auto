import React, { useState, useEffect } from 'react';
import { ScheduledAutomation } from '../types.ts';
import { useAuth } from '../context/AuthContext.tsx';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Play,
  RotateCcw,
  Ban,
  Eye,
  X,
  Phone,
  AlertCircle,
  Send,
  AlertTriangle,
  Settings,
  Sparkles,
  Info,
  Smartphone,
} from 'lucide-react';

interface ScheduledAutomationsViewProps {
  onRunWorkerNow: (options?: { forceAll?: boolean; simulate?: boolean }) => Promise<any>;
  workerRunning: boolean;
  onNavigate?: (tab: string) => void;
  isAccountConfigured?: boolean;
}

export const ScheduledAutomationsView: React.FC<ScheduledAutomationsViewProps> = ({
  onRunWorkerNow,
  workerRunning,
  onNavigate,
  isAccountConfigured = false,
}) => {
  const { fetchWithAuth } = useAuth();
  const [automations, setAutomations] = useState<ScheduledAutomation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<{
    automation: ScheduledAutomation;
    messages: any[];
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [runningId, setRunningId] = useState<number | null>(null);
  const [simulationMode, setSimulationMode] = useState<boolean>(false);
  const [missingCredsModal, setMissingCredsModal] = useState<{
    automationId: number;
    contactName: string;
    contactPhone: string;
  } | null>(null);
  const [hideCredsBanner, setHideCredsBanner] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'warning' | 'info' | 'error';
    title: string;
    message: string;
  } | null>(null);

  const loadAutomations = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/automations');
      if (res.ok) {
        const data = await res.json();
        setAutomations(data);
      }
    } catch (err) {
      console.error('Failed to load automations:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadSimulationMode = async () => {
    try {
      const res = await fetchWithAuth('/api/automations/simulation-mode');
      if (res.ok) {
        const data = await res.json();
        setSimulationMode(Boolean(data.simulationMode));
      }
    } catch (err) {
      console.warn('Could not check simulation mode:', err);
    }
  };

  const toggleSimulationMode = async () => {
    try {
      const next = !simulationMode;
      const res = await fetchWithAuth('/api/automations/simulation-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      if (res.ok) {
        setSimulationMode(next);
        setFeedback({
          type: 'info',
          title: next ? 'Simulation Mode Activated' : 'Live Meta Cloud API Mode Active',
          message: next
            ? 'Messages will execute immediately with simulated WhatsApp delivery (useful for testing without Meta credentials).'
            : 'Messages will attempt live delivery through Meta Cloud API (requires valid Phone Number ID & Access Token).',
        });
      }
    } catch (err) {
      console.error('Failed to toggle simulation mode:', err);
    }
  };

  useEffect(() => {
    loadAutomations();
    loadSimulationMode();
  }, []);

  useEffect(() => {
    const pending = ['ACCEPTED', 'PROCESSING', 'SENT', 'DELIVERED'];
    if (!automations.some(a => pending.includes(a.status)) && !pending.includes(selectedItem?.automation.status || '')) return;
    let active = true, refreshing = false;
    const timer = window.setInterval(async () => {
      if (document.hidden || refreshing) return;
      refreshing = true;
      try {
        const response = await fetchWithAuth('/api/automations');
        if (response.ok) {
          const list = await response.json();
          if (active) setAutomations(list);
        }
        if (selectedItem && pending.includes(selectedItem.automation.status)) {
          const details = await fetchWithAuth(`/api/automations/${selectedItem.automation.id}`);
          if (details.ok) {
            const data = await details.json();
            if (active) setSelectedItem(current => current?.automation.id === data.automation.id ? data : current);
          }
        }
      } catch { /* Keep the last confirmed state on a temporary network failure. */ }
      finally { refreshing = false; }
    }, 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, [automations, selectedItem?.automation.id, selectedItem?.automation.status, fetchWithAuth]);


  const handleCancel = async (id: number) => {
    if (!window.confirm('Are you sure you want to cancel this scheduled automation?')) {
      return;
    }

    setCancellingId(id);
    try {
      const res = await fetchWithAuth(`/api/automations/${id}/cancel`, {
        method: 'POST',
      });
      if (res.ok) {
        setFeedback({
          type: 'info',
          title: 'Automation Cancelled',
          message: `Scheduled automation #${id} has been marked as CANCELLED.`,
        });
        await loadAutomations();
      } else {
        const err = await res.json();
        setFeedback({
          type: 'error',
          title: 'Cancellation Failed',
          message: err.error || 'Failed to cancel automation',
        });
      }
    } catch (err) {
      console.error('Cancel error:', err);
    } finally {
      setCancellingId(null);
    }
  };

  // Immediate single dispatch
  const handleRunSingle = async (id: number, forceSimulation?: boolean) => {
    const simulate = forceSimulation !== undefined ? forceSimulation : simulationMode;

    if (!isAccountConfigured && !simulate) {
      const auto = automations.find((a) => a.id === id);
      setMissingCredsModal({
        automationId: id,
        contactName: auto?.contactName || 'Recipient',
        contactPhone: auto?.contactPhone || '',
      });
      return;
    }

    setRunningId(id);
    setFeedback(null);
    try {
      const res = await fetchWithAuth(`/api/automations/${id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulate }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (data.successCount > 0) {
          setFeedback({
            type: simulate ? 'info' : 'success',
            title: simulate ? 'Sandbox Simulation Executed' : 'Delivered to Meta Cloud API',
            message: simulate
              ? `Automation #${id} ran in Sandbox Mode. NOTE: No real message was sent to the phone because Meta API credentials are not configured.`
              : `Automation #${id} successfully dispatched to Meta WhatsApp Cloud API!`,
          });
        } else if (data.failureCount > 0) {
          const detail = data.details?.[0]?.error || 'WhatsApp Business API credentials not configured.';
          setFeedback({
            type: 'error',
            title: 'Message Execution Failed',
            message: detail,
          });
        }
        await loadAutomations();
      } else {
        setFeedback({
          type: 'error',
          title: 'Execution Error',
          message: data.error || 'Failed to dispatch automation.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        title: 'Network Error',
        message: err?.message || 'Error communicating with server.',
      });
    } finally {
      setRunningId(null);
    }
  };

  const handleRunQueueNow = async () => {
    setFeedback(null);
    const result = await onRunWorkerNow({ forceAll: true, simulate: simulationMode });
    await loadAutomations();

    if (result) {
      if (result.processed === 0) {
        setFeedback({
          type: 'info',
          title: 'Queue Checked',
          message: 'No automations were due for execution. Use "Send Now" on any row to dispatch immediately.',
        });
      } else if (result.successCount > 0 && result.failureCount === 0) {
        setFeedback({
          type: 'success',
          title: 'Queue Executed Successfully',
          message: `Processed ${result.processed} automation(s). Requests accepted. Check each message’s delivery status.`,
        });
      } else if (result.failureCount > 0) {
        const firstError = result.details?.[0]?.error || 'Credentials not configured';
        setFeedback({
          type: 'warning',
          title: `Queue Processed: ${result.failureCount} Failed, ${result.successCount} Sent`,
          message: `${firstError}. Configure credentials in WhatsApp Settings or enable Simulation Mode.`,
        });
      }
    }
  };

  const handleViewDetails = async (id: number) => {
    setDetailLoading(true);
    try {
      const res = await fetchWithAuth(`/api/automations/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedItem(data);
      }
    } catch (err) {
      console.error('Failed to load automation detail:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SCHEDULED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
            <Clock className="w-3 h-3" /> SCHEDULED
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/30 animate-pulse">
            <RotateCcw className="w-3 h-3 animate-spin" /> PROCESSING
          </span>
        );
      case 'ACCEPTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30" title="Meta accepted the request; recipient delivery has not been confirmed">
            <Clock className="w-3 h-3" /> AWAITING DELIVERY
          </span>
        );
      case 'SENT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" title="WhatsApp confirmed the message was sent; awaiting recipient delivery">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> SENT
          </span>
        );
      case 'SIMULATED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/40" title="Simulated locally - No message was sent to real phone because WhatsApp credentials are not configured">
            <Sparkles className="w-3 h-3 text-purple-400" /> SIMULATED (NOT DELIVERED TO PHONE)
          </span>
        );
      case 'DELIVERED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-300 border border-teal-500/30">
            <CheckCircle2 className="w-3 h-3" /> DELIVERED
          </span>
        );
      case 'READ':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-300 border border-sky-500/30">
            <CheckCircle2 className="w-3 h-3 text-sky-400" /> READ
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-300 border border-rose-500/30">
            <XCircle className="w-3 h-3" /> FAILED
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            <Ban className="w-3 h-3" /> CANCELLED
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">Scheduled Messages Queue</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Automated WhatsApp Cloud API delivery pipeline with real-time status tracking.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            id="simulation-mode-toggle"
            onClick={toggleSimulationMode}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition cursor-pointer ${
              simulationMode
                ? 'bg-purple-950/50 border-purple-600/50 text-purple-300'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
            title="Sandbox Simulation Mode allows testing message workflows without Meta API credentials"
          >
            <Sparkles className={`w-3.5 h-3.5 ${simulationMode ? 'text-purple-400' : 'text-slate-500'}`} />
            <span>Simulation Mode: {simulationMode ? 'ON' : 'OFF'}</span>
          </button>

          <button
            id="refresh-automations-button"
            onClick={loadAutomations}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>

          <button
            id="run-worker-automations-button"
            onClick={handleRunQueueNow}
            disabled={workerRunning}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition cursor-pointer shadow-md shadow-emerald-950/40 disabled:opacity-50"
          >
            <Play className={`w-3.5 h-3.5 ${workerRunning ? 'animate-spin' : ''}`} />
            <span>{workerRunning ? 'Processing Queue...' : 'Trigger Due Jobs Now'}</span>
          </button>
        </div>
      </div>

      {/* WhatsApp Credentials Notice Banner if not configured */}
      {!isAccountConfigured && !hideCredsBanner && (
        <div
          id="credentials-warning-banner"
          className="p-4 rounded-2xl bg-amber-950/40 border border-amber-800/50 text-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg relative"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-white text-sm">
                WhatsApp Cloud API Credentials Not Configured
              </div>
              <p className="text-amber-300/90 mt-0.5 leading-relaxed">
                Messages require Meta Graph API credentials (Phone Number ID & Access Token) to reach real recipient phones.
                You can add them in <strong>WhatsApp Settings</strong>, or enable <strong>Sandbox Simulation Mode</strong> to test queue workflows and variable rendering right now.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onNavigate && (
              <button
                id="banner-settings-btn"
                onClick={() => onNavigate('settings')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold transition cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Go to Settings</span>
              </button>
            )}
            <button
              onClick={toggleSimulationMode}
              className={`px-3 py-1.5 rounded-lg border font-medium transition cursor-pointer ${
                simulationMode
                  ? 'bg-purple-900/60 border-purple-500 text-purple-200'
                  : 'bg-slate-900 border-amber-700 text-amber-300 hover:bg-slate-800'
              }`}
            >
              {simulationMode ? 'Simulation Enabled' : 'Enable Simulation'}
            </button>
            <button
              onClick={() => setHideCredsBanner(true)}
              className="p-1 rounded-lg hover:bg-amber-900/40 text-amber-400 hover:text-white transition cursor-pointer"
              title="Dismiss banner"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Execution Feedback Notification */}
      {feedback && (
        <div
          id="execution-feedback-alert"
          className={`p-4 rounded-2xl border text-xs flex items-start justify-between gap-3 shadow-lg transition ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200'
              : feedback.type === 'warning'
              ? 'bg-amber-950/40 border-amber-800/60 text-amber-200'
              : feedback.type === 'error'
              ? 'bg-rose-950/40 border-rose-800/60 text-rose-200'
              : 'bg-sky-950/40 border-sky-800/60 text-sky-200'
          }`}
        >
          <div className="flex items-start gap-3">
            {feedback.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
            {feedback.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />}
            {feedback.type === 'error' && <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />}
            {feedback.type === 'info' && <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />}
            <div>
              <div className="font-semibold text-white">{feedback.title}</div>
              <div className="mt-0.5 leading-relaxed">{feedback.message}</div>
            </div>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-white p-1 rounded transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase bg-slate-900/80">
                <th className="py-3 px-4 font-medium">Customer</th>
                <th className="py-3 px-4 font-medium">Template</th>
                <th className="py-3 px-4 font-medium">Scheduled Time</th>
                <th className="py-3 px-4 font-medium">Status & Error Details</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {automations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500 text-sm">
                    {loading ? 'Loading scheduled automations...' : 'No automations found.'}
                  </td>
                </tr>
              ) : (
                automations.map((a) => {
                  const isScheduled = a.status === 'SCHEDULED';
                  const isFailed = a.status === 'FAILED';
                  const isRunningThis = runningId === a.id;

                  return (
                    <tr key={a.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-white">{a.contactName}</div>
                        <div className="text-xs text-slate-400 flex items-center gap-1 font-mono mt-0.5">
                          <Phone className="w-3 h-3 text-emerald-400" />
                          {a.contactPhone}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-mono text-xs px-2.5 py-1 rounded bg-slate-950 text-emerald-300 border border-slate-800">
                          {a.templateName}
                        </span>
                        <div className="text-[11px] text-slate-500 mt-1">
                          Lang: {a.templateLanguage}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-300">
                        <div className="font-medium text-white">
                          {new Date(a.scheduledAt).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                        <div className="text-[11px] text-slate-500">{a.timezone}</div>
                        {a.executedAt && (
                          <div className="text-[10px] text-emerald-400 mt-0.5">
                            Executed: {new Date(a.executedAt).toLocaleTimeString()}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div>
                          {getStatusBadge(a.status)}
                          {a.errorMessage && (
                            <div
                              className={`text-[11px] mt-1 line-clamp-2 max-w-xs font-sans leading-tight p-1.5 rounded border ${
                                a.status === 'SIMULATED'
                                  ? 'text-purple-300 bg-purple-950/40 border-purple-800/50 flex items-start gap-1'
                                  : 'text-rose-300/90 bg-rose-950/30 border-rose-900/40'
                              }`}
                              title={a.errorMessage}
                            >
                              {a.status === 'SIMULATED' && (
                                <Sparkles className="w-3 h-3 text-purple-400 shrink-0 mt-0.5" />
                              )}
                              <span>{a.errorMessage}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2">
                        {/* Quick Run / Send Now Button */}
                        {(isScheduled || isFailed || a.status === 'SIMULATED') && (
                          <button
                            id={`run-automation-${a.id}`}
                            onClick={() => handleRunSingle(a.id, a.status === 'SIMULATED' ? false : undefined)}
                            disabled={isRunningThis || workerRunning}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer disabled:opacity-50 ${
                              a.status === 'SIMULATED'
                                ? 'bg-purple-950/40 hover:bg-purple-900/60 border border-purple-700/50 text-purple-200'
                                : 'bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-700/50 text-emerald-300'
                            }`}
                            title={
                              a.status === 'SIMULATED'
                                ? 'Dispatch to real WhatsApp mobile phone'
                                : simulationMode
                                ? 'Dispatch now in Sandbox Mode'
                                : 'Send message right now'
                            }
                          >
                            <Send className={`w-3 h-3 ${isRunningThis ? 'animate-spin' : ''}`} />
                            <span>
                              {isRunningThis
                                ? 'Sending...'
                                : a.status === 'SIMULATED'
                                ? 'Send to Phone'
                                : 'Send Now'}
                            </span>
                          </button>
                        )}

                        {/* View Details */}
                        <button
                          id={`view-automation-${a.id}`}
                          onClick={() => handleViewDetails(a.id)}
                          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                          title="View Message Payload & Logs"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {/* Cancel Button */}
                        {isScheduled && (
                          <button
                            id={`cancel-automation-${a.id}`}
                            onClick={() => handleCancel(a.id)}
                            disabled={cancellingId === a.id}
                            className="px-2.5 py-1 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/50 text-rose-300 text-xs font-medium transition cursor-pointer disabled:opacity-50"
                          >
                            {cancellingId === a.id ? 'Cancelling...' : 'Cancel'}
                          </button>
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

      {/* Details Modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5 relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white">
                  Automation #{selectedItem.automation.id}
                </h2>
                {getStatusBadge(selectedItem.automation.status)}
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
                <div>
                  <span className="text-slate-500 block">Customer:</span>
                  <span className="font-medium text-white">{selectedItem.automation.contactName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Phone:</span>
                  <span className="font-mono text-slate-300">{selectedItem.automation.contactPhone}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Template:</span>
                  <span className="font-mono text-emerald-300">{selectedItem.automation.templateName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Scheduled At:</span>
                  <span className="text-slate-300">
                    {new Date(selectedItem.automation.scheduledAt).toLocaleString()}
                  </span>
                </div>
                {selectedItem.automation.executedAt && (
                  <div>
                    <span className="text-slate-500 block">Executed At:</span>
                    <span className="text-emerald-400">
                      {new Date(selectedItem.automation.executedAt).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              {/* Template Variables */}
              <div className="space-y-1.5">
                <span className="font-medium text-slate-300">Template Variables Used:</span>
                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-[11px] text-slate-300 space-y-1">
                  {Object.entries(selectedItem.automation.variables || {}).map(([k, v]) => (
                    <div key={k}>
                      <span className="text-emerald-400 font-semibold">{`{{${k}}}`}</span>: {v}
                    </div>
                  ))}
                </div>
              </div>

              {/* Simulation Notice if Simulated */}
              {selectedItem.automation.status === 'SIMULATED' && (
                <div className="p-3 bg-purple-950/40 border border-purple-800/80 rounded-xl text-purple-300 space-y-2">
                  <div className="flex items-start gap-2">
                    <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-purple-400" />
                    <div>
                      <div className="font-semibold text-white">Sandbox Simulation (Not Sent to Phone)</div>
                      <div className="text-[11px] mt-0.5 leading-relaxed text-purple-200">
                        This automation executed in local test mode because Meta WhatsApp Cloud API credentials are not yet configured in WhatsApp Settings.
                        <span className="block mt-1 font-semibold text-amber-300">
                          No real WhatsApp message was transmitted across the network to mobile phone {selectedItem.automation.contactPhone}.
                        </span>
                      </div>
                    </div>
                  </div>
                  {onNavigate && (
                    <button
                      onClick={() => {
                        setSelectedItem(null);
                        onNavigate('settings');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition cursor-pointer flex items-center gap-1.5 mt-2"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span>Go to WhatsApp Settings to Connect Real API</span>
                    </button>
                  )}
                </div>
              )}

              {/* Error details if failed */}
              {selectedItem.automation.status === 'FAILED' && selectedItem.automation.errorMessage && (
                <div className="p-3 bg-rose-950/40 border border-rose-800 rounded-xl text-rose-300 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                    <div>
                      <div className="font-semibold">Reason for Failure:</div>
                      <div className="text-[11px] mt-0.5 leading-relaxed">{selectedItem.automation.errorMessage}</div>
                    </div>
                  </div>
                  {onNavigate && (
                    <button
                      onClick={() => {
                        setSelectedItem(null);
                        onNavigate('settings');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-rose-800 hover:bg-rose-700 text-white font-medium text-xs transition cursor-pointer flex items-center gap-1.5 mt-2"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span>Configure WhatsApp Credentials</span>
                    </button>
                  )}
                </div>
              )}

              {/* Sent Messages History */}
              <div className="space-y-2">
                <span className="font-medium text-slate-300">WhatsApp Message Records:</span>
                {selectedItem.messages.length === 0 ? (
                  <p className="text-slate-500">No outbound message record generated yet.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedItem.messages.map((m: any) => (
                      <div key={m.id} className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[11px] text-slate-400">
                            wamid: {m.whatsappMessageId || 'Pending'}
                          </span>
                          {getStatusBadge(m.status)}
                        </div>
                        {m.sentAt && <div className="text-slate-400 text-[11px]">Sent: {new Date(m.sentAt).toLocaleTimeString()}</div>}
                        {m.deliveredAt && <div className="text-teal-400 text-[11px]">Delivered: {new Date(m.deliveredAt).toLocaleTimeString()}</div>}
                        {m.readAt && <div className="text-sky-400 text-[11px]">Read: {new Date(m.readAt).toLocaleTimeString()}</div>}
                        {m.errorMessage && <div className="text-rose-400 text-[11px]">Error: {m.errorMessage}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-800">
              {selectedItem.automation.status !== 'SENT' && (
                <button
                  onClick={async () => {
                    await handleRunSingle(selectedItem.automation.id);
                    setSelectedItem(null);
                  }}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-medium transition cursor-pointer flex items-center gap-1.5"
                >
                  <Send className="w-3 h-3" />
                  <span>Send Message Now</span>
                </button>
              )}
              <button
                onClick={() => setSelectedItem(null)}
                className="ml-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Missing Credentials Modal */}
      {missingCredsModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/40 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5 relative">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">
                  WhatsApp API Not Configured
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Real WhatsApp messages cannot be delivered to mobile number <strong className="text-amber-300 font-mono">{missingCredsModal.contactPhone}</strong> without official Meta credentials.
                </p>
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs space-y-2.5 text-slate-300">
              <div className="font-semibold text-white flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                To receive messages on your mobile device:
              </div>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-400 pl-1 leading-relaxed">
                <li>Go to <strong className="text-slate-200">WhatsApp Settings</strong> in top navigation.</li>
                <li>Enter your <strong className="text-slate-200">Phone Number ID</strong> & <strong className="text-slate-200">Access Token</strong> from Meta Developers.</li>
                <li>If using Meta's test sandbox, add your number (<span className="text-emerald-400 font-mono">{missingCredsModal.contactPhone}</span>) to the Meta 'To' recipient whitelist.</li>
              </ol>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  const autoId = missingCredsModal.automationId;
                  setMissingCredsModal(null);
                  handleRunSingle(autoId, true);
                }}
                className="w-full sm:w-auto px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer"
              >
                Run Test Simulation (Preview Only)
              </button>
              <button
                onClick={() => {
                  setMissingCredsModal(null);
                  if (onNavigate) onNavigate('settings');
                }}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Settings className="w-4 h-4" />
                <span>Go to WhatsApp Settings</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
