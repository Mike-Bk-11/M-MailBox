import prisma from '../lib/prisma';
import { syncAccountEmails } from './imap.service';
import { syncGmailAccount } from './gmail.service';
import { syncOutlookAccount } from './outlook.service';

export async function syncAllAccounts(userId: string, limit?: number) {
  const accounts = await prisma.emailAccount.findMany({
    where: { userId, isActive: true },
  });

  const results = [];

  for (const account of accounts) {
    try {
      // First sync: fetch up to 5000 emails; subsequent syncs: use normal limit
      const effectiveLimit = account.lastSyncedAt ? limit : 5000;

      switch (account.provider) {
        case 'gmail':
          await syncGmailAccount(account.id, effectiveLimit);
          break;
        case 'outlook':
          await syncOutlookAccount(account.id, effectiveLimit);
          break;
        case 'imap':
          await syncAccountEmails(account.id, effectiveLimit);
          break;
      }

      await prisma.emailAccount.update({
        where: { id: account.id },
        data: { lastSyncedAt: new Date() },
      });

      results.push({ accountId: account.id, email: account.email, status: 'ok' });
    } catch (error) {
      console.error(`Sync error for ${account.email}:`, error);
      results.push({ accountId: account.id, email: account.email, status: 'error', error: String(error) });
    }
  }

  return results;
}
