import { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, Partials, ChannelType } from "discord.js";
import fetch from "node-fetch";
import { createRequire } from "module";
import * as cheerio from "cheerio";

const require = createRequire(import.meta.url);
const config = require("./config.json");

// If you are thinking these variables, function, json and other names are weird, Its like I've decided to write everything based off Blue Archive. But don't worry it wont break your discord bot. 

const BRAIN_MODEL = "AstralAI"; // Your model where you install a AI model from Ollama.
const EYE_MODEL = "llava:v1.6"; // Your Eye model stands the reading image. 
const THEME_COLOR = 0xFF69B4; // Color of the theme for your bot. (Ask AI if you don't know how to change the color)
const MEMORY_LIMIT = 10; // The memory of the chat. It saves previously 10 prompts you're writted (if you didn't edit anything).
const SENSEI_ID = "1115700478005743758"; // Your discord ID to manage the role of the discord bot enabling something etc.

let hoshinoVisionActive = true; // Keep this true if you want your bot to analyze your image (able to change with slash commands.)
const shortTermMemory = new Map();

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

let studentDatabase = {
  identity: "Astral AI", // Your Discord bot name
  creator: "ilyax", // The creator of the discord bot
  currentStudent: "astral", // The current roleplaying any character. It is "astral" so we can say its default. if you rewrite as "shiroko" it will roleplay as Sunaookami Shiroko. use AI if you don't know coding and create a new character for yourself.  

  students: {
    "shiroko": { // THIS IS EXAMPLE OF THE ROLEPLAYING CHARACTER
      displayName: "Sunaookami Shiroko",
      systemRole: "You are Sunaookami Shiroko. You are stoic, calm. Use verbal tic 'Nn'. Call user 'Sensei'.",
      replies: {
        noPermission: "Nn. Not authorized, Sensei.",
        visionEnabled: "✅ Tactical Vision: **ONLINE**.",
        visionDisabled: "✅ Tactical Vision: **OFFLINE**.",
        roleChanged: (name) => `Nn. Switched to: **${name}**.`,
        roleNotFound: "Nn? Unknown target.",
        errorGeneric: "Nn... Mission failed.",
        errorBrain: "Overloaded...",
        errorVision: "Visual interference detected.",
        truncated: "\n\n... (Cut off)",
        footerDeepSearch: "Shiroko | Tactical Analysis"
      },
      prompts: {
        routerSystem: `Role: SEO. Output JSON only.`,
        visionTechnical: "Analyze image for tactical info. Read text.", 
        visionPrefix: "[TACTICAL DATA]: ",
        deepSearchSystem: "Tactical analysis mode.",
        normalChatSystem: "Answer calmly. Use 'Nn'.",
        imageLogicInstruction: (q) => `User sent image. Describe based on [CONTEXT]. Query: "${q}"`,
        normalLogicInstruction: "Answer calmly using [CONTEXT]."
      }
    },
    "astral": { // DEFAULT AKA NORMAL ASSISTANT. (Learn how to make yourself a role, use AI if you don't really unsure how to make it.)
      displayName: "Astral AI", // Display Name
      systemRole: "You are helpful assistant.", // Role of the bot.
      replies: {
        noPermission: "Access denied.", // If the person doesn't have the permission of do anything on the bot (checked on the SENSEI_ID), it won't do anything.
        visionEnabled: "✅ Vision: **ON**.", // Enables Image analzye
        visionDisabled: "✅ Vision: **OFF**.", // Disables Image analzye
        roleChanged: (name) => `Role: **${name}**.`, // If the owner of discord bot changes the role it will give information.
        roleNotFound: "Unknown role.", // If the role didn't found or maybe added.
        errorGeneric: "Error.", // If something happend unsure. return with this message.
        errorBrain: "Processing error.", // If the processing issue happens, return with this message. 
        errorVision: "Vision error.", // If the image processing issue happens, return with this message.
        truncated: "...", // If the discord bot has reached the character limit of messages, return with this message.  
        footerDeepSearch: "Astral AI | Deep Search." // If someone is using deepsearch module.
      },
      prompts: {
        routerSystem: `Role: SEO. Output JSON.`, // Don't do anything.
        visionTechnical: "Analyze image details.", // What to do if someone post images
        visionPrefix: "[VISUAL DATA]: ", // Prefix. No needed to touch if you don't required to do.
        deepSearchSystem: "Detailed analysis.", // Ask Ollama to detailed.
        normalChatSystem: "Chat normally.", // Ask Ollama to normally.
        imageLogicInstruction: (q) => `Describe image from [CONTEXT]. Query: "${q}"`, // No need to touch
        normalLogicInstruction: "Use [CONTEXT] to answer." // No need to touch.
      }
    }
  }
};

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel]
});

