# MCP Server (WhatsApp Automation Helper)

Endpoints:
- GET /health
- POST /normalize_event
- POST /ai_intent
- POST /send_whatsapp
- POST /schedule_followup

## Environment (set ONLY in Coolify)
MCP_PORT, MCP_API_KEY, MODEL_NAME, GEMINI_API_KEY, REDIS_URL

## Deploy on Coolify (public at https://mcp.nxtgenai.io)
- Add New → Application → Git repository → Build: Dockerfile (/, Dockerfile).
- Set Environment Variables with your secrets.
- General → Enable Proxy/Domain → mcp.nxtgenai.io → Enable SSL → Deploy.
- Check https://mcp.nxtgenai.io/health returns JSON.

## Wire in n8n
Workflow Settings → Parameters:
- MCP_BASE_URL = https://mcp.nxtgenai.io
- MCP_API_KEY = (same as Coolify)
- CLIENT_ID = nxtgenai

In MCP nodes:
- URL: {{ $workflow.parameters.MCP_BASE_URL }}/normalize_event (or /ai_intent)
- Headers: Authorization: Bearer {{ $workflow.parameters.MCP_API_KEY }}, Content-Type: application/json
- Body: message_id, phone, text, client_id
