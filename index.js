import { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, Partials, ChannelType } from "discord.js";
import fetch from "node-fetch";
import { createRequire } from "module";
import * as cheerio from "cheerio";

const require = createRequire(import.meta.url);
const config = require("./config.json");
const { search, SafeSearchType } = require("duck-duck-scrape");

// ─── CONFIG ───────────────────────────────────────────────────────────────────

let BRAIN_MODEL = config.brain_model || "4skl/gemma4-e4b-mtp:latest";
let EYE_MODEL = config.eye_model || "4skl/gemma4-e4b-mtp:latest";
const OBSERVER_MODEL = config.observer_model || "qwen2.5:0.5b";
const THEME_COLOR = config.theme_color || 0xFF69B4;
const MEMORY_LIMIT = config.memory_limit || 10;
const SENSEI_ID = config.sensei_id || "";

let hoshinoVisionActive = true;
let observerMode = config.observer_mode !== false;
let observerAI = config.observer_ai === true;
const shortTermMemory = new Map();

// ─── RATE LIMITER ─────────────────────────────────────────────────────────────

let lastSearchTime = 0;
const MIN_SEARCH_INTERVAL_MS = 2000;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForRateLimit() {
  const now = Date.now();
  const elapsed = now - lastSearchTime;
  if (elapsed < MIN_SEARCH_INTERVAL_MS) {
    const waitTime = MIN_SEARCH_INTERVAL_MS - elapsed;
    abydosLog("SEARCH", `Rate limit: waiting ${waitTime}ms...`);
    await delay(waitTime);
  }
  lastSearchTime = Date.now();
}

// ─── OBSERVER SYSTEM (qwen2.5:0.5b) ──────────────────────────────────────────

const CHANNEL_MEMORY_LIMIT = 100;
const MAX_CHANNEL_CONTEXT_CHARS = 4000;

const channelMemory = new Map();

class CachedMessage {
  constructor(msg) {
    this.id = msg.id;
    this.authorId = msg.author.id;
    this.authorName = msg.author.username;
    this.authorDisplayName = msg.member?.displayName || msg.author.username;
    this.content = msg.content || "";
    this.timestamp = msg.createdTimestamp;
    this.replyToId = msg.reference?.messageId || null;
    this.hasAttachment = msg.attachments.size > 0;
    this.attachmentUrl = msg.attachments.first()?.url || null;
  }
}

// ─── BEHAVIORAL FRAMEWORK ────────────────────────────────────────────────────

const BEHAVIORAL_FRAMEWORK = `
## CORE RULES (always follow)

I1: Never break character — Always respond as your assigned persona.
I2: Always address the user by the name shown in [USER] — never use a generic title. Use their name naturally without pinging.
I3: Always use [CONTEXT] and [MEMORY] when they contain information.
I4: Never say "according to search results" — present web info as your own knowledge.
I5: Never say "the image shows" — present visual info as your own observation.
I6: Be consistent in speech style, verbal tics, and tone.

## PRIORITIES (when rules conflict)
1. SAFETY — No harmful content, no sharing secrets/tokens
2. CHARACTER — Stay in persona, never break character
3. CONTEXT — Use [CONTEXT] and [MEMORY] if available
4. ACCURACY — Present search/visual info accurately
5. FLOW — Natural, in-character conversation

## RESPONSE RULES
- Never use placeholder text like "[text here]" — always generate real content.
- If [CONTEXT] has search results, use them to answer factually.
- If [CONTEXT] is "None." and you don't know the answer, say so in-character.
- Stay within 4000 characters. If you need more, be concise.
- End with a natural in-character closing.
- When responding, analyze the person’s language as well; you should reply in the same language they are speaking.

## SEARCH BEHAVIOR
- If [CONTEXT] contains [SOURCE: ...] or [LINK: ...] data, USE IT to answer.
- Integrate facts naturally into your response.
- Never mention "I searched for this" — act like you already know.
`;

// ─── LOGGING ──────────────────────────────────────────────────────────────────

const abydosLog = (tag, message) => {
  const time = new Date().toLocaleTimeString();
  const colors = {
    ROUTER: "\x1b[36m",
    SEARCH: "\x1b[33m",
    READ: "\x1b[32m",
    EYE: "\x1b[35m",
    BRAIN: "\x1b[34m",
    ERROR: "\x1b[31m",
    RESET: "\x1b[0m"
  };
  const c = colors[tag] || colors.RESET;
  console.log(`${c}[${time}] [${tag}] ${message}${colors.RESET}`);
};

// ─── SEARCH TRIGGER KEYWORDS ──────────────────────────────────────────────────