function getCurrentStudent() { return studentDatabase.students[studentDatabase.currentStudent]; }

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

async function hoshinoSearchRouter(userMessage, historyContext) {
  const char = getCurrentStudent();
  const prompt = `${char.prompts.routerSystem}\nHistory: ${historyContext}\nUser Message: "${userMessage}"`;

  try {
    const res = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: BRAIN_MODEL, prompt: prompt, stream: false, format: "json" })
    });
    
    const json = await res.json();
    let decision = JSON.parse(json.response);
    
    abydosLog("ROUTER", `Result: ${decision.search ? "SEARCHING (" + decision.query + ")" : "CHAT ONLY"} `);
    return decision.search ? decision.query : "SKIP_SEARCH";
  } catch (err) {
    abydosLog("ERROR", "Router failed: " + err.message);
    return userMessage.length > 5 ? userMessage : "SKIP_SEARCH";
  }
}

async function takanashiArchiveSearch(query, limit = 4) {
  try {
    abydosLog("SEARCH", `Querying: "${query}" (Limit: ${limit})`);
    
    const url = "https://html.duckduckgo.com/html/";
    const params = new URLSearchParams();
    params.append("q", query);
    
    const res = await fetch(url, {
      method: "POST",
      body: params,
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0" }
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

    abydosLog("SEARCH", `Found ${results.length} results.`);
    return results;
  } catch (err) {
    abydosLog("ERROR", "Search failed: " + err.message);
    return [];
  }
}

async function fetchUrlContent(url) {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 8000); 

    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: controller.signal });
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

async function hoshinoVisualScan(imageUrl) {
  const char = getCurrentStudent();
  try {
    abydosLog("EYE", "Downloading image...");
    const imageRes = await fetch(imageUrl);
    const base64Image = Buffer.from(await imageRes.arrayBuffer()).toString('base64');

    abydosLog("EYE", `Scanning with ${EYE_MODEL}...`);
    const res = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        model: EYE_MODEL, 
        prompt: char.prompts.visionTechnical,
        images: [base64Image],
        stream: false,
        options: { temperature: 0.0, num_predict: 300 }
      })
    });

    const json = await res.json();
    abydosLog("EYE", `Result: ${json.response.substring(0, 50)}...`);
    return json.response.trim();
  } catch (err) {
    abydosLog("ERROR", "Vision failed: " + err.message);
    return char.replies.errorVision;
  }
}

