import React from 'react';
import { DashboardData } from '../types.ts';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  Users,
  AlertTriangle,
  Play,
  ArrowUpRight,
  ShieldCheck,
  Cake,
} from 'lucide-react';

interface DashboardViewProps {
  data: DashboardData | null;
  loading: boolean;
  onRefresh: () => void;
  onNavigate: (tab: string) => void;
  onRunWorkerNow: (options?: any) => Promise<any>;
  workerRunning: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  data,
  loading,
  onRefresh,
  onNavigate,
  onRunWorkerNow,
  workerRunning,
}) => {
  const isConnected = data?.connection?.status === 'CONNECTED' && data?.connection?.configured;

  return (
    <div className="space-y-8">
      {/* Top Banner: WhatsApp Connection Status */}
      <div
        id="whatsapp-connection-banner"
        className={`p-5 rounded-2xl border transition ${
          isConnected
            ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-100'
            : 'bg-amber-950/30 border-amber-800/40 text-amber-100'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isConnected
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}
            >
              {isConnected ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-base text-white">
                  {isConnected ? 'WhatsApp Cloud API Connected' : 'WhatsApp API Not Configured'}
                </h3>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                    isConnected
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  {data?.connection?.status || 'DISCONNECTED'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {isConnected ? (
                  <span>
                    Phone: <span className="text-slate-200">{data?.connection?.displayPhoneNumber || 'Registered'}</span>
                    {data?.connection?.verifiedName && ` • Name: ${data.connection.verifiedName}`}
                    {data?.connection?.qualityRating && ` • Quality: ${data.connection.qualityRating}`}
                  </span>
                ) : (
                  'Configure your Meta App ID, Phone Number ID, and Access Token in WhatsApp Settings to enable sending.'
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              id="dashboard-worker-trigger-button"
              onClick={onRunWorkerNow}
              disabled={workerRunning}
              title="Manually trigger scheduled jobs queue immediately"
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer disabled:opacity-50"
            >
              <Play className={`w-3.5 h-3.5 text-emerald-400 ${workerRunning ? 'animate-spin' : ''}`} />
              <span>{workerRunning ? 'Executing Queue...' : 'Run Queue Now'}</span>
            </button>
            <button
              id="dashboard-manage-connection-button"
              onClick={() => onNavigate('settings')}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer shadow-sm"
            >
              <span>{isConnected ? 'Settings' : 'Configure WhatsApp'}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Contacts */}
        <div
          id="stat-card-contacts"
          onClick={() => onNavigate('contacts')}
          className="p-5 bg-slate-900 border border-slate-800 rounded-2xl cursor-pointer hover:border-slate-700 transition group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-medium uppercase tracking-wider">Total Contacts</span>
            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300 group-hover:text-white transition">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-semibold text-white tracking-tight">
            {loading ? '—' : data?.stats?.totalContacts ?? 0}
          </div>
          <p className="text-xs text-slate-500 mt-1">Recipients in address book</p>
        </div>

        {/* Scheduled Messages */}
        <div
          id="stat-card-scheduled"
          onClick={() => onNavigate('automations')}
          className="p-5 bg-slate-900 border border-slate-800 rounded-2xl cursor-pointer hover:border-slate-700 transition group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-medium uppercase tracking-wider">Scheduled</span>
            <div className="w-8 h-8 rounded-lg bg-amber-950/60 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-105 transition">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-semibold text-white tracking-tight">
            {loading ? '—' : data?.stats?.scheduledMessages ?? 0}
          </div>
          <p className="text-xs text-amber-500/80 mt-1">Pending queue execution</p>
        </div>

        {/* Messages Sent */}
        <div
          id="stat-card-sent"
          onClick={() => onNavigate('automations')}
          className="p-5 bg-slate-900 border border-slate-800 rounded-2xl cursor-pointer hover:border-slate-700 transition group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-medium uppercase tracking-wider">Messages Sent</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-950/60 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition">
              <Send className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-semibold text-white tracking-tight">
            {loading ? '—' : data?.stats?.messagesSent ?? 0}
          </div>
          <p className="text-xs text-emerald-500/80 mt-1">Sent & delivered via Meta</p>
        </div>

        {/* Failed Messages */}
        <div
          id="stat-card-failed"
          onClick={() => onNavigate('automations')}
          className="p-5 bg-slate-900 border border-slate-800 rounded-2xl cursor-pointer hover:border-slate-700 transition group"
        >
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-medium uppercase tracking-wider">Failed</span>
            <div className="w-8 h-8 rounded-lg bg-rose-950/60 border border-rose-500/20 flex items-center justify-center text-rose-400 group-hover:scale-105 transition">
              <XCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-3xl font-semibold text-white tracking-tight">
            {loading ? '—' : data?.stats?.failedMessages ?? 0}
          </div>
          <p className="text-xs text-rose-500/80 mt-1">Errors or opt-out rejections</p>
        </div>
      </div>

      {/* Birthday Automation Spotlight Card */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-amber-950/30 border border-slate-800 hover:border-amber-500/30 rounded-2xl p-5 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <Cake className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm text-white">Birthday Automation Engine</h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Annual Auto-Pilot
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Automatically detect birthdays annually, schedule WhatsApp wishes at 9:00 AM, and customize messages per customer.
            </p>
          </div>
        </div>

        <button
          onClick={() => onNavigate('birthdays')}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-450 text-slate-950 font-semibold rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer shrink-0"
        >
          <span>Open Birthday Automation</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Upcoming Scheduled Messages section */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-white">Upcoming Scheduled Messages</h2>
            <p className="text-xs text-slate-400">Automations queued for automatic backend dispatch</p>
          </div>
          <button
            id="dashboard-schedule-new-button"
            onClick={() => onNavigate('create')}
            className="text-xs font-medium text-emerald-400 hover:text-emerald-300 transition flex items-center gap-1 cursor-pointer"
          >
            <span>Schedule New</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {(!data?.upcoming || data.upcoming.length === 0) ? (
          <div className="text-center py-10 text-slate-500 text-sm">
            <Clock className="w-8 h-8 mx-auto mb-2 text-slate-600" />
            <p>No upcoming messages currently scheduled.</p>
            <button
              onClick={() => onNavigate('create')}
              className="mt-3 text-xs text-emerald-400 hover:underline cursor-pointer"
            >
              Create your first automation &rarr;
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase">
                  <th className="pb-3 font-medium">Customer</th>
                  <th className="pb-3 font-medium">Template</th>
                  <th className="pb-3 font-medium">Scheduled Time</th>
                  <th className="pb-3 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {data.upcoming.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5">
                      <div className="font-medium text-white">{item.contactName}</div>
                      <div className="text-xs text-slate-400">{item.contactPhone}</div>
                    </td>
                    <td className="py-3.5">
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-emerald-300 border border-slate-700">
                        {item.templateName}
                      </span>
                    </td>
                    <td className="py-3.5 text-slate-300 text-xs">
                      {new Date(item.scheduledAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-3.5 text-right">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-300 border border-amber-500/30">
                        <Clock className="w-3 h-3" />
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
