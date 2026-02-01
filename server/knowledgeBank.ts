import fs from 'fs';
import path from 'path';

const KNOWLEDGE_BANK_PATH = path.join(process.cwd(), 'data/knowledge_bank.md');

// Ensure data directory exists
const dataDir = path.dirname(KNOWLEDGE_BANK_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize if not exists
if (!fs.existsSync(KNOWLEDGE_BANK_PATH)) {
  fs.writeFileSync(KNOWLEDGE_BANK_PATH, '# Knowledge Bank\n\nThis is a repository of permanent knowledge extracted from files and documents.\n', 'utf-8');
}

export function getKnowledgeBank(): string {
  try {
    if (!fs.existsSync(KNOWLEDGE_BANK_PATH)) return '';
    return fs.readFileSync(KNOWLEDGE_BANK_PATH, 'utf-8');
  } catch (error) {
    console.error('Failed to read knowledge bank:', error);
    return '';
  }
}

export function updateKnowledgeBank(content: string): void {
  try {
    fs.writeFileSync(KNOWLEDGE_BANK_PATH, content, 'utf-8');
  } catch (error) {
    console.error('Failed to update knowledge bank:', error);
  }
}

export function appendToKnowledgeBank(content: string): void {
  try {
    const current = getKnowledgeBank();
    const newContent = current + '\n\n' + content;
    fs.writeFileSync(KNOWLEDGE_BANK_PATH, newContent, 'utf-8');
  } catch (error) {
    console.error('Failed to append to knowledge bank:', error);
  }
}