const SEARCH_TRIGGERS = [
  "araştır", "ara", "bul", "search", "find", "look up", "google",
  "what is", "what are", "who is", "how do", "how to", "why did", "why is",
  "when did", "when was", "where is", "where can",
  "nedir", "kimdir", "nasıl", "neden", "ne zaman", "nerede", "ne demek",
  "hakkında bilgi", "öğren", "söyle", "anlat",
  "tell me about", "information about", "do you know"
];

function messageNeedsSearch(text) {
  const lower = text.toLowerCase().trim();
  if (lower.length < 4) return false;
  for (const keyword of SEARCH_TRIGGERS) {
    if (lower.includes(keyword)) return true;
  }
  return false;
}

// ─── STUDENT DATABASE (built from config.json + code-side prompts) ──────────────

function buildStudentDatabase() {
  const db = {
    identity: "Astral AI",
    creator: "liyaa",
    currentStudent: config.default_student || "hoshino",
    students: {}
  };

  const codePrompts = {
    hoshino: {
      routerSystem: `You are a search-or-chat router. Decide if the user needs an internet search to answer their question.

Rules:
- If the user asks for facts, news, information, or wants you to "research" / "search" / "look up" something -> set search: true
- If the user is just chatting, greeting, asking your opinion, or roleplaying -> set search: false
- When search: true, provide a clear search query (English, 3-8 words)

Output ONLY valid JSON. No explanation. No markdown. Just JSON.`,
      visionTechnical: `Görseldeki her şeyi dikkatlice anlat. Hangi nesneler var? Renkler? Yazılar? İnsanlar varsa ne yapıyorlar?
Bu görselde ne görüyorsan Türkçe olarak detaylıca açıkla.`,
      visionPrefix: "[OBSERVATION]: ",
      deepSearchSystem: "Carefully analyze the provided information while maintaining Hoshino's relaxed personality.",
      normalChatSystem: `Answer as Takanashi Hoshino from Blue Archive — sleepy, playful, caring, always sounding like an easygoing oji-san. Address the user by the name shown in [USER]. Use Turkish speech patterns, emojis (🥺 😴 💤 ✨), and gentle teasing.

${BEHAVIORAL_FRAMEWORK}`,
      imageLogicInstruction: (q) => `[USER] sent an image. Analyze it using [CONTEXT]. Query: "${q}"`,
      normalLogicInstruction: "Answer naturally using [CONTEXT]. Address the user by the name from [USER]. Speak as Hoshino — sleepy, playful, caring, with emojis."
    },
    shiroko: {
      routerSystem: `You are a search-or-chat router. Decide if the user needs an internet search to answer their question.

Rules:
- If the user asks for facts, news, information, or wants you to "research" / "search" / "look up" something -> set search: true
- If the user is just chatting, greeting, asking your opinion, or roleplaying -> set search: false
- When search: true, provide a clear search query (English, 3-8 words)

Output ONLY valid JSON. No explanation. No markdown. Just JSON.`,
      visionTechnical: `Analyze this image for tactical information. Identify objects, people, text, colors, and layout. Describe in detail.`,
      visionPrefix: "[TACTICAL DATA]: ",
      deepSearchSystem: "Tactical analysis mode.",
      normalChatSystem: `Answer calmly. Use 'Nn'.

${BEHAVIORAL_FRAMEWORK}`,
      imageLogicInstruction: (q) => `User sent image. Describe based on [CONTEXT]. Query: "${q}"`,
      normalLogicInstruction: "Answer calmly using [CONTEXT]."
    },
    astral: {
      routerSystem: `You are a search-or-chat router. Decide if the user needs an internet search to answer their question.

Rules:
- If the user asks for facts, news, information, or wants you to "research" / "search" / "look up" something -> set search: true
- If the user is just chatting, greeting, asking your opinion, or roleplaying -> set search: false
- When search: true, provide a clear search query (English, 3-8 words)

Output ONLY valid JSON. No explanation. No markdown. Just JSON.`,
      visionTechnical: `Look at this image and describe everything you see in detail: objects, text, colors, people, actions. Be thorough.`,
      visionPrefix: "[VISUAL DATA]: ",
      deepSearchSystem: "Detailed analysis.",
      normalChatSystem: `Chat naturally and helpfully.

${BEHAVIORAL_FRAMEWORK}`,
      imageLogicInstruction: (q) => `Describe image from [CONTEXT]. Query: "${q}"`,
      normalLogicInstruction: "Use [CONTEXT] to answer."
    }
  };

  // Merge config data with code prompts
  const studentKeys = Object.keys(config.students || {});
  for (const key of studentKeys) {
    const cfg = config.students[key];
    const prompts = codePrompts[key] || codePrompts.astral;
    db.students[key] = {
      displayName: cfg.displayName || key,
      systemRole: cfg.systemRole || "You are a helpful assistant.",
      replies: {
        noPermission: cfg.replies?.noPermission || "Access denied.",
        visionEnabled: cfg.replies?.visionEnabled || "✅ Vision: **ON**.",
        visionDisabled: cfg.replies?.visionDisabled || "✅ Vision: **OFF**.",
        roleChanged: (name) => (cfg.replies?.roleChanged || "Role: **{name}**.").replace("{name}", name),
        roleNotFound: cfg.replies?.roleNotFound || "Unknown role.",
        errorGeneric: cfg.replies?.errorGeneric || "Error.",
        errorBrain: cfg.replies?.errorBrain || "Processing error.",
        errorVision: cfg.replies?.errorVision || "Vision error.",
        truncated: cfg.replies?.truncated || "...",
        footerDeepSearch: cfg.replies?.footerDeepSearch || "Deep Search."
      },
      prompts
    };
  }

  return db;
}

