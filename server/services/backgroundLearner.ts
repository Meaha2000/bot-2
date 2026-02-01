import { WebBrowser } from './webBrowser';
import { db } from '../db';
import { chatWithGemini } from '../gemini';
import { appendToKnowledgeBank } from '../knowledgeBank';

const TOPICS = [
  { name: "Arab World & Egypt", query: "news egypt arab world today" },
  { name: "AI & Tech", query: "AI news technology science updates today" },
  { name: "Anime & Japanese Games", query: "anime news japanese games updates today" },
  { name: "Chinese Games", query: "chinese games news hoyoverse wuthering waves arknights today" }
];

let currentTopicIndex = 0;
const LEARNER_INTERVAL_MS = 5 * 60 * 1000; // 5 Minutes

async function getCapableUserId(): Promise<string | null> {
  // Find a user who has active Gemini keys
  const key = db.prepare("SELECT user_id FROM gemini_keys WHERE status = 'active' LIMIT 1").get() as any;
  return key ? key.user_id : null;
}

async function runLearningCycle() {
  const topic = TOPICS[currentTopicIndex];
  console.log(`[BackgroundLearner] Starting learning cycle for topic: ${topic.name}...`);
  
  // Advance index for next time
  currentTopicIndex = (currentTopicIndex + 1) % TOPICS.length;

  const userId = await getCapableUserId();
  if (!userId) {
    console.warn('[BackgroundLearner] No active user with keys found. Skipping cycle.');
    return;
  }

  try {
    // 1. Search for trends (Single topic)
    console.log(`[BackgroundLearner] Searching for: ${topic.query}`);
    const results = await WebBrowser.search(topic.query);
    
    if (results.length === 0) {
      console.log('[BackgroundLearner] No search results found.');
      return;
    }

    const context = results.map(r => `Title: ${r.title}\nLink: ${r.link}\nSnippet: ${r.snippet}`).join('\n\n');

    // 2. Synthesize with AI
    console.log('[BackgroundLearner] Synthesizing knowledge...');
    const prompt = `
      You are an autonomous knowledge collector.
      I have performed a web search for the topic: "${topic.name}".
      Analyze the following search results and identify the top 2-3 most significant events or trends.
      
      SEARCH RESULTS:
      ${context}

      INSTRUCTIONS:
      - Summarize these trends into a concise, factual format suitable for a Knowledge Bank.
      - Focus ONLY on the topic: ${topic.name}.
      - Ignore trivial clickbait. Focus on significant updates.
      - If the search results contain NO useful information, output exactly: [NO_INFO]
      - Format strictly as follows for each trend:
        
        ## Learned Trend [YYYY-MM-DD]
        **Topic:** [Title]
        **Summary:** [2-3 sentences explanation]
        **Source:** [Link]

      - Do NOT add any conversational text like "Here is the summary". Do NOT apologize. Just output the data or [NO_INFO].
    `;

    // Use a special chat ID for the learner to avoid polluting user chats
    // Force use of a cheaper/older model (gemini-1.5-flash) to save tokens on better models
    const result = await chatWithGemini(userId, 'system-learner', prompt, [], { 
      platform: 'system',
      modelOverride: 'gemini-1.5-flash'
    });
    const summary = result.response;

    // 3. Save to Knowledge Bank
    if (summary && !summary.includes('[NO_REPLY]') && !summary.includes('[NO_INFO]')) {
      // Validate format to prevent conversational garbage
      if (summary.trim().startsWith('## Learned Trend')) {
         appendToKnowledgeBank(summary);
         console.log(`[BackgroundLearner] Knowledge Bank updated with new trends for ${topic.name}.`);
      } else {
         console.warn('[BackgroundLearner] AI response was not in correct format. Discarding.');
      }
    }

  } catch (error) {
    console.error('[BackgroundLearner] Cycle failed:', error);
  }
}

export function startBackgroundLearner() {
  // Run immediately on startup (or after a short delay)
  setTimeout(runLearningCycle, 30 * 1000); // 30s delay to let server settle

  // Schedule hourly
  setInterval(runLearningCycle, LEARNER_INTERVAL_MS);
  console.log('[BackgroundLearner] Service started.');
}
