import { useState, useEffect } from 'react';
import api from '../lib/api';
import { useTheme } from '../hooks/useTheme';
import {
  Cog6ToothIcon,
  KeyIcon,
  BellIcon,
  SparklesIcon,
  UserIcon,
  SunIcon,
  MoonIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface UserSettings {
  theme: string;
  aiEnabled: boolean;
  aiAutoReply: boolean;
  aiAutoSummarize: boolean;
  aiAutoCategorize: boolean;
  aiAutoSpamDetect: boolean;
  notifyNewEmail: boolean;
  notifyAiAction: boolean;
  openaiApiKey: string;
  signature: string;
}

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState<UserSettings>({
    theme: 'system',
    aiEnabled: true,
    aiAutoReply: false,
    aiAutoSummarize: true,
    aiAutoCategorize: true,
    aiAutoSpamDetect: true,
    notifyNewEmail: true,
    notifyAiAction: false,
    openaiApiKey: '',
    signature: '',
  });
  const [profile, setProfile] = useState({ name: '', email: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [saving, setSaving] = useState(false);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);

  useEffect(() => {
    fetchSettings();
    fetchProfile();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data } = await api.get('/settings');
      setSettings((prev) => ({ ...prev, ...data }));
    } catch { /* ignore */ }
  };

  const fetchProfile = async () => {
    try {
      const { data } = await api.get('/auth/me');
      setProfile({ name: data.name, email: data.email });
    } catch { /* ignore */ }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...settings };
      // Don't send the masked key back — only send if user typed a new key
      if (payload.openaiApiKey && (payload.openaiApiKey.includes('••••') || !payload.openaiApiKey.startsWith('sk-'))) {
        delete (payload as any).openaiApiKey;
      }
      await api.patch('/settings', payload);
      toast.success('Settings saved');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save settings');
    }
    setSaving(false);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      return toast.error('Passwords do not match');
    }
    if (passwordForm.newPassword.length < 6) {
      return toast.error('Password must be at least 6 characters');
    }
    try {
      await api.post('/auth/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      toast.success('Password changed');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to change password');
    }
  };

  const Toggle = ({ enabled, onChange, label }: { enabled: boolean; onChange: (v: boolean) => void; label: string }) => (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
      <button
        onClick={() => onChange(!enabled)}
        className={`w-10 h-6 rounded-full relative transition-colors ${enabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}`}
      >
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${enabled ? 'left-4.5' : 'left-0.5'}`} />
      </button>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Cog6ToothIcon className="w-6 h-6" /> Settings
        </h1>

        {/* Profile */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <UserIcon className="w-5 h-5" /> Profile
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
              <input type="text" readOnly value={profile.name}
                className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
              <input type="email" readOnly value={profile.email}
                className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
            </div>
          </div>
        </section>

        {/* Change Password */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <KeyIcon className="w-5 h-5" /> Change Password
          </h3>
          <form onSubmit={handlePasswordChange} className="space-y-3">
            <input type="password" placeholder="Current password" value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            <div className="grid grid-cols-2 gap-3">
              <input type="password" placeholder="New password" value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              <input type="password" placeholder="Confirm new password" value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <button type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition">
              Update Password
            </button>
          </form>
        </section>

        {/* Theme */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <SunIcon className="w-5 h-5" /> Appearance
          </h3>
          <div className="flex gap-3">
            {(['light', 'dark', 'system'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition ${
                  theme === t
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {t === 'light' && <SunIcon className="w-4 h-4" />}
                {t === 'dark' && <MoonIcon className="w-4 h-4" />}
                {t === 'system' && <Cog6ToothIcon className="w-4 h-4" />}
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </section>

        {/* AI Settings */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <SparklesIcon className="w-5 h-5" /> AI Features
          </h3>
          <div className="space-y-1">
            <Toggle label="Enable AI Features" enabled={settings.aiEnabled} onChange={(v) => setSettings({ ...settings, aiEnabled: v })} />
            <Toggle label="Auto-summarize incoming emails" enabled={settings.aiAutoSummarize} onChange={(v) => setSettings({ ...settings, aiAutoSummarize: v })} />
            <Toggle label="Auto-categorize emails" enabled={settings.aiAutoCategorize} onChange={(v) => setSettings({ ...settings, aiAutoCategorize: v })} />
            <Toggle label="Auto-detect spam" enabled={settings.aiAutoSpamDetect} onChange={(v) => setSettings({ ...settings, aiAutoSpamDetect: v })} />
            <Toggle label="Enable AI auto-reply suggestions" enabled={settings.aiAutoReply} onChange={(v) => setSettings({ ...settings, aiAutoReply: v })} />
          </div>
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">OpenAI API Key</label>
            <div className="flex gap-2">
              <input
                type={apiKeyVisible ? 'text' : 'password'}
                value={settings.openaiApiKey}
                onChange={(e) => setSettings({ ...settings, openaiApiKey: e.target.value })}
                placeholder="sk-..."
                className="flex-1 px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none font-mono"
              />
              <button
                type="button"
                onClick={() => setApiKeyVisible(!apiKeyVisible)}
                className="px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
              >
                {apiKeyVisible ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">Your key is encrypted at rest. Required for AI features.</p>
          </div>
        </section>

        {/* Notifications */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-4">
            <BellIcon className="w-5 h-5" /> Notifications
          </h3>
          <Toggle label="Notify on new emails" enabled={settings.notifyNewEmail} onChange={(v) => setSettings({ ...settings, notifyNewEmail: v })} />
          <Toggle label="Notify on AI actions" enabled={settings.notifyAiAction} onChange={(v) => setSettings({ ...settings, notifyAiAction: v })} />
        </section>

        {/* Email Signature */}
        <section className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Email Signature</h3>
          <textarea
            value={settings.signature}
            onChange={(e) => setSettings({ ...settings, signature: e.target.value })}
            rows={4}
            placeholder="Your email signature..."
            className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
          />
        </section>

        {/* Save */}
        <div className="flex justify-end pb-8">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
