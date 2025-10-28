# MCP Server (WhatsApp Automation Helper)

Minimal HTTP server exposing:
- GET /health
- POST /normalize_event
- POST /ai_intent
- POST /send_whatsapp
- POST /schedule_followup

## Environment
See .env for examples:
- MCP_PORT, MCP_API_KEY, MODEL_NAME, GEMINI_API_KEY, REDIS_URL

## Deploy on Coolify (public at https://mcp.nxtgenai.io)
1. In Coolify → Projects → open the project where n8n is running → Add New → Application.  
2. Source: Git repository → this repo URL → Build: Dockerfile (Context `/`, Dockerfile `Dockerfile`).  
3. Environment Variables: copy .env values here (recommended) or keep a private repo.  
4. General → Enable Proxy/Domain → set domain `mcp.nxtgenai.io` → Enable SSL → Deploy.  
5. Check `https://mcp.nxtgenai.io/health` returns JSON.

## Wire in n8n
Workflow Settings → Parameters:
- MCP_BASE_URL = https://mcp.nxtgenai.io
- MCP_API_KEY = (same as in Coolify)
- CLIENT_ID = nxtgenai (or your tenant)

In MCP nodes (Normalize / AI):
- URL: {{ $workflow.parameters.MCP_BASE_URL }}/normalize_event (or /ai_intent)
- Headers: Authorization: Bearer {{ $workflow.parameters.MCP_API_KEY }}, Content-Type: application/json
- Body: message_id, phone, text, client_id (from your Extract Fields)
