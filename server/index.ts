import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { initDb, db } from './db';
import { authenticateUser, generateToken, verifyToken, createUser } from './auth';
import { chatWithGemini } from './gemini';
import { processMedia } from './media';
import { 
  getAdapter, 
  handleIncomingMessage, 
  sendMessageWithBehavior,
  PlatformIntegration,
  IncomingMessage,
  getRandomUserAgent,
  downloadTelegramFile,
  downloadWhatsAppMedia
} from './platforms';
import {
  saveFile,
  getFileById,
  listFilesByCategory,
  listAllFiles,
  deleteFile,
  readFileContent,
  getFileStats,
  cleanupOldFiles,
  toggleFilePermanent
} from './fileStorage';
import {
  getKnowledgeBank,
  updateKnowledgeBank,
  appendToKnowledgeBank
} from './knowledgeBank';
import {
  getOrCreateUnifiedContext,
  updateContextSummary,
  addFileReference,
  getRecentContexts,
  savePlaygroundMessage,
  getPlaygroundHistory,
  getPlaygroundSessions,
  deletePlaygroundSession,
  clearPlaygroundHistory,
  getUserSettings,
  updateUserSettings,
} from './unifiedContext';
import {
  listPersonalities,
  createPersonality,
  updatePersonality,
  deletePersonality,
  setActivePersonality,
  getActivePersonality,
} from './personality';
import { getChatLogsForUser } from './chatLogs';
import { verifyIntegration } from './platformVerification';
import { startModelDiscoveryService, refreshKeyModels } from './modelDiscovery';
import { startBackgroundLearner } from './services/backgroundLearner';
import dotenv from 'dotenv';

dotenv.config();

// --- SYSTEM LOGS (In-Memory Circular Buffer) ---
const MAX_SYSTEM_LOGS = 1000;
const systemLogs: { timestamp: string; type: 'info' | 'error' | 'warn'; message: string }[] = [];

const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

function captureLog(type: 'info' | 'error' | 'warn', args: any[]) {
  try {
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    
    const entry = {
      timestamp: new Date().toISOString(),
      type,
      message
    };
    
    systemLogs.push(entry);
    if (systemLogs.length > MAX_SYSTEM_LOGS) {
      systemLogs.shift();
    }
  } catch (e) {
    // Prevent infinite loops if JSON.stringify fails
  }
}

console.log = (...args) => {
  captureLog('info', args);
  originalConsoleLog.apply(console, args);
};

console.error = (...args) => {
  captureLog('error', args);
  originalConsoleError.apply(console, args);
};

console.warn = (...args) => {
  captureLog('warn', args);
  originalConsoleWarn.apply(console, args);
};

const app = express();
const port = process.env.PORT || 3001;
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.raw({ type: 'application/json' })); // For webhook signature verification

// Serve static files from the React app
app.use(express.static(path.join(process.cwd(), 'dist')));

// Serve downloaded media files statically
// This allows the frontend to access them via /downloads/filename.ext
// IMPORTANT: In a production env, you might want more auth here, but for this local bot, it's fine.
app.use('/downloads', express.static(path.join(process.cwd(), 'data', 'downloads')));

// Initialize Database
try {
  initDb();
  console.log('Database initialized successfully');
} catch (error) {
  console.error('Failed to initialize database:', error);
}

// Ensure critical directories exist
const REQUIRED_DIRS = [
  path.join(process.cwd(), 'data', 'media'),
  path.join(process.cwd(), 'data', 'downloads'),
  path.join(process.cwd(), 'server', 'media') // Some platforms might expect this
];

REQUIRED_DIRS.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
});

// Start Model Discovery Service (periodic checks)
startModelDiscoveryService();
// startBackgroundLearner();

// Start File Cleanup Job (Daily)
// Deletes non-permanent files older than 7 days
setInterval(() => {
  console.log('[Cleanup] Starting weekly file cleanup...');
  const count = cleanupOldFiles(7);
  if (count > 0) console.log(`[Cleanup] Deleted ${count} old files.`);
}, 24 * 60 * 60 * 1000); // Run every 24 hours
// Run once on startup
cleanupOldFiles(7);

// Seed initial admin user if none exists
const adminExists = db.prepare('SELECT count(*) as count FROM users').get() as any;
if (adminExists.count === 0) {
  createUser('admin', 'admin123').then(() => {
    console.log('Default admin user created: admin / admin123 (ID: 1)');
  });
} else {
    // Ensure admin has ID 1 if possible, or just log
    // If we wanted to enforce ID 1 migration, we'd do it here, but it's risky for data integrity.
    // The createUser change ensures NEW setups work.
}

// Middleware: Auth
const authMiddleware = (req: any, res: any, next: any) => {
  let token = req.headers.authorization?.split(' ')[1];
  
  // Allow token via query param for media loading (img/video tags)
  if (!token && req.query.token) {
    token = req.query.token as string;
  }

  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  
  const user = verifyToken(token);
  if (!user) return res.status(401).json({ error: 'Invalid token' });
  
  req.user = user;
  next();
};

// --- AUTHROUTES ---
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await authenticateUser(username, password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  
  const token = generateToken(user);
  res.json({ token, user });
});

app.get('/api/auth/me', authMiddleware, (req: any, res) => {
  res.json({ user: req.user });
});

