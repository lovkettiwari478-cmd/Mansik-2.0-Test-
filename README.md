# MANISK OS - Personal AI Operating System v2.0

MANISK is a Personal AI Operating System / Personal AI Assistant that understands the user, remembers approved context, plans tasks, uses tools, executes workflows with permissions, verifies actions, recovers from failures, and provides a premium mobile-first interface.

## Live Deployment

**LIVE URL:** https://3000-iuef90utnj98tj0zv5h0h.e2b.app

- Frontend: Premium mobile-first React UI
- Backend: Production Express server with clean architecture
- Database: SQLite with WAL, migrations, indexes, user isolation
- Health: /api/health

## Architecture

```
Frontend (React + Vite + Tailwind)
↓
Authentication / Session (JWT + bcrypt + DB sessions)
↓
Context + Intent Engine (ANSWER, PLAN, TOOL_ACTION, AUTOMATION, RESEARCH, MEMORY_OPERATION)
↓
Orchestrator
↓
Planner (goal decomposition, dependency detection, conflict detection, plan validation)
↓
Agents (Personal Assistant, Researcher, Task Executor, Memory Keeper, Computer Agent, Creative)
↓
Tools / Integrations (Calendar, Memory, Tasks, Web Search, Knowledge, Email, File, Code, Image, Smart Home)
↓
Verification (tool result verification, plan validation, contradiction detection)
↓
Memory / Knowledge (short-term, long-term, approved, semantic retrieval, duplicate detection)
↓
Audit / Observability (structured logs, health checks, metrics, audit logs, predictions)
```

## Features Implemented

### Core Intelligence
- Intent Engine with confidence scoring, uncertainty detection, contradiction detection
- Context Engine with semantic retrieval (local embeddings + OpenAI fallback)
- Orchestrator with multi-intent handling
- Personality Engine (tone, length, focus/quiet/urgent modes)

### Task Engine
- States: PLANNED → APPROVED → EXECUTING → VERIFYING → COMPLETED
- Failure: FAILED → RETRYING → RECOVERED
- Dependency detection, conflict detection, plan validation, timeouts, idempotency, retries, cancellation, emergency STOP ALL

### Security / Permission Firewall
- Authentication with bcrypt (12 rounds), JWT, secure sessions, httpOnly cookies
- Session revocation, device tracking, audit logs
- Permission firewall: per-agent, per-tool, per-device, temporary permissions, expiration
- Suspicious activity detection, no secrets in frontend, encrypted sensitive data

### Memory
- Short-term conversation memory, long-term approved memory, provenance tracking
- Semantic search with embeddings, duplicate detection, correction, deletion, "Forget this"
- User isolation

### Personal Life System
- Calendar with conflict detection, daily briefing, upcoming events
- Tasks with priorities, deadlines, schedule conflict detection

### Knowledge / Documents
- Documents, notes, PDFs (pdf-parse), semantic search, duplicate detection, linking

### Computer Agent
- File search, code assistance, background jobs

### Research Engine
- Web research via Tavily (when configured) + DuckDuckGo fallback, multi-source, citations, contradiction checking, no fabricated sources

### Skill / Plugin System
- Custom skills, enable/disable, system skills, permissions, tools registry

### Smart Home Architecture
- Device management, routines, modes (Welcome Home, Leaving Home, Sleep, Study, Meeting, Movie, Energy Saver)
- Clean interfaces, REQUIRES CONFIGURATION, no hardware pretended
- Camera/person recognition requires explicit permission

### Real-time / Background Engine
- Background jobs with persistence (survives restarts), retries, progress tracking, cancellation, scheduled jobs, cron

### Model Routing
- Provider abstraction: OpenAI, Anthropic, Google, Local fallback
- Fallback chain, timeout handling, cost/usage tracking, status endpoint
- Clearly marks REQUIRES CONFIGURATION when keys missing

### Database
- Users, sessions, permissions, conversations, messages, memories, tasks, audit_logs, background_jobs, calendar_events, documents, integrations, notifications, model_usage, skills, smart_home_devices, smart_home_routines, system_flags
- Migrations, indexes, user-level isolation, WAL mode, foreign keys

### Premium Mobile-First UI
- Chat with intent display, permission dialogs, tool calls, model provider
- Dashboard with health, briefing, predictions, architecture overview
- Tasks with execution flow, audit trail
- Memory with semantic search, forget behavior
- Calendar, Knowledge, Tools, Agents, Automations, Smart Home, Research, System
- Loading states, empty states, errors, confirmations, progress indicators

## Security Checks Performed
- Unauthorized API access blocked
- Broken access control tested (user isolation)
- Privilege escalation prevented
- Secret exposure checked (no secrets in frontend, /api/health doesn't leak)
- Prompt injection handled (dangerous intent requires permission)
- Permission bypass tested (dangerous tools denied without grant)
- Session abuse tested (revoked sessions blocked)
- File upload validation (10MB limit)
- Rate limiting on auth endpoints
- Audit logging for all sensitive actions

## Tests

Run `npm test` - 22 tests covering:
1. Registration
2. Login failure
3. User isolation
4. Normal question
5. Follow-up conversation
6. Memory save
7. Memory retrieval
8. Memory correction
9. Forget request
10. Task creation
11. Task execution
12. Tool permission denial
13. Tool permission approval
14. Failed tool execution
15. Retry logic
16. Cancellation
17. Emergency stop
18. Background job
19. AI provider failure (fallback to local)
20. Logout/session revocation
+ Security tests

## Environment Variables

See .env.example:
- PORT, JWT_SECRET, DATABASE_PATH, NODE_ENV, ENCRYPTION_KEY, CORS_ORIGIN
- OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY, TAVILY_API_KEY (REQUIRES CONFIGURATION for enhanced features)
- SMTP_HOST, SMTP_USER, SMTP_PASS (REQUIRES CONFIGURATION for email)

## Deployment

- Frontend: Built to dist/client, served by Express static
- Backend: Node.js ESM, Express, SQLite
- Database: File-based SQLite at ./data/manisk.db with migrations
- Background workers: Started with server, persistent jobs
- Health checks: /api/health and /api/system/health
- Production config: NODE_ENV=production, PORT=3000, 0.0.0.0 binding

## Known Limitations

- Email integration requires SMTP config
- External calendar sync (Google/Outlook) requires OAuth config
- Web search enhanced with Tavily API key, fallback to DuckDuckGo
- Image generation requires OpenAI key
- Smart home requires hardware and provider tokens
- Local embeddings are simple hash-based, not as accurate as OpenAI embeddings but functional
- No real-time WebSocket yet (polling for jobs)

## Development

```bash
npm install
npm run dev          # Dev server with tsx watch
npm run build        # Build server + client
npm start            # Production start
npm test             # Run tests
npm run db:migrate   # Run migrations
```
