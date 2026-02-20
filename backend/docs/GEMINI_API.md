# Gemini API (Backend Proxy)

Ce projet expose Gemini via le backend pour garder la cle API en securite.

## Configuration

Ajouter dans `.env`:

```env
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.0-flash
GEMINI_TIMEOUT_MS=30000
```

## Endpoints

1. `GET /api/ai/gemini/status`
2. `POST /api/ai/gemini/generate`

### Payload `POST /api/ai/gemini/generate`

```json
{
  "prompt": "Explique le risque de rupture du produit PRD-001",
  "system_instruction": "Tu es un assistant stock clair et concis.",
  "model": "gemini-2.0-flash",
  "temperature": 0.3,
  "max_output_tokens": 1024,
  "history": [
    { "role": "user", "text": "Bonjour" },
    { "role": "model", "text": "Bonjour, je peux vous aider pour le stock." }
  ]
}
```

### Reponse type

```json
{
  "ok": true,
  "model": "gemini-2.0-flash",
  "text": "Voici l'explication...",
  "usage": {},
  "finish_reason": "STOP"
}
```
