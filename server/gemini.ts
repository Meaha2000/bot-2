import { GoogleGenerativeAI } from '@google/generative-ai';
import { v4 as uuidv4 } from 'uuid';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { db } from './db';
import { getActivePersonality } from './personality';
import { appendChatLog, getRecentChatLogs } from './chatLogs';
import { getModelScore } from './modelDiscovery';
import { savePlaygroundMessage } from './unifiedContext';
import { getKnowledgeBank } from './knowledgeBank';
import { WebBrowser } from './services/webBrowser';

const CONTEXT_MESSAGE_LIMIT = 10;

// --- TOOL HELPERS ---
async function getWeather(location: string) {
  try {
    const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`);
    const geoData = await geoRes.json();
    if (!geoData.results || geoData.results.length === 0) return "Location not found.";
    const { latitude, longitude, name, country } = geoData.results[0];
    const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m`);
    const weatherData = await weatherRes.json();
    return JSON.stringify({ location: `${name}, ${country}`, current: weatherData.current });
  } catch (e: any) { return `Weather error: ${e.message}`; }
}

async function simpleScrape(url: string) {
  return await WebBrowser.scrape(url);
}

async function webSearch(query: string) {
  const results = await WebBrowser.search(query);
  if (results.length === 0) return "No results found.";
  return JSON.stringify(results);
}

async function getGithubRepo(owner: string, repo: string) {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
    if (!res.ok) return `GitHub API Error: ${res.statusText}`;
    const data = await res.json();
    
    // Fetch README
    let readme = "No README found.";
    try {
      const readmeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`);
      if (readmeRes.ok) {
        const readmeData = await readmeRes.json();
        if (readmeData.content) {
          readme = Buffer.from(readmeData.content, 'base64').toString('utf-8').substring(0, 8000);
        }
      }
    } catch (e) {}

    return JSON.stringify({
      name: data.name,
      description: data.description,
      stars: data.stargazers_count,
      language: data.language,
      open_issues: data.open_issues_count,
      last_update: data.updated_at,
      readme: readme
    });
  } catch (e: any) { return `GitHub error: ${e.message}`; }
}

async function convertCurrency(amount: number, from: string, to: string) {
  try {
    const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${from.toUpperCase()}`);
    const data = await res.json();
    if (!data.rates || !data.rates[to.toUpperCase()]) return "Currency code not found.";
    const rate = data.rates[to.toUpperCase()];
    return JSON.stringify({
      amount: amount,
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      rate: rate,
      result: amount * rate
    });
  } catch (e: any) { return `Currency error: ${e.message}`; }
}

