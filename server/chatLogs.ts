// Chat logs: every input and output for contextual awareness and audit
import { v4 as uuidv4 } from 'uuid';
import { db } from './db';

const DEFAULT_CONTEXT_LIMIT = 10;

export interface ChatLogEntry {
  id: string;
  user_id: string;
  chat_id: string;
  platform: string;
  role: 'user' | 'model';
  content: string;
  raw_response: string | null;
  created_at: string;
  chat_type?: string;
  group_id?: string;
  sender_id?: string;
  sender_name?: string;
}

/**
 * Append a single message (user or model) to chat_logs. Used for every input and output.
 */
export function appendChatLog(
  userId: string,
  chatId: string,
  role: 'user' | 'model',
  content: string,
  options: { 
    platform?: string; 
    rawResponse?: string;
    chatType?: 'private' | 'group';
    groupId?: string;
    senderId?: string;
    senderName?: string;
  } = {}
): ChatLogEntry {
  const id = uuidv4();
  const platform = options.platform ?? 'playground';
  const chatType = options.chatType ?? 'private';
  const groupId = options.groupId ?? null;
  const senderId = options.senderId ?? null;
  const senderName = options.senderName ?? null;

  db.prepare(`
    INSERT INTO chat_logs (id, user_id, chat_id, platform, role, content, raw_response, chat_type, group_id, sender_id, sender_name)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, chatId, platform, role, content, options.rawResponse ?? null, chatType, groupId, senderId, senderName);
  return db.prepare('SELECT * FROM chat_logs WHERE id = ?').get(id) as ChatLogEntry;
}

/**
 * Get the last N messages for a (user_id, chat_id) for multi-turn context.
 * Returns in chronological order (oldest first) for Gemini history.
 */
export function getRecentChatLogs(
  userId: string,
  chatId: string,
  limit: number = DEFAULT_CONTEXT_LIMIT,
  options: {
    platform?: string;
    chatType?: 'private' | 'group';
    groupId?: string;
    senderId?: string;
  } = {}
): { role: string; content: string }[] {
  const { chatType, groupId, senderId, platform } = options;
  let rows: { role: string; content: string }[] = [];

  if (chatType === 'group' && groupId && platform) {
     const rawRows = db.prepare(`
        SELECT role, content, sender_name
        FROM chat_logs
        WHERE user_id = ? AND group_id = ? AND platform = ?
        ORDER BY created_at DESC
        LIMIT ?
     `).all(userId, groupId, platform, limit) as { role: string; content: string; sender_name: string | null }[];

     rows = rawRows.map(r => ({
       role: r.role,
       content: (r.role === 'user' && r.sender_name) ? `[${r.sender_name}]: ${r.content}` : r.content
     }));
  } else if (chatType === 'private' && senderId && platform && platform !== 'playground') {
     // User Bridge Logic: Fetch logs for this sender on this platform
     rows = db.prepare(`
        SELECT role, content
        FROM chat_logs
        WHERE user_id = ? AND platform = ? AND sender_id = ?
        ORDER BY created_at DESC
        LIMIT ?
     `).all(userId, platform, senderId, limit) as { role: string; content: string }[];
  } else {
     // Fallback for playground or missing context
     rows = db.prepare(`
        SELECT role, content
        FROM chat_logs
        WHERE user_id = ? AND chat_id = ?
        ORDER BY created_at DESC
        LIMIT ?
     `).all(userId, chatId, limit) as { role: string; content: string }[];
  }

  return rows.reverse();
}

/**
 * Get chat logs for a user (for logs UI / review).
 */
export function getChatLogsForUser(
  userId: string,
  options: { chatId?: string; limit?: number; offset?: number } = {}
): ChatLogEntry[] {
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;
  if (options.chatId) {
    return db.prepare(`
      SELECT * FROM chat_logs
      WHERE user_id = ? AND chat_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(userId, options.chatId, limit, offset) as ChatLogEntry[];
  }
  return db.prepare(`
    SELECT * FROM chat_logs
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(userId, limit, offset) as ChatLogEntry[];
}
