import prisma from '../lib/prisma';

interface FilterCondition {
  field: 'from' | 'to' | 'subject' | 'body' | 'hasAttachments' | 'size' | 'date';
  operator: 'contains' | 'equals' | 'startsWith' | 'endsWith' | 'greaterThan' | 'lessThan' | 'is';
  value: string;
}

interface FilterConfig {
  logic: 'AND' | 'OR';
  rules: FilterCondition[];
}

interface FilterAction {
  type: 'moveToFolder' | 'applyLabel' | 'markRead' | 'star' | 'delete' | 'markSpam' | 'forward' | 'autoReply';
  value?: string;
}

function evaluateCondition(email: any, condition: FilterCondition): boolean {
  let fieldValue = '';

  switch (condition.field) {
    case 'from':
      fieldValue = `${email.fromName || ''} ${email.fromAddress}`.toLowerCase();
      break;
    case 'to':
      fieldValue = (email.toAddresses || '').toLowerCase();
      break;
    case 'subject':
      fieldValue = (email.subject || '').toLowerCase();
      break;
    case 'body':
      fieldValue = (email.bodyText || email.snippet || '').toLowerCase();
      break;
    case 'hasAttachments':
      return email.hasAttachments === (condition.value === 'true');
    case 'size':
      const emailSize = (email.bodyText || '').length;
      const targetSize = parseInt(condition.value);
      if (condition.operator === 'greaterThan') return emailSize > targetSize;
      if (condition.operator === 'lessThan') return emailSize < targetSize;
      return false;
    default:
      return false;
  }

  const searchValue = condition.value.toLowerCase();

  switch (condition.operator) {
    case 'contains': return fieldValue.includes(searchValue);
    case 'equals': return fieldValue === searchValue;
    case 'startsWith': return fieldValue.startsWith(searchValue);
    case 'endsWith': return fieldValue.endsWith(searchValue);
    default: return false;
  }
}

export function evaluateFilter(email: any, filterConfig: FilterConfig): boolean {
  if (!filterConfig.rules || filterConfig.rules.length === 0) return false;

  if (filterConfig.logic === 'AND') {
    return filterConfig.rules.every(rule => evaluateCondition(email, rule));
  } else {
    return filterConfig.rules.some(rule => evaluateCondition(email, rule));
  }
}

export async function applyFiltersToEmail(email: any, userId: string): Promise<FilterAction[]> {
  const filters = await prisma.filter.findMany({
    where: { userId, isActive: true },
  });

  const appliedActions: FilterAction[] = [];

  for (const filter of filters) {
    try {
      const config: FilterConfig = JSON.parse(filter.conditions);
      const actions: FilterAction[] = JSON.parse(filter.actions);

      if (evaluateFilter(email, config)) {
        for (const action of actions) {
          appliedActions.push(action);

          switch (action.type) {
            case 'moveToFolder':
              await prisma.email.update({
                where: { id: email.id },
                data: { folder: action.value || 'INBOX' },
              });
              break;
            case 'applyLabel':
              const currentLabels = JSON.parse(email.labels || '[]');
              if (!currentLabels.includes(action.value)) {
                currentLabels.push(action.value);
                await prisma.email.update({
                  where: { id: email.id },
                  data: { labels: JSON.stringify(currentLabels) },
                });
              }
              break;
            case 'markRead':
              await prisma.email.update({
                where: { id: email.id },
                data: { isRead: true },
              });
              break;
            case 'star':
              await prisma.email.update({
                where: { id: email.id },
                data: { isStarred: true },
              });
              break;
            case 'delete':
              await prisma.email.update({
                where: { id: email.id },
                data: { folder: 'TRASH' },
              });
              break;
            case 'markSpam':
              await prisma.email.update({
                where: { id: email.id },
                data: { isSpam: true, folder: 'SPAM' },
              });
              break;
          }
        }
      }
    } catch (e) {
      console.error(`Filter evaluation error for filter ${filter.id}:`, e);
    }
  }

  return appliedActions;
}
