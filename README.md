# Discord AI Bot
> A special Discord AI Bot with Ollama support  
> Build your own Discord AI Bot with Ollama without wasting time on coding or setup.

This bot uses Ollama to process prompts locally and respond with full privacy.  
It is not just a simple chatbot — it offers advanced features for communication, search, and roleplay.

---

## 1. Advanced Chat Bot
- When using the **DeepSeek Model**, the bot filters unnecessary thinking and gives direct answers.  
- **Deep Search Module**: Searches the internet deeply to provide accurate information.

---

## 2. Context Awareness and Summarizing
- If the bot reaches its Discord limit, it will flag automatically.  
- Long messages (e.g., 600+ words) can be summarized. Just reply and ask the bot to summarize.

---

## 3. Image Analyzing
- Uses **LLaVA 1.6** to analyze images.  
- Reads text inside images.  
- Identifies objects, buildings, and more, then gives an honest review.

---

## 4. Web Search
- The bot decides if your input is a chat or a question.  
- For questions like *“Is RTX 5090 out?”* or *“How much is Bitcoin in USD?”*, it provides updated information.  
- Uses **DuckDuckGo** for search.  
- Reads the first 4 websites and combines results for accuracy.

---

## 5. Dynamic Persona System (Roleplay)
- Change the bot’s persona with one command.  
- Example personas:  
  - **Shiroko** (Blue Archive): Responds with “Nn.” Acts cool, roleplays as a skilled robber.  
  - **Astral AI**: Default persona, serious and tactical assistant.  
- You can also create your own persona in `index.js`.

---

## 6. Smart Filter
- Removes generic AI phrases like *“I am an AI”* or *“How can I help you”*.  
- Keeps the bot always in character without breaking roleplay.

---

## Setup Guide

### Requirements
- **Ollama** installed  
- Node.js v18 or higher  
- A decent GPU  

### Installation
```bash
git clone https://github.com/ilyaxuwu/discord-ai-bot.git
cd discord-ai-bot
npm install
```

### Configuration

Open config.json and paste your token:

```json
{
  "token": "TOKEN_HERE"
}
```

Edit index.js to set your models and IDs.

Run the Bot

```bash
node index.js
ollama serve
```

### Notes:

- This bot is designed for privacy and flexibility.

- You can expand features by editing the source code.

- Personas and modules are customizable for your own use case.