import { useState } from 'react';
import { useMailStore } from '../stores/mailStore';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const { setSearchQuery, selectedEmailIds, bulkAction, clearSelection } = useMailStore();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(query);
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      {/* Bulk Actions */}
      {selectedEmailIds.length > 0 ? (
        <div className="flex items-center gap-2 w-full">
          <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">
            {selectedEmailIds.length} selected
          </span>
          <button onClick={() => bulkAction('markRead')} className="px-3 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition">
            Mark Read
          </button>
          <button onClick={() => bulkAction('markUnread')} className="px-3 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition">
            Mark Unread
          </button>
          <button onClick={() => bulkAction('star')} className="px-3 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition">
            Star
          </button>
          <button onClick={() => bulkAction('delete')} className="px-3 py-1.5 text-xs rounded-lg bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 transition">
            Delete
          </button>
          <button onClick={clearSelection} className="ml-auto px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition">
            Cancel
          </button>
        </div>
      ) : (
        <form onSubmit={handleSearch} className="flex items-center gap-2 w-full">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search emails..."
              className="w-full pl-9 pr-4 py-2 text-sm rounded-xl bg-gray-100 dark:bg-gray-800 border border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-gray-700 text-gray-900 dark:text-white outline-none transition"
            />
          </div>
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); setSearchQuery(''); }}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Clear
            </button>
          )}
        </form>
      )}
    </div>
  );
}
