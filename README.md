# 🌌 AI Discord Bot
> A powerful, private, and customizable Discord AI Bot with Ollama support.

Build your own AI companion without wasting time on complex coding. This bot uses **Ollama** to process everything locally, ensuring your data stays private and secure.

---

## ✨ Features

### 1. Advanced Chat Experience
- **Reasoning Support:** When using the **DeepSeek-R1** model, the bot filters internal "thinking" processes to provide clean, direct answers.
- **Deep Search:** A dedicated module that searches the internet thoroughly to find the most accurate information.

### 2. Context Awareness & Summarizing
- **Auto-Flagging:** If a response hits Discord's character limit, the bot handles it gracefully.
- **Smart Summary:** You can summarize long messages (600+ words). Simply **Reply** to a long message, tag the bot, and ask it to summarize.

### 3. Image Analysis (Vision)
- **Powered by LLaVA 1.6:** The bot can "see" your images.
- **OCR:** It reads text inside images perfectly.
- **Object Recognition:** Identifies buildings, objects, and people to provide honest reviews or descriptions.

### 4. Web Search Capabilities
- **Smart Routing:** The bot automatically decides if you are just chatting or asking a factual question.
- **Live Data:** Ask about things like *"Is the RTX 5090 out?"* or *"Bitcoin price in USD"*.
- **DuckDuckGo Integration:** It reads the top 4 search results and combines them for the best answer.

### 5. Dynamic Persona System (Roleplay)
- **Switch Personas:** Change the bot's personality instantly with a command.
- **Pre-set Roles:** Includes **Shiroko** (cool/stoic student) and **Astral AI** (tactical assistant).
- **Fully Customizable:** Easily add your own characters in the code.

---

## 🛠️ How to Use & Setup

### Choosing Your Model
When using Ollama, choosing the right model depends on your hardware. 
- If you have a powerful GPU with plenty of VRAM, you can use larger models for faster and more intelligent responses.
- If you are unsure which model is best for your PC, ask an AI for advice on coding performance or general conversation models.

### Initial Configuration
Before starting your bot, check **index.js from line 11 to 15**. You will see these settings:

```javascript
const BRAIN_MODEL = "deepseek-r1:8b"; // The AI model name you installed via Ollama.
const EYE_MODEL = "llava:v1.6"; // The Vision model used for reading images.
const THEME_COLOR = 0xFF69B4; // The color of the Embed messages (Ask AI for Hex codes).
const MEMORY_LIMIT = 10; // Number of previous messages the bot remembers for context.
const SENSEI_ID = "1115700478005743758"; // Your Discord ID to access Admin commands.
```

> Note for beginners: The text after // are comments explaining what each value does.

---

# 🎭 Creating Your Own Persona

You can create a custom personality at **line 35 of index.js**. Here is how the database looks:

```js
let studentDatabase = {
  identity: "Astral AI", // Name of your bot
  creator: "ilyax", // Your name
  currentStudent: "astral", // Default role. Change to "hoshino" to start as Hoshino.

  students: {
    "shiroko": { // Example Roleplay Character
      displayName: "Sunaookami Shiroko",
      systemRole: "You are Sunaookami Shiroko. You are stoic and calm. Use verbal tic 'Nn'. Call user 'Sensei'.",
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
    "astral": { // Default Assistant
      displayName: "Astral AI", 
      systemRole: "You are a helpful assistant.", 
      replies: {
        noPermission: "Access denied.", 
        visionEnabled: "✅ Vision: **ON**.", 
        visionDisabled: "✅ Vision: **OFF**.", 
        roleChanged: (name) => `Role: **${name}**.`, 
        roleNotFound: "Unknown role.", 
        errorGeneric: "Error.", 
        errorBrain: "Processing error.", 
        errorVision: "Vision error.", 
        truncated: "...", 
        footerDeepSearch: "Astral AI | Deep Search." 
      },
      prompts: {
        routerSystem: `Role: SEO. Output JSON.`, 
        visionTechnical: "Analyze image details.", 
        visionPrefix: "[VISUAL DATA]: ", 
        deepSearchSystem: "Detailed analysis.", 
        normalChatSystem: "Chat normally.", 
        imageLogicInstruction: (q) => `Describe image from [CONTEXT]. Query: "${q}"`, 
        normalLogicInstruction: "Use [CONTEXT] to answer." 
      }
    }
  }
};
```
Understanding the values to create your own persona for the discord bot: 

```json
    "astral": { // THE NAME OF THE VALUE. (This will be used as currentStudent at the top of the studentDatabase variable and will be set using the /setrole command.)
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
```

### How to add a new Persona
If you understand basic JSON, you can copy the astral block, paste it below, and change the values (names, roles, and replies). If you are not sure how to do this, you can ask an AI to generate a new character block for you!

---

# ⌨️ Bot Commands

### User Commands
- `/askastral` -> Ask any question. You can also upload an image to get an analysis.
Example: /askastral question: What is the story of Blue Archive?
- `/deepsearch` -> The bot performs a deep web search for better results.
Example: /deepsearch topic: What is Quantum Physics?

### Admin Commands (Requires SENSEI_ID)
- `/enableimagesearch` -> Enable or disable the image processing system (useful for saving GPU power).
- `/setrole` -> Change the bot's current personality.
Example: /setrole role:shiroko (The bot will now act like Shiroko).

---

## 📡 Passive Usage (No Commands Needed)

### Mentions (@Bot)
You can simply tag the bot in any channel to ask a question.
- If you attach an image and tag the bot, it will automatically describe the image.
- If you share a link, the bot will visit the website, read the content, and answer based on that link.

### Replies
If you **Reply** to the bot's message or someone else's message while tagging the bot, it will read the "replied-to" message as context. This is perfect for summarizing long texts or translating previous messages.

---

## 🚀 Installation
1. Install **Ollama** and download your models (`ollama run deepseek-r1:8b`, etc.).
2. Install **Node.js v18+**.
3. Clone this repo:
```bash 
git clone https://github.com/ilyaxuwu/discord-ai-bot.git
```
and run
```bash
npm install
```
4. Add your bot token to `config.json`.
5. Run the bot using `node index.js`.

*If you don't have coding knowledge, feel free to ask an AI to help you fix any setup issues!*