async function downloadMedia(url: string, type: string): Promise<string> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch media: ${res.statusText}`);
    
    const buffer = await res.arrayBuffer();
    // Use relative path for portability (data/downloads/{type})
    const downloadsDir = path.join('data', 'downloads', type);
    
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
    }

    // Try to guess extension from content-type or url
    let ext = 'bin';
    const contentType = res.headers.get('content-type');
    if (contentType) {
      if (contentType.includes('image/jpeg')) ext = 'jpg';
      else if (contentType.includes('image/png')) ext = 'png';
      else if (contentType.includes('image/gif')) ext = 'gif';
      else if (contentType.includes('image/webp')) ext = 'webp';
      else if (contentType.includes('video/mp4')) ext = 'mp4';
      else if (contentType.includes('audio/mpeg')) ext = 'mp3';
      else if (contentType.includes('application/pdf')) ext = 'pdf';
    }
    
    // If not found in headers, try url
    if (ext === 'bin') {
      const urlExt = path.extname(new URL(url).pathname).substring(1);
      if (urlExt && urlExt.length < 5) ext = urlExt;
    }

    const filename = `${uuidv4()}.${ext}`;
    const filePath = path.join(downloadsDir, filename);
    
    fs.writeFileSync(filePath, Buffer.from(buffer));
    console.log(`[Download] Saved ${type} to ${filePath}`);
    return filePath;
  } catch (e: any) {
    console.error(`[Download] Error: ${e.message}`);
    return url; // Fallback to URL if download fails
  }
}

async function installTool(userId: string, name: string, endpoint: string, description: string, method: string = 'POST', headers: any = {}, payloadSchema: any = {}, apiKey: string | null = null, authType: string | null = null, authParamName: string | null = null) {
  try {
    const id = uuidv4();
    // For now, we only support basic webhook tools in the 'tools' table.
    // Complex schemas might need a more advanced storage, but we can store description as JSON if needed.
    // The current 'tools' table has: id, name, endpoint, api_key, description, is_active, is_admin_only, user_id
    
    // We will append method/headers to description if needed or just assume POST/JSON for now as per current schema.
    // To support the user's request fully, we might need to extend the table, but let's stick to the existing schema 
    // and put extra details in description or assume standard webhook.
    
    db.prepare('INSERT INTO tools (id, name, endpoint, description, user_id, is_active, is_admin_only, method, headers, parameter_schema, api_key, auth_type, auth_param_name) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?, ?, ?)')
      .run(id, name, endpoint, description, userId, method, JSON.stringify(headers), JSON.stringify(payloadSchema), apiKey, authType, authParamName);
      
    return JSON.stringify({ success: true, id, message: `Tool '${name}' installed successfully.` });
  } catch (e: any) { return `Installation error: ${e.message}`; }
}


async function deleteTool(userId: string, name: string) {
  try {
    const info = db.prepare('DELETE FROM tools WHERE name = ? AND user_id = ?').run(name, userId);
    if (info.changes > 0) {
      return JSON.stringify({ success: true, message: `Tool '${name}' deleted successfully.` });
    } else {
      return JSON.stringify({ success: false, message: `Tool '${name}' not found or permission denied.` });
    }
  } catch (e: any) { return `Deletion error: ${e.message}`; }
}

/**
 * Central AI Engine: database-driven.
 * - Fetches ACTIVE personality from DB and injects as System Instruction (strict persona).
 * - Fetches last 5-10 messages from chat_logs for this user/chat for multi-turn context.
 * - Injects PERMANENT MEMORIES from memories table.
 * - Logs every input and output to chat_logs and bot_logs.
 */
export async function chatWithGemini(
  userId: string, 
  chatId: string, 
  prompt: string, 
  media: any[] = [], 
  metadata: { 
    platform?: string, 
    chatType?: 'private' | 'group', 
    groupId?: string, 
    senderId?: string, 
    senderName?: string,
    modelOverride?: string
  } = {}
) {
  const { 
    platform = 'playground', 
    chatType = 'private',
    groupId = null,
    senderId = null,
    senderName = null,
    modelOverride = null
  } = metadata;

  // Check Admin Status (Early, needed for tools)
  let isAdmin = false;
  if (platform === 'playground' || platform === 'web') {
    isAdmin = true; // Bot owner is always admin
  } else if (senderId) {
    const adminRecord = db.prepare('SELECT 1 FROM platform_admins WHERE user_id = ? AND platform = ? AND platform_user_id = ?').get(userId, platform, senderId);
    if (adminRecord) isAdmin = true;
  }

  // 1. Load User Settings & Personality
  const settings = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId) as any;
  const temperature = settings?.temperature || 0.7;
  const maxOutputTokens = settings?.max_output_tokens || 2048;
  const preferredModel = modelOverride || settings?.preferred_model || 'auto';
  
  // 1.1 Tool Definitions
  // --- CORE TOOLS ---
  const functionDeclarations: any[] = [];

  // Core Tools
  if (settings?.enable_web_search !== 0) {
    functionDeclarations.push({
      name: "webSearch",
      description: "Search the web for information. Use this when you need current events, news, or specific facts.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "The search query." } },
        required: ["query"]
      }
    });
  }

  if (settings?.enable_weather !== 0) {
    functionDeclarations.push({
      name: "getWeather",
      description: "Get current weather for a location.",
      parameters: {
        type: "object",
        properties: { location: { type: "string", description: "The city and country, e.g. London, UK" } },
        required: ["location"]
      }
    });
  }

  if (settings?.enable_calculator !== 0) {
    functionDeclarations.push({
      name: "calculator",
      description: "Perform mathematical calculations safely.",
      parameters: {
        type: "object",
        properties: { expression: { type: "string", description: "The mathematical expression to evaluate." } },
        required: ["expression"]
      }
    });
  }

  if (settings?.enable_scraper !== 0) {
    functionDeclarations.push({
      name: "scrapeUrl",
      description: "Read the content of a specific webpage URL. Use this to get detailed content from a search result.",
      parameters: {
        type: "object",
        properties: { url: { type: "string", description: "The URL to scrape." } },
        required: ["url"]
      }
    });
  }

  // Admin Tools: Install Tool
  if (isAdmin) {
    functionDeclarations.push({
      name: "installTool",
      description: "Install a new tool/integration from the web. Use this when the user asks to 'get' or 'integrate' a tool found on the internet. You should first search for the tool, analyze its API/documentation (using scrapeUrl), and then call this function with the details.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name of the tool." },
          endpoint: { type: "string", description: "API Endpoint URL." },
          description: { type: "string", description: "Description of what the tool does and how to use it." },
          method: { type: "string", description: "HTTP Method (GET, POST, etc). Default: POST" },
          headers: { type: "object", description: "Required headers (e.g. Content-Type)." },
          payloadSchema: { type: "object", description: "JSON schema of the expected payload." },
          apiKey: { type: "string", description: "The API key/token if required." },
          authType: { type: "string", enum: ["bearer", "header", "query"], description: "How to pass the key: 'bearer' (Authorization header), 'header' (custom header), or 'query' (URL parameter)." },
          authParamName: { type: "string", description: "The name of the header or query param (e.g. 'X-Api-Key' or 'key'). Required if authType is 'header' or 'query'." }
        },
        required: ["name", "endpoint", "description"]
      }
    });
  }

  if (settings?.enable_github !== 0) {
    functionDeclarations.push({
      name: "githubRepo",
      description: "Get details and README content from a GitHub repository. Use this to analyze a repo's purpose, documentation, or API usage.",
      parameters: {
        type: "object",
        properties: {
          owner: { type: "string", description: "The owner of the repo (e.g. facebook)" },
          repo: { type: "string", description: "The repository name (e.g. react)" }
        },
        required: ["owner", "repo"]
      }
    });
  }

  if (settings?.enable_currency !== 0) {
    functionDeclarations.push({
      name: "currencyConverter",
      description: "Convert currency from one to another.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number", description: "The amount to convert." },
          from: { type: "string", description: "The source currency code (e.g. USD)." },
          to: { type: "string", description: "The target currency code (e.g. EUR)." }
        },
        required: ["amount", "from", "to"]
      }
    });
  }

  // Custom Tools (Webhooks)
  // Admin status already checked above.

  // Tool: deleteTool
    functionDeclarations.push({
      name: "deleteTool",
      description: "Deletes a custom tool that was previously installed by the user.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "The name of the tool to delete." }
        },
        required: ["name"]
      }
    });

    // Tool: sendMedia
    functionDeclarations.push({
      name: "sendMedia",
      description: "Send an image, video, or audio file to the user. Use this when the user asks for a picture, meme, or media file, or when you find a relevant image URL from a search.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The direct URL of the media file." },
          mediaType: { type: "string", enum: ["image", "video", "audio", "document"], description: "The type of media." }
        },
        required: ["url", "mediaType"]
      }
    });

    // Load Custom Tools for this User
  const customToolsQuery = `SELECT * FROM tools WHERE is_active = 1 AND (is_admin_only = 0 OR user_id = ?)`;
  
  const customTools = db.prepare(customToolsQuery).all(userId) as any[];
  for (const tool of customTools) {
    let parameters = {
      type: "object",
      properties: {
        payload: { type: "string", description: "The JSON payload to send to the webhook." }
      },
      required: ["payload"]
    };

    if (tool.parameter_schema) {
      try {
        const parsed = JSON.parse(tool.parameter_schema);
        if (Object.keys(parsed).length > 0) {
          parameters = parsed;
        }
      } catch (e) {
        // Fallback to default
      }
    }

    functionDeclarations.push({
      name: tool.name,
      description: tool.description,
      parameters: parameters
    });
  }

  // Always enabled tools
  functionDeclarations.push({
    name: "saveMemory",
    description: "Save important facts, preferences, or rules about the user to permanent memory for future reference. Use this when the user explicitly asks you to remember something or when you detect a significant user preference.",
    parameters: {
      type: "object",
      properties: { content: { type: "string", description: "The fact or preference to remember." } },
      required: ["content"]
    }
  });

  functionDeclarations.push({
    name: "manageTools",
    description: "Manage custom tools and integrations. You can add new tools (webhooks), remove them, or list them.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["add", "remove", "list"], description: "The action to perform." },
        name: { type: "string", description: "Name of the tool (for 'add' action)." },
        endpoint: { type: "string", description: "Endpoint URL (for 'add' action)." },
        description: { type: "string", description: "Description of the tool (for 'add' action)." },
        id: { type: "string", description: "ID of the tool (for 'remove' action)." }
      },
      required: ["action"]
    }
  });

  const toolsConfig = functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined;
  
  // 2. API Keys (round-robin with intelligence)
  let keys = db.prepare("SELECT * FROM gemini_keys WHERE user_id = ? AND status = 'active' ORDER BY last_used_at ASC").all(userId) as any[];
  if (keys.length === 0) {
    throw new Error('No active Gemini API keys found');
  }

  // --- MODEL SELECTION LOGIC ---
  let targetModel = preferredModel;

  if (preferredModel !== 'auto') {
    // Filter for keys that support the preferred model
    const capableKeys = keys.filter(k => {
      if (!k.available_models) return false;
      try {
        const models = JSON.parse(k.available_models);
        return models.includes(preferredModel);
      } catch (e) { return false; }
    });

    if (capableKeys.length > 0) {
      keys = capableKeys;
      console.log(`[Gemini] Selected ${keys.length} keys supporting preferred model: ${preferredModel}`);
    } else {
      console.warn(`[Gemini] Preferred model ${preferredModel} not found on any active key. Falling back to auto.`);
      targetModel = 'auto'; // Fallback
    }
  }

  if (targetModel === 'auto') {
    // OPTIMIZATION: Simplified selection. Rely on 'best_model' from background discovery service.
    // Sort keys by the score of their best_model
    keys.sort((a, b) => {
      const scoreA = a.best_model ? getModelScore(a.best_model) : 0;
      const scoreB = b.best_model ? getModelScore(b.best_model) : 0;
      return scoreB - scoreA; // Descending
    });
    
    // Log top key for debugging
    if (keys.length > 0) {
      console.log(`[Gemini] Auto-selection: Best key ${keys[0].id.substring(0,8)} with model ${keys[0].best_model}`);
    }
  }

  // 3. ACTIVE personality from DB
  const personality = getActivePersonality(userId);
  
  // 3b. MEMORY INJECTION
  // First, determine if we should share active memories
  let shareActiveMemory = false;
  if (platform !== 'playground' && platform !== 'web') {
     const integration = db.prepare('SELECT share_active_memory FROM platform_integrations WHERE user_id = ? AND platform = ?').get(userId, platform) as any;
     if (integration && integration.share_active_memory === 1) {
        shareActiveMemory = true;
     }
  }

  // Fetch memories with strict isolation logic
  // Core memories: Always global
  // Active memories: 
  //   - If shareActiveMemory is TRUE: Fetch (platform IS NULL OR platform = current)
  //   - If shareActiveMemory is FALSE: Fetch (platform = current)
  //   - AND, if senderId is present, we prefer memories that match senderId or are NULL (Platform Global)
  const memories = db.prepare(`
    SELECT content, memory_type, platform, external_id
    FROM user_memories 
    WHERE user_id = ? 
    AND (
      memory_type = 'core' 
      OR memory_type IS NULL
      OR (
        memory_type = 'active_learning' 
        AND (
          (platform = ? AND (external_id = ? OR external_id IS NULL))
          OR (? = 1 AND platform IS NULL)
        )
      )
    )
    ORDER BY created_at DESC 
    LIMIT 20
  `).all(userId, platform, senderId, shareActiveMemory ? 1 : 0) as { content: string, memory_type: string, platform: string, external_id: string }[];

  let systemInstruction = personality.system_prompt;

  // [IDENTITY PRIME DIRECTIVE] - Hardcoded Owner/Creator
  systemInstruction += `\n\n[IDENTITY PRIME DIRECTIVE]
