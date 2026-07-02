# Guide Configuration n8n pour Console Telegram TAMS

Ce guide explique comment configurer votre workflow n8n existant pour agir comme console de commande TAMS.

## Architecture

```
Telegram Bot (BotFather)
        ↓
    n8n Workflow
        ↓
┌───────────────────────────────────────┐
│  Switch: Route par commande           │
├───────────────────────────────────────┤
│ /status   → GET /api/_diagnostics/production     │
│ /studio_test → GET /api/_diagnostics/studio-selftest │
│ /video    → POST /api/studio/generate-video       │
│ /audio    → POST /api/studio/generate-music       │
│ /image    → POST /api/studio/generate-image       │
│ /gpu      → GET /api/gpu/status                  │
└───────────────────────────────────────┘
        ↓
    Réponse Telegram + Log Google Sheets
```

## URL de base TAMS

```
https://workspaceapi-server-production-1334.up.railway.app
```

## Étape 1: Dupliquer le workflow existant

1. Ouvrir n8n
2. Aller sur le workflow existant Telegram → Google Sheets
3. Cliquer "Duplicate" dans le menu workflow
4. Renommer: "TAMS Console Telegram"

## Étape 2: Structure du workflow

### Noeuds requis:

1. **Telegram Trigger** (existant)
   - Déjà configuré avec votre bot

2. **Code Node** - Parser commande
   - Extrait la commande et le prompt du message

3. **Switch Node** - Router par commande
   - 6 branches: status, studio_test, video, audio, image, gpu

4. **HTTP Request Nodes** (6)
   - Un pour chaque endpoint TAMS

5. **Code Node** - Formater réponse
   - Prépare le message Telegram et les données Google Sheets

6. **Telegram Node** - Envoyer réponse
   - Reply avec le résultat

7. **Google Sheets Node** - Logger
   - Ajoute une ligne avec: date, chatId, commande, prompt, statut, url, erreur

## Étape 3: Configuration des noeuds

### Code Node: Parser Commande

```javascript
// Input: $json.message.text (message Telegram)
const text = $input.first().json.message?.text || '';
const chatId = $input.first().json.message?.chat?.id;
const username = $input.first().json.message?.from?.username || 'unknown';

// Parser la commande
const parts = text.trim().split(/\s+/);
const command = parts[0]?.toLowerCase() || '';
const prompt = parts.slice(1).join(' ');

// Valider commande
const validCommands = ['/status', '/studio_test', '/video', '/audio', '/image', '/gpu'];

return {
  chatId,
  username,
  command: validCommands.includes(command) ? command : 'unknown',
  prompt: prompt || '',
  originalText: text,
  timestamp: new Date().toISOString(),
  isValid: validCommands.includes(command)
};
```

### HTTP Request: /status

- Method: GET
- URL: `https://workspaceapi-server-production-1334.up.railway.app/api/_diagnostics/production`
- Response Format: JSON

### HTTP Request: /studio_test

- Method: GET
- URL: `https://workspaceapi-server-production-1334.up.railway.app/api/_diagnostics/studio-selftest`
- Response Format: JSON

### HTTP Request: /video

- Method: POST
- URL: `https://workspaceapi-server-production-1334.up.railway.app/api/studio/generate-video`
- Headers: `Content-Type: application/json`
- Body:
```json
{
  "text": "={{ $json.prompt }}",
  "images": [],
  "secondsPerImage": 2
}
```

### HTTP Request: /audio

- Method: POST
- URL: `https://workspaceapi-server-production-1334.up.railway.app/api/studio/generate-music`
- Headers: `Content-Type: application/json`
- Body:
```json
{
  "prompt": "={{ $json.prompt }}"
}
```

### HTTP Request: /image

- Method: POST
- URL: `https://workspaceapi-server-production-1334.up.railway.app/api/studio/generate-image`
- Headers: `Content-Type: application/json`
- Body:
```json
{
  "prompt": "={{ $json.prompt }}",
  "width": 1024,
  "height": 1024,
  "style": "photorealistic"
}
```

### HTTP Request: /gpu

- Method: GET
- URL: `https://workspaceapi-server-production-1334.up.railway.app/api/gpu/status`
- Response Format: JSON

### Code Node: Formater Réponse

