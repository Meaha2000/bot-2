// Personality engine: CRUD and active selection. AI Engine MUST use getActivePersonality before every request.
import { v4 as uuidv4 } from 'uuid';
import { db } from './db';

export interface Personality {
  id: string;
  name: string;
  system_prompt: string;
  is_active: number;
  user_id: string;
  created_at: string;
}

const DEFAULT_SYSTEM_PROMPT = `You are a helpful, friendly assistant. Respond naturally and in character. Do not sound robotic or generic.`;

/**
 * Get the active personality for a user. Called by the AI Engine before every request.
 * If no personality is set active, returns a default so the bot still has a clear persona.
 */
export function getActivePersonality(userId: string): Personality & { system_prompt: string } {
  const row = db.prepare(
    'SELECT * FROM personalities WHERE user_id = ? AND is_active = 1'
  ).get(userId) as Personality | undefined;

  if (row) {
    return { ...row, system_prompt: row.system_prompt || DEFAULT_SYSTEM_PROMPT };
  }

  // No active personality: return a default persona (still from DB concept: "system" persona)
  return {
    id: '',
    name: 'Default',
    system_prompt: DEFAULT_SYSTEM_PROMPT,
    is_active: 1,
    user_id: userId,
    created_at: new Date().toISOString(),
  };
}

/**
 * List all personalities for a user.
 */
export function listPersonalities(userId: string): Personality[] {
  return db.prepare('SELECT * FROM personalities WHERE user_id = ? ORDER BY is_active DESC, created_at ASC')
    .all(userId) as Personality[];
}

/**
 * Create a new personality.
 */
export function createPersonality(userId: string, name: string, systemPrompt: string): Personality {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO personalities (id, name, system_prompt, is_active, user_id)
    VALUES (?, ?, ?, 0, ?)
  `).run(id, name, systemPrompt, userId);
  return db.prepare('SELECT * FROM personalities WHERE id = ?').get(id) as Personality;
}

/**
 * Update a personality.
 */
export function updatePersonality(
  userId: string,
  id: string,
  updates: { name?: string; system_prompt?: string }
): Personality | null {
  const existing = db.prepare('SELECT * FROM personalities WHERE id = ? AND user_id = ?').get(id, userId) as Personality | undefined;
  if (!existing) return null;

  const name = updates.name !== undefined ? updates.name : existing.name;
  const system_prompt = updates.system_prompt !== undefined ? updates.system_prompt : existing.system_prompt;
  db.prepare('UPDATE personalities SET name = ?, system_prompt = ? WHERE id = ?').run(name, system_prompt, id);
  return db.prepare('SELECT * FROM personalities WHERE id = ?').get(id) as Personality;
}

/**
 * Delete a personality.
 */
export function deletePersonality(userId: string, id: string): boolean {
  const result = db.prepare('DELETE FROM personalities WHERE id = ? AND user_id = ?').run(id, userId);
  return result.changes > 0;
}

/**
 * Set the active personality (only one active per user).
 */
export function setActivePersonality(userId: string, id: string): Personality | null {
  const existing = db.prepare('SELECT * FROM personalities WHERE id = ? AND user_id = ?').get(id, userId);
  if (!existing) return null;

  db.prepare('UPDATE personalities SET is_active = 0 WHERE user_id = ?').run(userId);
  db.prepare('UPDATE personalities SET is_active = 1 WHERE id = ? AND user_id = ?').run(id, userId);
  return db.prepare('SELECT * FROM personalities WHERE id = ?').get(id) as Personality;
}