// --- BOT ROUTES ---
app.post('/api/bot/chat', authMiddleware, upload.array('files'), async (req: any, res) => {
  try {
    const { prompt, chatId } = req.body;
    const files = req.files as Express.Multer.File[];
    
    const processedMedia = [];
    if (files) {
      for (const file of files) {
        const processed = await processMedia(file.buffer, file.mimetype);
        processedMedia.push(processed);
      }
    }
    
    const result = await chatWithGemini(req.user.id, chatId || 'default', prompt, processedMedia);
    res.json(result);
  } catch (error: any) {
    // Check if it's the [NO_REPLY] signal
    if (error.message.includes('[NO_REPLY]')) {
      // Just ignore this request, send empty success
      return res.json({ status: 'ignored', reason: 'NO_REPLY' });
    }
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/bot/clear-memory', authMiddleware, (req: any, res) => {
  const { chatId } = req.body;
  const cid = chatId || 'default';
  // Only clear chat logs for the specific session. Memories are permanent user data.
  db.prepare('DELETE FROM chat_logs WHERE user_id = ? AND chat_id = ?').run(req.user.id, cid);
  res.json({ success: true });
});

// --- LOGS (every input/output in chat_logs; bot_logs for full audit) ---
app.get('/api/logs', authMiddleware, (req: any, res) => {
  const logs = db.prepare('SELECT * FROM bot_logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').all(req.user.id);
  res.json(logs);
});

app.get('/api/logs/terminal', authMiddleware, (req: any, res) => {
  // Return last 200 system logs
  const logs = systemLogs.slice(-200).reverse();
  res.json(logs);
});

app.get('/api/chat-logs', authMiddleware, (req: any, res) => {
  const chatId = req.query.chatId as string | undefined;
  const limit = parseInt(req.query.limit as string, 10) || 100;
  const offset = parseInt(req.query.offset as string, 10) || 0;
  const entries = getChatLogsForUser(req.user.id, { chatId, limit, offset });
  res.json(entries);
});

// --- PLAYGROUND HISTORY ---
app.get('/api/playground/sessions', authMiddleware, (req: any, res) => {
  const sessions = getPlaygroundSessions(req.user.id);
  res.json(sessions);
});

app.delete('/api/playground/sessions/:chatId', authMiddleware, (req: any, res) => {
  deletePlaygroundSession(req.params.chatId, req.user.id);
  res.json({ success: true });
});

app.get('/api/playground/history/:chatId', authMiddleware, (req: any, res) => {
  const history = getPlaygroundHistory(req.params.chatId, req.user.id);
  res.json(history);
});

// --- KEYS ---
app.get('/api/keys', authMiddleware, (req: any, res) => {
  const keys = db.prepare('SELECT id, key, status, last_used_at, best_model, available_models FROM gemini_keys WHERE user_id = ?').all(req.user.id);
  res.json(keys);
});

app.get('/api/models', authMiddleware, (req: any, res) => {
  try {
    // Aggregate all available models from all keys
    const keys = db.prepare("SELECT available_models FROM gemini_keys WHERE user_id = ? AND status = 'active'").all(req.user.id) as any[];
    const allModels = new Set<string>();
    
    keys.forEach(k => {
      if (k.available_models) {
        try {
          const models = JSON.parse(k.available_models);
          models.forEach((m: string) => allModels.add(m));
        } catch (e) {}
      }
    });
    
    // Also add some defaults if empty
    if (allModels.size === 0) {
      allModels.add('gemini-1.5-flash');
      allModels.add('gemini-1.5-pro');
      allModels.add('gemini-2.0-flash-exp');
    }

    res.json(Array.from(allModels).sort());
  } catch (error: any) {
    console.error('Failed to fetch models:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch models' });
  }
});

app.post('/api/keys', authMiddleware, (req: any, res) => {
  const key = req.body?.key;
  if (!key) {
    return res.status(400).json({ error: 'API key is required' });
  }
  const id = uuidv4();
  db.prepare('INSERT INTO gemini_keys (id, key, user_id) VALUES (?, ?, ?)').run(id, key, req.user.id);
  
  // Immediately discover models for this new key
  refreshKeyModels(id, key).catch(console.error);

  res.json({ id, key });
});

