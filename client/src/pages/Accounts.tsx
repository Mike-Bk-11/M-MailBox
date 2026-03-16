import { useState } from 'react';
import { useMailStore } from '../stores/mailStore';
import api from '../lib/api';
import {
  PlusIcon,
  TrashIcon,
  EnvelopeIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const PROVIDER_PRESETS: Record<string, { imapHost: string; imapPort: string; smtpHost: string; smtpPort: string; color: string; label: string; helpText: string; helpUrl: string }> = {
  gmail: {
    imapHost: 'imap.gmail.com', imapPort: '993',
    smtpHost: 'smtp.gmail.com', smtpPort: '587',
    color: '#EA4335',
    label: 'Gmail / Google Workspace',
    helpText: 'Use an App Password (not your regular password). Go to Google Account → Security → 2-Step Verification → App Passwords.',
    helpUrl: 'https://myaccount.google.com/apppasswords',
  },
  outlook: {
    imapHost: 'outlook.office365.com', imapPort: '993',
    smtpHost: 'smtp.office365.com', smtpPort: '587',
    color: '#0078D4',
    label: 'Outlook / Microsoft 365',
    helpText: 'Use an App Password if 2FA is enabled. Go to Microsoft Account → Security → App Passwords.',
    helpUrl: 'https://account.live.com/proofs/AppPassword',
  },
  yahoo: {
    imapHost: 'imap.mail.yahoo.com', imapPort: '993',
    smtpHost: 'smtp.mail.yahoo.com', smtpPort: '587',
    color: '#6001D2',
    label: 'Yahoo Mail',
    helpText: 'Generate an App Password at Yahoo Account → Security → Generate App Password.',
    helpUrl: 'https://login.yahoo.com/account/security',
  },
  zoho: {
    imapHost: 'imap.zoho.com', imapPort: '993',
    smtpHost: 'smtp.zoho.com', smtpPort: '587',
    color: '#F4B400',
    label: 'Zoho Mail',
    helpText: 'Enable IMAP access in Zoho Mail Settings → Mail Accounts → IMAP Access. Use an App Password if 2FA is on.',
    helpUrl: 'https://accounts.zoho.com/home#security/security_pwd',
  },
  icloud: {
    imapHost: 'imap.mail.me.com', imapPort: '993',
    smtpHost: 'smtp.mail.me.com', smtpPort: '587',
    color: '#007AFF',
    label: 'iCloud Mail',
    helpText: 'Generate an App-Specific Password at appleid.apple.com → Sign-In and Security → App-Specific Passwords.',
    helpUrl: 'https://appleid.apple.com/account/manage',
  },
  custom: {
    imapHost: '', imapPort: '993',
    smtpHost: '', smtpPort: '587',
    color: '#6B7280',
    label: 'Other / Custom IMAP',
    helpText: 'Enter your provider\'s IMAP and SMTP server details. Check your email provider\'s help docs for the correct settings.',
    helpUrl: '',
  },
};

export default function Accounts() {
  const { accounts, fetchAccounts } = useMailStore();
  const [showAdd, setShowAdd] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: '', displayName: '', imapHost: '', imapPort: '993',
    smtpHost: '', smtpPort: '587', password: '', color: '#3B82F6',
  });
  const [saving, setSaving] = useState(false);

  const applyPreset = (key: string) => {
    if (key === 'outlook') {
      handleConnectOutlook();
      return;
    }
    const preset = PROVIDER_PRESETS[key];
    setSelectedPreset(key);
    setForm((prev) => ({
      ...prev,
      imapHost: preset.imapHost,
      imapPort: preset.imapPort,
      smtpHost: preset.smtpHost,
      smtpPort: preset.smtpPort,
      color: preset.color,
    }));
  };

  const handleConnectOutlook = async () => {
    try {
      const { data } = await api.get('/accounts/microsoft/auth-url');
      window.location.href = data.url;
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to start Outlook OAuth');
    }
  };

  const handleAddImap = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/accounts/imap', form);
      toast.success('Account added!');
      setShowAdd(false);
      setSelectedPreset(null);
      setForm({ email: '', displayName: '', imapHost: '', imapPort: '993', smtpHost: '', smtpPort: '587', password: '', color: '#3B82F6' });
      fetchAccounts();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to add account');
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure? This will delete the account and all synced emails.')) return;
    try {
      await api.delete(`/accounts/${id}`);
      toast.success('Account deleted');
      fetchAccounts();
    } catch {
      toast.error('Failed to delete account');
    }
  };

  const providerBg: Record<string, string> = {
    gmail: 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800',
    outlook: 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800',
    imap: 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700',
  };

  const preset = selectedPreset ? PROVIDER_PRESETS[selectedPreset] : null;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Email Accounts</h1>
          <button
            onClick={() => { setShowAdd(!showAdd); setSelectedPreset(null); }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition"
          >
            <PlusIcon className="w-4 h-4" />
            Add Account
          </button>
        </div>

        {/* Add Account Section */}
        {showAdd && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 mb-6 shadow-sm border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Connect Email Account</h3>

            {!selectedPreset ? (
              <>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  Choose your email provider. Works with any email from any company or domain — Gmail, Outlook, Yahoo, Zoho, iCloud, or any IMAP provider.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {Object.entries(PROVIDER_PRESETS).map(([key, p]) => (
                    <button
                      key={key}
                      onClick={() => applyPreset(key)}
                      className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 transition"
                    >
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: p.color + '20' }}>
                        <EnvelopeIcon className="w-5 h-5" style={{ color: p.color }} />
                      </div>
                      <span className="font-medium text-sm text-gray-900 dark:text-white">{p.label}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <form onSubmit={handleAddImap} className="space-y-4">
                {/* Help banner */}
                <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <InformationCircleIcon className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-blue-800 dark:text-blue-300">
                    <p>{preset?.helpText}</p>
                    {preset?.helpUrl && (
                      <a href={preset.helpUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-block mt-1 text-blue-600 dark:text-blue-400 underline hover:no-underline text-xs">
                        Open {selectedPreset === 'custom' ? 'provider docs' : PROVIDER_PRESETS[selectedPreset].label + ' security settings'} →
                      </a>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email Address</label>
                    <input
                      type="email" required
                      value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="you@company.com"
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Display Name</label>
                    <input
                      type="text"
                      value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                      placeholder="My Work Email"
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">IMAP Host</label>
                    <input
                      type="text" required placeholder="imap.example.com"
                      value={form.imapHost} onChange={(e) => setForm({ ...form, imapHost: e.target.value })}
                      className={`w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none ${selectedPreset !== 'custom' ? 'bg-gray-50 dark:bg-gray-600' : ''}`}
                      readOnly={selectedPreset !== 'custom'}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">IMAP Port</label>
                    <input
                      type="number" required
                      value={form.imapPort} onChange={(e) => setForm({ ...form, imapPort: e.target.value })}
                      className={`w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none ${selectedPreset !== 'custom' ? 'bg-gray-50 dark:bg-gray-600' : ''}`}
                      readOnly={selectedPreset !== 'custom'}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">SMTP Host</label>
                    <input
                      type="text" required placeholder="smtp.example.com"
                      value={form.smtpHost} onChange={(e) => setForm({ ...form, smtpHost: e.target.value })}
                      className={`w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none ${selectedPreset !== 'custom' ? 'bg-gray-50 dark:bg-gray-600' : ''}`}
                      readOnly={selectedPreset !== 'custom'}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">SMTP Port</label>
                    <input
                      type="number" required
                      value={form.smtpPort} onChange={(e) => setForm({ ...form, smtpPort: e.target.value })}
                      className={`w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none ${selectedPreset !== 'custom' ? 'bg-gray-50 dark:bg-gray-600' : ''}`}
                      readOnly={selectedPreset !== 'custom'}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {selectedPreset === 'custom' ? 'Password' : 'App Password'}
                    </label>
                    <input
                      type="password" required
                      value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Color</label>
                    <input
                      type="color"
                      value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })}
                      className="w-full h-10 rounded-xl border border-gray-300 dark:border-gray-600 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="flex gap-3 justify-end">
                  <button type="button" onClick={() => { setSelectedPreset(null); setShowAdd(false); }} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition">
                    Cancel
                  </button>
                  <button type="submit" disabled={saving} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition disabled:opacity-50">
                    {saving ? 'Adding...' : 'Add Account'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Account List */}
        <div className="space-y-3">
          {accounts.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <EnvelopeIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg">No email accounts connected</p>
              <p className="text-sm mt-1">Add your first account to get started</p>
            </div>
          ) : (
            accounts.map((account) => (
              <div key={account.id} className={`rounded-2xl p-4 border ${providerBg[account.provider] || providerBg.imap}`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: account.color + '20' }}>
                    <EnvelopeIcon className="w-5 h-5" style={{ color: account.color }} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">{account.displayName || account.email}</span>
                      <span className="text-xs uppercase px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                        {account.provider}
                      </span>
                    </div>
                    <span className="text-sm text-gray-500">{account.email}</span>
                  </div>
                  <button
                    onClick={() => handleDelete(account.id)}
                    className="p-2 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-600 transition"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