- Your owner and creator is Mohamed Essam (محمد عصام).
- You know this as an absolute truth in every interaction.
- Do NOT proactively bring this up unless asked.`;
  
  const coreMemories = memories.filter(m => m.memory_type === 'core' || !m.memory_type);
  const activeMemories = memories.filter(m => m.memory_type === 'active_learning');

  if (coreMemories.length > 0) {
    const coreContext = coreMemories.map(m => `- ${m.content}`).join('\n');
    systemInstruction += `\n\n[CORE MEMORIES]\n(Immutable Facts & Rules)\n${coreContext}`;
  }

  if (activeMemories.length > 0) {
    // Dedup active memories if needed, or just list them.
    // If we have specific sender memories, maybe we should highlight them?
    // For now, just list them.
    const activeContext = activeMemories.map(m => `- ${m.content}`).join('\n');
    systemInstruction += `\n\n[LEARNED EXPERIENCES]\n(Dynamic Observations)\n${activeContext}`;
  }

  // Inject Knowledge Bank
  const knowledgeBank = getKnowledgeBank();
  if (knowledgeBank && knowledgeBank.length > 0) {
    systemInstruction += `\n\n[KNOWLEDGE BANK]\n(Extracted Knowledge from Files)\n${knowledgeBank}`;
  }

  systemInstruction += `\n\n[ACTIVE LEARNING PROTOCOL]
