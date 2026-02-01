// Telegram Platform Adapter
import { PlatformAdapter, PlatformIntegration, IncomingMessage, OutgoingMessage, getRandomUserAgent } from './types';
import fs from 'fs';
import path from 'path';

export const telegramAdapter: PlatformAdapter = {
  platform: 'telegram',

  async sendMessage(integration: PlatformIntegration, message: OutgoingMessage): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': integration.userAgent || getRandomUserAgent(),
    };

    let endpoint = 'sendMessage';
    const body: any = {
      chat_id: message.chatId,
      parse_mode: 'Markdown',
    };

    if (message.replyToMessageId) {
      body.reply_to_message_id = message.replyToMessageId;
    }

    if (message.mediaUrl) {
      // Check if it is a local file path (anything not starting with http/https)
      const isLocal = !message.mediaUrl.startsWith('http');

      // Media Message
      switch (message.mediaType) {
        case 'image':
          endpoint = 'sendPhoto';
          if (!isLocal) body.photo = message.mediaUrl;
          break;
        case 'video':
          endpoint = 'sendVideo';
          if (!isLocal) body.video = message.mediaUrl;
          break;
        case 'audio':
          endpoint = 'sendAudio';
          if (!isLocal) body.audio = message.mediaUrl;
          break;
        case 'document':
          endpoint = 'sendDocument';
          if (!isLocal) body.document = message.mediaUrl;
          break;
        case 'sticker':
          endpoint = 'sendSticker';
          if (!isLocal) body.sticker = message.mediaUrl;
          break;
        case 'gif':
          endpoint = 'sendAnimation';
          if (!isLocal) body.animation = message.mediaUrl;
          break;
        default:
          endpoint = 'sendMessage'; // Fallback
          body.text = `${message.content}\n\n[Media: ${message.mediaUrl}]`;
          break;
      }
      
      // Add caption if allowed (Stickers don't support captions)
      if (endpoint !== 'sendSticker' && message.content) {
        body.caption = message.content;
      }

      // Handle Local File Upload
      if (isLocal && endpoint !== 'sendMessage') {
        if (fs.existsSync(message.mediaUrl)) {
          try {
            const formData = new FormData();
            formData.append('chat_id', message.chatId);
            if (body.reply_to_message_id) formData.append('reply_to_message_id', body.reply_to_message_id);
            if (body.caption) formData.append('caption', body.caption);
            if (body.parse_mode) formData.append('parse_mode', body.parse_mode);

            const fileBuffer = fs.readFileSync(message.mediaUrl);
            const fileName = path.basename(message.mediaUrl);
            const blob = new Blob([fileBuffer]);
            
            // Determine field name based on endpoint (sendPhoto -> photo, sendVideo -> video)
            const fieldName = endpoint.replace('send', '').toLowerCase();
            // Special cases
            let finalFieldName = fieldName;
            if (endpoint === 'sendAnimation') finalFieldName = 'animation';
            
            formData.append(finalFieldName, blob, fileName);

            const uploadUrl = `https://api.telegram.org/bot${integration.botToken}/${endpoint}`;
            const uploadRes = await fetch(uploadUrl, {
              method: 'POST',
              body: formData
            });
            
            return uploadRes.json();
          } catch (e: any) {
            console.error('[Telegram] Failed to upload local file:', e);
            return { error: e.message };
          }
        }
      }

    } else {
      // Text Message
      endpoint = 'sendMessage';
      body.text = message.content;
    }

    const url = `https://api.telegram.org/bot${integration.botToken}/${endpoint}`;

    const fetchOptions: RequestInit = {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    };

    const response = await fetch(url, fetchOptions);
    return response.json();
  },

  async sendTypingIndicator(integration: PlatformIntegration, chatId: string): Promise<void> {
    const url = `https://api.telegram.org/bot${integration.botToken}/sendChatAction`;
    
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': integration.userAgent || getRandomUserAgent(),
      },
      body: JSON.stringify({
        chat_id: chatId,
        action: 'typing',
      }),
    });
  },

  parseWebhook(payload: any): IncomingMessage | null {
    const message = payload.message || payload.edited_message;
    if (!message) return null;

    const chatType = message.chat.type === 'private' ? 'private' : 'group';
    
    const result: IncomingMessage = {
      platform: 'telegram',
      integrationId: '', // Will be set by handler
      chatId: String(message.chat.id),
      chatType: chatType,
      groupId: chatType === 'group' ? String(message.chat.id) : undefined,
      messageId: String(message.message_id),
      senderId: String(message.from.id),
      senderName: message.from.first_name || message.from.username,
      content: message.text || message.caption || '',
      timestamp: new Date(message.date * 1000),
      rawPayload: payload,
    };

    // Handle media types
    if (message.photo) {
      result.mediaType = 'image';
      result.mediaUrl = message.photo[message.photo.length - 1].file_id;
    } else if (message.video) {
      result.mediaType = 'video';
      result.mediaUrl = message.video.file_id;
    } else if (message.audio || message.voice) {
      result.mediaType = 'audio';
      result.mediaUrl = (message.audio || message.voice).file_id;
    } else if (message.document) {
      result.mediaType = 'document';
      result.mediaUrl = message.document.file_id;
    } else if (message.sticker) {
      result.mediaType = 'sticker';
      result.mediaUrl = message.sticker.file_id;
    } else if (message.animation) {
      result.mediaType = 'gif';
      result.mediaUrl = message.animation.file_id;
    }

    return result;
  },

  validateWebhook(payload: any, signature?: string): boolean {
    // Telegram doesn't use signatures, but we validate structure
    return payload && (payload.message || payload.edited_message || payload.callback_query);
  },
};

// Helper to download file from Telegram
export async function downloadTelegramFile(
  botToken: string,
  fileId: string
): Promise<{ buffer: Buffer; fileName: string }> {
  // Get file path
  const fileInfoUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`;
  const fileInfoRes = await fetch(fileInfoUrl);
  const fileInfo = await fileInfoRes.json();
  
  if (!fileInfo.ok) {
    throw new Error('Failed to get file info from Telegram');
  }

  // Download file
  const fileUrl = `https://api.telegram.org/file/bot${botToken}/${fileInfo.result.file_path}`;
  const fileRes = await fetch(fileUrl);
  const arrayBuffer = await fileRes.arrayBuffer();
  
  return {
    buffer: Buffer.from(arrayBuffer),
    fileName: fileInfo.result.file_path.split('/').pop() || 'file',
  };
}

// Set webhook URL for Telegram bot
export async function setTelegramWebhook(
  botToken: string,
  webhookUrl: string
): Promise<any> {
  const url = `https://api.telegram.org/bot${botToken}/setWebhook`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl }),
  });
  
  return response.json();
}