app.delete('/api/keys/:id', authMiddleware, (req: any, res) => {
  db.prepare('DELETE FROM gemini_keys WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// --- MEMORIES ---
app.get('/api/memories', authMiddleware, (req: any, res) => {
  const { type } = req.query;
  let query = 'SELECT * FROM user_memories WHERE user_id = ?';
  const params = [req.user.id];
  
  if (type) {
    query += ' AND memory_type = ?';
    params.push(type as string);
  }
  
  query += ' ORDER BY created_at DESC';
  
  const memories = db.prepare(query).all(...params);
  res.json(memories);
});

app.get('/api/memories/search', authMiddleware, (req: any, res) => {
  const { q, limit, offset } = req.query;
  const searchTerm = q ? `%${q}%` : '%';
  const limitVal = parseInt(limit as string, 10) || 50;
  const offsetVal = parseInt(offset as string, 10) || 0;

  try {
    // Search Chat Logs
    const logs = db.prepare(`
      SELECT 
        id, user_id, chat_id, platform, role, content, created_at, 
        chat_type, group_id, sender_id, sender_name,
        'chat_log' as entry_type
      FROM chat_logs 
      WHERE user_id = ? 
      AND (
        content LIKE ? OR 
        group_id LIKE ? OR 
        sender_id LIKE ? OR 
        sender_name LIKE ? OR
        platform LIKE ?
      )
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(
      req.user.id, 
      searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, 
      limitVal, offsetVal
    ) as any[];

    // Search User Memories
    const memories = db.prepare(`
      SELECT 
        id, user_id, NULL as chat_id, 'system' as platform, 'system' as role, content, created_at,
        NULL as chat_type, NULL as group_id, NULL as sender_id, NULL as sender_name,
        'memory' as entry_type,
        memory_type
      FROM user_memories
      WHERE user_id = ?
      AND content LIKE ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(
      req.user.id,
      searchTerm,
      limitVal, offsetVal
    ) as any[];

    // Combine and sort
    const combined = [...logs, ...memories].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // Slice again to respect limit after combination (approximate pagination)
    const sliced = combined.slice(0, limitVal);

    res.json(sliced);
  } catch (error: any) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/memories', authMiddleware, (req: any, res) => {
  const { content, type } = req.body;
  if (!content) return res.status(400).json({ error: 'Content is required' });
  
  const id = uuidv4();
  const memoryType = type || 'core';
  
  db.prepare('INSERT INTO user_memories (id, user_id, content, memory_type) VALUES (?, ?, ?, ?)').run(id, req.user.id, content, memoryType);
  res.json({ id, content, memory_type: memoryType, created_at: new Date().toISOString() });
});

app.delete('/api/memories/:id', authMiddleware, (req: any, res) => {
  db.prepare('DELETE FROM user_memories WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

app.post('/api/memories/backup', authMiddleware, (req: any, res) => {
  try {
    const memories = db.prepare('SELECT * FROM user_memories WHERE user_id = ?').all(req.user.id);
    const backupDir = path.join(process.cwd(), 'data', 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `memories_backup_${timestamp}.json`;
    const filePath = path.join(backupDir, filename);
    
    fs.writeFileSync(filePath, JSON.stringify(memories, null, 2));
    
    res.json({ success: true, filename, count: memories.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// --- PERSONALITIES (database-driven engine) ---
app.get('/api/personalities', authMiddleware, (req: any, res) => {
  res.json(listPersonalities(req.user.id));
});

app.get('/api/personalities/active', authMiddleware, (req: any, res) => {
  res.json(getActivePersonality(req.user.id));
});

app.post('/api/personalities', authMiddleware, (req: any, res) => {
  const { name, systemPrompt } = req.body;
  const p = createPersonality(req.user.id, name || 'Unnamed', systemPrompt || '');
  res.json({ id: p.id, name: p.name, system_prompt: p.system_prompt });
});

app.put('/api/personalities/:id', authMiddleware, (req: any, res) => {
  const { name, systemPrompt } = req.body;
  const p = updatePersonality(req.user.id, req.params.id, { name, system_prompt: systemPrompt });
  if (!p) return res.status(404).json({ error: 'Personality not found' });
  res.json(p);
});

app.post('/api/personalities/:id/activate', authMiddleware, (req: any, res) => {
  const p = setActivePersonality(req.user.id, req.params.id);
  if (!p) return res.status(404).json({ error: 'Personality not found' });
  res.json(p);
});

app.delete('/api/personalities/:id', authMiddleware, (req: any, res) => {
  const ok = deletePersonality(req.user.id, req.params.id);
  if (!ok) return res.status(404).json({ error: 'Personality not found' });
  res.json({ success: true });
});

// --- ADMIN MANAGEMENT ---
app.get('/api/admin/users', authMiddleware, (req: any, res) => {
  try {
    const admins = db.prepare('SELECT * FROM platform_admins WHERE user_id = ?').all(req.user.id);
    res.json(admins);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/all-users', authMiddleware, (req: any, res) => {
  try {
    const users = db.prepare(`
      SELECT 
        platform, 
        sender_id, 
        sender_name, 
        MAX(created_at) as last_seen 
      FROM chat_logs 
      WHERE user_id = ? AND role = 'user' AND sender_id IS NOT NULL 
      GROUP BY platform, sender_id 
      ORDER BY last_seen DESC
    `).all(req.user.id);
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/users', authMiddleware, (req: any, res) => {
  const { platform, platform_user_id, description } = req.body;
  if (!platform || !platform_user_id) return res.status(400).json({ error: 'Platform and User ID required' });

  try {
    const id = uuidv4();
    db.prepare('INSERT INTO platform_admins (id, platform, platform_user_id, description, user_id) VALUES (?, ?, ?, ?, ?)')
      .run(id, platform, platform_user_id, description || '', req.user.id);
    res.json({ success: true, id });
  } catch (error: any) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Admin already exists for this platform' });
    }
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/users/:id', authMiddleware, (req: any, res) => {
  try {
    db.prepare('DELETE FROM platform_admins WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- TOOLS MANAGEMENT (Updated) ---
app.get('/api/tools', authMiddleware, (req: any, res) => {
  const items = db.prepare('SELECT * FROM tools WHERE user_id = ?').all(req.user.id);
  res.json(items);
});

app.post('/api/tools', authMiddleware, (req: any, res) => {
  const { name, endpoint, description, is_admin_only } = req.body;
  const id = uuidv4();
  db.prepare('INSERT INTO tools (id, name, endpoint, description, user_id, is_admin_only) VALUES (?, ?, ?, ?, ?, ?)').run(id, name, endpoint, description, req.user.id, is_admin_only ? 1 : 0);
  res.json({ id, name, endpoint, is_admin_only: is_admin_only ? 1 : 0 });
});

app.post('/api/tools/:id/toggle', authMiddleware, (req: any, res) => {
  const tool = db.prepare('SELECT * FROM tools WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id) as any;
  if (tool) {
    db.prepare('UPDATE tools SET is_active = ? WHERE id = ?').run(tool.is_active ? 0 : 1, req.params.id);
  }
  res.json({ success: true });
});

app.post('/api/tools/:id/toggle-admin', authMiddleware, (req: any, res) => {
  const tool = db.prepare('SELECT * FROM tools WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id) as any;
  if (tool) {
    db.prepare('UPDATE tools SET is_admin_only = ? WHERE id = ?').run(tool.is_admin_only ? 0 : 1, req.params.id);
  }
  res.json({ success: true });
});

app.delete('/api/tools/:id', authMiddleware, (req: any, res) => {
  db.prepare('DELETE FROM tools WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// --- HEALTH CHECK ---
app.get('/api/health', (req, res) => {
  try {
    const result = db.prepare('SELECT 1').get();
    if (result) {
      res.json({ status: 'ok', database: 'connected' });
    } else {
      res.status(500).json({ status: 'error', database: 'disconnected' });
    }
  } catch (error) {
    res.status(500).json({ status: 'error', database: 'disconnected', error: String(error) });
  }
});

// --- STATS ---
app.get('/api/stats', authMiddleware, (req: any, res) => {
  const logs = db.prepare('SELECT count(*) as count FROM bot_logs WHERE user_id = ?').get(req.user.id) as any;
  const keys = db.prepare("SELECT count(*) as count FROM gemini_keys WHERE user_id = ? AND status = 'active'").get(req.user.id) as any;
  const memories = db.prepare('SELECT count(*) as count FROM user_memories WHERE user_id = ?').get(req.user.id) as any;
  const errors = db.prepare("SELECT count(*) as count FROM bot_logs WHERE user_id = ? AND (response_payload LIKE '%error%' OR response_payload IS NULL)").get(req.user.id) as any;
  
  const settings = db.prepare('SELECT preferred_model FROM user_settings WHERE user_id = ?').get(req.user.id) as any;
  const preferredModel = settings?.preferred_model || 'Auto';

  res.json({
    totalRequests: logs.count,
    activeKeys: keys.count,
    totalMemories: memories.count,
    errorsToday: errors.count,
    currentModel: preferredModel
  });
});

// --- PLATFORM INTEGRATIONS ---
app.get('/api/integrations', authMiddleware, (req: any, res) => {
  const items = db.prepare('SELECT * FROM platform_integrations WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json(items);
});

app.get('/api/integrations/:platform', authMiddleware, (req: any, res) => {
  const items = db.prepare('SELECT * FROM platform_integrations WHERE platform = ? AND user_id = ? ORDER BY created_at DESC').all(req.params.platform, req.user.id);
  res.json(items);
});

app.post('/api/integrations', authMiddleware, (req: any, res) => {
  const { platform, name, apiKey, apiSecret, webhookUrl, phoneNumber, botToken, pageId, accessToken, proxyUrl, typingDelayMin, typingDelayMax } = req.body;
  const id = uuidv4();
  const userAgent = getRandomUserAgent();
  
  db.prepare(`
    INSERT INTO platform_integrations (id, platform, name, api_key, api_secret, webhook_url, phone_number, bot_token, page_id, access_token, proxy_url, user_agent, typing_delay_min, typing_delay_max, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, platform, name, apiKey || null, apiSecret || null, webhookUrl || null, phoneNumber || null, botToken || null, pageId || null, accessToken || null, proxyUrl || null, userAgent, typingDelayMin || 500, typingDelayMax || 2000, req.user.id);
  
  res.json({ id, platform, name, status: 'inactive' });
});

app.put('/api/integrations/:id', authMiddleware, (req: any, res) => {
  const { name, apiKey, apiSecret, webhookUrl, phoneNumber, botToken, pageId, accessToken, proxyUrl, typingDelayMin, typingDelayMax, status } = req.body;
  
  // If credentials change, reset status to inactive to force re-verification
  let newStatus = status;
  if (botToken || accessToken || apiKey || apiSecret || phoneNumber) {
     newStatus = 'inactive';
  }

  db.prepare(`
    UPDATE platform_integrations 
    SET name = COALESCE(?, name), api_key = COALESCE(?, api_key), api_secret = COALESCE(?, api_secret), 
        webhook_url = COALESCE(?, webhook_url), phone_number = COALESCE(?, phone_number), 
        bot_token = COALESCE(?, bot_token), page_id = COALESCE(?, page_id), 
        access_token = COALESCE(?, access_token), proxy_url = COALESCE(?, proxy_url),
        typing_delay_min = COALESCE(?, typing_delay_min), typing_delay_max = COALESCE(?, typing_delay_max),
        status = COALESCE(?, status), updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).run(name, apiKey, apiSecret, webhookUrl, phoneNumber, botToken, pageId, accessToken, proxyUrl, typingDelayMin, typingDelayMax, newStatus, req.params.id, req.user.id);
  
  res.json({ success: true, status: newStatus });
});

// Real-time verification: only mark "active" after connection is verified
app.post('/api/integrations/:id/toggle', authMiddleware, async (req: any, res) => {
  const integration = db.prepare('SELECT * FROM platform_integrations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id) as any;
  if (!integration) return res.status(404).json({ error: 'Integration not found' });

  if (integration.status === 'active') {
    db.prepare('UPDATE platform_integrations SET status = ?, connection_error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('inactive', req.params.id);
    return res.json({ success: true, status: 'inactive' });
  }

  const result = await verifyIntegration(req.params.id) as any;
  if (!result.ok) {
    return res.status(400).json({ error: result.error, status: 'error', connection_error: result.error });
  }
  res.json({ success: true, status: 'active', message: result.message });
});

app.get('/api/integrations/:id/verify', authMiddleware, async (req: any, res) => {
  const integration = db.prepare('SELECT * FROM platform_integrations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!integration) return res.status(404).json({ error: 'Integration not found' });

  const result = await verifyIntegration(req.params.id) as any;
  if (result.ok) {
    return res.json({ success: true, message: result.message });
  }
  res.status(400).json({ success: false, error: result.error });
});

app.delete('/api/integrations/:id', authMiddleware, (req: any, res) => {
  db.prepare('DELETE FROM platform_integrations WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// --- WEBHOOK RECEIVERS ---
// Fix for Telegram Webhook 404 - Explicit /api/telegram route
app.post('/api/telegram', async (req, res) => {
  try {
    // For single admin mode, we look for the active telegram integration for the admin (or any active one)
    // We prioritize the admin user (ID 1)
    let integration = db.prepare("SELECT * FROM platform_integrations WHERE platform = 'telegram' AND user_id = '1' AND status = 'active'").get() as any;
    
    // Fallback: any active telegram integration
    if (!integration) {
        integration = db.prepare("SELECT * FROM platform_integrations WHERE platform = 'telegram' AND status = 'active' LIMIT 1").get() as any;
    }

    if (!integration) {
      return res.status(404).json({ error: 'No active Telegram integration found' });
    }

    console.log('[WEBHOOK] Telegram payload (Global Route):', JSON.stringify(req.body, null, 2));
    
    const adapter = getAdapter('telegram');
    const message = adapter.parseWebhook(req.body);
    
    if (message) {
      message.integrationId = integration.id;
      // Process message asynchronously
      processIncomingMessage(integration, message).catch(console.error);
    }
    
    res.json({ ok: true });
  } catch (error) {
    console.error('[WEBHOOK] Telegram error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

app.post('/api/webhooks/telegram/:integrationId', async (req, res) => {
  try {
    const integration = db.prepare('SELECT * FROM platform_integrations WHERE id = ? AND platform = ?').get(req.params.integrationId, 'telegram') as any;
    if (!integration || integration.status !== 'active') {
      return res.status(404).json({ error: 'Integration not found or inactive' });
    }

    console.log('[WEBHOOK] Telegram payload:', JSON.stringify(req.body, null, 2));
    
    const adapter = getAdapter('telegram');
    const message = adapter.parseWebhook(req.body);
    
    if (message) {
      message.integrationId = integration.id;
      // Process message asynchronously
      processIncomingMessage(integration, message).catch(console.error);
    }
    
    res.json({ ok: true });
  } catch (error) {
    console.error('[WEBHOOK] Telegram error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

app.post('/api/webhooks/whatsapp/:integrationId', async (req, res) => {
  try {
    const integration = db.prepare('SELECT * FROM platform_integrations WHERE id = ? AND platform = ?').get(req.params.integrationId, 'whatsapp') as any;
    if (!integration || integration.status !== 'active') {
      return res.status(404).json({ error: 'Integration not found or inactive' });
    }

    console.log('[WEBHOOK] WhatsApp payload:', JSON.stringify(req.body, null, 2));
    
    // Handle verification challenge
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token']) {
      return res.send(req.query['hub.challenge']);
    }
    
    const adapter = getAdapter('whatsapp');
    const message = adapter.parseWebhook(req.body);
    
    if (message) {
      message.integrationId = integration.id;
      processIncomingMessage(integration, message).catch(console.error);
    }
    
    res.json({ ok: true });
  } catch (error) {
    console.error('[WEBHOOK] WhatsApp error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

app.get('/api/webhooks/whatsapp/:integrationId', async (req, res) => {
  // WhatsApp webhook verification
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token']) {
    console.log('[WEBHOOK] WhatsApp verification request');
    
    try {
      const integration = db.prepare('SELECT api_key FROM platform_integrations WHERE id = ?').get(req.params.integrationId) as any;
      // If user set a verify token (api_key), check it.
      if (integration && integration.api_key) {
        if (req.query['hub.verify_token'] !== integration.api_key) {
          console.error('[WEBHOOK] WhatsApp verification failed: Token mismatch');
          return res.status(403).send('Verification failed');
        }
      }
      return res.send(req.query['hub.challenge']);
    } catch (e) {
      console.error('[WEBHOOK] WhatsApp verification DB error:', e);
      return res.status(500).send('Internal Server Error');
    }
  }
  res.status(400).send('Invalid verification');
});

app.post('/api/webhooks/messenger/:integrationId', async (req, res) => {
  try {
    const integration = db.prepare('SELECT * FROM platform_integrations WHERE id = ? AND platform = ?').get(req.params.integrationId, 'messenger') as any;
    if (!integration || integration.status !== 'active') {
      return res.status(404).json({ error: 'Integration not found or inactive' });
    }

    console.log('[WEBHOOK] Messenger payload:', JSON.stringify(req.body, null, 2));
    
    const adapter = getAdapter('messenger');
    const message = adapter.parseWebhook(req.body);
    
    if (message) {
      message.integrationId = integration.id;
      processIncomingMessage(integration, message).catch(console.error);
    }
    
    res.json({ ok: true });
  } catch (error) {
    console.error('[WEBHOOK] Messenger error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

app.get('/api/webhooks/messenger/:integrationId', async (req, res) => {
  // Messenger webhook verification
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token']) {
    console.log('[WEBHOOK] Messenger verification request');
    
    try {
      const integration = db.prepare('SELECT api_key FROM platform_integrations WHERE id = ?').get(req.params.integrationId) as any;
      // If user set a verify token (api_key), check it.
      if (integration && integration.api_key) {
        if (req.query['hub.verify_token'] !== integration.api_key) {
          console.error('[WEBHOOK] Messenger verification failed: Token mismatch');
          return res.status(403).send('Verification failed');
        }
      }
      return res.send(req.query['hub.challenge']);
    } catch (e) {
      console.error('[WEBHOOK] Messenger verification DB error:', e);
      return res.status(500).send('Internal Server Error');
    }
  }
  res.status(400).send('Invalid verification');
});

// Central flow: all platform messages through DB and AI Engine + active personality
async function processIncomingMessage(integration: any, message: IncomingMessage) {
  try {
    getOrCreateUnifiedContext(message.senderId, message.platform, message.chatId, integration.user_id);

    // Handle Media Processing
    let mediaForGemini: any[] = [];
    if (message.mediaUrl) {
      try {
        let mediaBuffer: Buffer | null = null;
        let mimeType = message.mediaType === 'image' ? 'image/jpeg' : 
                       message.mediaType === 'audio' ? 'audio/mp3' : 
                       message.mediaType === 'video' ? 'video/mp4' : 'application/octet-stream';

        if (message.platform === 'telegram') {
          const result = await downloadTelegramFile(integration.bot_token, message.mediaUrl);
          mediaBuffer = result.buffer;
          // Detect mime based on extension or default
          if (result.fileName.endsWith('.jpg')) mimeType = 'image/jpeg';
          else if (result.fileName.endsWith('.png')) mimeType = 'image/png';
          else if (result.fileName.endsWith('.mp4')) mimeType = 'video/mp4';
          else if (result.fileName.endsWith('.ogg')) mimeType = 'audio/ogg';
        } else if (message.platform === 'whatsapp') {
          const result = await downloadWhatsAppMedia(message.mediaUrl, integration.access_token);
          mediaBuffer = result.buffer;
          mimeType = result.mimeType;
        } else if (message.platform === 'messenger') {
          // Messenger URLs are usually accessible directly
          const res = await fetch(message.mediaUrl);
          const arrayBuffer = await res.arrayBuffer();
          mediaBuffer = Buffer.from(arrayBuffer);
          // Mime type usually in headers or inferred
          const headerMime = res.headers.get('content-type');
          if (headerMime) mimeType = headerMime;
        }

        if (mediaBuffer) {
           const processed = await processMedia(mediaBuffer, mimeType);
           mediaForGemini.push({
             data: processed.data,
             mimeType: processed.mimeType
           });
           
           // Also save to file storage for record keeping
           await saveFile(mediaBuffer, `${uuidv4()}.${mimeType.split('/')[1]}`, mimeType, integration.user_id, {
             platform: message.platform,
             chatId: message.chatId,
             messageId: message.messageId
           });
        }
      } catch (e) {
        console.error('Failed to process media:', e);
      }
    }

    const chatId = `${message.platform}-${message.chatId}`;
    const response = await chatWithGemini(integration.user_id, chatId, message.content, mediaForGemini, { 
      platform: message.platform,
      chatType: message.chatType,
      groupId: message.groupId,
      senderId: message.senderId,
      senderName: message.senderName
    });
    
    // Send response with human-like behavior
    const platformIntegration: PlatformIntegration = {
      id: integration.id,
      platform: integration.platform,
      name: integration.name,
      botToken: integration.bot_token,
      accessToken: integration.access_token,
      phoneNumber: integration.phone_number,
      status: integration.status,
      typingDelayMin: integration.typing_delay_min,
      typingDelayMax: integration.typing_delay_max,
      userAgent: integration.user_agent,
      userId: integration.user_id,
      createdAt: integration.created_at,
      updatedAt: integration.updated_at,
    };
    
    await sendMessageWithBehavior(platformIntegration, {
      chatId: message.chatId,
      content: response.response,
      replyToMessageId: message.messageId,
    });
    
    // Update context
    updateContextSummary(message.senderId, message.platform, integration.user_id, response.response.substring(0, 200));
    
  } catch (error) {
    console.error('Error processing message:', error);
  }
}

// --- FILE STORAGE ---
app.get('/api/files', authMiddleware, (req: any, res) => {
  const category = req.query.category as string;
  const files = category ? listFilesByCategory(category, req.user.id) : listAllFiles(req.user.id);
  res.json(files);
});

app.get('/api/files/stats', authMiddleware, (req: any, res) => {
  const stats = getFileStats(req.user.id);
  res.json(stats);
});

app.get('/api/files/path', authMiddleware, (req: any, res) => {
  res.json({ path: path.join(process.cwd(), 'data', 'media') });
});

app.get('/api/files/:id', authMiddleware, (req: any, res) => {
  const file = getFileById(req.params.id, req.user.id);
  if (!file) return res.status(404).json({ error: 'File not found' });
  res.json(file);
});

app.get('/api/files/:id/download', authMiddleware, (req: any, res) => {
  const file = getFileById(req.params.id, req.user.id);
  if (!file) return res.status(404).json({ error: 'File not found' });
  
  const content = readFileContent(req.params.id, req.user.id);
  if (!content) return res.status(404).json({ error: 'File content not found' });
  
  res.setHeader('Content-Type', file.mime_type);
  res.setHeader('Content-Disposition', `attachment; filename="${file.original_name}"`);
  res.send(content);
});

app.post('/api/files', authMiddleware, upload.single('file'), async (req: any, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file provided' });
    
    const result = await saveFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      req.user.id,
      {
        platform: req.body.platform,
        chatId: req.body.chatId,
        messageId: req.body.messageId,
      }
    );
    
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/files/:id', authMiddleware, (req: any, res) => {
  const success = deleteFile(req.params.id, req.user.id);
  if (!success) return res.status(404).json({ error: 'File not found' });
  res.json({ success: true });
});

app.patch('/api/files/:id/toggle-permanent', authMiddleware, (req: any, res) => {
  const success = toggleFilePermanent(req.params.id, req.user.id);
  if (!success) return res.status(404).json({ error: 'File not found or failed to update' });
  
  const file = getFileById(req.params.id, req.user.id);
  res.json({ success: true, is_permanent: file.is_permanent });
});

// --- KNOWLEDGE BANK ---
app.get('/api/knowledge-bank', authMiddleware, (req: any, res) => {
  res.json({ content: getKnowledgeBank() });
});

app.post('/api/knowledge-bank', authMiddleware, (req: any, res) => {
  const { content } = req.body;
  if (typeof content !== 'string') return res.status(400).json({ error: 'Content must be a string' });
  
  updateKnowledgeBank(content);
  res.json({ success: true });
});

app.post('/api/files/:id/process-knowledge', authMiddleware, async (req: any, res) => {
  try {
    const file = getFileById(req.params.id, req.user.id);
    if (!file) return res.status(404).json({ error: 'File not found' });
    
    const buffer = readFileContent(req.params.id, req.user.id);
    if (!buffer) return res.status(404).json({ error: 'File content not found' });
    
    // Process with Gemini
    const mimeType = file.mime_type;
    const { data: base64Data, mimeType: finalMime } = await processMedia(buffer, mimeType);
    
    const mediaItem = {
      data: base64Data,
      mimeType: finalMime
    };
    
    const prompt = "Please analyze this file and extract key knowledge, facts, and rules that should be added to your long-term 'Knowledge Bank'. Be concise, structured, and informative. Focus on lasting information.";
    
    // We use a temporary chat ID for this processing to not pollute main chats
    const tempChatId = `processing-${uuidv4()}`;
    
    const response = await chatWithGemini(req.user.id, tempChatId, prompt, [mediaItem], {
      platform: 'system',
      chatType: 'private'
    });
    
    // Append to Knowledge Bank
    appendToKnowledgeBank(`### Analysis of ${file.original_name}\n\n${response.response}`);
    
    res.json({ success: true, summary: response.response });
  } catch (error: any) {
    console.error('Failed to process file for knowledge bank:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/downloads/process-knowledge', authMiddleware, async (req: any, res) => {
  try {
    const { category, filename } = req.body;
    if (!category || !filename) return res.status(400).json({ error: 'Category and filename required' });

    const filePath = path.join(process.cwd(), 'data', 'downloads', category, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const buffer = fs.readFileSync(filePath);
    
    // Determine mime type
    let mimeType = 'application/octet-stream';
    if (category === 'image') mimeType = 'image/jpeg'; // Simplification, processMedia handles extension usually
    else if (category === 'video') mimeType = 'video/mp4';
    else if (category === 'audio') mimeType = 'audio/mp3';
    
    // Process with Gemini
    const { data: base64Data, mimeType: finalMime } = await processMedia(buffer, mimeType);
    
    const mediaItem = {
      data: base64Data,
      mimeType: finalMime
    };
    
    const prompt = "Please analyze this downloaded file and extract key knowledge, facts, and rules that should be added to your long-term 'Knowledge Bank'. Be concise, structured, and informative. Focus on lasting information.";
    
    // We use a temporary chat ID for this processing
    const tempChatId = `processing-dl-${uuidv4()}`;
    
    const response = await chatWithGemini(req.user.id, tempChatId, prompt, [mediaItem], {
      platform: 'system',
      chatType: 'private'
    });
    
    // Append to Knowledge Bank
    appendToKnowledgeBank(`### Analysis of Downloaded File: ${filename}\n\n${response.response}`);
    
    res.json({ success: true, summary: response.response });
  } catch (error: any) {
    console.error('Failed to process download for knowledge bank:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- DOWNLOADS BROWSER ---
app.get('/api/downloads', authMiddleware, (req: any, res) => {
  try {
    const downloadsRoot = path.join(process.cwd(), 'data', 'downloads');
    if (!fs.existsSync(downloadsRoot)) {
      return res.json([]);
    }

    const files: any[] = [];
    
    // Helper to scan a directory
    const scanDir = (dirPath: string, category: string) => {
        if (!fs.existsSync(dirPath)) return;
        const entries = fs.readdirSync(dirPath);
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry);
            try {
              const stats = fs.statSync(fullPath);
              if (stats.isFile()) {
                  files.push({
                      name: entry,
                      category: category, // 'image', 'video', 'audio', 'document'
                      url: `/downloads/${category}/${entry}`, // Web-accessible path
                      size: stats.size,
                      created_at: stats.birthtime,
                      modified_at: stats.mtime
                  });
              }
            } catch (e) {
              // Ignore files we can't read
            }
        }
    };

    // Scan known categories matching the downloader logic
    // See gemini.ts downloadMedia function
    const categories = ['image', 'video', 'audio', 'document'];
    
    // Also scan root just in case, or unknown folders? 
    // For now, let's stick to the structure we enforce.
    categories.forEach(cat => {
        scanDir(path.join(downloadsRoot, cat), cat);
    });
    
    // Sort by newest first
    files.sort((a, b) => new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime());

    res.json(files);
  } catch (error: any) {
    console.error('Failed to list downloads:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- BACKUPS ---
app.post('/api/settings/backup-memories', authMiddleware, async (req: any, res) => {
  try {
    const backupDir = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const memories = db.prepare('SELECT * FROM user_memories').all();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `memories-backup-${timestamp}.json`;
    const filePath = path.join(backupDir, filename);

    fs.writeFileSync(filePath, JSON.stringify(memories, null, 2));

    res.json({ success: true, message: `Backup created: ${filename}` });
  } catch (error: any) {
    console.error('Backup failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- PLAYGROUND HISTORY ---
app.get('/api/playground/sessions', authMiddleware, (req: any, res) => {
  const sessions = getPlaygroundSessions(req.user.id);
  res.json(sessions);
});

app.get('/api/playground/history/:chatId', authMiddleware, (req: any, res) => {
  const history = getPlaygroundHistory(req.params.chatId, req.user.id);
  res.json(history);
});

app.post('/api/playground/message', authMiddleware, (req: any, res) => {
  const { chatId, role, content, mediaIds } = req.body;
  const message = savePlaygroundMessage(chatId, role, content, req.user.id, mediaIds);
  res.json(message);
});

app.delete('/api/playground/session/:chatId', authMiddleware, (req: any, res) => {
  deletePlaygroundSession(req.params.chatId, req.user.id);
  res.json({ success: true });
});

app.delete('/api/playground/history', authMiddleware, (req: any, res) => {
  clearPlaygroundHistory(req.user.id);
  res.json({ success: true });
});

// --- USER SETTINGS ---
app.get('/api/settings/user', authMiddleware, (req: any, res) => {
  const settings = getUserSettings(req.user.id);
  res.json(settings);
});

app.put('/api/settings/user', authMiddleware, (req: any, res) => {
  const { 
    darkMode, typingSimulation, antiDetection, defaultPersonalityId, 
    preferredModel, temperature, maxOutputTokens,
    enableWebSearch, enableWeather, enableCalculator, enableScraper,
    enableGithub, enableCurrency
  } = req.body;
  
  // Basic update
  updateUserSettings(req.user.id, { 
    darkMode, typingSimulation, antiDetection, defaultPersonalityId,
    enableWebSearch, enableWeather, enableCalculator, enableScraper,
    enableGithub, enableCurrency
  });
  
  // Special handling for preferredModel and extended settings
  db.prepare(`
    UPDATE user_settings 
    SET preferred_model = COALESCE(?, preferred_model), 
        temperature = COALESCE(?, temperature),
        max_output_tokens = COALESCE(?, max_output_tokens),
        updated_at = CURRENT_TIMESTAMP 
    WHERE user_id = ?
  `).run(preferredModel, temperature, maxOutputTokens, req.user.id);
  
  res.json({ success: true });
});

// --- UNIFIED CONTEXT ---
app.get('/api/context/recent', authMiddleware, (req: any, res) => {
  const contexts = getRecentContexts(req.user.id);
  res.json(contexts);
});

// --- MODEL STATUS ---
app.get('/api/models/status', authMiddleware, (req: any, res) => {
  try {
    const keys = db.prepare("SELECT id, available_models, best_model, last_used_at, status FROM gemini_keys WHERE status = 'active'").all() as any[];
    
    // Aggregate all unique models found across all keys
    const allModels: any[] = [];
    const seen = new Set();

    keys.forEach(key => {
      if (key.available_models) {
        try {
          const parsed = JSON.parse(key.available_models);
          // Handle both string array and object array
          const models = Array.isArray(parsed) ? parsed : [];
          
          models.forEach((m: any) => {
            const name = typeof m === 'string' ? m : m.name;
            const keyString = `${name}-${key.id}`; // Unique per key-model combo? Or just unique models globally?
            // User wants to know available models. 
            // If we just list unique models, we can show their best limits found.
            
            if (!seen.has(name)) {
              seen.add(name);
              allModels.push(typeof m === 'string' ? { name: m } : m);
            }
          });
        } catch (e) {}
      }
    });

    res.json({ keys: keys.length, models: allModels });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- HEALTH CHECK ---
app.get('/api/health', (req, res) => {
  try {
    const dbStatus = db.prepare('SELECT 1').get();
    res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  } catch (e: any) {
    res.status(500).json({ status: 'error', database: 'disconnected', error: e.message });
  }
});

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});