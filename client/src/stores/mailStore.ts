import { create } from 'zustand';
import api from '../lib/api';

export interface EmailAccount {
  id: string;
  provider: string;
  email: string;
  displayName: string | null;
  isActive: boolean;
  color: string;
  createdAt: string;
  _count?: { emails: number };
}

export interface Email {
  id: string;
  accountId: string;
  messageId: string | null;
  threadId: string | null;
  fromAddress: string;
  fromName: string | null;
  toAddresses: string;
  ccAddresses: string | null;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  snippet: string | null;
  date: string;
  isRead: boolean;
  isStarred: boolean;
  folder: string;
  labels: string;
  hasAttachments: boolean;
  aiCategory: string | null;
  aiSentiment: string | null;
  aiPriority: number | null;
  aiSummary: string | null;
  isSpam: boolean;
  account?: {
    email: string;
    provider: string;
    color: string;
    displayName: string | null;
  };
  attachments?: Array<{
    id: string;
    filename: string;
    contentType: string;
    size: number;
  }>;
}

interface MailState {
  accounts: EmailAccount[];
  emails: Email[];
  selectedEmail: Email | null;
  selectedAccountId: string | null;
  currentFolder: string;
  searchQuery: string;
  isLoading: boolean;
  isSyncing: boolean;
  pagination: { page: number; limit: number; total: number; totalPages: number };
  selectedEmailIds: string[];

  fetchAccounts: () => Promise<void>;
  fetchEmails: (params?: Record<string, string>) => Promise<void>;
  selectEmail: (id: string) => Promise<void>;
  setSelectedAccount: (id: string | null) => void;
  setCurrentFolder: (folder: string) => void;
  setSearchQuery: (query: string) => void;
  syncEmails: (quick?: boolean) => Promise<void>;
  syncAccount: (accountId: string) => Promise<void>;
  toggleStar: (id: string) => Promise<void>;
  bulkAction: (action: string, value?: string) => Promise<void>;
  toggleSelectEmail: (id: string) => void;
  selectAllEmails: () => void;
  clearSelection: () => void;
  sendEmail: (params: { accountId: string; to: string; cc?: string; bcc?: string; subject: string; text?: string; html?: string }) => Promise<void>;
}

export const useMailStore = create<MailState>()((set, get) => ({
  accounts: [],
  emails: [],
  selectedEmail: null,
  selectedAccountId: null,
  currentFolder: 'INBOX',
  searchQuery: '',
  isLoading: false,
  isSyncing: false,
  pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
  selectedEmailIds: [],

  fetchAccounts: async () => {
    try {
      const { data } = await api.get('/accounts');
      set({ accounts: data });
    } catch (error) {
      console.error('Fetch accounts error:', error);
    }
  },

  fetchEmails: async (params = {}) => {
    set({ isLoading: true });
    try {
      const state = get();
      const queryParams: Record<string, string> = {
        folder: state.currentFolder,
        page: String(state.pagination.page),
        limit: String(state.pagination.limit),
        ...params,
      };
      if (state.selectedAccountId) queryParams.accountId = state.selectedAccountId;
      if (state.searchQuery) queryParams.search = state.searchQuery;

      const { data } = await api.get('/emails', { params: queryParams });
      set({ emails: data.emails, pagination: data.pagination, isLoading: false });
    } catch (error) {
      console.error('Fetch emails error:', error);
      set({ isLoading: false });
    }
  },

  selectEmail: async (id) => {
    try {
      const { data } = await api.get(`/emails/${id}`);
      set({ selectedEmail: data });
      // Update read status in list
      set((state) => ({
        emails: state.emails.map((e) => (e.id === id ? { ...e, isRead: true } : e)),
      }));
    } catch (error) {
      console.error('Select email error:', error);
    }
  },

  setSelectedAccount: (id) => {
    set({ selectedAccountId: id, pagination: { ...get().pagination, page: 1 } });
    get().fetchEmails();
  },

  setCurrentFolder: (folder) => {
    set({ currentFolder: folder, pagination: { ...get().pagination, page: 1 }, selectedEmail: null });
    get().fetchEmails();
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query, pagination: { ...get().pagination, page: 1 } });
    get().fetchEmails();
  },

  syncEmails: async (quick) => {
    set({ isSyncing: true });
    try {
      await api.post(`/emails/sync${quick ? '?quick=true' : ''}`);
      await get().fetchEmails();
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      set({ isSyncing: false });
    }
  },

  syncAccount: async (accountId) => {
    set({ isSyncing: true });
    try {
      await api.post(`/emails/sync/${accountId}`);
      await get().fetchEmails();
    } catch (error) {
      console.error('Sync account error:', error);
    } finally {
      set({ isSyncing: false });
    }
  },

  toggleStar: async (id) => {
    try {
      const { data } = await api.patch(`/emails/${id}/star`);
      set((state) => ({
        emails: state.emails.map((e) => (e.id === id ? { ...e, isStarred: data.isStarred } : e)),
        selectedEmail: state.selectedEmail?.id === id ? { ...state.selectedEmail, isStarred: data.isStarred } : state.selectedEmail,
      }));
    } catch (error) {
      console.error('Toggle star error:', error);
    }
  },

  bulkAction: async (action, value) => {
    const ids = get().selectedEmailIds;
    if (!ids.length) return;
    try {
      await api.post('/emails/bulk', { ids, action, value });
      set({ selectedEmailIds: [] });
      await get().fetchEmails();
    } catch (error) {
      console.error('Bulk action error:', error);
    }
  },

  toggleSelectEmail: (id) => {
    set((state) => ({
      selectedEmailIds: state.selectedEmailIds.includes(id)
        ? state.selectedEmailIds.filter((eid) => eid !== id)
        : [...state.selectedEmailIds, id],
    }));
  },

  selectAllEmails: () => {
    set((state) => ({
      selectedEmailIds: state.emails.map((e) => e.id),
    }));
  },

  clearSelection: () => set({ selectedEmailIds: [] }),

  sendEmail: async (params) => {
    await api.post('/emails/send', params);
  },
}));
