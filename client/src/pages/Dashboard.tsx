import { useEffect, useState } from 'react';
import api from '../lib/api';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  BarChart, Bar,
} from 'recharts';
import {
  EnvelopeIcon,
  EnvelopeOpenIcon,
  StarIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  PaperClipIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

const COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F97316', '#10B981', '#6366F1', '#EF4444', '#14B8A6', '#F59E0B', '#6B7280'];

interface DashboardStats {
  totalEmails: number;
  unreadCount: number;
  starredCount: number;
  spamCount: number;
  accountStats: Array<{ id: string; email: string; displayName: string; provider: string; color: string; unread: number; total: number }>;
  categoryBreakdown: Array<{ category: string; count: number }>;
  topSenders: Array<{ email: string; count: number }>;
  attachmentStats: { totalCount: number; totalSize: number };
  aiStats: Array<{ action: string; count: number }>;
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [emailsOverTime, setEmailsOverTime] = useState<Array<{ date: string; received: number; sent: number }>>([]);
  const [responseTime, setResponseTime] = useState<{ avgResponseTimeHours: number; totalReplies: number } | null>(null);
  const [days, setDays] = useState('30');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [statsRes, timeRes, rtRes] = await Promise.all([
          api.get('/dashboard/stats', { params: { days } }),
          api.get('/dashboard/emails-over-time', { params: { days } }),
          api.get('/dashboard/response-time'),
        ]);
        setStats(statsRes.data);
        setEmailsOverTime(timeRes.data);
        setResponseTime(rtRes.data);
      } catch (error) {
        console.error('Dashboard load error:', error);
      }
      setLoading(false);
    }
    load();
  }, [days]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <select
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className="px-3 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
        >
          <option value="7">Last 7 days</option>
          <option value="14">Last 14 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon={EnvelopeIcon} label="Total Emails" value={stats.totalEmails} color="blue" />
        <StatCard icon={EnvelopeOpenIcon} label="Unread" value={stats.unreadCount} color="orange" />
        <StatCard icon={StarIcon} label="Starred" value={stats.starredCount} color="yellow" />
        <StatCard icon={ExclamationTriangleIcon} label="Spam" value={stats.spamCount} color="red" />
      </div>

      {/* Account Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {stats.accountStats.map((acc) => (
          <div key={acc.id} className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: acc.color }} />
              <span className="font-medium text-gray-900 dark:text-white text-sm truncate">
                {acc.displayName || acc.email}
              </span>
              <span className="text-xs text-gray-500 uppercase">{acc.provider}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold text-gray-900 dark:text-white">{acc.unread}</span>
              <span className="text-sm text-gray-500">unread of {acc.total}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Emails Over Time */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Email Volume</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={emailsOverTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="received" stroke="#3B82F6" strokeWidth={2} dot={false} name="Received" />
              <Line type="monotone" dataKey="sent" stroke="#10B981" strokeWidth={2} dot={false} name="Sent" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Category Breakdown */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Categories</h3>
          {stats.categoryBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={stats.categoryBreakdown} dataKey="count" nameKey="category" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name} (${value})`}>
                  {stats.categoryBreakdown.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-gray-400">
              No categorized emails yet. Use AI to categorize.
            </div>
          )}
        </div>
      </div>

      {/* Second Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Top Contacts */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Top Contacts</h3>
          {stats.topSenders.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={stats.topSenders.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="email" type="category" tick={{ fontSize: 10 }} width={150} />
                <Tooltip />
                <Bar dataKey="count" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-gray-400">
              No data yet
            </div>
          )}
        </div>

        {/* Stats Panel */}
        <div className="space-y-4">
          {/* Response Time */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-2">
              <ClockIcon className="w-5 h-5 text-blue-600" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Response Time</h3>
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {responseTime?.avgResponseTimeHours || 0}h
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Average response time ({responseTime?.totalReplies || 0} replies tracked)
            </p>
          </div>

          {/* Attachment Stats */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-2">
              <PaperClipIcon className="w-5 h-5 text-green-600" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Attachments</h3>
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {stats.attachmentStats.totalCount}
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Total size: {(stats.attachmentStats.totalSize / 1024 / 1024).toFixed(1)} MB
            </p>
          </div>

          {/* AI Actions */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-3">
              <SparklesIcon className="w-5 h-5 text-purple-600" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">AI Actions</h3>
            </div>
            {stats.aiStats.length > 0 ? (
              <div className="space-y-2">
                {stats.aiStats.map((stat) => (
                  <div key={stat.action} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400 capitalize">{stat.action.replace('-', ' ')}</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{stat.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No AI actions yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    orange: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
    yellow: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400',
    red: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${colorMap[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
      <div className="text-sm text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}
