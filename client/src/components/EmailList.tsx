import { useEffect, useState, useRef } from 'react';
import { useMailStore } from '../stores/mailStore';
import { format, isToday, isYesterday, isThisYear } from 'date-fns';
import {
  StarIcon as StarOutline,
  PaperClipIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolid } from '@heroicons/react/24/solid';

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  if (isToday(date)) return format(date, 'h:mm a');
  if (isYesterday(date)) return 'Yesterday';
  if (isThisYear(date)) return format(date, 'MMM d');
  return format(date, 'MMM d, yyyy');
}

function getSentimentColor(sentiment: string | null) {
  switch (sentiment) {
    case 'positive': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'negative': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    case 'urgent': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
    default: return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  }
}

function getPriorityColor(priority: number | null) {
  if (!priority) return '';
  if (priority >= 4) return 'border-l-4 border-l-red-500';
  if (priority === 3) return 'border-l-4 border-l-yellow-500';
  return 'border-l-4 border-l-transparent';
}

export default function EmailList() {
  const {
    emails, selectedEmail, isLoading, fetchEmails, selectEmail, toggleStar,
    selectedEmailIds, toggleSelectEmail, selectAllEmails, clearSelection, pagination, currentFolder,
  } = useMailStore();
  const [showSelectMenu, setShowSelectMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowSelectMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectByFilter = (filter: string) => {
    let ids: string[] = [];
    switch (filter) {
      case 'all':
        ids = emails.map((e) => e.id);
        break;
      case 'none':
        ids = [];
        break;
      case 'read':
        ids = emails.filter((e) => e.isRead).map((e) => e.id);
        break;
      case 'unread':
        ids = emails.filter((e) => !e.isRead).map((e) => e.id);
        break;
      case 'starred':
        ids = emails.filter((e) => e.isStarred).map((e) => e.id);
        break;
      case 'unstarred':
        ids = emails.filter((e) => !e.isStarred).map((e) => e.id);
        break;
    }
    if (filter === 'none') {
      clearSelection();
    } else {
      // Set the selected IDs directly
      useMailStore.setState({ selectedEmailIds: ids });
    }
    setShowSelectMenu(false);
  };

  const allSelected = emails.length > 0 && selectedEmailIds.length === emails.length;
  const someSelected = selectedEmailIds.length > 0 && selectedEmailIds.length < emails.length;

  if (isLoading && emails.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 p-8">
        <svg className="w-16 h-16 mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
        </svg>
        <p className="text-lg font-medium">No emails in {currentFolder}</p>
        <p className="text-sm mt-1">Your emails will appear here</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Selection toolbar */}
      {emails.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <div className="relative" ref={menuRef}>
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected; }}
                onChange={() => allSelected ? clearSelection() : selectAllEmails()}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <button
                onClick={() => setShowSelectMenu(!showSelectMenu)}
                className="p-0.5 ml-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition"
              >
                <ChevronDownIcon className="w-3.5 h-3.5 text-gray-500" />
              </button>
            </div>

            {showSelectMenu && (
              <div className="absolute left-0 top-full mt-1 w-36 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-20 py-1">
                {[
                  { key: 'all', label: 'All' },
                  { key: 'none', label: 'None' },
                  { key: 'read', label: 'Read' },
                  { key: 'unread', label: 'Unread' },
                  { key: 'starred', label: 'Starred' },
                  { key: 'unstarred', label: 'Unstarred' },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => selectByFilter(opt.key)}
                    className="w-full text-left px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="text-xs text-gray-500 dark:text-gray-400">
            {selectedEmailIds.length > 0
              ? `${selectedEmailIds.length} of ${emails.length} selected`
              : `${emails.length} emails`}
          </span>

          {/* Pagination controls */}
          {pagination.totalPages > 1 && (
            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
              </span>
              <button
                disabled={pagination.page <= 1}
                onClick={() => useMailStore.getState().fetchEmails({ page: String(pagination.page - 1) })}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 transition"
              >
                <ChevronDownIcon className="w-4 h-4 text-gray-600 dark:text-gray-400 rotate-90" />
              </button>
              <button
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => useMailStore.getState().fetchEmails({ page: String(pagination.page + 1) })}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 transition"
              >
                <ChevronDownIcon className="w-4 h-4 text-gray-600 dark:text-gray-400 -rotate-90" />
              </button>
            </div>
          )}
        </div>
      )}

      {emails.map((email) => (
        <div
          key={email.id}
          onClick={() => selectEmail(email.id)}
          className={`flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800 cursor-pointer transition hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
            selectedEmail?.id === email.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
          } ${!email.isRead ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/50 dark:bg-gray-900/50'} ${getPriorityColor(email.aiPriority)}`}
        >
          {/* Checkbox */}
          <input
            type="checkbox"
            checked={selectedEmailIds.includes(email.id)}
            onChange={(e) => { e.stopPropagation(); toggleSelectEmail(email.id); }}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
          />

          {/* Star */}
          <button
            onClick={(e) => { e.stopPropagation(); toggleStar(email.id); }}
            className="shrink-0 text-gray-300 hover:text-yellow-500 transition"
          >
            {email.isStarred
              ? <StarSolid className="w-5 h-5 text-yellow-500" />
              : <StarOutline className="w-5 h-5" />
            }
          </button>

          {/* Account color dot */}
          {email.account && (
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: email.account.color }} />
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-sm truncate ${!email.isRead ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                {email.fromName || email.fromAddress}
              </span>

              {/* AI Badges */}
              <div className="flex items-center gap-1 shrink-0">
                {email.aiCategory && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                    {email.aiCategory}
                  </span>
                )}
                {email.aiSentiment && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${getSentimentColor(email.aiSentiment)}`}>
                    {email.aiSentiment}
                  </span>
                )}
                {email.aiPriority && email.aiPriority >= 4 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                    P{email.aiPriority}
                  </span>
                )}
              </div>

              {/* Date */}
              <span className="ml-auto text-xs text-gray-500 dark:text-gray-500 shrink-0">
                {formatDate(email.date)}
              </span>
            </div>

            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-sm truncate ${!email.isRead ? 'text-gray-800 dark:text-gray-200' : 'text-gray-500 dark:text-gray-500'}`}>
                {email.subject || '(no subject)'}
              </span>
              {email.hasAttachments && (
                <PaperClipIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              )}
            </div>

            <p className="text-xs text-gray-400 dark:text-gray-600 truncate mt-0.5">
              {email.snippet}
            </p>
          </div>
        </div>
      ))}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <span className="text-sm text-gray-500">
            {pagination.total} emails
          </span>
          <div className="flex gap-2">
            <button
              disabled={pagination.page <= 1}
              onClick={() => useMailStore.getState().fetchEmails({ page: String(pagination.page - 1) })}
              className="px-3 py-1 text-sm rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-50"
            >
              Prev
            </button>
            <span className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400">
              {pagination.page} / {pagination.totalPages}
            </span>
            <button
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => useMailStore.getState().fetchEmails({ page: String(pagination.page + 1) })}
              className="px-3 py-1 text-sm rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
