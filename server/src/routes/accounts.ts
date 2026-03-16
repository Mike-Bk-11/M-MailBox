import { Router, Response } from 'express';
import { google } from 'googleapis';
import { ConfidentialClientApplication } from '@azure/msal-node';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { encrypt, decrypt } from '../utils/crypto';

const router = Router();

// --- List accounts ---
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const accounts = await prisma.emailAccount.findMany({
      where: { userId: req.userId },
      select: {
        id: true,
        provider: true,
        email: true,
        displayName: true,
        isActive: true,
        color: true,
        createdAt: true,
        _count: { select: { emails: { where: { isRead: false, folder: 'INBOX' } } } },
      },
    });
    return res.json(accounts);
  } catch (error) {
    console.error('List accounts error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Add IMAP account ---
router.post('/imap', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { email, displayName, imapHost, imapPort, smtpHost, smtpPort, password, color } = req.body;
    if (!email || !imapHost || !imapPort || !smtpHost || !smtpPort || !password) {
      return res.status(400).json({ error: 'All IMAP/SMTP fields are required' });
    }

    const account = await prisma.emailAccount.create({
      data: {
        userId: req.userId!,
        provider: 'imap',
        email,
        displayName: displayName || email,
        imapHost,
        imapPort: Number(imapPort),
        smtpHost,
        smtpPort: Number(smtpPort),
        encryptedPassword: encrypt(password),
        color: color || '#3B82F6',
      },
    });

    return res.status(201).json({ id: account.id, email: account.email, provider: account.provider });
  } catch (error) {
    console.error('Add IMAP account error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Google OAuth2 ---
function getGoogleOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

router.get('/google/auth-url', authMiddleware, async (req: AuthRequest, res: Response) => {
  const oauth2Client = getGoogleOAuth2Client();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
    state: req.userId,
  });
  return res.json({ url });
});

router.get('/google/callback', async (req, res: Response) => {
  try {
    const { code, state: userId } = req.query;
    if (!code || !userId) {
      return res.status(400).json({ error: 'Missing code or state' });
    }

    const oauth2Client = getGoogleOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code as string);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();

    await prisma.emailAccount.upsert({
      where: {
        userId_email: { userId: userId as string, email: userInfo.email! },
      },
      update: {
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token || undefined,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
      create: {
        userId: userId as string,
        provider: 'gmail',
        email: userInfo.email!,
        displayName: userInfo.name || userInfo.email!,
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token || undefined,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        color: '#EA4335',
      },
    });

    return res.redirect(`${process.env.CLIENT_URL}/accounts?connected=gmail`);
  } catch (error) {
    console.error('Google callback error:', error);
    return res.redirect(`${process.env.CLIENT_URL}/accounts?error=google_failed`);
  }
});

// --- Microsoft OAuth2 ---
function getMsalClient() {
  return new ConfidentialClientApplication({
    auth: {
      clientId: process.env.MICROSOFT_CLIENT_ID!,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
      authority: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || 'common'}`,
    },
  });
}

const MS_IMAP_SCOPES = [
  'https://outlook.office365.com/IMAP.AccessAsUser.All',
  'https://outlook.office365.com/SMTP.Send',
  'offline_access',
  'openid',
  'profile',
  'email',
];

router.get('/microsoft/auth-url', authMiddleware, async (req: AuthRequest, res: Response) => {
  const msalClient = getMsalClient();
  const url = await msalClient.getAuthCodeUrl({
    scopes: MS_IMAP_SCOPES,
    redirectUri: process.env.MICROSOFT_REDIRECT_URI!,
    state: req.userId,
  });
  return res.json({ url });
});

router.get('/microsoft/callback', async (req, res: Response) => {
  try {
    const { code, state: userId } = req.query;
    if (!code || !userId) {
      return res.status(400).json({ error: 'Missing code or state' });
    }

    const msalClient = getMsalClient();
    const tokenResponse = await msalClient.acquireTokenByCode({
      code: code as string,
      scopes: MS_IMAP_SCOPES,
      redirectUri: process.env.MICROSOFT_REDIRECT_URI!,
    });

    // Extract refresh token from MSAL cache
    const cache = msalClient.getTokenCache().serialize();
    const cacheData = JSON.parse(cache);
    const refreshTokens = cacheData.RefreshToken || {};
    const refreshTokenEntry = Object.values(refreshTokens)[0] as any;
    const refreshToken = refreshTokenEntry?.secret || null;

    const userEmail = tokenResponse.account?.username || '';
    const userName = tokenResponse.account?.name || userEmail;

    await prisma.emailAccount.upsert({
      where: {
        userId_email: { userId: userId as string, email: userEmail },
      },
      update: {
        accessToken: tokenResponse.accessToken,
        refreshToken: refreshToken,
        tokenExpiry: tokenResponse.expiresOn || null,
      },
      create: {
        userId: userId as string,
        provider: 'outlook',
        email: userEmail,
        displayName: userName,
        accessToken: tokenResponse.accessToken,
        refreshToken: refreshToken,
        tokenExpiry: tokenResponse.expiresOn || null,
        imapHost: 'outlook.office365.com',
        imapPort: 993,
        smtpHost: 'smtp.office365.com',
        smtpPort: 587,
        color: '#0078D4',
      },
    });

    return res.redirect(`${process.env.CLIENT_URL}/accounts?connected=outlook`);
  } catch (error) {
    console.error('Microsoft callback error:', error);
    return res.redirect(`${process.env.CLIENT_URL}/accounts?error=microsoft_failed`);
  }
});

// --- Delete account ---
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const account = await prisma.emailAccount.findFirst({
      where: { id, userId: req.userId },
    });
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    await prisma.emailAccount.delete({ where: { id } });
    return res.json({ message: 'Account deleted' });
  } catch (error) {
    console.error('Delete account error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Update account ---
router.patch('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { displayName, color, isActive } = req.body;
    const account = await prisma.emailAccount.findFirst({
      where: { id, userId: req.userId },
    });
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const updated = await prisma.emailAccount.update({
      where: { id },
      data: {
        ...(displayName !== undefined && { displayName }),
        ...(color !== undefined && { color }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return res.json(updated);
  } catch (error) {
    console.error('Update account error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
