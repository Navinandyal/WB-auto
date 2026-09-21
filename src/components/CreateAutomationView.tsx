import React, { useState, useEffect } from 'react';
import { Contact, MessageTemplate } from '../types.ts';
import { useAuth } from '../context/AuthContext.tsx';
import {
  Calendar,
  Clock,
  Send,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowRight,
  Info,
} from 'lucide-react';

interface CreateAutomationViewProps {
  onAutomationCreated: () => void;
  onNavigate: (tab: string) => void;
}

export const CreateAutomationView: React.FC<CreateAutomationViewProps> = ({
  onAutomationCreated,
  onNavigate,
}) => {
  const { fetchWithAuth } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');

  // Execution states
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    customer: string;
    contactPhone: string;
    scheduled: string;
    template: string;
    status: string;
  } | null>(null);

  // Initialize form with defaults
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [cRes, tRes] = await Promise.all([
          fetchWithAuth('/api/contacts'),
          fetchWithAuth('/api/whatsapp/templates'),
        ]);

        if (cRes.ok) {
          const cData = await cRes.json();
          setContacts(cData);
          if (cData.length > 0) setSelectedContactId(String(cData[0].id));
        }

        if (tRes.ok) {
          const tData = await tRes.json();
          // Filter strictly approved templates
          const approved = tData.filter((t: MessageTemplate) => t.status === 'APPROVED');
          setTemplates(approved);
          if (approved.length > 0) {
            setSelectedTemplateId(String(approved[0].id));
            initVariables(approved[0]);
          }
        }
      } catch (err) {
        console.error('Failed to load contacts/templates:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Default to today + 1 hour in local time
    const now = new Date();
    now.setHours(now.getHours() + 1);
    now.setMinutes(0);
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toTimeString().slice(0, 5); // "HH:MM"
    setScheduleDate(dateStr);
    setScheduleTime(timeStr);
  }, []);

  const initVariables = (template: MessageTemplate) => {
    const count = template.variableCount || 0;
    const initialVars: Record<string, string> = {};
    for (let i = 1; i <= count; i++) {
      if (i === 1) initialVars['1'] = 'Rahul Sharma';
      else if (i === 2) initialVars['2'] = 'Appointment #123';
      else if (i === 3) initialVars['3'] = '15 September 2026';
      else initialVars[String(i)] = '';
    }
    setVariables(initialVars);
  };

  const handleTemplateChange = (templateIdStr: string) => {
    setSelectedTemplateId(templateIdStr);
    const found = templates.find((t) => String(t.id) === templateIdStr);
    if (found) {
      initVariables(found);
    }
  };

  const handleVariableChange = (varKey: string, val: string) => {
    setVariables((prev) => ({
      ...prev,
      [varKey]: val,
    }));
  };

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessData(null);
    setSubmitting(true);

    try {
      if (!selectedContactId) {
        throw new Error('Please select a customer contact.');
      }
      if (!selectedTemplateId) {
        throw new Error('Please select an approved WhatsApp template.');
      }
      if (!scheduleDate || !scheduleTime) {
        throw new Error('Please select both a date and time for scheduled execution.');
      }

      // Compose ISO string
      const scheduledDateTime = new Date(`${scheduleDate}T${scheduleTime}:00`);
      if (isNaN(scheduledDateTime.getTime())) {
        throw new Error('Invalid scheduled date or time.');
      }

      const res = await fetchWithAuth('/api/automations', {
        method: 'POST',
        body: JSON.stringify({
          contactId: parseInt(selectedContactId, 10),
          templateId: parseInt(selectedTemplateId, 10),
          variables,
          scheduledAt: scheduledDateTime.toISOString(),
          timezone,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to schedule automation');
      }

      setSuccessData({
        customer: data.automation.customer,
        contactPhone: data.automation.contactPhone,
        scheduled: new Date(data.automation.scheduled).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
        template: data.automation.template,
        status: data.automation.status,
      });

      onAutomationCreated();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to schedule automation');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedTemplate = templates.find((t) => String(t.id) === selectedTemplateId);
  const selectedContact = contacts.find((c) => String(c.id) === selectedContactId);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white tracking-tight">Create Scheduled Automation</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Configure recipient, template parameters, and trigger time for official Meta WhatsApp Cloud API dispatch.
        </p>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-start gap-3">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Success Card */}
      {successData && (
        <div
          id="automation-success-card"
          className="p-6 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 shadow-xl space-y-4"
        >
          <div className="flex items-center gap-2.5 text-emerald-400 font-semibold text-base">
            <CheckCircle2 className="w-5 h-5" />
            <span>Automation scheduled successfully</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-emerald-950/60 border border-emerald-800/40 text-xs">
            <div>
              <span className="text-slate-400 block mb-0.5">Customer:</span>
              <span className="font-medium text-white">{successData.customer}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Scheduled:</span>
              <span className="font-medium text-white">{successData.scheduled}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Template:</span>
              <span className="font-mono text-emerald-300">{successData.template}</span>
            </div>
            <div>
              <span className="text-slate-400 block mb-0.5">Status:</span>
              <span className="inline-flex items-center gap-1 font-mono px-2 py-0.5 rounded bg-emerald-900/80 border border-emerald-600 text-emerald-200 font-semibold">
                {successData.status}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-slate-400">
              The database background worker will process this job when the scheduled time arrives.
            </p>
            <button
              onClick={() => onNavigate('automations')}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-xl transition cursor-pointer flex items-center gap-1.5"
            >
              <span>View Scheduled Automations</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Create Automation Form */}
      <form onSubmit={handleSchedule} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6 shadow-xl">
        {/* Contact Selector */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
            <span>Customer Contact *</span>
            <button
              type="button"
              onClick={() => onNavigate('contacts')}
              className="text-[11px] text-emerald-400 hover:underline cursor-pointer"
            >
              + Add new contact
            </button>
          </label>
          <select
            id="automation-customer-select"
            required
            value={selectedContactId}
            onChange={(e) => setSelectedContactId(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 transition cursor-pointer"
          >
            <option value="">-- Select Contact --</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id} disabled={!c.optIn}>
                {c.name} ({c.phone}) {!c.optIn ? '[OPTED OUT]' : ''}
              </option>
            ))}
          </select>
          {selectedContact && !selectedContact.optIn && (
            <p className="text-xs text-rose-400 flex items-center gap-1 mt-1">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Selected contact has opted out. Messages cannot be sent to opted-out contacts.
            </p>
          )}
        </div>

        {/* WhatsApp Template Selector */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
            <span>WhatsApp Template (Approved only) *</span>
            <button
              type="button"
              onClick={() => onNavigate('templates')}
              className="text-[11px] text-emerald-400 hover:underline cursor-pointer"
            >
              View Templates
            </button>
          </label>
          <select
            id="automation-template-select"
            required
            value={selectedTemplateId}
            onChange={(e) => handleTemplateChange(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white font-mono focus:outline-none focus:border-emerald-500 transition cursor-pointer"
          >
            <option value="">-- Select Approved Template --</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.language}) - {t.category}
              </option>
            ))}
          </select>
        </div>

        {/* Dynamic Template Variables */}
        {selectedTemplate && selectedTemplate.variableCount > 0 && (
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
              <Sparkles className="w-4 h-4" />
              <span>Template Variables ({selectedTemplate.name})</span>
            </div>

            <div className="space-y-3">
              {Array.from({ length: selectedTemplate.variableCount }).map((_, idx) => {
                const varNum = String(idx + 1);
                return (
                  <div key={varNum} className="space-y-1">
                    <label className="text-xs text-slate-400 font-mono">
                      Variable {varNum} <code className="text-emerald-300 font-bold">{`{{${varNum}}}`}</code>
                    </label>
                    <input
                      id={`template-variable-${varNum}`}
                      type="text"
                      required
                      value={variables[varNum] || ''}
                      onChange={(e) => handleVariableChange(varNum, e.target.value)}
                      placeholder={`Value for {{${varNum}}}`}
                      className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500 transition"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Scheduling Details */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-800">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              <span>Schedule Date *</span>
            </label>
            <input
              id="automation-date-input"
              type="date"
              required
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 transition"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>Schedule Time *</span>
            </label>
            <input
              id="automation-time-input"
              type="time"
              required
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 transition"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Timezone</label>
            <select
              id="automation-timezone-select"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 transition cursor-pointer"
            >
              <option value="Asia/Kolkata">Asia/Kolkata (IST +5:30)</option>
              <option value="UTC">UTC (Coordinated Universal Time)</option>
              <option value="America/New_York">America/New_York (EST)</option>
              <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
              <option value="Europe/London">Europe/London (GMT/BST)</option>
              <option value="Asia/Dubai">Asia/Dubai (GST +4:00)</option>
              <option value="Asia/Singapore">Asia/Singapore (SGT +8:00)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-slate-800">
          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-500" />
            <span>Executed idempotently via database queue</span>
          </div>

          <button
            id="schedule-message-button"
            type="submit"
            disabled={submitting || (selectedContact && !selectedContact.optIn)}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition cursor-pointer shadow-lg shadow-emerald-950/50 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            <span>{submitting ? 'Scheduling...' : 'Schedule Message'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