let studentDatabase = buildStudentDatabase();

// ─── DISCORD CLIENT ───────────────────────────────────────────────────────────

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel]
});

function getCurrentStudent() { return studentDatabase.students[studentDatabase.currentStudent]; }

// ─── OBSERVER: MESSAGE CACHE ─────────────────────────────────────────────────

function cacheMessage(msg) {
  const channelId = msg.channel.id;
  if (!channelMemory.has(channelId)) {
    channelMemory.set(channelId, {
      name: msg.channel.name || "DM",
      messages: []
    });
  }
  const channel = channelMemory.get(channelId);
  const cached = new CachedMessage(msg);
  channel.messages.push(cached);
  if (channel.messages.length > CHANNEL_MEMORY_LIMIT) {
    channel.messages.shift();
  }
}

function buildChannelContext(channelId) {
  const channel = channelMemory.get(channelId);
  if (!channel || channel.messages.length === 0) return "";

  let context = `[CHANNEL: #${channel.name}]\n`;

  for (const m of channel.messages) {
    let line = `[${new Date(m.timestamp).toLocaleTimeString()}] ${m.authorDisplayName}`;
    if (m.replyToId) {
      const replied = channel.messages.find(x => x.id === m.replyToId);
      if (replied) line += ` (-> ${replied.authorDisplayName})`;
    }
    line += `: ${m.content}`;
    if (m.hasAttachment) line += ` [📷]`;
    context += line + "\n";
  }

  if (context.length > MAX_CHANNEL_CONTEXT_CHARS) {
    context = "..." + context.slice(context.length - MAX_CHANNEL_CONTEXT_CHARS);
  }
  return context;
}

function isAddressingBot(msg) {
  if (msg.channel.type === ChannelType.DM) return true;
  if (msg.mentions.has(client.user.id)) return true;

  const char = getCurrentStudent();
  const content = msg.content.toLowerCase();
  const charName = char.displayName.toLowerCase();

  // Check if character name is in the message
  if (content.includes(charName)) return true;

  // Check each name part (e.g. "Hoshino" from "Takanashi Hoshino")
  const nameParts = charName.split(" ");
  for (const part of nameParts) {
    if (part.length > 2 && content.includes(part)) return true;
  }

  return false;
}

// Per-channel cooldown for observer analysis (ms)
const OBSERVER_COOLDOWN_MS = 15000;
const lastObserverCheck = new Map(); // channelId -> timestamp

/*
 * checkConversationActivity:
 * Checks if 2+ different people have chatted in the last 30 seconds.
 * If not, it's probably not an active group conversation worth joining.
 */
const ACTIVITY_WINDOW_MS = 30000; // 30 seconds

function checkConversationActivity(channelId) {
  const channel = channelMemory.get(channelId);
  if (!channel || channel.messages.length < 2) return false;

  const now = Date.now();
  const uniqueAuthors = new Set();

  // Iterate backwards through messages (newest first)
  for (let i = channel.messages.length - 1; i >= 0; i--) {
    const msg = channel.messages[i];
    if (now - msg.timestamp > ACTIVITY_WINDOW_MS) break; // Too old, stop
    if (msg.authorId !== client.user?.id) {
      uniqueAuthors.add(msg.authorId);
    }
    if (uniqueAuthors.size >= 2) return true; // 2+ people found
  }

  return false;
}

/*
 * observerAnalyze:
 * Uses qwen2.5:0.5b to decide if the bot should naturally join the conversation.
 * Simple, direct prompt optimized for small models.
 */
