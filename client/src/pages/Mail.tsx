import { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from '../components/Sidebar';
import EmailList from '../components/EmailList';
import EmailView from '../components/EmailView';
import SearchBar from '../components/SearchBar';
import ComposeModal from '../components/ComposeModal';
import Dashboard from './Dashboard';
import Accounts from './Accounts';
import Filters from './Filters';
import Settings from './Settings';
import { useMailStore } from '../stores/mailStore';

const AUTO_SYNC_INTERVAL = 60_000; // 60 seconds

export default function Mail() {
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<any>(null);
  const [forwardEmail, setForwardEmail] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState('mail');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const autoSync = useCallback(async () => {
    const store = useMailStore.getState();
    if (store.isSyncing) return;
    try {
      await store.syncEmails(true); // quick sync - only fetch latest 20
    } catch {
      // silent background sync
    }
  }, []);

  useEffect(() => {
    intervalRef.current = setInterval(autoSync, AUTO_SYNC_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoSync]);

  const handleCompose = () => {
    setReplyTo(null);
    setForwardEmail(null);
    setComposeOpen(true);
  };

  const handleReply = (email: any) => {
    setReplyTo(email);
    setForwardEmail(null);
    setComposeOpen(true);
  };

  const handleForward = (email: any) => {
    setForwardEmail(email);
    setReplyTo(null);
    setComposeOpen(true);
  };

  const renderContent = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'accounts':
        return <Accounts />;
      case 'filters':
        return <Filters />;
      case 'settings':
        return <Settings />;
      default:
        return (
          <div className="flex-1 flex flex-col overflow-hidden">
            <SearchBar />
            <div className="flex-1 flex overflow-hidden">
              <div className="w-96 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
                <EmailList />
              </div>
              <EmailView onReply={handleReply} onForward={handleForward} />
            </div>
          </div>
        );
    }
  };

  return (
    <div className="h-screen flex overflow-hidden bg-white dark:bg-gray-900">
      <Sidebar onCompose={handleCompose} onNavigate={setCurrentPage} currentPage={currentPage} />
      {renderContent()}

      <ComposeModal
        isOpen={composeOpen}
        onClose={() => { setComposeOpen(false); setReplyTo(null); setForwardEmail(null); }}
        replyTo={replyTo}
        forwardEmail={forwardEmail}
      />
    </div>
  );
}
