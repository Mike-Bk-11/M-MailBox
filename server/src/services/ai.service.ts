import OpenAI from 'openai';
import prisma from '../lib/prisma';

async function getOpenAIClient(userId: string): Promise<OpenAI | null> {
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  let apiKey = settings?.openaiApiKey || process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.startsWith('sk-your')) return null;
  // Strip non-ASCII characters (e.g. bullet points copied from web UIs)
  apiKey = apiKey.replace(/[^\x20-\x7E]/g, '').trim();
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

async function logAIAction(userId: string, emailId: string | null, action: string, input: string, output: string) {
  await prisma.aILog.create({
    data: { userId, emailId, action, input: input.slice(0, 500), output: output.slice(0, 2000) },
  });
}

export async function suggestReplies(userId: string, emailId: string): Promise<string[] | null> {
  const client = await getOpenAIClient(userId);
  if (!client) return null;

  const email = await prisma.email.findUnique({ where: { id: emailId } });
  if (!email) return null;

  const prompt = `You are an email assistant. Generate 3 reply options for the following email.
Return a JSON array of 3 strings: [formal_reply, casual_reply, brief_reply].

From: ${email.fromName || email.fromAddress}
Subject: ${email.subject || '(no subject)'}
Body:
${(email.bodyText || email.snippet || '').slice(0, 1500)}`;

  const res = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    max_tokens: 1000,
  });

  const content = res.choices[0]?.message?.content || '{}';
  try {
    const parsed = JSON.parse(content);
    const replies = parsed.replies || parsed.options || Object.values(parsed).flat();
    await logAIAction(userId, emailId, 'suggest-reply', prompt, content);
    return Array.isArray(replies) ? replies.slice(0, 3) : null;
  } catch {
    return null;
  }
}

export async function summarizeEmail(userId: string, emailId: string): Promise<string | null> {
  const client = await getOpenAIClient(userId);
  if (!client) return null;

  const email = await prisma.email.findUnique({ where: { id: emailId } });
  if (!email) return null;

  const prompt = `Summarize this email in 2-3 concise bullet points:

From: ${email.fromName || email.fromAddress}
Subject: ${email.subject || '(no subject)'}
Body:
${(email.bodyText || email.snippet || '').slice(0, 2000)}`;

  const res = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 300,
  });

  const summary = res.choices[0]?.message?.content || null;
  if (summary) {
    await prisma.email.update({ where: { id: emailId }, data: { aiSummary: summary } });
    await logAIAction(userId, emailId, 'summarize', prompt, summary);
  }
  return summary;
}

export async function categorizeEmail(userId: string, emailId: string): Promise<string | null> {
  const client = await getOpenAIClient(userId);
  if (!client) return null;

  const email = await prisma.email.findUnique({ where: { id: emailId } });
  if (!email) return null;

  const prompt = `Categorize this email into exactly one category. Choose from: Work, Personal, Finance, Shopping, Travel, Social, Newsletter, Promotions, Updates, Support, Other.

Return JSON: { "category": "..." }

From: ${email.fromAddress}
Subject: ${email.subject || ''}
Preview: ${(email.snippet || '').slice(0, 500)}`;

  const res = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    max_tokens: 50,
  });

  try {
    const parsed = JSON.parse(res.choices[0]?.message?.content || '{}');
    const category = parsed.category;
    if (category) {
      await prisma.email.update({ where: { id: emailId }, data: { aiCategory: category } });
      await logAIAction(userId, emailId, 'categorize', prompt, category);
    }
    return category;
  } catch {
    return null;
  }
}

export async function analyzeSentiment(userId: string, emailId: string): Promise<string | null> {
  const client = await getOpenAIClient(userId);
  if (!client) return null;

  const email = await prisma.email.findUnique({ where: { id: emailId } });
  if (!email) return null;

  const prompt = `Analyze the sentiment/tone of this email. Choose exactly one: positive, negative, neutral, urgent.
Return JSON: { "sentiment": "..." }

Subject: ${email.subject || ''}
Body: ${(email.bodyText || email.snippet || '').slice(0, 500)}`;

  const res = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    max_tokens: 30,
  });

  try {
    const parsed = JSON.parse(res.choices[0]?.message?.content || '{}');
    const sentiment = parsed.sentiment;
    if (sentiment) {
      await prisma.email.update({ where: { id: emailId }, data: { aiSentiment: sentiment } });
      await logAIAction(userId, emailId, 'sentiment', prompt, sentiment);
    }
    return sentiment;
  } catch {
    return null;
  }
}

