import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import {
  BirthdaySettings,
  BirthdayWishContactSummary,
  BirthdayWishHistoryItem,
  MessageTemplate,
} from '../types.ts';
import {
  Cake,
  Calendar as CalendarIcon,
  ListFilter,
  Settings,
  History,
  Send,
  Clock,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Edit3,
  Search,
  Sparkles,
  PartyPopper,
  X,
  Check,
  Power,
  Phone,
  CalendarDays,
  UserCheck,
  ExternalLink,
} from 'lucide-react';

type TabType = 'list' | 'calendar' | 'history' | 'settings';
type FilterType = 'all' | 'today' | 'upcoming' | 'this_month';

export const BirthdayView: React.FC = () => {
  const { fetchWithAuth } = useAuth();

  // State
  const [activeTab, setActiveTab] = useState<TabType>('list');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Data
  const [summaryList, setSummaryList] = useState<BirthdayWishContactSummary[]>([]);
  const [historyList, setHistoryList] = useState<BirthdayWishHistoryItem[]>([]);
  const [settings, setSettings] = useState<BirthdaySettings>({
    enabled: true,
    defaultSendTime: '09:00',
    defaultTemplateId: 1,
    customMessage: '🎉 Happy Birthday {{name}}! Wishing you a fantastic year filled with happiness, health, and success! 🎂🎈',
    timezone: 'Asia/Kolkata',
  });
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);

  // Modals & Editing
  const [editingWish, setEditingWish] = useState<BirthdayWishContactSummary | null>(null);
  const [customWishText, setCustomWishText] = useState('');
  const [editScheduledTime, setEditScheduledTime] = useState('');
  const [editTemplateId, setEditTemplateId] = useState<number>(1);
  const [savingEdit, setSavingEdit] = useState(false);

  // Quick Send Modal
  const [quickSendContact, setQuickSendContact] = useState<BirthdayWishContactSummary | null>(null);
  const [quickSendText, setQuickSendText] = useState('');
  const [sendingNow, setSendingNow] = useState(false);

  // Calendar navigation state
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());

  // Show Toast
  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Load Data
  const loadData = async (retries = 2) => {
    setLoading(true);
    try {
      const [sumRes, setRes, histRes, tmplRes] = await Promise.all([
        fetchWithAuth('/api/wishflow/summary'),
        fetchWithAuth('/api/wishflow/settings'),
        fetchWithAuth('/api/wishflow/history'),
        fetchWithAuth('/api/whatsapp/templates'),
      ]);

      const safeJson = async <T,>(res: Response, fallback: T): Promise<T> => {
        if (!res.ok) return fallback;
        const ct = res.headers.get('content-type');
        if (!ct || !ct.includes('application/json')) return fallback;
        try {
          return await res.json();
        } catch {
          return fallback;
        }
      };

      const sumData = await safeJson(sumRes, null);
      if (sumData) setSummaryList(sumData);

      const setData = await safeJson(setRes, null);
      if (setData) setSettings(setData);

      const histData = await safeJson(histRes, null);
      if (histData) setHistoryList(histData);

      const tmplData = await safeJson(tmplRes, null);
      if (tmplData) setTemplates(tmplData);
    } catch (err: any) {
      if (retries > 0) {
        setTimeout(() => loadData(retries - 1), 800);
      } else {
        console.warn('Notice loading Birthday WishFlow data:', err?.message || err);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Sync All Birthdays
  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      const res = await fetchWithAuth('/api/wishflow/sync', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || 'All birthdays synced and scheduled successfully!');
        await loadData();
      } else {
        showToast(data.error || 'Failed to sync birthdays', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Sync failed', 'error');
    } finally {
      setSyncing(false);
    }
  };

  // Toggle Contact Automation
  const handleToggleContact = async (contactId: number, currentStatus: boolean) => {
    const nextStatus = !currentStatus;
    try {
      const res = await fetchWithAuth(`/api/wishflow/contacts/${contactId}/toggle`, {
        method: 'POST',
        body: JSON.stringify({ enabled: nextStatus }),
      });
      if (res.ok) {
        setSummaryList((prev) =>
          prev.map((c) =>
            c.contactId === contactId
              ? {
                  ...c,
                  birthdayAutomationEnabled: nextStatus,
                  automationStatus: nextStatus ? 'SCHEDULED' : 'PAUSED',
                }
              : c
          )
        );
        showToast(
          nextStatus
            ? 'Birthday WishFlow enabled for contact'
            : 'Birthday WishFlow paused for contact'
        );
      }
    } catch (err) {
      showToast('Failed to toggle contact automation', 'error');
    }
  };

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSyncing(true);
    try {
      const res = await fetchWithAuth('/api/wishflow/settings', {
        method: 'POST',
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        showToast('WishFlow settings updated and scheduled dates refreshed!');
        await loadData();
      } else {
        showToast('Failed to update settings', 'error');
      }
    } catch (err) {
      showToast('Error saving settings', 'error');
    } finally {
      setSyncing(false);
    }
  };

  // Open Edit Wish Modal
  const openEditModal = (item: BirthdayWishContactSummary) => {
    setEditingWish(item);
    setCustomWishText(
      item.customMessage ||
        settings.customMessage
          .replace(/{{name}}/g, item.contactName)
          .replace(/{{age}}/g, String(item.ageTurning))
    );
    setEditTemplateId(item.templateId || settings.defaultTemplateId || 1);
    setEditScheduledTime(
      item.nextScheduledTime
        ? item.nextScheduledTime.slice(0, 16)
        : new Date().toISOString().slice(0, 16)
    ); // YYYY-MM-DDTHH:mm
  };

  // Save Edited Wish
  const handleSaveWishEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWish) return;
    setSavingEdit(true);
    try {
      if (editingWish.automationId) {
        const res = await fetchWithAuth(`/api/wishflow/automations/${editingWish.automationId}`, {
          method: 'PUT',
          body: JSON.stringify({
            customMessage: customWishText,
            templateId: editTemplateId,
            scheduledAt: new Date(editScheduledTime).toISOString(),
          }),
        });
        if (res.ok) {
          showToast('Birthday wish message and schedule updated!');
          setEditingWish(null);
          await loadData();
        } else {
          showToast('Failed to update wish schedule', 'error');
        }
      } else {
        showToast('Wish automation not found to update', 'error');
      }
    } catch (err) {
      showToast('Error saving wish changes', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  // Open Quick Send Modal
  const openSendNowModal = (item: BirthdayWishContactSummary) => {
    setQuickSendContact(item);
    setQuickSendText(
      item.customMessage ||
        settings.customMessage
          .replace(/{{name}}/g, item.contactName)
          .replace(/{{age}}/g, String(item.ageTurning))
    );
  };

  // Execute Send Now
  const handleExecuteSendNow = async () => {
    if (!quickSendContact) return;
    setSendingNow(true);
    try {
      const res = await fetchWithAuth(`/api/wishflow/contacts/${quickSendContact.contactId}/send-now`, {
        method: 'POST',
        body: JSON.stringify({ customMessage: quickSendText }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Birthday wish sent immediately to ${quickSendContact.contactName}! 🎂`);
        setQuickSendContact(null);
        await loadData();
      } else {
        showToast(data.error || 'Failed to send message via WhatsApp', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to send birthday wish', 'error');
    } finally {
      setSendingNow(false);
    }
  };

  // Filtered Contacts
  const filteredList = useMemo(() => {
    return summaryList.filter((item) => {
      // Filter tab
      if (filterType === 'today' && !item.isToday) return false;
      if (filterType === 'upcoming' && (item.daysUntilBirthday > 30 || item.isToday)) return false;
      if (filterType === 'this_month' && !item.isThisMonth) return false;

      // Search
      if (search) {
        const q = search.toLowerCase();
        return item.contactName.toLowerCase().includes(q) || item.contactPhone.includes(q);
      }
      return true;
    });
  }, [summaryList, filterType, search]);

  // Statistics
  const stats = useMemo(() => {
    const todayCount = summaryList.filter((c) => c.isToday).length;
    const upcomingMonthCount = summaryList.filter((c) => c.isThisMonth).length;
    const activeAutomations = summaryList.filter((c) => c.birthdayAutomationEnabled).length;
    return {
      total: summaryList.length,
      today: todayCount,
      thisMonth: upcomingMonthCount,
      activeAutomations,
    };
  }, [summaryList]);

  // Calendar Helpers
  const calendarDays = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay(); // 0 = Sun, 1 = Mon ...

    const cells: Array<{
      dayNumber: number;
      isCurrentMonth: boolean;
      dateStr: string;
      contactsOnThisDay: BirthdayWishContactSummary[];
      isToday: boolean;
    }> = [];

    const now = new Date();
    const isThisActualMonth = now.getFullYear() === year && now.getMonth() === month;

    // Blank cells before first day
    for (let i = 0; i < startDayOfWeek; i++) {
      cells.push({
        dayNumber: 0,
        isCurrentMonth: false,
        dateStr: '',
        contactsOnThisDay: [],
        isToday: false,
      });
    }

    // Days of current month
    for (let d = 1; d <= daysInMonth; d++) {
      const isToday = isThisActualMonth && now.getDate() === d;
      const contactsOnThisDay = summaryList.filter((c) => {
        return c.birthMonth === month + 1 && c.birthDay === d;
      });

      const mm = String(month + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      cells.push({
        dayNumber: d,
        isCurrentMonth: true,
        dateStr: `${year}-${mm}-${dd}`,
        contactsOnThisDay,
        isToday,
      });
    }

    return cells;
  }, [calendarDate, summaryList]);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm shadow-xl transition-all ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-800 text-emerald-200'
              : 'bg-rose-950/90 border-rose-800 text-rose-200'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 md:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
              <Cake className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white tracking-tight">
                  Birthday WishFlow
                </h1>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Annual Auto-Pilot
                </span>
                {settings.enabled ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    System Active
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
                    System Paused
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                Automatically detects contact birthdays every year, schedules WhatsApp greeting templates with personalized details, and tracks delivery status seamlessly.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              id="sync-birthdays-btn"
              onClick={handleSyncAll}
              disabled={syncing}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-slate-600 text-slate-200 hover:text-white rounded-xl text-xs font-medium inline-flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
              title="Rescan contacts and update schedules"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Birthdays'}
            </button>
            <button
              id="wishflow-settings-btn"
              onClick={() => setActiveTab('settings')}
              className={`px-3.5 py-2 rounded-xl text-xs font-medium inline-flex items-center gap-2 transition cursor-pointer border ${
                activeTab === 'settings'
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                  : 'bg-slate-850 hover:bg-slate-800 text-slate-300 border-slate-750'
              }`}
            >
              <Settings className="w-3.5 h-3.5 text-amber-400" />
              Configure WishFlow
            </button>
          </div>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-slate-800/80">
          <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Total Birthdays</span>
              <UserCheck className="w-3.5 h-3.5 text-slate-500" />
            </div>
            <div className="text-lg font-bold text-white mt-1">{stats.total}</div>
            <p className="text-[10px] text-slate-500 mt-0.5">Contacts with DOB recorded</p>
          </div>

          <div className="p-3 bg-slate-950/60 border border-amber-500/20 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs text-amber-300 font-medium">Today's Birthdays</span>
              <PartyPopper className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-lg font-bold text-amber-400 mt-1">{stats.today}</div>
            <p className="text-[10px] text-slate-500 mt-0.5">Celebrating today</p>
          </div>

          <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">This Month</span>
              <CalendarDays className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <div className="text-lg font-bold text-indigo-300 mt-1">{stats.thisMonth}</div>
            <p className="text-[10px] text-slate-500 mt-0.5">Due this calendar month</p>
          </div>

          <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Auto-Pilot Active</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-lg font-bold text-emerald-400 mt-1">
              {stats.activeAutomations}
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">Contacts auto-scheduling</p>
          </div>
        </div>
      </div>

      {/* Main Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-1">
        <div className="flex items-center gap-2">
          <button
            id="tab-birthday-list"
            onClick={() => setActiveTab('list')}
            className={`px-4 py-2.5 rounded-xl text-xs font-medium inline-flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'list'
                ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <ListFilter className="w-3.5 h-3.5" />
            Birthday List & Queue
          </button>

          <button
            id="tab-birthday-calendar"
            onClick={() => setActiveTab('calendar')}
            className={`px-4 py-2.5 rounded-xl text-xs font-medium inline-flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'calendar'
                ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            Birthday Calendar
          </button>

          <button
            id="tab-birthday-history"
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2.5 rounded-xl text-xs font-medium inline-flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'history'
                ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Delivery History ({historyList.length})
          </button>

          <button
            id="tab-birthday-settings"
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2.5 rounded-xl text-xs font-medium inline-flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            Settings & Message
          </button>
        </div>
      </div>

      {/* TAB 1: BIRTHDAY LIST & QUEUE */}
      {activeTab === 'list' && (
        <div className="space-y-4">
          {/* Filters and Search Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-3 rounded-xl">
            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              <button
                onClick={() => setFilterType('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                  filterType === 'all'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-750'
                }`}
              >
                All ({summaryList.length})
              </button>
              <button
                onClick={() => setFilterType('today')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                  filterType === 'today'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-750'
                }`}
              >
                <PartyPopper className="w-3 h-3" />
                Today ({stats.today})
              </button>
              <button
                onClick={() => setFilterType('upcoming')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                  filterType === 'upcoming'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-750'
                }`}
              >
                Upcoming (30 days)
              </button>
              <button
                onClick={() => setFilterType('this_month')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                  filterType === 'this_month'
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-750'
                }`}
              >
                This Month ({stats.thisMonth})
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search contact or phone..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-amber-500 transition"
              />
            </div>
          </div>

          {/* Contact Birthday Cards / Table */}
          {loading ? (
            <div className="p-12 text-center text-slate-500 text-sm bg-slate-900/50 border border-slate-800 rounded-2xl">
              Loading birthday contacts...
            </div>
          ) : filteredList.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-sm bg-slate-900/50 border border-slate-800 rounded-2xl space-y-2">
              <Cake className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-slate-300 font-medium">No contacts match this filter</p>
              <p className="text-xs text-slate-500">
                Ensure contacts have a Date of Birth entered in the Contacts tab.
              </p>
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase bg-slate-950/60">
                      <th className="py-3 px-4 font-medium">Customer</th>
                      <th className="py-3 px-4 font-medium">Date of Birth</th>
                      <th className="py-3 px-4 font-medium">Countdown / Turning</th>
                      <th className="py-3 px-4 font-medium">Next Wish Schedule</th>
                      <th className="py-3 px-4 font-medium">WishFlow Status</th>
                      <th className="py-3 px-4 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredList.map((item) => (
                      <tr key={item.contactId} className="hover:bg-slate-800/40 transition">
                        {/* Customer */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 font-bold text-xs flex items-center justify-center shrink-0">
                              {item.contactName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span className="font-medium text-white text-sm block">
                                {item.contactName}
                              </span>
                              <span className="font-mono text-xs text-slate-400 flex items-center gap-1">
                                <Phone className="w-3 h-3 text-emerald-400" />
                                {item.contactPhone}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Date of Birth */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5 text-xs text-slate-200">
                            <Cake className="w-3.5 h-3.5 text-amber-400" />
                            <span className="font-mono font-medium">{item.dob}</span>
                          </div>
                        </td>

                        {/* Countdown / Turning Age */}
                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            {item.isToday ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                                <PartyPopper className="w-3.5 h-3.5" />
                                TODAY! (Turning {item.ageTurning})
                              </span>
                            ) : (
                              <div className="text-xs">
                                <span className="text-slate-300 font-medium">
                                  In {item.daysUntilBirthday} days
                                </span>
                                <span className="text-slate-500 ml-1.5">
                                  (Turning {item.ageTurning})
                                </span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Next Scheduled */}
                        <td className="py-3.5 px-4">
                          {item.nextScheduledTime ? (
                            <div className="text-xs">
                              <span className="text-slate-200 font-mono block">
                                {new Date(item.nextScheduledTime).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}
                              </span>
                              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                                <Clock className="w-3 h-3 text-slate-500" />
                                {new Date(item.nextScheduledTime).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500 font-mono">—</span>
                          )}
                        </td>

                        {/* WishFlow Status & Toggle */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            {/* Toggle Switch */}
                            <label
                              className="relative inline-flex items-center cursor-pointer"
                              title={
                                item.birthdayAutomationEnabled
                                  ? 'Click to pause automatic birthday wish'
                                  : 'Click to enable automatic birthday wish'
                              }
                            >
                              <input
                                type="checkbox"
                                checked={item.birthdayAutomationEnabled}
                                onChange={() =>
                                  handleToggleContact(
                                    item.contactId,
                                    item.birthdayAutomationEnabled
                                  )
                                }
                                className="sr-only peer"
                              />
                              <div className="w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-500"></div>
                            </label>

                            {/* Badge */}
                            {item.automationStatus === 'SCHEDULED' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/30">
                                <Clock className="w-3 h-3" /> Scheduled
                              </span>
                            )}
                            {item.automationStatus === 'SENT' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                                <CheckCircle2 className="w-3 h-3" /> Sent ({item.lastSentYear})
                              </span>
                            )}
                            {item.automationStatus === 'SIMULATED' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                                <CheckCircle2 className="w-3 h-3" /> Simulated
                              </span>
                            )}
                            {item.automationStatus === 'FAILED' && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-300 border border-rose-500/30">
                                <AlertCircle className="w-3 h-3" /> Failed
                              </span>
                            )}
                            {item.automationStatus === 'PAUSED' && (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400">
                                Paused
                              </span>
                            )}
                            {item.automationStatus === 'NOT_SCHEDULED' && (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-500">
                                Queuing
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right space-x-2">
                          <button
                            id={`edit-wish-${item.contactId}`}
                            onClick={() => openEditModal(item)}
                            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-amber-300 transition cursor-pointer"
                            title="Edit birthday message & schedule time"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            id={`send-now-${item.contactId}`}
                            onClick={() => openSendNowModal(item)}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 hover:text-emerald-200 text-xs font-medium inline-flex items-center gap-1 transition cursor-pointer"
                            title="Send birthday wish immediately"
                          >
                            <Send className="w-3 h-3" />
                            Send Now
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: BIRTHDAY CALENDAR */}
      {activeTab === 'calendar' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
          {/* Calendar Month Header & Navigation */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-amber-400" />
                {monthNames[calendarDate.getMonth()]} {calendarDate.getFullYear()}
              </h2>
              <span className="text-xs text-slate-400">
                ({summaryList.filter((c) => c.birthMonth === calendarDate.getMonth() + 1).length} birthdays this month)
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white transition cursor-pointer"
                title="Previous Month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCalendarDate(new Date())}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-xs text-slate-300 hover:text-white transition cursor-pointer"
              >
                Today
              </button>
              <button
                onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white transition cursor-pointer"
                title="Next Month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Weekday Labels */}
          <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-slate-400 py-1 border-b border-slate-800">
            <div>Sun</div>
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-2">
            {calendarDays.map((cell, idx) => {
              if (!cell.isCurrentMonth) {
                return (
                  <div
                    key={`blank-${idx}`}
                    className="min-h-[100px] p-2 rounded-xl bg-slate-950/30 border border-slate-800/40 opacity-30"
                  />
                );
              }

              return (
                <div
                  key={cell.dateStr}
                  className={`min-h-[100px] p-2 rounded-xl border transition flex flex-col justify-between ${
                    cell.isToday
                      ? 'bg-amber-500/10 border-amber-500/40 shadow-inner'
                      : cell.contactsOnThisDay.length > 0
                      ? 'bg-slate-950/80 border-slate-750 hover:border-slate-600'
                      : 'bg-slate-950/40 border-slate-850'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                        cell.isToday
                          ? 'bg-amber-500 text-slate-950 font-extrabold'
                          : 'text-slate-400'
                      }`}
                    >
                      {cell.dayNumber}
                    </span>
                    {cell.contactsOnThisDay.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-semibold flex items-center gap-0.5">
                        <Cake className="w-2.5 h-2.5" />
                        {cell.contactsOnThisDay.length}
                      </span>
                    )}
                  </div>

                  {/* Contact Badges inside day cell */}
                  <div className="space-y-1 overflow-y-auto max-h-[80px]">
                    {cell.contactsOnThisDay.map((c) => (
                      <div
                        key={c.contactId}
                        onClick={() => openEditModal(c)}
                        className="p-1 rounded bg-slate-850 hover:bg-slate-800 border border-slate-750 text-[11px] text-white flex items-center justify-between cursor-pointer transition"
                        title={`Turning ${c.ageTurning} - Click to customize wish`}
                      >
                        <span className="truncate font-medium pr-1">{c.contactName}</span>
                        <span className="text-[10px] text-amber-300 shrink-0 font-mono">
                          {c.ageTurning}y
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: DELIVERY HISTORY */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Birthday Wish Delivery Log</h2>
              <p className="text-xs text-slate-400">
                Audited history of automated and direct birthday wishes dispatched via WhatsApp.
              </p>
            </div>
            <button
              onClick={loadData}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-medium inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh Log
            </button>
          </div>

          {historyList.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-sm bg-slate-900/50 border border-slate-800 rounded-2xl">
              No birthday wishes delivered yet. When automations trigger or you click "Send Now", logs will appear here.
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase bg-slate-950/60">
                      <th className="py-3 px-4 font-medium">Customer</th>
                      <th className="py-3 px-4 font-medium">Year</th>
                      <th className="py-3 px-4 font-medium">Dispatched Time</th>
                      <th className="py-3 px-4 font-medium">Message Preview</th>
                      <th className="py-3 px-4 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {historyList.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-800/40 transition text-xs">
                        <td className="py-3 px-4">
                          <span className="font-medium text-white block">{item.contactName}</span>
                          <span className="font-mono text-slate-400 text-[11px]">{item.contactPhone}</span>
                        </td>
                        <td className="py-3 px-4 font-mono font-medium text-amber-300">
                          {item.year}
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          {item.executedAt ? new Date(item.executedAt).toLocaleString() : '—'}
                        </td>
                        <td className="py-3 px-4 max-w-sm truncate text-slate-300">
                          {item.messagePreview}
                        </td>
                        <td className="py-3 px-4">
                          {item.status === 'SENT' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                              <CheckCircle2 className="w-3 h-3" /> Delivered
                            </span>
                          )}
                          {item.status === 'SIMULATED' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                              <CheckCircle2 className="w-3 h-3" /> Simulated
                            </span>
                          )}
                          {item.status === 'FAILED' && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-300 border border-rose-500/30">
                              <AlertCircle className="w-3 h-3" /> Failed
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: SETTINGS & MESSAGE TEMPLATE */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Settings className="w-4 h-4 text-amber-400" />
                WishFlow Engine Configuration
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Configure global settings, send time, and template defaults for annual birthday automations.
              </p>
            </div>

            {/* Global Automation Switch */}
            <div className="flex items-center justify-between p-4 bg-slate-950/80 border border-slate-800 rounded-xl">
              <div>
                <span className="text-sm font-semibold text-white block">
                  Global Birthday Automation
                </span>
                <p className="text-xs text-slate-400">
                  When enabled, the system automatically detects each contact’s birthday every year and queues a WhatsApp wish.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>

            {/* Default Send Time & Timezone */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  Default Daily Send Time (24h)
                </label>
                <input
                  type="time"
                  required
                  value={settings.defaultSendTime}
                  onChange={(e) => setSettings({ ...settings, defaultSendTime: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 transition font-mono"
                />
                <p className="text-[11px] text-slate-500">
                  Recommended: 09:00 AM for high customer open rates.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">
                  Timezone
                </label>
                <input
                  type="text"
                  value={settings.timezone}
                  onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                  placeholder="e.g. Asia/Kolkata or America/New_York"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 transition"
                />
                <p className="text-[11px] text-slate-500">
                  Timezone for scheduling the dispatch timestamp.
                </p>
              </div>
            </div>

            {/* Meta Template Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300">
                Default Meta WhatsApp Template
              </label>
              <select
                value={settings.defaultTemplateId}
                onChange={(e) => setSettings({ ...settings, defaultTemplateId: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 transition"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.language}) {t.name === 'hello_world' ? '— WhatsApp Pre-Approved (Recommended)' : `— ${t.status}`}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500">
                The Meta-approved template used to initiate outbound WhatsApp messaging outside the 24-hour service window. Notice: WhatsApp Cloud API requires custom templates to be created and approved in Meta WhatsApp Manager; "hello_world" works out-of-the-box.
              </p>
            </div>

            {/* Greeting Template Text & Variable Interpolation */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-300">
                  Default Birthday Message / Personalized Wish Template
                </label>
                <div className="flex items-center gap-1 text-[11px] text-amber-300">
                  <Sparkles className="w-3 h-3" />
                  <span>Use {'{{name}}'} and {'{{age}}'}</span>
                </div>
              </div>
              <textarea
                rows={3}
                value={settings.customMessage}
                onChange={(e) => setSettings({ ...settings, customMessage: e.target.value })}
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 transition resize-none font-sans"
              />
              <p className="text-[11px] text-slate-500">
                Preview: {settings.customMessage.replace(/{{name}}/g, 'Rahul').replace(/{{age}}/g, '28')}
              </p>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={syncing}
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-450 text-slate-950 font-semibold rounded-xl text-xs flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {syncing ? 'Saving & Syncing...' : 'Save Settings & Sync Schedules'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* EDIT SCHEDULED WISH MODAL */}
      {editingWish && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5 relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-base font-semibold text-white flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-amber-400" />
                  Edit Birthday Wish for {editingWish.contactName}
                </h2>
                <p className="text-xs text-slate-400">
                  Turning {editingWish.ageTurning} on {editingWish.nextBirthdayDate}
                </p>
              </div>
              <button
                onClick={() => setEditingWish(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveWishEdit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Scheduled Dispatch Time</label>
                <input
                  type="datetime-local"
                  required
                  value={editScheduledTime}
                  onChange={(e) => setEditScheduledTime(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 transition font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">WhatsApp Template</label>
                <select
                  value={editTemplateId}
                  onChange={(e) => setEditTemplateId(Number(e.target.value))}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 transition"
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.language}) {t.name === 'hello_world' ? '— WhatsApp Pre-Approved (Recommended)' : `— ${t.status}`}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">
                  Personalized Wish Message (Can be edited before sending)
                </label>
                <textarea
                  rows={4}
                  value={customWishText}
                  onChange={(e) => setCustomWishText(e.target.value)}
                  className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-amber-500 transition resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingWish(null)}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-slate-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-450 text-slate-950 font-semibold rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QUICK SEND NOW MODAL */}
      {quickSendContact && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5 relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <Send className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white">Send Birthday Wish Now</h2>
                  <p className="text-xs text-slate-400">
                    To {quickSendContact.contactName} ({quickSendContact.contactPhone})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setQuickSendContact(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Message to Send</label>
                <textarea
                  rows={4}
                  value={quickSendText}
                  onChange={(e) => setQuickSendText(e.target.value)}
                  className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 transition resize-none"
                />
              </div>

              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl text-xs text-slate-400 flex items-start gap-2">
                <PartyPopper className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  This immediately sends via the official WhatsApp Cloud API and records the completion for {new Date().getFullYear()} in WishFlow history.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setQuickSendContact(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-slate-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteSendNow}
                disabled={sendingNow}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                {sendingNow ? 'Sending...' : 'Send Message Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
