import { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { format } from 'date-fns';
import { useMailStore } from '../stores/mailStore';
import api from '../lib/api';
import {
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  TrashIcon,
  StarIcon as StarOutline,
  SparklesIcon,
  PaperClipIcon,
  TagIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolid } from '@heroicons/react/24/solid';
import toast from 'react-hot-toast';

interface EmailViewProps {
  onReply: (email: any) => void;
  onForward: (email: any) => void;
}

export default function EmailView({ onReply, onForward }: EmailViewProps) {
  const { selectedEmail, toggleStar } = useMailStore();
  const [aiSuggestions, setAiSuggestions] = useState<string[] | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [loadingAI, setLoadingAI] = useState<string | null>(null);

  // Clear AI data when switching emails
  useEffect(() => {
    setAiSuggestions(null);
    setAiSummary(null);
    setLoadingAI(null);
  }, [selectedEmail?.id]);

  if (!selectedEmail) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-400 dark:text-gray-600">
        <svg className="w-20 h-20 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
        </svg>
        <p className="text-lg">Select an email to read</p>
      </div>
    );
  }

  const email = selectedEmail;
  const toAddresses = JSON.parse(email.toAddresses || '[]');
  const ccAddresses = email.ccAddresses ? JSON.parse(email.ccAddresses) : [];

  const handleAISuggestReplies = async () => {
    setLoadingAI('suggest');
    try {
      const { data } = await api.post(`/ai/suggest-replies/${email.id}`);
      setAiSuggestions(data.replies);
    } catch {
      toast.error('Failed to get AI suggestions');
    }
    setLoadingAI(null);
  };

  const handleAISummarize = async () => {
    setLoadingAI('summarize');
    try {
      const { data } = await api.post(`/ai/summarize/${email.id}`);
      setAiSummary(data.summary);
    } catch {
      toast.error('Failed to summarize email');
    }
    setLoadingAI(null);
  };

  const handleAIProcess = async () => {
    setLoadingAI('process');
    try {
      await api.post(`/ai/process/${email.id}`);
      toast.success('AI analysis complete');
    } catch {
      toast.error('AI processing failed');
    }
    setLoadingAI(null);
  };

  const handleDelete = async () => {
    try {
      await api.patch(`/emails/${email.id}/move`, { folder: 'TRASH' });
      toast.success('Moved to trash');
      useMailStore.getState().fetchEmails();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const sanitizedHtml = email.bodyHtml
    ? DOMPurify.sanitize(email.bodyHtml, { FORBID_TAGS: ['script', 'style'], FORBID_ATTR: ['onerror', 'onclick', 'onload'] })
    : null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <button onClick={() => onReply(email)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition" title="Reply">
          <ArrowUturnLeftIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
        <button onClick={() => onForward(email)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition" title="Forward">
          <ArrowUturnRightIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
        <button onClick={handleDelete} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition" title="Delete">
          <TrashIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
        <button onClick={() => toggleStar(email.id)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition" title="Star">
          {email.isStarred ? <StarSolid className="w-5 h-5 text-yellow-500" /> : <StarOutline className="w-5 h-5 text-gray-600 dark:text-gray-400" />}
        </button>

        <div className="flex-1" />

        {/* AI Actions */}
        <button
          onClick={handleAISuggestReplies}
          disabled={!!loadingAI}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-400 dark:hover:bg-purple-900/40 rounded-lg transition disabled:opacity-50"
        >
          <SparklesIcon className="w-4 h-4" />
          {loadingAI === 'suggest' ? 'Thinking...' : 'AI Reply'}
        </button>
        <button
          onClick={handleAISummarize}
          disabled={!!loadingAI}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/40 rounded-lg transition disabled:opacity-50"
        >
          {loadingAI === 'summarize' ? 'Thinking...' : 'Summarize'}
        </button>
        <button
          onClick={handleAIProcess}
          disabled={!!loadingAI}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/40 rounded-lg transition disabled:opacity-50"
        >
          {loadingAI === 'process' ? 'Analyzing...' : 'Analyze'}
        </button>
      </div>

      {/* Email Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          {/* Subject */}
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            {email.subject || '(no subject)'}
          </h2>

          {/* AI Badges */}
          {(email.aiCategory || email.aiSentiment || email.aiPriority) && (
            <div className="flex flex-wrap gap-2 mb-4">
              {email.aiCategory && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                  <TagIcon className="w-3 h-3" /> {email.aiCategory}
                </span>
              )}
              {email.aiSentiment && (
                <span className={`inline-flex items-center text-xs px-2 py-1 rounded-full ${
                  email.aiSentiment === 'positive' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                  email.aiSentiment === 'negative' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                  email.aiSentiment === 'urgent' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                  'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                }`}>
                  {email.aiSentiment}
                </span>
              )}
              {email.aiPriority && (
                <span className={`inline-flex items-center text-xs px-2 py-1 rounded-full ${
                  email.aiPriority >= 4 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                  email.aiPriority === 3 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                  'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                }`}>
                  Priority: {email.aiPriority}/5
                </span>
              )}
            </div>
          )}

          {/* Labels */}
          {(() => {
            try {
              const labels: string[] = JSON.parse(email.labels || '[]');
              if (labels.length === 0) return null;
              return (
                <div className="flex flex-wrap gap-2 mb-4">
                  {labels.map((label) => (
                    <span key={label} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      <TagIcon className="w-3 h-3" /> {label}
                    </span>
                  ))}
                </div>
              );
            } catch { return null; }
          })()}

          {/* AI Summary */}
          {(aiSummary || email.aiSummary) && (
            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-1 text-sm font-medium text-blue-700 dark:text-blue-400 mb-1">
                <SparklesIcon className="w-4 h-4" /> AI Summary
              </div>
              <p className="text-sm text-blue-800 dark:text-blue-300 whitespace-pre-wrap">
                {aiSummary || email.aiSummary}
              </p>
            </div>
          )}

          {/* Sender info */}
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-medium text-sm shrink-0">
              {(email.fromName || email.fromAddress)[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900 dark:text-white">
                  {email.fromName || email.fromAddress}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-500">
                  &lt;{email.fromAddress}&gt;
                </span>
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-500">
                To: {toAddresses.join(', ')}
                {ccAddresses.length > 0 && ` | Cc: ${ccAddresses.join(', ')}`}
              </div>
              <div className="text-sm text-gray-400 dark:text-gray-600">
                {format(new Date(email.date), 'MMMM d, yyyy \'at\' h:mm a')}
              </div>
            </div>
          </div>

          {/* Attachments */}
          {email.attachments && email.attachments.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {email.attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm"
                >
                  <PaperClipIcon className="w-4 h-4 text-gray-500" />
                  <span className="text-gray-700 dark:text-gray-300">{att.filename}</span>
                  <span className="text-gray-400 text-xs">
                    {(att.size / 1024).toFixed(1)} KB
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Email body */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            {sanitizedHtml ? (
              <div
                className="prose dark:prose-invert max-w-none text-sm"
                dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
              />
            ) : (
              <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans">
                {email.bodyText || email.snippet || 'No content'}
              </pre>
            )}
          </div>

          {/* AI Reply Suggestions */}
          {aiSuggestions && (
            <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
              <h3 className="flex items-center gap-2 text-sm font-medium text-purple-700 dark:text-purple-400 mb-3">
                <SparklesIcon className="w-4 h-4" /> AI Reply Suggestions
              </h3>
              <div className="space-y-3">
                {aiSuggestions.map((suggestion, i) => (
                  <div
                    key={i}
                    className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800 cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/30 transition"
                    onClick={() => {
                      onReply({ ...email, aiDraft: suggestion });
                      setAiSuggestions(null);
                    }}
                  >
                    <div className="text-xs font-medium text-purple-600 dark:text-purple-400 mb-1">
                      {i === 0 ? 'Formal' : i === 1 ? 'Casual' : 'Brief'}
                    </div>
                    <p className="text-sm text-purple-800 dark:text-purple-300">{suggestion}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