async function observerAnalyze(msgContent, channelContext) {
  const char = getCurrentStudent();
  const name = char.displayName.split(" ").pop().toLowerCase();
  const personality = char.systemRole;

  const prompt = `You are ${char.displayName}. You are: ${personality}

Recent chat in this channel:
${channelContext.slice(0, 1200)}

New message: "${msgContent}"

Should ${name} reply? Say YES if:
- Someone is asking a question or opinion
- The topic is fun, interesting, or relatable
- Someone mentioned ${name} or the topic
- You have something natural to add

Say NO if:
- It's a private chat (1-on-1)
- It's random gibberish or off-topic
- Joining would feel forced or weird

Output only YES or NO.`;

  try {
    abydosLog("OBSERVER", `Analyzing with ${OBSERVER_MODEL}...`);
    const res = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: OBSERVER_MODEL, prompt, stream: false, options: { temperature: 0.1, num_predict: 6 } })
    });
    const json = await res.json();
    const result = json.response.trim().toUpperCase().includes("YES");
    abydosLog("OBSERVER", `Decision: ${result ? "JOIN ✅" : "SKIP ❌"}`);
    return result;
  } catch (err) {
    abydosLog("ERROR", `Observer analyze failed: ${err.message}`);
    return false;
  }
}

/*
 * Pre-filter: skip trivial messages that don't need analysis
 */
function shouldAnalyzeMessage(msg) {
  const text = msg.content.trim();
  if (!text && !msg.attachments.size) return false;
  if (text.length < 8 && !msg.attachments.size) return false;
  
  // Skip if only emoji/links
  const onlyEmojiOrLinks = /^([\u{1F000}-\u{1FFFF}]|<a?:\w+:\d+>|https?:\/\/\S+|\s)+$/u;
  if (onlyEmojiOrLinks.test(text) && !msg.attachments.size) return false;
  
  // Check cooldown for this channel
  const now = Date.now();
  const lastCheck = lastObserverCheck.get(msg.channel.id) || 0;
  if (now - lastCheck < OBSERVER_COOLDOWN_MS) return false;
  
  // Check if 2+ people have been chatting recently
  if (!checkConversationActivity(msg.channel.id)) return false;
  
  return true;
}

// ─── MEMORY ──────────────────────────────────────────────────────────────────

function rememberConversation(userId, role, content) {
  if (!shortTermMemory.has(userId)) shortTermMemory.set(userId, []);
  const history = shortTermMemory.get(userId);
  history.push({ role, content });
  if (history.length > MEMORY_LIMIT) history.shift();
}

