import { db } from './server/db';

console.log('--- memories table info ---');
const info = db.prepare("PRAGMA table_info(memories)").all();
console.log(JSON.stringify(info, null, 2));

console.log('--- chat_logs table info ---');
const chatLogsInfo = db.prepare("PRAGMA table_info(chat_logs)").all();
console.log(JSON.stringify(chatLogsInfo, null, 2));
