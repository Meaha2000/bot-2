import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'database.sqlite');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Ensure multi-modal file directories exist
const MEDIA_DIRS = ['images', 'videos', 'audios', 'documents'];
MEDIA_DIRS.forEach(dir => {
  const mediaPath = path.join(process.cwd(), 'data', 'media', dir);
  if (!fs.existsSync(mediaPath)) {
    fs.mkdirSync(mediaPath, { recursive: true });
  }
});

export const db: Database.Database = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -2000'); // 2MB cache
db.pragma('temp_store = MEMORY');
db.pragma('foreign_keys = OFF');

const DB_VERSION = 2;

function getDbVersion(): number {
  try {
    const row = db.prepare("SELECT value FROM _schema_version WHERE key = 'version'").get() as { value: string } | undefined;
    return row ? parseInt(row.value, 10) : 0;
  } catch {
    return 0;
  }
}

function setDbVersion(version: number): void {
  db.prepare("INSERT OR REPLACE INTO _schema_version (key, value) VALUES ('version', ?)").run(String(version));
}

// Initialize tables and run migrations
export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _schema_version (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS gemini_keys (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      last_used_at DATETIME,
      user_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS personalities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      system_prompt TEXT NOT NULL,
      is_active INTEGER DEFAULT 0,
      user_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      context TEXT NOT NULL,
      user_id TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id),
      UNIQUE(chat_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS user_memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS bot_logs (
      id TEXT PRIMARY KEY,
      request_payload TEXT,
      response_payload TEXT,
      raw_response TEXT,
      api_key_used TEXT,
      user_id TEXT,
      chat_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS tools (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      api_key TEXT,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      is_admin_only INTEGER DEFAULT 0,
      user_id TEXT,
      method TEXT DEFAULT 'POST',
      headers TEXT DEFAULT '{}',
      parameter_schema TEXT DEFAULT '{}',
      auth_type TEXT,
      auth_param_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS platform_admins (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      platform_user_id TEXT NOT NULL,
      description TEXT,
      user_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id),
      UNIQUE(platform, platform_user_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS platform_integrations (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      name TEXT NOT NULL,
      api_key TEXT,
      api_secret TEXT,
      webhook_url TEXT,
      phone_number TEXT,
      bot_token TEXT,
      page_id TEXT,
      access_token TEXT,
      status TEXT DEFAULT 'inactive',
      proxy_url TEXT,
      user_agent TEXT,
      typing_delay_min INTEGER DEFAULT 500,
      typing_delay_max INTEGER DEFAULT 2000,
      user_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS media_files (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      category TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      platform TEXT,
      chat_id TEXT,
      message_id TEXT,
      processed INTEGER DEFAULT 0,
      extracted_text TEXT,
      user_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS playground_history (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      media_ids TEXT,
      platform TEXT DEFAULT 'playground',
      user_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS unified_context (
      id TEXT PRIMARY KEY,
      external_user_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      context_summary TEXT,
      file_references TEXT,
      last_interaction DATETIME DEFAULT CURRENT_TIMESTAMP,
      user_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id),
      UNIQUE(external_user_id, platform, user_id)
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      dark_mode INTEGER DEFAULT 0,
      typing_simulation INTEGER DEFAULT 1,
      anti_detection INTEGER DEFAULT 1,
      default_personality_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(default_personality_id) REFERENCES personalities(id)
    );

  `);

  // Migration for is_admin_only if column doesn't exist
  try {
    db.prepare("ALTER TABLE tools ADD COLUMN is_admin_only INTEGER DEFAULT 0").run();
  } catch (e) {
    // Column already exists
  }

  try {
    db.prepare("ALTER TABLE user_settings ADD COLUMN admin_tools TEXT DEFAULT '[]'").run();
  } catch (e) {
    // Column already exists
  }

  try {
    db.prepare("ALTER TABLE tools ADD COLUMN parameter_schema TEXT DEFAULT '{}'").run();
  } catch (e) {
    // Column already exists
  }

  try {
    db.prepare("ALTER TABLE tools ADD COLUMN auth_type TEXT").run();
    db.prepare("ALTER TABLE tools ADD COLUMN auth_param_name TEXT").run();
  } catch (e) {
    // Column already exists
  }

  let currentVersion = getDbVersion();
  if (currentVersion === 0) {
    setDbVersion(1);
    currentVersion = 1;
  }

  if (currentVersion < 2) {
    // Chat logs: every input/output for context and audit
    db.exec(`
      CREATE TABLE IF NOT EXISTS chat_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        platform TEXT DEFAULT 'playground',
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        raw_response TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_chat_logs_user_chat ON chat_logs(user_id, chat_id);
      CREATE INDEX IF NOT EXISTS idx_chat_logs_created ON chat_logs(created_at);
    `);

    // Add status verification columns to platform_integrations
    const tableInfo = db.prepare("PRAGMA table_info(platform_integrations)").all() as { name: string }[];
    const hasStatusVerifiedAt = tableInfo.some(c => c.name === 'status_verified_at');
    const hasConnectionError = tableInfo.some(c => c.name === 'connection_error');
    if (!hasStatusVerifiedAt) {
      db.exec('ALTER TABLE platform_integrations ADD COLUMN status_verified_at DATETIME');
    }
    if (!hasConnectionError) {
      db.exec('ALTER TABLE platform_integrations ADD COLUMN connection_error TEXT');
    }

    // Add chat_id to bot_logs if missing
    const botLogsInfo = db.prepare("PRAGMA table_info(bot_logs)").all() as { name: string }[];
    if (!botLogsInfo.some(c => c.name === 'chat_id')) {
      db.exec('ALTER TABLE bot_logs ADD COLUMN chat_id TEXT');
    }

    setDbVersion(2);
    console.log('Database migrated to version 2');
  }

  if (currentVersion < 3) {
    // Migration 3: Add model discovery columns
    try {
      const keysInfo = db.prepare("PRAGMA table_info(gemini_keys)").all() as any[];
      if (!keysInfo.find(c => c.name === 'best_model')) {
        db.prepare("ALTER TABLE gemini_keys ADD COLUMN best_model TEXT").run();
      }
      if (!keysInfo.find(c => c.name === 'available_models')) {
        db.prepare("ALTER TABLE gemini_keys ADD COLUMN available_models TEXT").run();
      }

      const settingsInfo = db.prepare("PRAGMA table_info(user_settings)").all() as any[];
      if (!settingsInfo.find(c => c.name === 'preferred_model')) {
        db.prepare("ALTER TABLE user_settings ADD COLUMN preferred_model TEXT DEFAULT 'auto'").run();
      }

      setDbVersion(3);
      console.log('Database migrated to version 3');
    } catch (e) {
      console.error('Migration to v3 failed:', e);
    }
  }

  if (currentVersion < 4) {
    // Migration 4: Add model_used to bot_logs
    try {
      const logsInfo = db.prepare("PRAGMA table_info(bot_logs)").all() as any[];
      if (!logsInfo.find(c => c.name === 'model_used')) {
        db.prepare("ALTER TABLE bot_logs ADD COLUMN model_used TEXT").run();
      }
      setDbVersion(4);
      console.log('Database migrated to version 4');
    } catch (e) {
      console.error('Migration 4 failed:', e);
    }
  }

  if (currentVersion < 5) {
    // Migration 5: Add is_permanent to media_files
    try {
      const filesInfo = db.prepare("PRAGMA table_info(media_files)").all() as any[];
      if (!filesInfo.find(c => c.name === 'is_permanent')) {
        db.prepare("ALTER TABLE media_files ADD COLUMN is_permanent INTEGER DEFAULT 0").run();
      }
      setDbVersion(5);
      console.log('Database migrated to version 5');
    } catch (e) {
      console.error('Migration 5 failed:', e);
    }
  }

  if (currentVersion < 6) {
    // Migration 6: Add token_usage to bot_logs
    try {
      const logsInfo = db.prepare("PRAGMA table_info(bot_logs)").all() as any[];
      if (!logsInfo.find(c => c.name === 'token_usage')) {
        db.prepare("ALTER TABLE bot_logs ADD COLUMN token_usage TEXT").run();
      }
      setDbVersion(6);
      console.log('Database migrated to version 6');
    } catch (e) {
      console.error('Migration 6 failed:', e);
    }
  }

  if (currentVersion < 7) {
    // Migration 7: Fix memories table and add user_memories
    try {
      // 1. Recreate memories table with correct schema
      db.exec('DROP TABLE IF EXISTS memories');
      db.exec(`
        CREATE TABLE memories (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          user_id TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(user_id) REFERENCES users(id)
        )
      `);

      // 2. Create user_memories table
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_memories (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(user_id) REFERENCES users(id)
        );
      `);

      setDbVersion(7);
      console.log('Database migrated to version 7');
    } catch (e) {
      console.error('Migration 7 failed:', e);
    }
  }

  if (currentVersion < 8) {
    // Migration 8: Add temperature, max_output_tokens, and core tool toggles to user_settings
    try {
      const settingsInfo = db.prepare("PRAGMA table_info(user_settings)").all() as any[];
      
      if (!settingsInfo.find(c => c.name === 'temperature')) {
        db.prepare("ALTER TABLE user_settings ADD COLUMN temperature REAL DEFAULT 0.7").run();
      }
      if (!settingsInfo.find(c => c.name === 'max_output_tokens')) {
        db.prepare("ALTER TABLE user_settings ADD COLUMN max_output_tokens INTEGER DEFAULT 2048").run();
      }
      if (!settingsInfo.find(c => c.name === 'enable_web_search')) {
        db.prepare("ALTER TABLE user_settings ADD COLUMN enable_web_search INTEGER DEFAULT 1").run();
      }
      if (!settingsInfo.find(c => c.name === 'enable_weather')) {
        db.prepare("ALTER TABLE user_settings ADD COLUMN enable_weather INTEGER DEFAULT 1").run();
      }
      if (!settingsInfo.find(c => c.name === 'enable_calculator')) {
        db.prepare("ALTER TABLE user_settings ADD COLUMN enable_calculator INTEGER DEFAULT 1").run();
      }
      if (!settingsInfo.find(c => c.name === 'enable_scraper')) {
        db.prepare("ALTER TABLE user_settings ADD COLUMN enable_scraper INTEGER DEFAULT 1").run();
      }

      setDbVersion(8);
      console.log('Database migrated to version 8');
    } catch (e) {
      console.error('Migration 8 failed:', e);
    }
  }

  if (currentVersion < 9) {
    // Migration 9: Add GitHub and Currency Converter tool toggles
    try {
      const settingsInfo = db.prepare("PRAGMA table_info(user_settings)").all() as any[];
      
      if (!settingsInfo.find(c => c.name === 'enable_github')) {
        db.prepare("ALTER TABLE user_settings ADD COLUMN enable_github INTEGER DEFAULT 1").run();
      }
      if (!settingsInfo.find(c => c.name === 'enable_currency')) {
        db.prepare("ALTER TABLE user_settings ADD COLUMN enable_currency INTEGER DEFAULT 1").run();
      }

      setDbVersion(9);
      console.log('Database migrated to version 9');
    } catch (e) {
      console.error('Migration 9 failed:', e);
    }
  }

  if (currentVersion < 10) {
    // Migration 10: Add chat_type and group_id to chat_logs for memory scoping
    try {
      const chatLogsInfo = db.prepare("PRAGMA table_info(chat_logs)").all() as any[];
      if (!chatLogsInfo.find(c => c.name === 'chat_type')) {
        db.prepare("ALTER TABLE chat_logs ADD COLUMN chat_type TEXT DEFAULT 'private'").run();
      }
      if (!chatLogsInfo.find(c => c.name === 'group_id')) {
        db.prepare("ALTER TABLE chat_logs ADD COLUMN group_id TEXT").run();
      }
      if (!chatLogsInfo.find(c => c.name === 'sender_id')) {
        db.prepare("ALTER TABLE chat_logs ADD COLUMN sender_id TEXT").run();
      }
      setDbVersion(10);
      console.log('Database migrated to version 10');
    } catch (e) {
      console.error('Migration to v10 failed:', e);
    }
  }

  if (currentVersion < 11) {
    // Migration 11: Add sender_name and indices for chat_logs search performance
    try {
      const chatLogsInfo = db.prepare("PRAGMA table_info(chat_logs)").all() as any[];
      if (!chatLogsInfo.find(c => c.name === 'sender_name')) {
        db.prepare("ALTER TABLE chat_logs ADD COLUMN sender_name TEXT").run();
      }

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_chat_logs_sender ON chat_logs(sender_id);
        CREATE INDEX IF NOT EXISTS idx_chat_logs_group ON chat_logs(group_id);
        CREATE INDEX IF NOT EXISTS idx_chat_logs_platform ON chat_logs(platform);
        CREATE INDEX IF NOT EXISTS idx_chat_logs_chat_type ON chat_logs(chat_type);
        CREATE INDEX IF NOT EXISTS idx_chat_logs_content ON chat_logs(content);
      `);
      setDbVersion(11);
      console.log('Database migrated to version 11');
    } catch (e) {
      console.error('Migration to v11 failed:', e);
    }
  }

  if (currentVersion < 12) {
    // Migration 12: Add memory_type to user_memories
    try {
      const userMemoriesInfo = db.prepare("PRAGMA table_info(user_memories)").all() as any[];
      if (!userMemoriesInfo.find(c => c.name === 'memory_type')) {
        db.prepare("ALTER TABLE user_memories ADD COLUMN memory_type TEXT DEFAULT 'core'").run();
      }
      setDbVersion(12);
      console.log('Database migrated to version 12');
    } catch (e) {
      console.error('Migration to v12 failed:', e);
    }
  }

  if (currentVersion < 13) {
    // Migration 13: Add share_active_memory to platform_integrations and platform to user_memories
    try {
      const integrationsInfo = db.prepare("PRAGMA table_info(platform_integrations)").all() as any[];
      if (!integrationsInfo.find(c => c.name === 'share_active_memory')) {
        db.prepare("ALTER TABLE platform_integrations ADD COLUMN share_active_memory INTEGER DEFAULT 0").run();
      }

      const userMemoriesInfo = db.prepare("PRAGMA table_info(user_memories)").all() as any[];
      if (!userMemoriesInfo.find(c => c.name === 'platform')) {
        db.prepare("ALTER TABLE user_memories ADD COLUMN platform TEXT").run();
      }
      
      setDbVersion(13);
      console.log('Database migrated to version 13');
    } catch (e) {
      console.error('Migration to v13 failed:', e);
    }
  }

  if (currentVersion < 14) {
    // Migration 14: Add indices for user_memories performance
    try {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_user_memories_user_created ON user_memories(user_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_user_memories_platform ON user_memories(platform);
      `);
      setDbVersion(14);
      console.log('Database migrated to version 14');
    } catch (e) {
      console.error('Migration to v14 failed:', e);
    }
  }

  if (currentVersion < 15) {
    // Migration 15: Add method and headers to tools table
    try {
      const toolsInfo = db.prepare("PRAGMA table_info(tools)").all() as any[];
      if (!toolsInfo.find(c => c.name === 'method')) {
        db.prepare("ALTER TABLE tools ADD COLUMN method TEXT DEFAULT 'POST'").run();
      }
      if (!toolsInfo.find(c => c.name === 'headers')) {
        db.prepare("ALTER TABLE tools ADD COLUMN headers TEXT DEFAULT '{}'").run();
      }
      setDbVersion(15);
      console.log('Database migrated to version 15');
    } catch (e) {
      console.error('Migration to v15 failed:', e);
    }
  }

  if (currentVersion < 16) {
    // Migration 16: Add external_id to user_memories for user-specific isolation
    try {
      const userMemoriesInfo = db.prepare("PRAGMA table_info(user_memories)").all() as any[];
      if (!userMemoriesInfo.find(c => c.name === 'external_id')) {
        db.prepare("ALTER TABLE user_memories ADD COLUMN external_id TEXT").run();
      }
      // Add index for performance
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_user_memories_external_id ON user_memories(external_id);
      `);
      setDbVersion(16);
      console.log('Database migrated to version 16');
    } catch (e) {
      console.error('Migration to v16 failed:', e);
    }
  }

  console.log('Database initialized at:', DB_PATH);
  console.log('Media directories initialized at:', path.join(process.cwd(), 'data', 'media'));
}