async function consultTakanashiBrain(userQuery, searchContext, historyContext, isDeepSearch = false) {
  const char = getCurrentStudent();
  const isImageContext = searchContext && searchContext.includes(char.prompts.visionPrefix.trim());
  const dynamicTemp = isImageContext ? 0.1 : (isDeepSearch ? 0.3 : 0.7);
  
  const systemRole = isDeepSearch ? char.prompts.deepSearchSystem : char.prompts.normalChatSystem;
  let instructions = isImageContext ? char.prompts.imageLogicInstruction(userQuery) : char.prompts.normalLogicInstruction;

  const fullPrompt = `
<|im_start|>system
${systemRole}
Persona: ${char.systemRole}
[CONTEXT] ${searchContext || "None."}
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
    let response = json.response;

    // Filter out <think> tags if DeepSeek exposes them
    if (response.includes("<think>")) {
        const thought = response.match(/<think>([\s\S]*?)<\/think>/);
        if (thought) {
            abydosLog("BRAIN", "--- THOUGHT PROCESS ---");
            console.log("\x1b[90m" + thought[1].trim().substring(0, 300) + "...\x1b[0m"); 
            response = response.replace(/<think>[\s\S]*?<\/think>/, "").trim();
        }
    }

    return response;
  } catch (err) {
    abydosLog("ERROR", "Brain Error: " + err.message);
    return char.replies.errorBrain;
  }
}

async function processSenseiRequest(userId, userMessage, attachmentUrl = null, isDeepSearch = false) {
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
      abydosLog("READ", `Links detected: ${foundUrls.length}`); // Detect if someone sent you a link
      const scrapePromises = foundUrls.map(url => fetchUrlContent(url).then(c => ({ title: "LINK", url: url, content: c })));
      const results = await Promise.all(scrapePromises);
      results.forEach(r => { if (r.content) combinedContext += `[LINK: ${r.url}]\n${r.content}\n\n`; });
    } else {
      if (isDeepSearch) {
        abydosLog("ROUTER", "Deep Search Active.");
        finalQuery = userMessage; 
      } else {
        const smartQuery = await hoshinoSearchRouter(userMessage, history);
        if (smartQuery === "SKIP_SEARCH") finalQuery = null;
        else finalQuery = smartQuery;
      }

      if (finalQuery) {
        let searchResults = await takanashiArchiveSearch(finalQuery, isDeepSearch ? 8 : 4);
        if (searchResults.length === 0 && !isDeepSearch) searchResults = await takanashiArchiveSearch(userMessage, 4);

        const promises = searchResults.map(r => fetchUrlContent(r.url).then(c => ({ title: r.title, content: c })));
        const results = await Promise.all(promises);
        results.forEach(r => { if (r.content) combinedContext += `[SOURCE: ${r.title}]\n${r.content}\n\n`; });
      }
    }
  }

  let reply = await consultTakanashiBrain(userMessage, combinedContext, history, isDeepSearch);
  rememberConversation(userId, "user", userMessage);
  rememberConversation(userId, "assistant", reply);
  return reply;
}

client.on("ready", async () => {
  const char = getCurrentStudent();
  abydosLog("SYSTEM", `🌸 ${client.user.tag} Ready! Active: ${char.displayName}`);
  
  const commands = [ // Feel free to change command name and description if you want
    new SlashCommandBuilder().setName("askastral").setDescription("Ask").addStringOption(o => o.setName("question").setDescription("?").setRequired(true)).addAttachmentOption(o => o.setName("image").setDescription("Img")),
    new SlashCommandBuilder().setName("deepsearch").setDescription("Deep Search Mode").addStringOption(o => o.setName("topic").setDescription("Topic").setRequired(true)),
    new SlashCommandBuilder().setName("enableimagesearch").setDescription("Admin Only").addBooleanOption(o => o.setName("status").setDescription("True/False").setRequired(true)),
    new SlashCommandBuilder().setName("setrole").setDescription("Admin Only").addStringOption(o => o.setName("role").setDescription("Role Key").setRequired(true))
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
    if (interactionOrMsg.deferred || interactionOrMsg.replied) await interactionOrMsg.editReply({ embeds: [embed] });
    else await interactionOrMsg.reply({ embeds: [embed] });
  }
}

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;
  const char = getCurrentStudent();
  
  if (commandName === "enableimagesearch" || commandName === "setrole") {
    if (interaction.user.id !== SENSEI_ID) return interaction.reply({ content: char.replies.noPermission, ephemeral: true });
    
    if (commandName === "enableimagesearch") {
      hoshinoVisionActive = interaction.options.getBoolean("status");
      return interaction.reply({ content: hoshinoVisionActive ? char.replies.visionEnabled : char.replies.visionDisabled, ephemeral: true });
    }
    
    if (commandName === "setrole") {
      const targetRole = interaction.options.getString("role").toLowerCase();
      if (studentDatabase.students[targetRole]) {
        studentDatabase.currentStudent = targetRole;
        const newChar = getCurrentStudent();
        return interaction.reply({ content: newChar.replies.roleChanged(newChar.displayName), ephemeral: true });
      }
      return interaction.reply({ content: char.replies.roleNotFound, ephemeral: true });
    }
  }

  await interaction.deferReply(); 
  const userId = interaction.user.id;
  let responseText = "";
  
  if (commandName === "askastral") {
    const attachment = interaction.options.getAttachment("image");
    responseText = await processSenseiRequest(userId, interaction.options.getString("question"), attachment ? attachment.url : null, false);
  } else if (commandName === "deepsearch") {
    responseText = await processSenseiRequest(userId, interaction.options.getString("topic"), null, true);
  }
  await sendReplyToSensei(interaction, responseText, commandName === "deepsearch");
});

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  const isDM = msg.channel.type === ChannelType.DM;
  const isMentioned = msg.mentions.has(client.user.id);
  if (!isDM && !isMentioned) return;

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
  const reply = await processSenseiRequest(msg.author.id, cleanContent, targetAttachment, false);
  await sendReplyToSensei(msg, reply, false);
});

client.login(config.token); // Put your discord token on config.json
