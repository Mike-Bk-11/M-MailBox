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
      switch (account.provider) {
        case 'gmail':
          await syncGmailAccount(account.id, limit);
          break;
        case 'outlook':
          await syncOutlookAccount(account.id, limit);
          break;
        case 'imap':
          await syncAccountEmails(account.id, limit);
          break;
      }
      results.push({ accountId: account.id, email: account.email, status: 'ok' });
    } catch (error) {
      console.error(`Sync error for ${account.email}:`, error);
      results.push({ accountId: account.id, email: account.email, status: 'error', error: String(error) });
    }
  }

  return results;
}