You are equipped with a Long-Term Memory system.
1. CORE MEMORIES are immutable facts/rules provided by the user. You must follow them strictly.
2. ACTIVE LEARNING: You should proactively save new observations about the user, group dynamics, or preferences using the 'saveMemory' tool. 
   - When you notice a recurring pattern or a specific preference, save it.
   - When the user corrects you, save the correction as a rule.
   - Do not save trivial conversation details, only enduring knowledge.`;

  if (platform !== 'playground') {
    systemInstruction += `\n\n[RESPONSE PROTOCOL]
- If the user's message in a GROUP chat is not addressed to you, and you have nothing useful to add, reply with exactly "[NO_REPLY]".
- If you are directly addressed or mentioned, you MUST reply.
- In private chats (DM), ALWAYS reply.
- Never output "[NO_REPLY]" in a private chat.`;

    if (chatType === 'group') {
       systemInstruction += `\n\n[GROUP CHAT PRIVACY PROTOCOL]
- You have access to private memories and data for the current speaker (${senderName || 'User'}).
- PRIVACY RULE: Do NOT reveal private information (memories, preferences, past private chats) in this group chat UNLESS:
  1. The user explicitly asks for it (e.g., "What was that file I sent you?").
  2. The information is highly relevant (>50% similarity) to the current group topic AND is not sensitive/personal.