export async function scorePriority(userId: string, emailId: string): Promise<number | null> {
  const client = await getOpenAIClient(userId);
  if (!client) return null;

  const email = await prisma.email.findUnique({ where: { id: emailId } });
  if (!email) return null;

  const prompt = `Rate the priority of this email from 1 (lowest) to 5 (highest/urgent). Consider sender, subject urgency keywords, and content.
Return JSON: { "priority": <number 1-5> }

From: ${email.fromAddress}
Subject: ${email.subject || ''}
Preview: ${(email.snippet || '').slice(0, 500)}`;

  const res = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    max_tokens: 30,
  });

  try {
    const parsed = JSON.parse(res.choices[0]?.message?.content || '{}');
    const priority = Math.min(5, Math.max(1, parseInt(parsed.priority)));
    if (!isNaN(priority)) {
      await prisma.email.update({ where: { id: emailId }, data: { aiPriority: priority } });
      await logAIAction(userId, emailId, 'priority', prompt, String(priority));
    }
    return priority;
  } catch {
    return null;
  }
}

export async function detectSpam(userId: string, emailId: string): Promise<boolean | null> {
  const client = await getOpenAIClient(userId);
  if (!client) return null;

  const email = await prisma.email.findUnique({ where: { id: emailId } });
  if (!email) return null;

  const prompt = `Is this email spam or phishing? Analyze sender, subject, and content for suspicious patterns.
Return JSON: { "isSpam": true/false, "confidence": 0.0-1.0 }

From: ${email.fromAddress}
Subject: ${email.subject || ''}
Preview: ${(email.bodyText || email.snippet || '').slice(0, 500)}`;

  const res = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    max_tokens: 50,
  });

  try {
    const parsed = JSON.parse(res.choices[0]?.message?.content || '{}');
    const isSpam = parsed.isSpam === true && parsed.confidence > 0.7;
    await prisma.email.update({ where: { id: emailId }, data: { isSpam } });
    await logAIAction(userId, emailId, 'spam-detect', prompt, JSON.stringify(parsed));
    return isSpam;
  } catch {
    return null;
  }
}

export async function processEmailWithAI(userId: string, emailId: string) {
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  if (!settings) return;

  const results: Record<string, any> = {};

  if (settings.aiCategorize) results.category = await categorizeEmail(userId, emailId);
  if (settings.aiSentiment) results.sentiment = await analyzeSentiment(userId, emailId);
  if (settings.aiPriority) results.priority = await scorePriority(userId, emailId);
  if (settings.aiSpamDetect) results.isSpam = await detectSpam(userId, emailId);
  if (settings.aiSummarize) results.summary = await summarizeEmail(userId, emailId);

  return results;
}

export async function composeEmailWithAI(
  userId: string,
  instruction: string,
  context?: { to?: string; subject?: string },
): Promise<{ subject: string; body: string } | null> {
  const client = await getOpenAIClient(userId);
  if (!client) return null;

  const prompt = `You are a professional email writing assistant. Write an email based on the user's instruction.
${context?.to ? `Recipient: ${context.to}` : ''}
${context?.subject ? `Subject line provided: ${context.subject}` : 'Also suggest a subject line.'}

User instruction: ${instruction}

Return JSON: { "subject": "...", "body": "..." }
The body should be in HTML format with <p> tags for paragraphs. Keep it professional and concise. Do not include a subject line in the body.`;

  const res = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    max_tokens: 1500,
  });

  const content = res.choices[0]?.message?.content || '{}';
  const parsed = JSON.parse(content);

  try {
    await logAIAction(userId, null, 'compose', instruction, content);
  } catch (logErr) {
    console.error('AI log error (non-fatal):', logErr);
  }

  return { subject: parsed.subject || '', body: parsed.body || '' };
}
