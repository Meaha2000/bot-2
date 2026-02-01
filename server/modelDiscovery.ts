import { db } from './db';

// Heuristic to score models based on version and capability
// Higher is better.
// gemini-3.0-pro > gemini-2.5-flash > gemini-1.5-pro > gemini-1.5-flash
export function getModelScore(name: string): number {
  let score = 0;
  const lower = name.toLowerCase();

  // 1. Version extraction (e.g., "gemini-1.5" -> 1.5)
  const vMatch = lower.match(/gemini-(\d+(\.\d+)?)/);
  if (vMatch) {
    score += parseFloat(vMatch[1]) * 1000;
  } else if (lower.includes('gemini-pro')) {
    score += 1000; // Assume 1.0
  }

  // 2. Tier capability
  if (lower.includes('gemini-3') && lower.includes('flash')) score += 2000; // Explicit user preference: 3.0 Flash
  else if (lower.includes('gemini-3')) score += 60; // Other Gemini 3
  else if (lower.includes('ultra')) score += 50;
  else if (lower.includes('pro')) score += 40;
  else if (lower.includes('flash')) score += 30;
  else if (lower.includes('nano')) score += 10;
  else score += 20; // standard

  // 3. Modifiers
  // "preview" often implies access to next-gen features before stable release
  if (lower.includes('preview')) score += 5;
  if (lower.includes('experimental')) score += 1;
  if (lower.includes('vision')) score += 2; // multimodal bonus

  return score;
}

export async function refreshKeyModels(keyId: string, apiKey: string) {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!response.ok) {
      console.warn(`[ModelDiscovery] Failed to fetch models for key ${keyId}: ${response.statusText}`);
      return;
    }

    const data = await response.json();
    if (!data.models) return;

    // Filter for content generation models
    const available = data.models
      .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m: any) => ({
        name: m.name.replace('models/', ''),
        inputTokenLimit: m.inputTokenLimit,
        outputTokenLimit: m.outputTokenLimit
      }));

    if (available.length === 0) return;
    
    // DEBUG: Log all available models
    console.log(`[ModelDiscovery] Key ${keyId.substring(0,8)} models:`, available.map((m: any) => m.name).join(', '));

    // Find the best model
    const sorted = available.sort((a: any, b: any) => getModelScore(b.name) - getModelScore(a.name));
    const bestModel = sorted[0].name;

    // Update DB
    db.prepare(`
      UPDATE gemini_keys 
      SET available_models = ?, best_model = ? 
      WHERE id = ?
    `).run(JSON.stringify(available), bestModel, keyId);

    console.log(`[ModelDiscovery] Key ${keyId} updated. Best: ${bestModel}`);
  } catch (error) {
    console.error(`[ModelDiscovery] Error processing key ${keyId}:`, error);
  }
}

export async function discoverAllKeys() {
  console.log('[ModelDiscovery] Starting discovery for all active keys...');
  const keys = db.prepare("SELECT * FROM gemini_keys WHERE status = 'active'").all() as any[];
  
  for (const key of keys) {
    await refreshKeyModels(key.id, key.key);
  }
  console.log(`[ModelDiscovery] Completed discovery for ${keys.length} keys.`);
}

let discoveryInterval: NodeJS.Timeout | null = null;

export function startModelDiscoveryService() {
  // Run immediately on start
  discoverAllKeys();

  // Run every 1 hour (3600000 ms) as requested to avoid slowing down responses
  if (discoveryInterval) clearInterval(discoveryInterval);
  discoveryInterval = setInterval(discoverAllKeys, 60 * 60 * 1000);
}