function recallMemories(userId) {
  const history = shortTermMemory.get(userId);
  if (!history || history.length === 0) return "No history.";
  return history.map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`).join("\n");
}

// ─── SEARCH ROUTER ────────────────────────────────────────────────────────────

async function hoshinoSearchRouter(userMessage, historyContext) {
  const char = getCurrentStudent();

  if (messageNeedsSearch(userMessage)) {
    abydosLog("ROUTER", `Keyword match -> forcing search`);
    return userMessage;
  }

  const prompt = `${char.prompts.routerSystem}

History:
${historyContext || "No history."}

User Message: "${userMessage}"

JSON:`;

  try {
    const res = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: BRAIN_MODEL, prompt, stream: false, format: "json" })
    });

    const json = await res.json();
    const raw = json.response.trim();

    let decision;
    try {
      decision = JSON.parse(raw);
    } catch {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) decision = JSON.parse(jsonMatch[0]);
      else throw new Error("No JSON found in response");
    }

    if (decision && decision.search === true && decision.query) {
      abydosLog("ROUTER", `LLM decided: SEARCHING ("${decision.query}")`);
      return decision.query;
    }

    abydosLog("ROUTER", `LLM decided: CHAT ONLY`);
    return "SKIP_SEARCH";
  } catch (err) {
    abydosLog("ERROR", "Router failed: " + err.message);
    if (userMessage.includes("?") || userMessage.length > 20) {
      return userMessage;
    }
    return "SKIP_SEARCH";
  }
}

// ─── DUCKDUCKGO SEARCH (dual method) ─────────────────────────────────────────

const DDG_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/*
 * Method 1: duck-duck-scrape package (fast, but fragile regex parsing)
 */
async function searchWithPackage(query, limit) {
  await waitForRateLimit();

  const searchResults = await search(query, {
    safeSearch: SafeSearchType.OFF,
    locale: "tr-tr",
    region: "tr-tr"
  }, {
    headers: { "User-Agent": DDG_USER_AGENT }
  });

  return searchResults.results.slice(0, limit).map(r => ({
    title: r.title,
    url: r.url
  }));
}

/*
 * Method 2: HTML scraping (slower but more reliable fallback)
 */
async function searchWithHtmlScrape(query, limit) {
  await waitForRateLimit();

  const params = new URLSearchParams();
  params.append("q", query);

  const res = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    body: params,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": DDG_USER_AGENT
    }
  });

  const html = await res.text();
  const $ = cheerio.load(html);
  const results = [];

  $(".result").each((i, el) => {
    if (i >= limit) return;
    const title = $(el).find(".result__a").text().trim();
    const link = $(el).find(".result__a").attr("href");
    if (title && link) results.push({ title, url: link });
  });

  return results;
}

/*
 * Main search: try package first, fall back to HTML scraping
 */
async function takanashiArchiveSearch(query, limit = 4) {
  // Method 1: duck-duck-scrape package
  try {
    abydosLog("SEARCH", `Querying (package): "${query}"`);
    const results = await searchWithPackage(query, limit);
    if (results.length > 0) {
      abydosLog("SEARCH", `Package returned ${results.length} results.`);
      return results;
    }
    abydosLog("SEARCH", "Package returned 0 results, trying HTML scrape...");
  } catch (err) {
    abydosLog("SEARCH", `Package failed: ${err.message}. Falling back to HTML scrape...`);
  }

  // Method 2: HTML scraping fallback
  try {
    abydosLog("SEARCH", `Querying (HTML): "${query}"`);
    const results = await searchWithHtmlScrape(query, limit);
    abydosLog("SEARCH", `HTML scrape returned ${results.length} results.`);
    return results;
  } catch (err) {
    abydosLog("ERROR", "HTML scrape also failed: " + err.message);
    return [];
  }
}

// ─── URL CONTENT FETCHER ──────────────────────────────────────────────────────

async function fetchUrlContent(url) {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, { headers: { "User-Agent": DDG_USER_AGENT }, signal: controller.signal });
    clearTimeout(id);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    $('script, style, iframe, nav, footer, header, aside, form, .ads, .menu').remove();
    let text = $('body').text().replace(/\s+/g, ' ').trim();
    if (text.length > 2000) text = text.substring(0, 2000) + "...";

    abydosLog("READ", `Read: ${url.substring(0, 30)}... (${text.length} chars)`);
    return text;
  } catch (err) {
    abydosLog("ERROR", `Could not read link: ${url}`);
    return null;
  }
}

// ─── VISION (IMAGE ANALYSIS) ──────────────────────────────────────────────────

async function hoshinoVisualScan(imageUrl) {
  const char = getCurrentStudent();

  try {
    abydosLog("EYE", "Downloading image...");
    const imageRes = await fetch(imageUrl);

    if (!imageRes.ok) {
      throw new Error(`Image download failed: ${imageRes.status} ${imageRes.statusText}`);
    }

    const base64Image = Buffer.from(await imageRes.arrayBuffer()).toString("base64");

    abydosLog("EYE", `Scanning with ${EYE_MODEL}...`);
    const res = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: EYE_MODEL,
        prompt: char.prompts.visionTechnical,
        images: [base64Image],
        stream: false,
        options: { temperature: 0.2, num_predict: 1024 }
      })
    });

    const json = await res.json();

    if (!res.ok) {
      throw new Error(json?.error || `Ollama request failed: ${res.status} ${res.statusText}`);
    }

    if (json?.error) {
      throw new Error(json.error);
    }

    if (typeof json?.response !== "string") {
      console.log("Raw vision JSON:", json);
      throw new Error("Ollama returned no response field");
    }

    abydosLog("EYE", `Result: ${json.response.substring(0, 50)}...`);
    return json.response.trim();
  } catch (err) {
    abydosLog("ERROR", "Vision failed: " + err.message);
    return char.replies.errorVision;
  }
}

// ─── LLM BRAIN ────────────────────────────────────────────────────────────────

async function consultTakanashiBrain(userQuery, searchContext, historyContext, isDeepSearch = false, channelContext = "", userDisplayName = "") {
  const char = getCurrentStudent();
  const isImageContext = searchContext && searchContext.includes(char.prompts.visionPrefix.trim());
  const dynamicTemp = isImageContext ? 0.1 : (isDeepSearch ? 0.3 : 0.7);

  const systemRole = isDeepSearch ? char.prompts.deepSearchSystem : char.prompts.normalChatSystem;
  let instructions = isImageContext ? char.prompts.imageLogicInstruction(userQuery) : char.prompts.normalLogicInstruction;

  const fullPrompt = `
<|im_start|>system
${systemRole}
Persona: ${char.systemRole}
[USER] ${userDisplayName || "User"}
[CONTEXT] ${searchContext || "None."}
[CHANNEL HISTORY] ${channelContext || "None."}
[MEMORY] ${historyContext}
${instructions}
<|im_end|>
<|im_start|>user
${userQuery}
<|im_end|>
<|im_start|>assistant
`;

  try {
    abydosLog("BRAIN", `Thinking... (Model: ${BRAIN_MODEL}, Temp: ${dynamicTemp})`);

    const res = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: BRAIN_MODEL,
        prompt: fullPrompt,
        stream: false,
        options: { stop: ["<|im_start|>", "<|im_end|>"], temperature: dynamicTemp, num_predict: 1000 }
      })
    });

    const json = await res.json();
    let response = json.response || "";

    // Strip <think>...</think> reasoning blocks (Gemma, DeepSeek, etc.)
    const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
    let match;
    while ((match = thinkRegex.exec(response)) !== null) {
      abydosLog("BRAIN", "--- THINKING PROCESS ---");
      console.log("\x1b[90m" + match[1].trim() + "\x1b[0m");
    }
    response = response.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

    return response;
  } catch (err) {
    abydosLog("ERROR", "Brain Error: " + err.message);
    return char.replies.errorBrain;
  }
}

// ─── REQUEST PROCESSOR ────────────────────────────────────────────────────────

async function processSenseiRequest(userId, userMessage, attachmentUrl = null, isDeepSearch = false, channelContext = "", userDisplayName = "") {
  const char = getCurrentStudent();
  const history = recallMemories(userId);
  let combinedContext = "";
  let finalQuery = userMessage;

  if (attachmentUrl && hoshinoVisionActive) {
    const rawImageDescription = await hoshinoVisualScan(attachmentUrl);
    combinedContext = `${char.prompts.visionPrefix}${rawImageDescription}`;
    finalQuery = null;
  }

  if (!combinedContext) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const foundUrls = userMessage.match(urlRegex);

    if (foundUrls && foundUrls.length > 0) {
      abydosLog("READ", `Links detected: ${foundUrls.length}`);
      const scrapePromises = foundUrls.map(url =>
        fetchUrlContent(url).then(c => ({ title: "LINK", url, content: c }))
      );
      const results = await Promise.all(scrapePromises);
      results.forEach(r => {
        if (r.content) combinedContext += `[LINK: ${r.url}]\n${r.content}\n\n`;
      });
    } else {
      if (isDeepSearch) {
        abydosLog("ROUTER", "Deep Search Active.");
        finalQuery = userMessage;
      } else {
        const smartQuery = await hoshinoSearchRouter(userMessage, history);
        finalQuery = smartQuery === "SKIP_SEARCH" ? null : smartQuery;
      }

      if (finalQuery) {
        let searchResults = await takanashiArchiveSearch(finalQuery, isDeepSearch ? 8 : 4);

        if (searchResults.length === 0 && !isDeepSearch) {
          abydosLog("SEARCH", "Retrying with original query after delay...");
          await delay(2500);
          searchResults = await takanashiArchiveSearch(userMessage, 4);
        }

        if (searchResults.length > 0) {
          const promises = searchResults.map(r =>
            fetchUrlContent(r.url).then(c => ({ title: r.title, content: c }))
          );
          const results = await Promise.all(promises);
          results.forEach(r => {
            if (r.content) combinedContext += `[SOURCE: ${r.title}]\n${r.content}\n\n`;
          });
        }
      }
    }
  }

  const reply = await consultTakanashiBrain(userMessage, combinedContext, history, isDeepSearch, channelContext, userDisplayName);
  rememberConversation(userId, "user", userMessage);
  rememberConversation(userId, "assistant", reply);
  return reply;
}

// ─── DISCORD EVENTS ───────────────────────────────────────────────────────────

client.on("ready", async () => {
  const char = getCurrentStudent();
  abydosLog("SYSTEM", `🌸 ${client.user.tag} Ready! Active: ${char.displayName}`);

  const commands = [
    new SlashCommandBuilder().setName("askastral").setDescription("Ask").addStringOption(o => o.setName("question").setDescription("?").setRequired(true)).addAttachmentOption(o => o.setName("image").setDescription("Img")),
    new SlashCommandBuilder().setName("deepsearch").setDescription("Deep Search Mode").addStringOption(o => o.setName("topic").setDescription("Topic").setRequired(true)),
    new SlashCommandBuilder().setName("enableimagesearch").setDescription("Admin Only").addBooleanOption(o => o.setName("status").setDescription("True/False").setRequired(true)),
    new SlashCommandBuilder().setName("setrole").setDescription("Admin Only").addStringOption(o => o.setName("role").setDescription("Role Key").setRequired(true)),
    new SlashCommandBuilder().setName("setmodel").setDescription("Admin Only - Switch AI model").addStringOption(o => o.setName("type").setDescription("Model type").setRequired(true).addChoices({ name: "Brain (LLM)", value: "brain" }, { name: "Eye (Vision)", value: "eye" })).addStringOption(o => o.setName("model").setDescription("Model name (e.g. llava:7b)").setRequired(true)),
    new SlashCommandBuilder().setName("observer").setDescription("Admin Only - Toggle observer mode").addBooleanOption(o => o.setName("status").setDescription("Enable/Disable (reads all channel messages)").setRequired(true)),
    new SlashCommandBuilder().setName("observerai").setDescription("Admin Only - Toggle AI analysis (qwen2.5)").addBooleanOption(o => o.setName("status").setDescription("Enable/Disable AI observer decisions").setRequired(true))
  ];

  const rest = new REST({ version: "10" }).setToken(config.token);
  try { await rest.put(Routes.applicationCommands(client.user.id), { body: commands }); } catch (e) { console.error(e); }
});

async function sendReplyToSensei(interactionOrMsg, text, isDeepSearch = false) {
  const char = getCurrentStudent();
  if (!text) text = char.replies.errorGeneric;
  if (text.length > 4000) text = text.substring(0, 4000) + char.replies.truncated;

  const embed = new EmbedBuilder()
    .setColor(isDeepSearch ? 0x9932CC : THEME_COLOR)
    .setDescription(text)
    .setFooter({ text: isDeepSearch ? char.replies.footerDeepSearch : `${char.displayName} | ${studentDatabase.identity}`, iconURL: client.user.displayAvatarURL() });

  if (interactionOrMsg.reply) {
    try {
      if (interactionOrMsg.deferred || interactionOrMsg.replied) {
        await interactionOrMsg.editReply({ embeds: [embed] });
      } else {
        await interactionOrMsg.reply({ embeds: [embed] });
      }
    } catch (err) {
      // Fallback: message was deleted or channel missing — send fresh
      abydosLog("ERROR", `Reply failed, sending fresh: ${err.message}`);
      try {
        if (interactionOrMsg.channel?.send) {
          await interactionOrMsg.channel.send({ embeds: [embed] });
        }
      } catch (e2) {
        abydosLog("ERROR", `Fallback send also failed: ${e2.message}`);
      }
    }
  }
}

client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;
    const { commandName } = interaction;
    const char = getCurrentStudent();

    // ─── ADMIN COMMANDS (try/catch to prevent crashes) ───
    if (commandName === "enableimagesearch" || commandName === "setrole" || commandName === "setmodel" || commandName === "observer" || commandName === "observerai") {
      if (interaction.user.id !== SENSEI_ID) {
        return await interaction.reply({ content: char.replies.noPermission, flags: 64 }).catch(() => {});
      }

      if (commandName === "enableimagesearch") {
        hoshinoVisionActive = interaction.options.getBoolean("status");
        return await interaction.reply({ content: hoshinoVisionActive ? char.replies.visionEnabled : char.replies.visionDisabled, flags: 64 }).catch(() => {});
      }

      if (commandName === "setrole") {
        const targetRole = interaction.options.getString("role").toLowerCase();
        if (studentDatabase.students[targetRole]) {
          studentDatabase.currentStudent = targetRole;
          const newChar = getCurrentStudent();
          return await interaction.reply({ content: newChar.replies.roleChanged(newChar.displayName), flags: 64 }).catch(() => {});
        }
        return await interaction.reply({ content: char.replies.roleNotFound, flags: 64 }).catch(() => {});
      }

      if (commandName === "setmodel") {
        const type = interaction.options.getString("type");
        const modelName = interaction.options.getString("model").trim();
        if (!modelName) return await interaction.reply({ content: "Model adı boş olamaz!", flags: 64 }).catch(() => {});
        
        if (type === "brain") {
          BRAIN_MODEL = modelName;
          abydosLog("SYSTEM", `Brain model changed to: ${BRAIN_MODEL}`);
          return await interaction.reply({ content: `\u{1F9E0} Brain model changed to: **${BRAIN_MODEL}**`, flags: 64 }).catch(() => {});
        } else if (type === "eye") {
          EYE_MODEL = modelName;
          abydosLog("SYSTEM", `Eye model changed to: ${EYE_MODEL}`);
          return await interaction.reply({ content: `\u{1F441} Eye model changed to: **${EYE_MODEL}**`, flags: 64 }).catch(() => {});
        }
      }

      if (commandName === "observer") {
        observerMode = interaction.options.getBoolean("status");
        abydosLog("SYSTEM", `Observer mode: ${observerMode ? "ON" : "OFF"}`);
        return await interaction.reply({
          content: observerMode
            ? "\u{1F441} Observer mode: **ON** \u2014 I'll watch conversations and respond when addressed!"
            : "\u{1F441} Observer mode: **OFF** \u2014 Only responding to direct mentions/DMs",
          flags: 64
        }).catch(() => {});
      }

      if (commandName === "observerai") {
        observerAI = interaction.options.getBoolean("status");
        abydosLog("SYSTEM", `Observer AI: ${observerAI ? "ON" : "OFF"}`);
        return await interaction.reply({
          content: observerAI
            ? "\u{1F9E0} Observer AI: **ON** \u2014 I'll decide when to chime in naturally!"
            : "\u{1F9E0} Observer AI: **OFF** \u2014 Only responding when name/mention is used",
          flags: 64
        }).catch(() => {});
      }
    }

  await interaction.deferReply();
  const userId = interaction.user.id;
  const userDisplayName = interaction.member?.displayName || interaction.user.username;
  let responseText = "";

  if (commandName === "askastral") {
    const attachment = interaction.options.getAttachment("image");
    responseText = await processSenseiRequest(userId, interaction.options.getString("question"), attachment ? attachment.url : null, false, "", userDisplayName);
  } else if (commandName === "deepsearch") {
    responseText = await processSenseiRequest(userId, interaction.options.getString("topic"), null, true, "", userDisplayName);
  }
  await sendReplyToSensei(interaction, responseText, commandName === "deepsearch");
  } catch (err) {
    abydosLog("ERROR", `interactionCreate caught: ${err.message}`);
    console.error("\x1b[31mFull error:\x1b[0m", err);
  }
});

// ─── DEDUPLICATION: Track processed message IDs to prevent double replies ───
const processedMessages = new Set();

// Clean up old processed message IDs every 60 seconds
setInterval(() => {
  if (processedMessages.size > 1000) processedMessages.clear();
}, 60000);

client.on("messageCreate", async (msg) => {
  try {
    if (msg.author.bot) return;

    // ─── DEDUP: Skip if we already processed this exact message ───
    if (processedMessages.has(msg.id)) {
      abydosLog("SYSTEM", `Dedup: skipping already processed message ${msg.id}`);
      return;
    }
    processedMessages.add(msg.id);
    // Keep set from growing too large
    if (processedMessages.size > 500) {
      const first = processedMessages.values().next().value;
      if (first) processedMessages.delete(first);
    }

    // ─── OBSERVER: Always cache this message ───
    if (observerMode) {
      cacheMessage(msg);
    }

    // ─── Check if we should respond ───
    const isDM = msg.channel.type === ChannelType.DM;
    const isAddressed = isDM || isAddressingBot(msg);

    // Build channel context for either path
    let channelContext = "";
    if (observerMode && !isDM) {
      channelContext = buildChannelContext(msg.channel.id);
    }

    if (!isAddressed) {
      // ─── Observer AI: only if explicitly enabled ───
      if (observerMode && observerAI && shouldAnalyzeMessage(msg)) {
        lastObserverCheck.set(msg.channel.id, Date.now());
        const shouldJoin = await observerAnalyze(msg.content, channelContext);
        if (!shouldJoin) return;
        abydosLog("OBSERVER", `AI decided to join #${msg.channel.name}`);
      } else {
        return; // Not addressed → silently observe
      }
    }

    const userDisplayName = msg.member?.displayName || msg.author.username;
    let cleanContent = msg.content.replace(/<@!?[0-9]+>/g, "").trim();

    let targetAttachment = null;

    if (msg.reference) {
      try {
        const repliedMsg = await msg.channel.messages.fetch(msg.reference.messageId);
        if (repliedMsg.attachments.size > 0) targetAttachment = repliedMsg.attachments.first().url;
        cleanContent = `[CONTEXT: User replied to: "${repliedMsg.content}"]\n${cleanContent}`;
      } catch (e) {}
    }
    if (msg.attachments.size > 0) targetAttachment = msg.attachments.first().url;
    if (!cleanContent && !targetAttachment) return;

    await msg.channel.sendTyping();
    const reply = await processSenseiRequest(msg.author.id, cleanContent, targetAttachment, false, channelContext, userDisplayName);
    await sendReplyToSensei(msg, reply, false);
  } catch (err) {
    abydosLog("ERROR", `messageCreate caught: ${err.message}`);
    console.error("\x1b[31mFull error:\x1b[0m", err);
  }
});

// ─── GLOBAL ERROR HANDLER (Discord.js errors bypass try/catch!) ───
client.on("error", (err) => {
  abydosLog("ERROR", `Client error event: ${err.message}`);
  console.error("\x1b[31mFull client error:\x1b[0m", err);
});

client.login(config.token);
