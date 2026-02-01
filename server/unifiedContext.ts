// Unified Context Engine - Cross-Platform Memory
import { v4 as uuidv4 } from 'uuid';
import { db } from './db';

export interface UnifiedContext {
  id: string;
  externalUserId: string;
  platform: string;
  chatId: string;
  contextSummary: string | null;
  fileReferences: string | null;
  lastInteraction: string;
  userId: string;
  createdAt: string;
}

export interface PlaygroundMessage {
  id: string;
  chatId: string;
  role: 'user' | 'assistant';
  content: string;
  mediaIds: string | null;
  platform: string;
  userId: string;
  createdAt: string;
}

// Get or create unified context for an external user
export function getOrCreateUnifiedContext(
  externalUserId: string,
  platform: string,
  chatId: string,
  userId: string
): UnifiedContext {
  let context = db.prepare(
    'SELECT * FROM unified_context WHERE external_user_id = ? AND platform = ? AND user_id = ?'
  ).get(externalUserId, platform, userId) as UnifiedContext | undefined;

  if (!context) {
    const id = uuidv4();
    db.prepare(`
      INSERT INTO unified_context (id, external_user_id, platform, chat_id, user_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, externalUserId, platform, chatId, userId);
    
    context = db.prepare('SELECT * FROM unified_context WHERE id = ?').get(id) as UnifiedContext;
  }

  return context;
}

// Update context summary
export function updateContextSummary(
  externalUserId: string,
  platform: string,
  userId: string,
  summary: string
): void {
  db.prepare(`
    UPDATE unified_context 
    SET context_summary = ?, last_interaction = CURRENT_TIMESTAMP 
    WHERE external_user_id = ? AND platform = ? AND user_id = ?
  `).run(summary, externalUserId, platform, userId);
}

// Add file reference to context
export function addFileReference(
  externalUserId: string,
  platform: string,
  userId: string,
  fileId: string
): void {
  const context = db.prepare(
    'SELECT file_references FROM unified_context WHERE external_user_id = ? AND platform = ? AND user_id = ?'
  ).get(externalUserId, platform, userId) as { file_references: string | null } | undefined;

  if (context) {
    const refs = context.file_references ? JSON.parse(context.file_references) : [];
    refs.push(fileId);
    db.prepare(`
      UPDATE unified_context 
      SET file_references = ?, last_interaction = CURRENT_TIMESTAMP 
      WHERE external_user_id = ? AND platform = ? AND user_id = ?
    `).run(JSON.stringify(refs), externalUserId, platform, userId);
  }
}

// Get all contexts for a user across platforms
export function getAllContextsForExternalUser(
  externalUserId: string,
  userId: string
): UnifiedContext[] {
  return db.prepare(
    'SELECT * FROM unified_context WHERE external_user_id = ? AND user_id = ? ORDER BY last_interaction DESC'
  ).all(externalUserId, userId) as UnifiedContext[];
}

// Get recent contexts
export function getRecentContexts(userId: string, limit = 20): UnifiedContext[] {
  return db.prepare(
    'SELECT * FROM unified_context WHERE user_id = ? ORDER BY last_interaction DESC LIMIT ?'
  ).all(userId, limit) as UnifiedContext[];
}

// === Playground History ===

// Save playground message
export function savePlaygroundMessage(
  chatId: string,
  role: 'user' | 'assistant',
  content: string,
  userId: string,
  mediaIds?: string[]
): PlaygroundMessage {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO playground_history (id, chat_id, role, content, media_ids, user_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, chatId, role, content, mediaIds ? JSON.stringify(mediaIds) : null, userId);

  return db.prepare('SELECT * FROM playground_history WHERE id = ?').get(id) as PlaygroundMessage;
}

// Get playground history
export function getPlaygroundHistory(chatId: string, userId: string, limit = 50): PlaygroundMessage[] {
  return db.prepare(
    'SELECT * FROM playground_history WHERE chat_id = ? AND user_id = ? ORDER BY created_at ASC LIMIT ?'
  ).all(chatId, userId, limit) as PlaygroundMessage[];
}

// Get all playground sessions
export function getPlaygroundSessions(userId: string): { chatId: string; messageCount: number; lastMessage: string }[] {
  return db.prepare(`
    SELECT chat_id as chatId, COUNT(*) as messageCount, MAX(created_at) as lastMessage
    FROM playground_history 
    WHERE user_id = ? 
    GROUP BY chat_id 
    ORDER BY lastMessage DESC
  `).all(userId) as any[];
}

// Delete playground session
export function deletePlaygroundSession(chatId: string, userId: string): void {
  db.prepare('DELETE FROM playground_history WHERE chat_id = ? AND user_id = ?').run(chatId, userId);
}

// Clear all playground history
export function clearPlaygroundHistory(userId: string): void {
  db.prepare('DELETE FROM playground_history WHERE user_id = ?').run(userId);
}

// === User Settings ===

export interface UserSettings {
  id: string;
  userId: string;
  darkMode: boolean;
  typingSimulation: boolean;
  antiDetection: boolean;
  defaultPersonalityId: string | null;
  preferredModel?: string;
  temperature?: number;
  maxOutputTokens?: number;
  enableWebSearch?: boolean;
  enableWeather?: boolean;
  enableCalculator?: boolean;
  enableScraper?: boolean;
  enableGithub?: boolean;
  enableCurrency?: boolean;
}

// Get or create user settings
export function getUserSettings(userId: string): UserSettings {
  let settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId) as any;

  if (!settings) {
    const id = uuidv4();
    db.prepare('INSERT INTO user_settings (id, user_id) VALUES (?, ?)').run(id, userId);
    settings = db.prepare('SELECT * FROM user_settings WHERE id = ?').get(id);
  }

  return {
    id: settings.id,
    userId: settings.user_id,
    darkMode: settings.dark_mode === 1,
    typingSimulation: settings.typing_simulation === 1,
    antiDetection: settings.anti_detection === 1,
    defaultPersonalityId: settings.default_personality_id,
    preferredModel: settings.preferred_model,
    temperature: settings.temperature,
    maxOutputTokens: settings.max_output_tokens,
    enableWebSearch: settings.enable_web_search !== 0,
    enableWeather: settings.enable_weather !== 0,
    enableCalculator: settings.enable_calculator !== 0,
    enableScraper: settings.enable_scraper !== 0,
    enableGithub: settings.enable_github !== 0,
    enableCurrency: settings.enable_currency !== 0
  };
}

// Update user settings
export function updateUserSettings(
  userId: string,
  updates: Partial<Omit<UserSettings, 'id' | 'userId'>>
): void {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.darkMode !== undefined) {
    fields.push('dark_mode = ?');
    values.push(updates.darkMode ? 1 : 0);
  }
  if (updates.typingSimulation !== undefined) {
    fields.push('typing_simulation = ?');
    values.push(updates.typingSimulation ? 1 : 0);
  }
  if (updates.antiDetection !== undefined) {
    fields.push('anti_detection = ?');
    values.push(updates.antiDetection ? 1 : 0);
  }
  if (updates.defaultPersonalityId !== undefined) {
    fields.push('default_personality_id = ?');
    values.push(updates.defaultPersonalityId);
  }
  if (updates.enableWebSearch !== undefined) {
    fields.push('enable_web_search = ?');
    values.push(updates.enableWebSearch ? 1 : 0);
  }
  if (updates.enableWeather !== undefined) {
    fields.push('enable_weather = ?');
    values.push(updates.enableWeather ? 1 : 0);
  }
  if (updates.enableCalculator !== undefined) {
    fields.push('enable_calculator = ?');
    values.push(updates.enableCalculator ? 1 : 0);
  }
  if (updates.enableScraper !== undefined) {
    fields.push('enable_scraper = ?');
    values.push(updates.enableScraper ? 1 : 0);
  }
  if (updates.enableGithub !== undefined) {
    fields.push('enable_github = ?');
    values.push(updates.enableGithub ? 1 : 0);
  }
  if (updates.enableCurrency !== undefined) {
    fields.push('enable_currency = ?');
    values.push(updates.enableCurrency ? 1 : 0);
  }

  if (fields.length > 0) {
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(userId);
    db.prepare(`UPDATE user_settings SET ${fields.join(', ')} WHERE user_id = ?`).run(...values);
  }
}
