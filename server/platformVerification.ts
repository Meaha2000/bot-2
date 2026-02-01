// Real-time platform verification: do NOT mark as "Online" until connection is verified.
import { db } from './db';
import { setTelegramWebhook } from './platforms/telegram';

export type VerificationResult = { ok: true; message?: string } | { ok: false; error: string };

/**
 * Verify Telegram bot: call getMe with bot token. Only then consider connection valid.
 */
export async function verifyTelegramIntegration(integrationId: string): Promise<VerificationResult> {
  const row = db.prepare(
    'SELECT * FROM platform_integrations WHERE id = ? AND platform = ?'
  ).get(integrationId, 'telegram') as any;

  if (!row || !row.bot_token) {
    return { ok: false, error: 'Integration not found or missing bot token' };
  }

  try {
    const url = `https://api.telegram.org/bot${row.bot_token}/getMe`;
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
    });
    const data = await res.json();

    if (!data.ok) {
      const err = data.description || 'Telegram API error';
      db.prepare(`
        UPDATE platform_integrations
        SET status = 'error', connection_error = ?, status_verified_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(err, new Date().toISOString(), integrationId);
      return { ok: false, error: err };
    }

    // Attempt to set webhook if URL is provided
    if (row.webhook_url) {
      try {
        const webhookRes = await setTelegramWebhook(row.bot_token, row.webhook_url);
        if (!webhookRes.ok) {
          console.warn('[Telegram] Failed to set webhook:', webhookRes.description);
          // We don't fail verification if webhook fails, but we log it. 
          // Or should we fail? User explicitly asked for webhook. 
          // Let's include it in the message.
          return { ok: true, message: `Bot verified, but webhook failed: ${webhookRes.description}` };
        }
      } catch (webhookErr: any) {
        console.error('[Telegram] Error setting webhook:', webhookErr);
      }
    }

    db.prepare(`
      UPDATE platform_integrations
      SET status = 'active', connection_error = NULL, status_verified_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(new Date().toISOString(), integrationId);
    return { ok: true, message: `Bot @${data.result?.username || 'unknown'} verified` };
  } catch (e: any) {
    const err = e.message || 'Network or request failed';
    db.prepare(`
      UPDATE platform_integrations
      SET status = 'error', connection_error = ?, status_verified_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(err, new Date().toISOString(), integrationId);
    return { ok: false, error: err };
  }
}

/**
 * Verify WhatsApp: test Graph API with phone number ID and access token.
 */
export async function verifyWhatsAppIntegration(integrationId: string): Promise<VerificationResult> {
  const row = db.prepare(
    'SELECT * FROM platform_integrations WHERE id = ? AND platform = ?'
  ).get(integrationId, 'whatsapp') as any;

  if (!row || !row.phone_number || !row.access_token) {
    return { ok: false, error: 'Integration not found or missing phone number / access token' };
  }

  try {
    const url = `https://graph.facebook.com/v18.0/${row.phone_number}?fields=verified_name&access_token=${row.access_token}`;
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
    const data = await res.json();

    if (data.error) {
      const err = data.error.message || data.error.code || 'WhatsApp API error';
      db.prepare(`
        UPDATE platform_integrations
        SET status = 'error', connection_error = ?, status_verified_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(err, new Date().toISOString(), integrationId);
      return { ok: false, error: err };
    }

    db.prepare(`
      UPDATE platform_integrations
      SET status = 'active', connection_error = NULL, status_verified_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(new Date().toISOString(), integrationId);
    return { ok: true, message: data.verified_name ? `Verified: ${data.verified_name}` : 'WhatsApp connection OK' };
  } catch (e: any) {
    const err = e.message || 'Network or request failed';
    db.prepare(`
      UPDATE platform_integrations
      SET status = 'error', connection_error = ?, status_verified_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(err, new Date().toISOString(), integrationId);
    return { ok: false, error: err };
  }
}

/**
 * Verify Messenger: test Graph API with page access token.
 */
export async function verifyMessengerIntegration(integrationId: string): Promise<VerificationResult> {
  const row = db.prepare(
    'SELECT * FROM platform_integrations WHERE id = ? AND platform = ?'
  ).get(integrationId, 'messenger') as any;

  if (!row || !row.access_token) {
    return { ok: false, error: 'Integration not found or missing access token' };
  }

  try {
    const url = `https://graph.facebook.com/v18.0/me?fields=name&access_token=${row.access_token}`;
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
    const data = await res.json();

    if (data.error) {
      const err = data.error.message || data.error.code || 'Messenger API error';
      db.prepare(`
        UPDATE platform_integrations
        SET status = 'error', connection_error = ?, status_verified_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(err, new Date().toISOString(), integrationId);
      return { ok: false, error: err };
    }

    db.prepare(`
      UPDATE platform_integrations
      SET status = 'active', connection_error = NULL, status_verified_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(new Date().toISOString(), integrationId);
    return { ok: true, message: data.name ? `Page: ${data.name}` : 'Messenger connection OK' };
  } catch (e: any) {
    const err = e.message || 'Network or request failed';
    db.prepare(`
      UPDATE platform_integrations
      SET status = 'error', connection_error = ?, status_verified_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(err, new Date().toISOString(), integrationId);
    return { ok: false, error: err };
  }
}

/**
 * Verify an integration by platform; updates status and status_verified_at in DB.
 */
export async function verifyIntegration(integrationId: string): Promise<VerificationResult> {
  const row = db.prepare('SELECT platform FROM platform_integrations WHERE id = ?').get(integrationId) as { platform: string } | undefined;
  if (!row) return { ok: false, error: 'Integration not found' };

  switch (row.platform) {
    case 'telegram':
      return verifyTelegramIntegration(integrationId);
    case 'whatsapp':
      return verifyWhatsAppIntegration(integrationId);
    case 'messenger':
      return verifyMessengerIntegration(integrationId);
    default:
      return { ok: false, error: `Unknown platform: ${row.platform}` };
  }
}
