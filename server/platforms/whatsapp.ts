// WhatsApp Platform Adapter (Meta Cloud API)
import { PlatformAdapter, PlatformIntegration, IncomingMessage, OutgoingMessage, getRandomUserAgent, getRandomDelay } from './types';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const whatsappAdapter: PlatformAdapter = {
  platform: 'whatsapp',

  async sendMessage(integration: PlatformIntegration, message: OutgoingMessage): Promise<any> {
    const url = `https://graph.facebook.com/v18.0/${integration.phoneNumber}/messages`;
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${integration.accessToken}`,
      'User-Agent': integration.userAgent || getRandomUserAgent(),
    };

    const body: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: message.chatId,
      type: 'text',
      text: {
        preview_url: true,
        body: message.content,
      },
    };

    // Handle media messages
    if (message.mediaUrl && message.mediaType) {
      // Check if local file
      const isLocal = !message.mediaUrl.startsWith('http');
      
      if (isLocal && fs.existsSync(message.mediaUrl)) {
        try {
           // Step 1: Upload Media
           const formData = new FormData();
           formData.append('messaging_product', 'whatsapp');
           
           const fileBuffer = fs.readFileSync(message.mediaUrl);
           const fileName = path.basename(message.mediaUrl);
           const ext = path.extname(fileName).toLowerCase().replace('.', '');
           
           // Simple MIME type guessing
           let mimeType = 'application/octet-stream';
           if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
           else if (ext === 'png') mimeType = 'image/png';
           else if (ext === 'webp') mimeType = 'image/webp';
           else if (ext === 'mp4') mimeType = 'video/mp4';
           else if (ext === 'mp3') mimeType = 'audio/mpeg';
           else if (ext === 'pdf') mimeType = 'application/pdf';
           
           const blob = new Blob([fileBuffer], { type: mimeType });
           formData.append('file', blob, fileName);
           formData.append('type', mimeType); 

           const uploadUrl = `https://graph.facebook.com/v18.0/${integration.phoneNumber}/media`;
           const uploadRes = await fetch(uploadUrl, {
             method: 'POST',
             headers: {
               'Authorization': `Bearer ${integration.accessToken}`,
             },
             body: formData
           });
           
           const uploadData = await uploadRes.json();
           
           if (uploadData.id) {
             // Step 2: Send Message with ID
             body.type = message.mediaType;
             body[message.mediaType] = {
               id: uploadData.id
             };
             if (message.content) {
               body[message.mediaType].caption = message.content;
             }
             delete body.text;
           } else {
             console.error('[WhatsApp] Upload failed:', uploadData);
             // Fallback to text error
             body.text = { body: `Failed to send media: ${message.content}` };
           }

        } catch (e) {
          console.error('[WhatsApp] Local file handling error:', e);
          body.text = { body: `Error processing media: ${message.content}` };
        }
      } else {
        // Send via URL
        body.type = message.mediaType;
        body[message.mediaType] = {
          link: message.mediaUrl,
        };
        if (message.content) {
          body[message.mediaType].caption = message.content;
        }
        delete body.text;
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
    // WhatsApp Cloud API doesn't have a direct typing indicator
    // We simulate "presence" by using read receipts
    const url = `https://graph.facebook.com/v18.0/${integration.phoneNumber}/messages`;
    
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${integration.accessToken}`,
        'User-Agent': integration.userAgent || getRandomUserAgent(),
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: chatId, // This should be the message ID being read
      }),
    }).catch(() => {
      // Silently fail - typing indicator is optional
    });
  },

  parseWebhook(payload: any): IncomingMessage | null {
    try {
      const entry = payload.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const message = value?.messages?.[0];

      if (!message) return null;

      const contact = value?.contacts?.[0];

      const result: IncomingMessage = {
        platform: 'whatsapp',
        integrationId: '', // Will be set by handler
        chatId: message.from,
        chatType: 'private',
        messageId: message.id,
        senderId: message.from,
        senderName: contact?.profile?.name || message.from,
        content: '',
        timestamp: new Date(parseInt(message.timestamp) * 1000),
        rawPayload: payload,
      };

      // Parse different message types
      switch (message.type) {
        case 'text':
          result.content = message.text?.body || '';
          break;
        case 'image':
          result.mediaType = 'image';
          result.mediaUrl = message.image?.id;
          result.content = message.image?.caption || '';
          break;
        case 'video':
          result.mediaType = 'video';
          result.mediaUrl = message.video?.id;
          result.content = message.video?.caption || '';
          break;
        case 'audio':
          result.mediaType = 'audio';
          result.mediaUrl = message.audio?.id;
          break;
        case 'document':
          result.mediaType = 'document';
          result.mediaUrl = message.document?.id;
          result.content = message.document?.caption || '';
          break;
        case 'sticker':
          result.mediaType = 'sticker';
          result.mediaUrl = message.sticker?.id;
          break;
      }

      return result;
    } catch (e) {
      console.error('Error parsing WhatsApp webhook:', e);
      return null;
    }
  },

  validateWebhook(payload: any, signature?: string): boolean {
    // Basic structure validation
    return payload && payload.entry && Array.isArray(payload.entry);
  },
};

// Verify WhatsApp webhook signature
export function verifyWhatsAppSignature(
  payload: string,
  signature: string,
  appSecret: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', appSecret)
    .update(payload)
    .digest('hex');
  
  return `sha256=${expectedSignature}` === signature;
}

// Download media from WhatsApp
export async function downloadWhatsAppMedia(
  mediaId: string,
  accessToken: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  // Get media URL
  const mediaInfoUrl = `https://graph.facebook.com/v18.0/${mediaId}`;
  const mediaInfoRes = await fetch(mediaInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const mediaInfo = await mediaInfoRes.json();

  if (!mediaInfo.url) {
    throw new Error('Failed to get media URL from WhatsApp');
  }

  // Download file
  const fileRes = await fetch(mediaInfo.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const arrayBuffer = await fileRes.arrayBuffer();

  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: mediaInfo.mime_type || 'application/octet-stream',
  };
}

// Anti-detection delay with randomization
export async function whatsappAntiDetectionDelay(
  integration: PlatformIntegration,
  messageLength: number
): Promise<void> {
  // Calculate typing time based on message length
  // Average typing speed: 40 words per minute = ~200 chars per minute
  const typingTime = Math.min((messageLength / 200) * 60 * 1000, 5000);
  
  // Add random human-like variance
  const variance = getRandomDelay(-500, 500);
  const baseDelay = getRandomDelay(integration.typingDelayMin, integration.typingDelayMax);
  
  const totalDelay = typingTime + baseDelay + variance;
  
  await new Promise(resolve => setTimeout(resolve, Math.max(totalDelay, 500)));
}
