# 🌸 AI Discord Bot

An Ollama-powered, fully customizable Discord AI bot. Everything runs locally, keeping your data private.

---

## ✨ Features

- **🧠 LLM Chat** — Responds using Ollama models such as Gemma, DeepSeek, Llava, and more
- **👁 Image Analysis** — Reads and describes images (EYE_MODEL)
- **🔍 Web Search** — Retrieves live information through DuckDuckGo
- **🎭 Roleplay System** — Switch between characters like Hoshino, Shiroko, Astral, and more
- **👀 Observer System** — Monitors channel messages and joins conversations when mentioned or when AI decides to participate
- **🧠 Think Filtering** — Automatically removes `<think>...</think>` reasoning tags (Gemma reasoning support)
- **📎 Link Reader** — Visits shared URLs and analyzes their content

---

## 🚀 Installation

```bash
# 1. Install Ollama and download the model (other models you'd want to install)
ollama pull 4skl/gemma4-e4b-mtp:latest

# 2. Clone the repository
git clone https://github.com/ilyaxuwu/discord-ai-bot
cd discord-ai-bot

# 3. Install dependencies
npm install

# 4. Edit config.json
#    - token: Your Discord bot token
#    - sensei_id: Your Discord ID (for admin commands)
#    - Optionally change models and characters

# 5. Start the bot
npm start
# or: node index.js
```

---

## ⚙️ config.json Structure

All settings are managed through `config.json`:

```json
{
  "token": "DISCORD_BOT_TOKEN",

  "brain_model": "4skl/gemma4-e4b-mtp:latest", (Or Any model you'd want to change)
  "eye_model": "4skl/gemma4-e4b-mtp:latest", (Or Any model you'd want to change)
  "observer_model": "qwen2.5:0.5b", (Or Any model you'd want to change)
  "theme_color": 0xFF69B4,
  "memory_limit": 10, (Change this if you want your bot to remind anything!)
  "sensei_id": "YOUR_DISCORD_ID", 
  "default_student": "hoshino",
  "observer_mode": true,
  "observer_ai": false,

  "students": {
    "hoshino": {
      "displayName": "Takanashi Hoshino",
      "systemRole": "Character system prompt — personality, speaking style, rules...",
      "replies": {
        "noPermission": "No permission message",
        "visionEnabled": "Image analysis enabled message",
        "visionDisabled": "Image analysis disabled message",
        "roleChanged": "Role changed: **{name}**",
        "roleNotFound": "Role not found message",
        "errorGeneric": "Generic error message",
        "errorBrain": "Brain model error message",
        "errorVision": "Vision model error message",
        "truncated": "Truncated response message",
        "footerDeepSearch": "Deep search footer"
      }
    }
  }
}
```

### Field Descriptions

| Field | Description |
|------|-------------|
| `brain_model` | Ollama model used for chat and text generation |
| `eye_model` | Ollama model used for image analysis |
| `observer_model` | Small, fast model used for Observer AI decisions (0.5B recommended) |
| `theme_color` | Embed message color (hex) |
| `memory_limit` | Number of recent messages the bot remembers |
| `sensei_id` | Discord ID allowed to use admin commands |
| `default_student` | Character loaded when the bot starts |
| `observer_mode` | `true` = monitors channel messages, `false` = responds only to mentions/DMs |
| `observer_ai` | `true` = allows a lightweight model to decide whether to join conversations |
| `students` | List of all characters, including `displayName`, `systemRole`, and `replies` |

---

## 🎭 Character (Roleplay) System

Characters are managed directly through the `students` section in `config.json`.

### Using `{name}` in `replies`

If you use `{name}` inside the `roleChanged` message, the bot automatically replaces it with the character's display name.

```json
"roleChanged": "I'm now speaking as **{name}**! 🥰"
```

### Adding a New Character

```json
"students": {
  "character-name": {
    "displayName": "Character Name",
    "systemRole": "Character personality, speaking style...",
    "replies": { ... }
  }
}
```

When adding a new character, you may also need to add its prompt configuration in the code. By default, the bot falls back to the "astral" prompts.

---

## ⌨️ Commands

### User Commands

- `/askastral question: <question> [image: <image>]` — Ask a question with an optional image
- `/deepsearch topic: <topic>` — Perform an in-depth web search

### Admin Commands (Requires `sensei_id`)

- `/enableimagesearch status: true/false` — Enable or disable image analysis
- `/setrole role: <character-name>` — Switch the active character
- `/setmodel type: brain/eye model: <model-name>` — Change models at runtime
- `/observer status: true/false` — Enable or disable Observer Mode
- `/observerai status: true/false` — Enable or disable AI-powered Observer decisions

---

## 🧠 Think Filtering

Some models such as Gemma and DeepSeek generate reasoning inside `<think>...</think>` tags. The bot automatically removes these tags before sending the response, while the reasoning remains visible in the terminal logs in gray.

---

## 🔍 Observer System

The bot supports two operating modes:

1. **Observer Mode** (`/observer true`) — Reads and caches channel messages. Responds when mentioned or when its name appears.
2. **Observer AI** (`/observerai true`) — Extends Observer Mode by allowing a lightweight model (`qwen2.5:0.5b`) to decide whether to join a conversation. If two or more users are actively chatting within 30 seconds and the discussion is relevant, the bot may participate.

---

## 📁 Project Structure

```text
├── config.json      # All configuration (token, models, characters)
├── index.js         # Main bot source code
├── package.json     # Dependencies
└── README.md        # This file
```

---

## 🛠 Requirements

- Node.js v18+
- Ollama (running locally)
- Ollama models: `brain_model` and `eye_model` (can be the same model)
- Optional for Observer AI: `qwen2.5:0.5b`

Since the code I wrote was very complex, I used AI to improve readability and add comments.
