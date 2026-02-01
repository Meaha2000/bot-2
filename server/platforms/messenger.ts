// Facebook Messenger Platform Adapter
import { PlatformAdapter, PlatformIntegration, IncomingMessage, OutgoingMessage, getRandomUserAgent } from './types';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const messengerAdapter: PlatformAdapter = {
  platform: 'messenger',

  async sendMessage(integration: PlatformIntegration, message: OutgoingMessage): Promise<any> {
    const url = `https://graph.facebook.com/v18.0/me/messages?access_token=${integration.accessToken}`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': integration.userAgent || getRandomUserAgent(),
    };

    const body: any = {
      recipient: { id: message.chatId },
      message: { text: message.content },
    };

    // Handle media attachments
    if (message.mediaUrl && message.mediaType) {
      // Check if it is a local file path (anything not starting with http/https)
      const isLocal = !message.mediaUrl.startsWith('http');
      
      if (isLocal && fs.existsSync(message.mediaUrl)) {
        // Send as multipart/form-data
        try {
          const formData = new FormData();
          formData.append('recipient', JSON.stringify({ id: message.chatId }));
          formData.append('message', JSON.stringify({
            attachment: {
              type: message.mediaType === 'document' ? 'file' : message.mediaType,
              payload: { is_reusable: true }
            }
          }));

          const fileBuffer = fs.readFileSync(message.mediaUrl);
          const fileName = path.basename(message.mediaUrl);
          const blob = new Blob([fileBuffer]);
          
          formData.append('filedata', blob, fileName);

          const response = await fetch(url, {
            method: 'POST',
            body: formData
          });
          
          return response.json();
        } catch (e: any) {
          console.error('[Messenger] Failed to upload local file:', e);
          // Fallback to text error or try URL if possible (not possible here)
          return { error: e.message };
        }
      } else {
        // Send as URL
        body.message = {
          attachment: {
            type: message.mediaType === 'document' ? 'file' : message.mediaType,
            payload: {
              url: message.mediaUrl,
              is_reusable: true,
            },
          },
        };
      }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    return response.json();
  },

  async sendTypingIndicator(integration: PlatformIntegration, chatId: string): Promise<void> {
    const url = `https://graph.facebook.com/v18.0/me/messages?access_token=${integration.accessToken}`;
    
    // Send typing_on action
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': integration.userAgent || getRandomUserAgent(),
      },
      body: JSON.stringify({
        recipient: { id: chatId },
        sender_action: 'typing_on',
      }),
    });
  },

  parseWebhook(payload: any): IncomingMessage | null {
    try {
      const entry = payload.entry?.[0];
      const messaging = entry?.messaging?.[0];

      if (!messaging || !messaging.message) return null;

      const message = messaging.message;

      const result: IncomingMessage = {
        platform: 'messenger',
        integrationId: '', // Will be set by handler
        chatId: messaging.sender.id,
        chatType: 'private',
        messageId: message.mid,
        senderId: messaging.sender.id,
        content: message.text || '',
        timestamp: new Date(messaging.timestamp),
        rawPayload: payload,
      };

      // Handle attachments
      if (message.attachments && message.attachments.length > 0) {
        const attachment = message.attachments[0];
        switch (attachment.type) {
          case 'image':
            result.mediaType = 'image';
            result.mediaUrl = attachment.payload?.url;
            break;
          case 'video':
            result.mediaType = 'video';
            result.mediaUrl = attachment.payload?.url;
            break;
          case 'audio':
            result.mediaType = 'audio';
            result.mediaUrl = attachment.payload?.url;
            break;
          case 'file':
            result.mediaType = 'document';
            result.mediaUrl = attachment.payload?.url;
            break;
          case 'sticker':
            result.mediaType = 'sticker';
            result.mediaUrl = attachment.payload?.url;
            break;
        }
      }

      return result;
    } catch (e) {
      console.error('Error parsing Messenger webhook:', e);
      return null;
    }
  },

  validateWebhook(payload: any, signature?: string): boolean {
    return payload && payload.object === 'page' && payload.entry;
  },
};

// Verify Messenger webhook signature
export function verifyMessengerSignature(
  payload: string,
  signature: string,
  appSecret: string
): boolean {
  if (!signature) return false;
  
  const [algorithm, hash] = signature.split('=');
  if (!algorithm || !hash) return false;
  
  const expectedHash = crypto
    .createHmac(algorithm, appSecret)
    .update(payload)
    .digest('hex');
    
  return expectedHash === hash;
}

// Mark message as seen
export async function markMessageAsSeen(
  accessToken: string,
  recipientId: string
): Promise<void> {
  const url = `https://graph.facebook.com/v18.0/me/messages?access_token=${accessToken}`;
  
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      sender_action: 'mark_seen',
    }),
  });
}

// Get user profile
export async function getMessengerUserProfile(
  accessToken: string,
  userId: string
): Promise<any> {
  const url = `https://graph.facebook.com/v18.0/${userId}?fields=first_name,last_name,profile_pic&access_token=${accessToken}`;
  
  const response = await fetch(url);
  return response.json();
}