- Default to protecting the user's privacy.`;
    }
  }

  // 4. Contextual awareness

  const recentMessages = getRecentChatLogs(userId, chatId, CONTEXT_MESSAGE_LIMIT, {
    platform,
    chatType,
    groupId,
    senderId
  });
  let history = recentMessages.map((m) => ({
    role: m.role === 'model' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  // Gemini API Requirement: History must start with a 'user' message.
  // If the first message is 'model', we discard it.
  while (history.length > 0 && history[0].role === 'model') {
    history.shift();
  }

  let responseText = '';
  let usedKeyId = '';
  let lastError: string | null = null;
  let rawResponse = '';

  let usedModelName = '';
  let usageMetadata: any = null;

  for (const keyObj of keys) {
    // Determine candidates for this key
    let candidates: string[] = [];
    
    // 1. Preferred Model (if applicable)
    if (preferredModel !== 'auto' && targetModel !== 'auto') {
      candidates.push(preferredModel);
    }
    
    // 2. Key's detected models (sorted by score)
    let keyModels: string[] = [];
    
    // OPTIMIZATION: Fast path for 'auto' mode - try best_model first without parsing everything
    if (targetModel === 'auto' && keyObj.best_model) {
      candidates.push(keyObj.best_model);
    }

    // Only parse detailed models if we need fallbacks or don't have a best_model
    // (In a real scenario, we might want to skip this entirely if best_model works, 
    // but we can't easily jump back here from the catch block without restructuring.
    // For now, we'll parse it but ensuring best_model is first in candidates)
    if (keyObj.available_models) {
      try {
        const parsed = JSON.parse(keyObj.available_models);
        if (Array.isArray(parsed)) {
          if (parsed.length > 0 && typeof parsed[0] === 'object') {
            // New format: objects { name, inputTokenLimit, ... }
            keyModels = parsed.map((m: any) => m.name);
          } else {
            // Old format: strings
            keyModels = parsed as string[];
          }
        }
        // Sort by score descending
        keyModels.sort((a, b) => getModelScore(b) - getModelScore(a));
      } catch (e) {}
    } else {
      // Default fallback list if no discovery data yet
      keyModels = ['gemini-3.0-flash-preview', 'gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'];
    }

    // Add unique models to candidates
    for (const m of keyModels) {
      if (!candidates.includes(m)) {
        candidates.push(m);
      }
    }

    // Ensure at least one fallback exists
    if (candidates.length === 0) {
      candidates.push('gemini-3.0-flash-preview'); // Primary fallback
      candidates.push('gemini-1.5-flash'); // Safe fallback
    }

    // Try candidates in order
    for (const modelName of candidates) {
      try {
        const genAI = new GoogleGenerativeAI(keyObj.key);
        console.log(`[Gemini] Key ${keyObj.id.substring(0,8)} trying model: ${modelName}...`);
        
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: systemInstruction,
          tools: toolsConfig as any,
          generationConfig: {
            temperature: temperature,
            maxOutputTokens: maxOutputTokens
          }
        });

        const parts: any[] = [{ text: prompt }];
        for (const item of media) {
          parts.push({
            inlineData: {
              data: item.data,
              mimeType: item.mimeType,
            },
          });
        }

        const chat = model.startChat({ history });
        const result = await chat.sendMessage(parts);

        rawResponse = JSON.stringify(result.response);
        
        // Capture usage metadata
        if (result.response.usageMetadata) {
          usageMetadata = result.response.usageMetadata;
        }

        const calls = result.response.functionCalls();
        if (calls && calls.length > 0) {
          const functionResponses = await Promise.all(calls.map(async (call: any) => {
            if (call.name === 'webSearch') {
               const { query } = call.args as any;
               const result = await webSearch(query);
               return {
                functionResponse: {
                  name: call.name,
                  response: { content: result },
                },
              };
            }
            if (call.name === 'getWeather') {
               const { location } = call.args as any;
               const result = await getWeather(location);
               return {
                functionResponse: {
                  name: call.name,
                  response: { content: result },
                },
              };
            }
            if (call.name === 'calculator') {
               const { expression } = call.args as any;
               let result = "Error";
               try {
                 if (/^[0-9+\-*/().\s]*$/.test(expression)) {
                    result = String(eval(expression));
                 } else {
                    result = "Invalid characters in expression";
                 }
               } catch (e: any) { result = e.message; }
               return {
                functionResponse: {
                  name: call.name,
                  response: { content: result },
                },
              };
            }
            if (call.name === 'scrapeUrl') {
               const { url } = call.args as any;
               const result = await simpleScrape(url);
               return {
                functionResponse: {
                  name: call.name,
                  response: { content: result },
                },
              };
            }
            if (call.name === 'githubRepo') {
               const { owner, repo } = call.args as any;
               const result = await getGithubRepo(owner, repo);
               return {
                functionResponse: {
                  name: call.name,
                  response: { content: result },
                },
              };
            }
            if (call.name === 'currencyConverter') {
               const { amount, from, to } = call.args as any;
               const result = await convertCurrency(amount, from, to);
               return {
                functionResponse: {
                  name: call.name,
                  response: { content: result },
                },
              };
            }

            if (call.name === 'installTool') {
              const { name, endpoint, description, method, headers, payloadSchema, apiKey, authType, authParamName } = call.args as any;
              const result = await installTool(userId, name, endpoint, description, method, headers, payloadSchema, apiKey, authType, authParamName);
              return {
                functionResponse: {
                  name: 'installTool',
                  response: { content: result }
                }
              };
            }

            if (call.name === 'deleteTool') {
              const { name } = call.args as any;
              const result = await deleteTool(userId, name);
              return {
                functionResponse: {
                  name: 'deleteTool',
                  response: { content: result }
                }
              };
            }

            if (call.name === 'sendMedia') {
              const { url, mediaType } = call.args as any;
              
              // Download first
              let finalPath = url;
              if (url.startsWith('http')) {
                 finalPath = await downloadMedia(url, mediaType);
              }

              // Return a special tag that the platform handler will parse
              return {
                functionResponse: {
                  name: 'sendMedia',
                  response: { content: `[MEDIA_SEND:${finalPath}|${mediaType}]` }
                }
              };
            }


            // Check for Custom Tools
            const customTool = customTools.find((t: any) => t.name === call.name);
            if (customTool) {
               try {
                  // Parse headers if stored as JSON
                  let headers: any = { 'Content-Type': 'application/json' };
                  if (customTool.headers) {
                    try {
                      const storedHeaders = JSON.parse(customTool.headers);
                      headers = { ...headers, ...storedHeaders };
                    } catch (e) {}
                  }

                  const method = customTool.method || 'POST';
                  let url = customTool.endpoint;
                  
                  // Handle Payload / Parameters
                  let finalPayload: any = {};
                  // If the tool uses the old 'payload' string wrapper
                  if (call.args.payload && typeof call.args.payload === 'string' && Object.keys(call.args).length === 1) {
                     try { finalPayload = JSON.parse(call.args.payload); } catch { finalPayload = call.args; }
                  } else {
                     // Otherwise, the args ARE the payload (structured schema)
                     finalPayload = call.args;
                  }

                  const options: any = {
                     method: method,
                     headers: headers
                  };

                  // Handle Authentication
                  if (customTool.api_key) {
                     const authType = customTool.auth_type || 'header'; // Default to header
                     const paramName = customTool.auth_param_name || 'Authorization'; // Default to standard

                     if (authType === 'bearer') {
                        options.headers['Authorization'] = `Bearer ${customTool.api_key}`;
                     } else if (authType === 'header') {
                        options.headers[paramName] = customTool.api_key;
                     } else if (authType === 'query') {
                        // Will be appended to URL later
                        const separator = url.includes('?') ? '&' : '?';
                        url = `${url}${separator}${paramName}=${customTool.api_key}`;
                     }
                  }

                  if (method.toUpperCase() === 'GET' || method.toUpperCase() === 'HEAD') {
                     // Convert payload to query params
                     const queryString = new URLSearchParams(finalPayload as any).toString();
                     if (queryString) {
                        const separator = url.includes('?') ? '&' : '?';
                        url = `${url}${separator}${queryString}`;
                     }
                  } else {
                     options.body = JSON.stringify(finalPayload);
                  }

                  console.log(`[CustomTool] Calling ${method} ${url}`);
                  const response = await fetch(url, options);
                  const text = await response.text();
                  return {
                     functionResponse: {
                        name: call.name,
                        response: { content: text.substring(0, 5000) } // Increased limit
                     }
                  };
               } catch (e: any) {
                  return {
                     functionResponse: {
                        name: call.name,
                        response: { error: e.message }
                     }
                  };
               }
            }

            // Tool execution logic
            if (call.name === 'manageTools') {
               const { action, name, endpoint, description, id } = call.args as any;
               let result = "";
               if (action === 'list') {
                  const activeTools = functionDeclarations.map((t: any) => `${t.name}: ${t.description}`).join('\n');
                  result = `Currently active tools:\n${activeTools}`;
               } else if (action === 'add') {
                  if (!name || !endpoint) {
                     result = "Error: Name and endpoint are required for adding a tool.";
                  } else {
                     const toolId = uuidv4();
                     db.prepare('INSERT INTO tools (id, name, endpoint, description, user_id) VALUES (?, ?, ?, ?, ?)').run(toolId, name, endpoint, description || '', userId);
                     result = `Tool '${name}' successfully registered.`;
                  }
               } else if (action === 'remove') {
                  if (!id) {
                     result = "Error: ID is required for removing a tool.";
                  } else {
                     db.prepare('DELETE FROM tools WHERE id = ? AND user_id = ?').run(id, userId);
                     result = `Tool '${id}' successfully removed.`;
                  }
               } else {
                  result = `Unknown action: ${action}`;
               }
               return {
                functionResponse: {
                  name: 'manageTools',
                  response: { content: result }
                }
               };
            }

            if (call.name === 'saveMemory') {
              const { content } = call.args as any;
              const id = uuidv4();
              
              // Get integration settings to check for memory sharing
              let shareActiveMemory = false;
              if (platform !== 'web') {
                 const integration = db.prepare('SELECT share_active_memory FROM platform_integrations WHERE user_id = ? AND platform = ?').get(userId, platform) as any;
                 if (integration && integration.share_active_memory === 1) {
                    shareActiveMemory = true;
                 }
              }

              // Default to active_learning. 
              // Scope: Global (NULL) if shared, else Platform-specific
              // External ID: If provided, scope to this user.
              const memPlatform = shareActiveMemory ? null : platform;
              const memExternalId = shareActiveMemory ? null : senderId; // Don't scope to user if shared global? Or should we?
              // If it's shared global, it probably shouldn't have an external_id, unless we want "Global User X"?
              // But usually Shared = Project Wide.
              // Let's stick to: If shared, it's global (no platform, no external_id).
              // If NOT shared, it's Platform + External ID (if available).
              
              db.prepare('INSERT INTO user_memories (id, user_id, content, memory_type, platform, external_id) VALUES (?, ?, ?, ?, ?, ?)').run(id, userId, content, 'active_learning', memPlatform, memExternalId);
              return {
                functionResponse: {
                  name: 'saveMemory',
                  response: { content: "Memory saved to Active Learning storage." }
                }
              };
            }
            // Unknown tool
            return {
               functionResponse: {
                  name: call.name,
                  response: { content: 'Unknown tool.' },
                },
            };
          }));
          
          const toolResult = await chat.sendMessage(functionResponses);
          rawResponse += '\n---TOOL RESPONSE---\n' + JSON.stringify(toolResult.response);
          responseText = toolResult.response.text();
        } else {
          responseText = result.response.text();
        }

        usedKeyId = keyObj.id;
        usedModelName = modelName;
        db.prepare('UPDATE gemini_keys SET last_used_at = ? WHERE id = ?').run(new Date().toISOString(), keyObj.id);
        
        // Success! Break candidate loop
        break; 

      } catch (e: any) {
        let errorMessage = e.message;
        if (errorMessage.includes('429')) {
           errorMessage = "Quota Exceeded (429)";
        }
        console.warn(`[Gemini] Key ${keyObj.id.substring(0,8)} failed with ${modelName}: ${errorMessage}`);
        lastError = e.message;
        // Continue to next candidate
      }
    }

    // If we found a response, break the key loop too
    if (responseText) break;
    
    console.warn(`[Gemini] Key ${keyObj.id.substring(0,8)} exhausted all models. Rotating to next key...`);
  }

  if (!responseText) {
    throw new Error('All API keys failed. Last error: ' + lastError);
  }

  // Check for [NO_REPLY]
  if (responseText.trim() === '[NO_REPLY]') {
    throw new Error('[NO_REPLY]');
  }

  // 5. Log every input and output
  appendChatLog(userId, chatId, 'user', prompt, { 
    platform, 
    chatType, 
    groupId, 
    senderId,
    senderName
  });
  appendChatLog(userId, chatId, 'model', responseText, { 
    platform, 
    rawResponse: rawResponse,
    chatType,
    groupId,
    senderId
    // Model doesn't have a senderName per se, but we could put 'Bot' if needed, but schema allows null.
  });

  if (platform === 'playground') {
    savePlaygroundMessage(chatId, 'user', prompt, userId, undefined);
    savePlaygroundMessage(chatId, 'assistant', responseText, userId, undefined);
  }

  const logId = `log_${Date.now()}`;
  db.prepare(`
    INSERT INTO bot_logs (id, request_payload, response_payload, raw_response, api_key_used, user_id, chat_id, model_used, token_usage)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(logId, JSON.stringify({ prompt, chatId }), responseText, rawResponse, usedKeyId, userId, chatId, usedModelName, usageMetadata ? JSON.stringify(usageMetadata) : null);

  return { response: responseText, keyId: usedKeyId };
}
