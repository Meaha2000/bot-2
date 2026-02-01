// Platform Integration Types

export type PlatformType = 'telegram' | 'whatsapp' | 'messenger';

export interface PlatformIntegration {
  id: string;
  platform: PlatformType;
  name: string;
  apiKey?: string;
  apiSecret?: string;
  webhookUrl?: string;
  phoneNumber?: string;
  botToken?: string;
  pageId?: string;
  accessToken?: string;
  status: 'active' | 'inactive' | 'error';
  proxyUrl?: string;
  userAgent?: string;
  typingDelayMin: number;
  typingDelayMax: number;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface IncomingMessage {
  platform: PlatformType;
  integrationId: string;
  chatId: string;
  messageId: string;
  senderId: string;
  senderName?: string;
  content: string;
  chatType: 'private' | 'group';
  groupId?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'gif';
  mediaUrl?: string;
  timestamp: Date;
  rawPayload: any;
}

export interface OutgoingMessage {
  chatId: string;
  content: string;
  mediaUrl?: string;
  mediaType?: string;
  replyToMessageId?: string;
}

export interface PlatformAdapter {
  platform: PlatformType;
  sendMessage(integration: PlatformIntegration, message: OutgoingMessage): Promise<any>;
  sendTypingIndicator(integration: PlatformIntegration, chatId: string): Promise<void>;
  parseWebhook(payload: any): IncomingMessage | null;
  validateWebhook(payload: any, signature?: string): boolean;
}

// Human-like behavior settings
export interface HumanBehaviorConfig {
  typingDelayMin: number;
  typingDelayMax: number;
  readingDelayPerChar: number;
  randomPauseProbability: number;
  statusUpdateInterval: number;
}

// User Agent rotation pool
export const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
];

export function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export function getRandomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function simulateTypingDelay(
  config: HumanBehaviorConfig,
  messageLength: number
): Promise<void> {
  const baseDelay = getRandomDelay(config.typingDelayMin, config.typingDelayMax);
  const readingDelay = Math.min(messageLength * config.readingDelayPerChar, 3000);
  const totalDelay = baseDelay + readingDelay;
  
  // Add random pause with probability
  const extraPause = Math.random() < config.randomPauseProbability ? getRandomDelay(500, 1500) : 0;
  
  await new Promise(resolve => setTimeout(resolve, totalDelay + extraPause));
}