```javascript
const input = $input.first().json;
const command = $('Parser Commande').first().json.command;
const chatId = $('Parser Commande').first().json.chatId;
const username = $('Parser Commande').first().json.username;

// Construire l'URL complète si URL relative retournée
const baseUrl = 'https://workspaceapi-server-production-1334.up.railway.app';
let mediaUrl = input.url || input.playable?.videoUrl || input.playable?.audioUrl || input.playable?.imageUrl || null;
if (mediaUrl && !mediaUrl.startsWith('http')) {
  mediaUrl = baseUrl + mediaUrl;
}

// Déterminer le statut
const status = input.ok === true || input.verdict === 'pass' ? 'success' : 'error';
const error = input.error || input.detail || null;

// Construire le message Telegram
let telegramMessage = '';

if (status === 'success') {
  if (command === '/status') {
    telegramMessage = `✅ **Status TAMS**\n\n`;
    telegramMessage += `Verdict: ${input.verdict}\n`;
    telegramMessage += `Railway: ${input.deployment?.railway ? 'Oui' : 'Non'}\n`;
    telegramMessage += `Database: ${input.env?.databaseConfigured ? 'Configuré' : 'Non configuré'}\n`;
    telegramMessage += `GPU Workers: ${input.env?.gpuVideoConfigured ? 'Configuré' : 'Non configuré'}\n`;
  } else if (command === '/studio_test') {
    telegramMessage = `🎬 **Studio Self-Test**\n\n`;
    telegramMessage += `Verdict: ${input.verdict}\n`;
    if (input.playable?.videoUrl) telegramMessage += `Video: ${baseUrl}${input.playable.videoUrl}\n`;
    if (input.playable?.audioUrl) telegramMessage += `Audio: ${baseUrl}${input.playable.audioUrl}\n`;
    if (input.playable?.imageUrl) telegramMessage += `Image: ${input.playable.imageUrl}\n`;
  } else if (command === '/video' && mediaUrl) {
    telegramMessage = `🎬 **Vidéo générée**\n\n`;
    telegramMessage += `URL: ${mediaUrl}\n`;
    telegramMessage += `Engine: ${input.engine || 'unknown'}\n`;
    if (input.degraded) telegramMessage += `\n⚠️ Fallback local utilisé`;
  } else if (command === '/audio' && mediaUrl) {
    telegramMessage = `🎵 **Audio généré**\n\n`;
    telegramMessage += `URL: ${mediaUrl}\n`;
    telegramMessage += `Engine: ${input.engine || 'unknown'}\n`;
  } else if (command === '/image' && mediaUrl) {
    telegramMessage = `🖼️ **Image générée**\n\n`;
    telegramMessage += `URL: ${mediaUrl}\n`;
  } else if (command === '/gpu') {
    telegramMessage = `🖥️ **GPU Workers Status**\n\n`;
    const workers = input.workers || [];
    workers.forEach(w => {
      const icon = w.status === 'connected' ? '✅' : '❌';
      telegramMessage += `${icon} ${w.kind}: ${w.status}\n`;
      if (w.status === 'missing_config') {
        telegramMessage += `   → Set ${w.env}\n`;
      }
    });
  }
} else {
  telegramMessage = `❌ **Erreur**\n\n`;
  telegramMessage += `Commande: ${command}\n`;
  telegramMessage += `Erreur: ${error}\n`;
}

// Données pour Google Sheets
const sheetsData = {
  date: new Date().toISOString(),
  chatId: String(chatId),
  username,
  commande: command,
  prompt: $('Parser Commande').first().json.prompt || '',
  statut: status,
  url: mediaUrl || '',
  erreur: error || ''
};

return {
  telegramMessage,
  chatId,
  sheetsData
};
```

### Telegram Node: Send Reply

- Operation: Send Message
- Chat ID: `={{ $json.chatId }}`
- Text: `={{ $json.telegramMessage }}`
- Parse Mode: Markdown

### Google Sheets Node: Log

- Operation: Append
- Spreadsheet: (votre spreadsheet existant)
- Sheet Name: (votre feuille)
- Columns: A=Date, B=ChatId, C=Username, D=Commande, E=Prompt, F=Statut, G=URL, H=Erreur
- Values: `={{ $json.sheetsData }}`

## Format Google Sheets

| Colonne | Donnée |
|---------|--------|
| A | Date (ISO 8601) |
| B | ChatId |
| C | Username |
| D | Commande |
| E | Prompt |
| F | Statut (success/error) |
| G | URL retournée |
| H | Erreur |

## Tests

Après configuration, tester chaque commande:

1. `/status` - Doit retourner le verdict TAMS
2. `/studio_test` - Doit retourner les URLs des médias générés
3. `/video un chat tigre` - Doit générer et retourner une URL vidéo
4. `/audio musique calme` - Doit générer et retourner une URL audio
5. `/image chat mignon` - Doit retourner une URL d'image
6. `/gpu` - Doit lister les workers configurés/non configurés

## Notes importantes

- **Ne jamais** mettre le token Telegram dans le code n8n ou le dépôt
- **Ne jamais** mettre de clés API dans le dépôt
- Utiliser les credentials n8n pour HTTP Request si nécessaire
- Le workflow GitHub Sheets sert de journal d'audit
- Les médias générés sont temporaires (stockés dans /tmp Railway)
