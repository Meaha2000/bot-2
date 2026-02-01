// Platform Integrations Index
import { getUserSettings } from '../unifiedContext';
import path from 'path';
import fs from 'fs';
import { PlatformAdapter, PlatformType, PlatformIntegration, IncomingMessage, OutgoingMessage, HumanBehaviorConfig, simulateTypingDelay, getRandomUserAgent, getRandomDelay } from './types';
import { telegramAdapter, downloadTelegramFile, setTelegramWebhook } from './telegram';
import { whatsappAdapter, downloadWhatsAppMedia, whatsappAntiDetectionDelay, verifyWhatsAppSignature } from './whatsapp';
import { messengerAdapter, markMessageAsSeen, getMessengerUserProfile, verifyMessengerSignature } from './messenger';

// Platform adapter registry
const adapters: Record<PlatformType, PlatformAdapter> = {
  telegram: telegramAdapter,
  whatsapp: whatsappAdapter,
  messenger: messengerAdapter,
};

export function getAdapter(platform: PlatformType): PlatformAdapter {
  const adapter = adapters[platform];
  if (!adapter) {
    throw new Error(`Unknown platform: ${platform}`);
  }
  return adapter;
}

// Unified message handler with human-like behavior
export async function handleIncomingMessage(
  integration: PlatformIntegration,
  message: IncomingMessage,
  processCallback: (msg: IncomingMessage) => Promise<string>
): Promise<void> {
  const adapter = getAdapter(integration.platform);
  const settings = getUserSettings(integration.userId);

  const behaviorConfig: HumanBehaviorConfig = {
    typingDelayMin: integration.typingDelayMin,
    typingDelayMax: integration.typingDelayMax,
    readingDelayPerChar: 20, // ms per character for "reading"
    randomPauseProbability: 0.15,
    statusUpdateInterval: 4000,
  };

  try {
    // 1. Simulate reading delay (if enabled)
    if (settings.typingSimulation) {
      await simulateTypingDelay(behaviorConfig, message.content.length);
    }

    // 2. Get response from AI
    let response = await processCallback(message);
    let mediaUrl: string | undefined;
    let mediaType: 'image' | 'video' | 'audio' | 'document' | undefined;

    // Check for media tag [MEDIA_SEND:url|type]
    const mediaMatch = response.match(/\[MEDIA_SEND:(.+?)\|(.+?)\]/);
    if (mediaMatch) {
      const extractedUrl = mediaMatch[1];
      mediaType = mediaMatch[2] as any;
      
      // SECURITY CHECK: Validate local file paths
      // We only allow sending files from the 'data/downloads' directory
      if (!extractedUrl.startsWith('http')) {
        const allowedDir = path.resolve(process.cwd(), 'data', 'downloads');
        const resolvedPath = path.resolve(process.cwd(), extractedUrl);
        
        if (!resolvedPath.startsWith(allowedDir)) {
          console.error(`[Security] Blocked attempt to send unauthorized file: ${resolvedPath}`);
          response = "I cannot send that file for security reasons.";
          mediaUrl = undefined;
        } else {
           // FRESHNESS CHECK: Ensure the file was created/modified recently (e.g., within last 5 minutes)
           // This prevents the bot from "hallucinating" or reusing old files that happen to exist in the folder.
           try {
             const stats = fs.statSync(resolvedPath);
             const now = Date.now();
             const fileAge = now - stats.mtime.getTime();
             const fiveMinutes = 5 * 60 * 1000;

             if (fileAge > fiveMinutes) {
               console.error(`[Security] Blocked attempt to send stale file (Age: ${fileAge}ms): ${resolvedPath}`);
               response = "I cannot send this file because it is expired/stale. Please ask me to download it again.";
               mediaUrl = undefined;
             } else {
               mediaUrl = extractedUrl;
             }
           } catch (e) {
             console.error(`[Security] File access error: ${e}`);
             mediaUrl = undefined;
           }
        }
      } else {
         mediaUrl = extractedUrl;
      }

      // Remove the tag from the text content
      response = response.replace(mediaMatch[0], '').trim();
      // If response is empty after removal, use a default caption or leave empty if platform supports it
      if (!response && mediaUrl) response = "Here is the media you requested:";
    }

    // 3. Send typing indicator (if enabled)
    if (settings.typingSimulation) {
      await adapter.sendTypingIndicator(integration, message.chatId);
    }

    // 4. Simulate typing delay based on response length (if enabled)
    if (settings.typingSimulation) {
      await simulateTypingDelay(behaviorConfig, response.length);
    }

    // 5. Send the response
    if (mediaUrl) {
      // If we have media, send text first (if any), then media
      if (response && response !== "Here is the media you requested:") {
         await adapter.sendMessage(integration, {
           chatId: message.chatId,
           content: response,
           replyToMessageId: message.messageId,
         });
      }
      
      // Then send media
      await adapter.sendMessage(integration, {
        chatId: message.chatId,
        content: '', // Media message doesn't need text usually
        replyToMessageId: message.messageId,
        mediaUrl: mediaUrl,
        mediaType: mediaType
      });
    } else {
      // Text only
      await adapter.sendMessage(integration, {
        chatId: message.chatId,
        content: response,
        replyToMessageId: message.messageId,
      });
    }

  } catch (error) {
    console.error(`Error handling message on ${integration.platform}:`, error);
    throw error;
  }
}

// Send message with human-like behavior
export async function sendMessageWithBehavior(
  integration: PlatformIntegration,
  message: OutgoingMessage
): Promise<any> {
  const adapter = getAdapter(integration.platform);
  const settings = getUserSettings(integration.userId);

  if (settings.typingSimulation) {
    // Send typing indicator first
    await adapter.sendTypingIndicator(integration, message.chatId);

    // Simulate typing delay
    const delay = getRandomDelay(integration.typingDelayMin, integration.typingDelayMax);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  // Send the actual message
  return adapter.sendMessage(integration, message);
}

// Export types
export type {
  PlatformAdapter,
  PlatformType,
  PlatformIntegration,
  IncomingMessage,
  OutgoingMessage,
  HumanBehaviorConfig,
};

// Export utilities
export {
  getRandomUserAgent,
  getRandomDelay,
  simulateTypingDelay,
  // Telegram
  telegramAdapter,
  downloadTelegramFile,
  setTelegramWebhook,
  // WhatsApp
  whatsappAdapter,
  downloadWhatsAppMedia,
  whatsappAntiDetectionDelay,
  verifyWhatsAppSignature,
  // Messenger
  messengerAdapter,
  markMessageAsSeen,
  getMessengerUserProfile,
  verifyMessengerSignature,
};
