import { useEffect, useState } from 'react';
import { useMailStore } from '../stores/mailStore';
import {
  InboxIcon,
  PaperAirplaneIcon,
  DocumentTextIcon,
  TrashIcon,
  ExclamationTriangleIcon,
  StarIcon,
  FolderIcon,
  PlusIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Cog6ToothIcon,
  ChartBarIcon,
  FunnelIcon,
  ArrowPathIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/outline';


interface SidebarProps {
  onCompose: () => void;
  onNavigate: (page: string) => void;
  currentPage: string;
}

const folders = [
  { id: 'INBOX', name: 'Inbox', icon: InboxIcon },
  { id: 'SENT', name: 'Sent', icon: PaperAirplaneIcon },
  { id: 'DRAFTS', name: 'Drafts', icon: DocumentTextIcon },
  { id: 'STARRED', name: 'Starred', icon: StarIcon },
  { id: 'SPAM', name: 'Spam', icon: ExclamationTriangleIcon },
  { id: 'TRASH', name: 'Trash', icon: TrashIcon },
];

export default function Sidebar({ onCompose, onNavigate, currentPage }: SidebarProps) {
  const { accounts, currentFolder, setCurrentFolder, setSelectedAccount, selectedAccountId, fetchAccounts, syncEmails, syncAccount, isSyncing } = useMailStore();
  const [expandedAccounts, setExpandedAccounts] = useState(true);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleFolderClick = (folderId: string) => {
    if (folderId === 'STARRED') {
      setCurrentFolder('INBOX');
      // Special handling for starred - would need filter
    } else {
      setCurrentFolder(folderId);
    }
    onNavigate('mail');
  };

  return (
    <div className="w-64 h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex flex-col">
      {/* Logo */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <EnvelopeIcon className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg text-gray-900 dark:text-white">M-MailBox</span>
        </div>
      </div>

      {/* Compose Button */}
      <div className="p-3">
        <button
          onClick={onCompose}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition shadow-md hover:shadow-lg"
        >
          <PlusIcon className="w-5 h-5" />
          Compose
        </button>
      </div>

      {/* Folders */}
      <nav className="flex-1 overflow-y-auto px-2">
        <div className="space-y-0.5">
          {folders.map(({ id, name, icon: Icon }) => (
            <button
              key={id}
              onClick={() => handleFolderClick(id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
                currentFolder === id && currentPage === 'mail'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
              }`}
            >
              <Icon className="w-5 h-5" />
              {name}
            </button>
          ))}
        </div>

        {/* Accounts */}
        <div className="mt-6">
          <button
            onClick={() => setExpandedAccounts(!expandedAccounts)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider"
          >
            Accounts
            {expandedAccounts ? <ChevronDownIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
          </button>

          {expandedAccounts && (
            <div className="space-y-0.5">
              <button
                onClick={() => setSelectedAccount(null)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                  !selectedAccountId ? 'bg-gray-100 dark:bg-gray-800 font-medium' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'
                }`}
              >
                <div className="w-3 h-3 rounded-full bg-gray-400" />
                All Accounts
              </button>

              {accounts.map((account) => (
                <div key={account.id} className="flex items-center group">
                  <button
                    onClick={() => setSelectedAccount(account.id)}
                    className={`flex-1 flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                      selectedAccountId === account.id ? 'bg-gray-100 dark:bg-gray-800 font-medium' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'
                    }`}
                  >
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: account.color }} />
                    <span className="truncate">{account.displayName || account.email}</span>
                    {account._count && account._count.emails > 0 && (
                      <span className="ml-auto text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-1.5 py-0.5 rounded-full">
                        {account._count.emails}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); syncAccount(account.id); }}
                    disabled={isSyncing}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all shrink-0 mr-1"
                    title={`Sync ${account.displayName || account.email}`}
                  >
                    <ArrowPathIcon className={`w-3.5 h-3.5 text-gray-500 ${isSyncing ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="mt-6 space-y-0.5">
          <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Navigation</div>
          <button
            onClick={() => onNavigate('dashboard')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
              currentPage === 'dashboard' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
            }`}
          >
            <ChartBarIcon className="w-5 h-5" />
            Dashboard
          </button>
          <button
            onClick={() => onNavigate('filters')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
              currentPage === 'filters' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
            }`}
          >
            <FunnelIcon className="w-5 h-5" />
            Filters
          </button>
          <button
            onClick={() => onNavigate('accounts')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
              currentPage === 'accounts' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
            }`}
          >
            <FolderIcon className="w-5 h-5" />
            Accounts
          </button>
          <button
            onClick={() => onNavigate('settings')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
              currentPage === 'settings' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
            }`}
          >
            <Cog6ToothIcon className="w-5 h-5" />
            Settings
          </button>
        </div>
      </nav>

      {/* Sync Button */}
      <div className="p-3 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={syncEmails}
          disabled={isSyncing}
          className="w-full flex items-center justify-center gap-2 py-2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition"
        >
          <ArrowPathIcon className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Syncing...' : 'Sync All'}
        </button>
      </div>
    </div>
  );
}
