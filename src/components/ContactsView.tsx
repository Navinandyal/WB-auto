import React, { useState, useEffect } from 'react';
import { Contact } from '../types.ts';
import { useAuth } from '../context/AuthContext.tsx';
import {
  UserPlus,
  Search,
  CheckCircle2,
  XCircle,
  Edit2,
  Trash2,
  Phone,
  AlertCircle,
  X,
  Cake,
} from 'lucide-react';

export const ContactsView: React.FC = () => {
  const { fetchWithAuth } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [optIn, setOptIn] = useState(true);
  const [dob, setDob] = useState('');
  const [birthdayAutomationEnabled, setBirthdayAutomationEnabled] = useState(true);
  const [notes, setNotes] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadContacts = async () => {
    setLoading(true);
    try {
      const url = search ? `/api/contacts?search=${encodeURIComponent(search)}` : '/api/contacts';
      const res = await fetchWithAuth(url);
      if (res.ok) {
        const data = await res.json();
        setContacts(data);
      }
    } catch (err) {
      console.error('Failed to load contacts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadContacts();
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const openCreateModal = () => {
    setEditingContact(null);
    setName('');
    setPhone('');
    setOptIn(true);
    setDob('');
    setBirthdayAutomationEnabled(true);
    setNotes('');
    setModalError(null);
    setShowModal(true);
  };

  const openEditModal = (contact: Contact) => {
    setEditingContact(contact);
    setName(contact.name);
    setPhone(contact.phone);
    setOptIn(contact.optIn);
    setDob(contact.dob || '');
    setBirthdayAutomationEnabled(contact.birthdayAutomationEnabled !== false);
    setNotes(contact.notes || '');
    setModalError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setModalError(null);

    try {
      const endpoint = editingContact ? `/api/contacts/${editingContact.id}` : '/api/contacts';
      const method = editingContact ? 'PUT' : 'POST';

      const res = await fetchWithAuth(endpoint, {
        method,
        body: JSON.stringify({
          name,
          phone,
          optIn,
          dob: dob || null,
          birthdayAutomationEnabled,
          notes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save contact');
      }

      setShowModal(false);
      await loadContacts();
    } catch (err: any) {
      setModalError(err.message || 'Error saving contact');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (contact: Contact) => {
    if (!window.confirm(`Are you sure you want to delete ${contact.name}?`)) {
      return;
    }

    try {
      const res = await fetchWithAuth(`/api/contacts/${contact.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await loadContacts();
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white tracking-tight">Contacts</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Customer directory with international WhatsApp numbers and opt-in compliance status.
          </p>
        </div>
        <button
          id="add-contact-button"
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition cursor-pointer shadow-md shadow-emerald-950/40 shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add Contact</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          id="contacts-search-input"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by customer name or phone number..."
          className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
        />
      </div>

      {/* Contacts Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 text-xs uppercase bg-slate-900/80">
                <th className="py-3 px-4 font-medium">Customer Name</th>
                <th className="py-3 px-4 font-medium">WhatsApp Phone</th>
                <th className="py-3 px-4 font-medium">Birthday (DOB)</th>
                <th className="py-3 px-4 font-medium">Opt-In Status</th>
                <th className="py-3 px-4 font-medium">Notes</th>
                <th className="py-3 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {contacts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500 text-sm">
                    {loading ? 'Loading contacts...' : 'No contacts found. Click "Add Contact" to create one.'}
                  </td>
                </tr>
              ) : (
                contacts.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4">
                      <span className="font-medium text-white">{c.name}</span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-300">
                      <span className="inline-flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-emerald-400" />
                        {c.phone}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      {c.dob ? (
                        <div className="flex items-center gap-1.5 text-xs">
                          <Cake className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="text-slate-200 font-medium">{c.dob}</span>
                          {c.birthdayAutomationEnabled !== false ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                              GreetSync ON
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                              Paused
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500 italic">Not set</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                          c.optIn
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                            : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                        }`}
                      >
                        {c.optIn ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" /> YES (Opted In)
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3" /> NO (Opted Out)
                          </>
                        )}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-400 max-w-xs truncate">
                      {c.notes || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button
                        id={`edit-contact-${c.id}`}
                        onClick={() => openEditModal(c)}
                        className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                        title="Edit contact"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        id={`delete-contact-${c.id}`}
                        onClick={() => handleDelete(c)}
                        className="p-1.5 rounded-lg hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                        title="Delete contact"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Contact Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5 relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-semibold text-white">
                {editingContact ? 'Edit Contact' : 'Add New Contact'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Customer Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">
                  WhatsApp Phone Number * (Normalized to international format)
                </label>
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 9876543210"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white font-mono focus:outline-none focus:border-emerald-500 transition"
                />
                <p className="text-[11px] text-slate-500">
                  Must include country code (e.g. +91 for India, +1 for US). Spaces will be normalized.
                </p>
              </div>

              {/* Date of Birth & Birthday Automation */}
              <div className="p-3.5 bg-slate-950/80 border border-slate-800/80 rounded-xl space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-amber-300 flex items-center gap-1.5">
                      <Cake className="w-3.5 h-3.5 text-amber-400" />
                      Date of Birth (DOB)
                    </label>
                    <span className="text-[11px] text-slate-500">YYYY-MM-DD</span>
                  </div>
                  <input
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500 transition"
                  />
                  <p className="text-[11px] text-slate-400">
                    Enables Birthday Automation to automatically celebrate every year on WhatsApp.
                  </p>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                  <div>
                    <span className="text-xs font-medium text-slate-200">Birthday Automation</span>
                    <p className="text-[11px] text-slate-400">Auto-schedule WhatsApp birthday greeting</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={birthdayAutomationEnabled}
                      onChange={(e) => setBirthdayAutomationEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
                  </label>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Opt-In Status</label>
                <div className="flex items-center gap-4 pt-1">
                  <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      name="optIn"
                      checked={optIn === true}
                      onChange={() => setOptIn(true)}
                      className="accent-emerald-500"
                    />
                    <span className="text-emerald-400 font-medium">YES</span> (Opted in)
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                    <input
                      type="radio"
                      name="optIn"
                      checked={optIn === false}
                      onChange={() => setOptIn(false)}
                      className="accent-rose-500"
                    />
                    <span className="text-rose-400 font-medium">NO</span> (Opted out)
                  </label>
                </div>
                <p className="text-[11px] text-slate-500">
                  The scheduler automatically rejects outbound automations if a contact is not opted in.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">Notes / Tags (Optional)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Preferred client, Bangalore branch"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm cursor-pointer transition"
                >
                  Cancel
                </button>
                <button
                  id="submit-contact-button"
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition cursor-pointer shadow-md shadow-emerald-950/40 disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingContact ? 'Update Contact' : 'Save Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
