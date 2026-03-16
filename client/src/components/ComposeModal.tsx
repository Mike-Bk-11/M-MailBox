import { useState, useEffect, useRef } from 'react';
import { Dialog } from '@headlessui/react';
import { XMarkIcon, PaperClipIcon, PaperAirplaneIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useMailStore } from '../stores/mailStore';
import api from '../lib/api';
import toast from 'react-hot-toast';

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  replyTo?: any;
  forwardEmail?: any;
}

export default function ComposeModal({ isOpen, onClose, replyTo, forwardEmail }: ComposeModalProps) {
  const { accounts, sendEmail } = useMailStore();
  const [accountId, setAccountId] = useState('');
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [aiPrompt, setAiPrompt] = useState('');
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sentRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Write your email...' }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'min-h-[200px] p-3 outline-none text-sm text-gray-900 dark:text-gray-100',
      },
    },
  });

  useEffect(() => {
    if (accounts.length > 0 && !accountId) {
      setAccountId(accounts[0].id);
    }
  }, [accounts, accountId]);

  const resetForm = () => {
    setTo('');
    setCc('');
    setBcc('');
    setSubject('');
    setShowCcBcc(false);
    setAttachments([]);
    setAiPrompt('');
    setShowAiPrompt(false);
    setDraftId(null);
    editor?.commands.setContent('');
  };

  // Reset form when modal opens for fresh compose (no reply/forward)
  useEffect(() => {
    if (isOpen && !replyTo && !forwardEmail) {
      resetForm();
      if (accounts.length > 0) setAccountId(accounts[0].id);
    }
    if (isOpen) {
      sentRef.current = false;
    }
  }, [isOpen]);

  useEffect(() => {
    if (replyTo) {
      setTo(replyTo.fromAddress);
      setSubject(`Re: ${replyTo.subject || ''}`);
      if (replyTo.aiDraft) {
        editor?.commands.setContent(`<p>${replyTo.aiDraft.replace(/\n/g, '<br>')}</p>`);
      } else {
        editor?.commands.setContent('');
      }
      if (replyTo.accountId) setAccountId(replyTo.accountId);
    } else if (forwardEmail) {
      setSubject(`Fwd: ${forwardEmail.subject || ''}`);
      setTo('');
      const fwdContent = `
        <br><br>
        <p>---------- Forwarded message ----------</p>
        <p><strong>From:</strong> ${forwardEmail.fromName || forwardEmail.fromAddress}</p>
        <p><strong>Date:</strong> ${new Date(forwardEmail.date).toLocaleString()}</p>
        <p><strong>Subject:</strong> ${forwardEmail.subject || ''}</p>
        <br>
        ${forwardEmail.bodyHtml || forwardEmail.bodyText || ''}
      `;
      editor?.commands.setContent(fwdContent);
      if (forwardEmail.accountId) setAccountId(forwardEmail.accountId);
    } else {
      setTo('');
      setCc('');
      setBcc('');
      setSubject('');
      editor?.commands.setContent('');
    }
  }, [replyTo, forwardEmail, editor]);

  const handleSend = async () => {
    if (!to || !accountId) {
      toast.error('Please fill in recipient and select account');
      return;
    }

    setSending(true);
    try {
      const html = editor?.getHTML();
      const text = editor?.getText();

      if (attachments.length > 0) {
        const formData = new FormData();
        formData.append('accountId', accountId);
        formData.append('to', to);
        if (cc) formData.append('cc', cc);
        if (bcc) formData.append('bcc', bcc);
        formData.append('subject', subject);
        if (html) formData.append('html', html);
        if (text) formData.append('text', text);
        attachments.forEach((file) => formData.append('attachments', file));
        await api.post('/emails/send', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        await sendEmail({
          accountId,
          to,
          cc: cc || undefined,
          bcc: bcc || undefined,
          subject,
          html,
          text,
        });
      }

      toast.success('Email sent!');
      sentRef.current = true;
      // Delete draft if one was saved
      if (draftId) {
        try { await api.delete(`/emails/drafts/${draftId}`); } catch {}
      }
      resetForm();
      onClose();
    } catch {
      toast.error('Failed to send email');
    }
    setSending(false);
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFilesChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachments((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
    e.target.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setAiGenerating(true);
    try {
      const { data } = await api.post('/ai/compose', {
        instruction: aiPrompt,
        to: to || undefined,
        subject: subject || undefined,
      });
      if (data.subject && !subject) setSubject(data.subject);
      if (data.body) editor?.commands.setContent(data.body);
      setShowAiPrompt(false);
      setAiPrompt('');
      toast.success('Email drafted by AI');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'AI generation failed');
    }
    setAiGenerating(false);
  };

  const handleClose = async () => {
    // Don't save draft if email was sent or it's a reply/forward with no changes
    const bodyText = editor?.getText()?.trim() || '';
    const hasContent = to.trim() || subject.trim() || bodyText;

    if (!sentRef.current && hasContent && accountId) {
      try {
        const html = editor?.getHTML();
        const text = editor?.getText();
        const { data } = await api.post('/emails/drafts', {
          accountId,
          to: to || undefined,
          cc: cc || undefined,
          bcc: bcc || undefined,
          subject: subject || undefined,
          text: text || undefined,
          html: html || undefined,
          draftId: draftId || undefined,
        });
        setDraftId(data.id);
        toast.success('Draft saved');
      } catch {
        // Silently fail - don't block close
      }
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
      <div className="fixed inset-0 flex items-end justify-center p-4 sm:items-center">
        <Dialog.Panel className="w-full max-w-2xl bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
              {replyTo ? 'Reply' : forwardEmail ? 'Forward' : 'New Email'}
            </Dialog.Title>
            <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">
              <XMarkIcon className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Fields */}
          <div className="px-4 py-2 space-y-2 border-b border-gray-200 dark:border-gray-700">
            {/* From */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500 w-12 shrink-0">From</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="flex-1 text-sm py-1.5 px-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-transparent text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.displayName || acc.email} ({acc.email})
                  </option>
                ))}
              </select>
            </div>

            {/* To */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500 w-12 shrink-0">To</label>
              <input
                type="text"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="flex-1 text-sm py-1.5 px-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-transparent text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="recipient@example.com"
              />
              {!showCcBcc && (
                <button onClick={() => setShowCcBcc(true)} className="text-xs text-blue-600 hover:text-blue-700 shrink-0">
                  Cc/Bcc
                </button>
              )}
            </div>

            {showCcBcc && (
              <>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-500 w-12 shrink-0">Cc</label>
                  <input
                    type="text"
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                    className="flex-1 text-sm py-1.5 px-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-transparent text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-500 w-12 shrink-0">Bcc</label>
                  <input
                    type="text"
                    value={bcc}
                    onChange={(e) => setBcc(e.target.value)}
                    className="flex-1 text-sm py-1.5 px-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-transparent text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </>
            )}

            {/* Subject */}
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500 w-12 shrink-0">Subj</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="flex-1 text-sm py-1.5 px-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-transparent text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                placeholder="Subject"
              />
            </div>
          </div>

          {/* Editor */}
          <div className="flex-1 overflow-y-auto border-b border-gray-200 dark:border-gray-700">
            <EditorContent editor={editor} />
          </div>

          {/* AI Compose Prompt */}
          {showAiPrompt && (
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-purple-50 dark:bg-purple-900/20">
              <div className="flex items-center gap-2 mb-2">
                <SparklesIcon className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-medium text-purple-700 dark:text-purple-300">AI Compose</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiGenerate(); } }}
                  placeholder="e.g. Write a follow-up email about the project deadline..."
                  className="flex-1 text-sm py-2 px-3 rounded-lg border border-purple-300 dark:border-purple-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none"
                  disabled={aiGenerating}
                  autoFocus
                />
                <button
                  onClick={handleAiGenerate}
                  disabled={aiGenerating || !aiPrompt.trim()}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  <SparklesIcon className="w-4 h-4" />
                  {aiGenerating ? 'Writing...' : 'Generate'}
                </button>
                <button
                  onClick={() => { setShowAiPrompt(false); setAiPrompt(''); }}
                  className="p-2 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-800/30 transition"
                >
                  <XMarkIcon className="w-4 h-4 text-purple-500" />
                </button>
              </div>
              <p className="text-xs text-purple-500 dark:text-purple-400 mt-1.5">
                Describe what you want to say and AI will draft the email for you.
              </p>
            </div>
          )}

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
              <div className="flex flex-wrap gap-2">
                {attachments.map((file, i) => (
                  <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 dark:bg-gray-700 rounded-lg text-xs text-gray-700 dark:text-gray-300">
                    <PaperClipIcon className="w-3.5 h-3.5" />
                    <span className="max-w-[150px] truncate">{file.name}</span>
                    <span className="text-gray-400">({formatFileSize(file.size)})</span>
                    <button onClick={() => removeAttachment(i)} className="ml-0.5 hover:text-red-500 transition">
                      <XMarkIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFilesChosen}
              />
              <button onClick={handleFileSelect} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition" title="Attach file">
                <PaperClipIcon className="w-5 h-5 text-gray-500" />
              </button>
              <button
                onClick={() => setShowAiPrompt(!showAiPrompt)}
                className={`p-2 rounded-lg transition ${showAiPrompt ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500'}`}
                title="AI Compose"
              >
                <SparklesIcon className="w-5 h-5" />
              </button>
            </div>
            <button
              onClick={handleSend}
              disabled={sending || !to}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <PaperAirplaneIcon className="w-4 h-4" />
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
