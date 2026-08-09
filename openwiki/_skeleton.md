---
type: Wiki 骨架
title: InterviewOS Wiki Skeleton
description: 本仓库 OpenWiki 文档的结构规划：入口、架构、后端、前端、安全与运维各域的概念页清单，以及覆盖范围与清理决策的维护记录。
tags: [skeleton, planning, maintenance]
---

# InterviewOS Wiki Skeleton

Repository: InterviewOS — AI 智能模拟面试 Agent 平台（本地优先、BYOK）。
Language: zh-CN prose; English tags in YAML front matter.

## Entrypoint

- `/openwiki/quickstart.md`
  - What this wiki is, how to navigate, 30-second repository map, task-routing table.
  - Backlog of explicitly deferred / unimplemented areas with source anchors.

## 1. Architecture

- `/openwiki/architecture/overview.md`
  - System-wide layers: Next.js frontend → FastAPI backend → BYOK LLM / ASR / TTS adapters → SQLite/Chroma data.
  - Runtime request flows (REST, WebSocket, SSE) with Mermaid diagrams.
  - Module dependency convergence (`app/api → app/services → app/core`).
  - Directory roles and extension seams (ASR, TTS, RAG backend, workflow, GitHub tool, company KB).
  - Security/performance consensus summary.

## 2. Backend

### 2.1 Foundation

- `/openwiki/backend/main.md` — `app/main.py` entrypoint, lifespan, CORS, trace middleware, error envelope, production gates.
- `/openwiki/backend/config.md` — `app/config.py` settings, env aliases, validation, computed embeddings.
- `/openwiki/backend/database.md` — lazy engine/session factory, `get_db`, `init_db`, SQLite specifics.
- `/openwiki/backend/models.md` — `UserProfile`, `LLMSettings`, `Resume`, `InterviewSession`, `PrepSession`, `GrowthRecord`.
- `/openwiki/backend/schemas.md` — Pydantic contracts, `InterviewConfig`, `ResumeAnalysis`, `InterviewReport`, `APIError`.
- `/openwiki/backend/constants.md` — `WorkflowType`, `InterviewPhaseId`, `Personality`, `InterviewStyle`, `RAGBackendKind`, WS/SSE events, thresholds.

### 2.2 Core Infrastructure

- `/openwiki/backend/core/security.md` — SSRF, URL pinning, filename sanitization, path traversal, API key redaction.
- `/openwiki/backend/core/secrets.md` — AES-256-GCM at-rest API key encryption, master key derivation, legacy format handling.
- `/openwiki/backend/core/logging.md` — structured JSON logs, `RedactFilter`, trace_id ContextVar.
- `/openwiki/backend/core/ratelimit.md` — sliding-window in-memory rate limiting, trusted-proxy CIDRs.
- `/openwiki/backend/core/migrate.md` — idempotent column migrations, Alembic head stamping.
- `/openwiki/backend/core/session-auth.md` — capability tokens, cookie/header/query extraction, CSRF origin checks.
- `/openwiki/backend/core/other.md` — file_lock, local_only, options_data, prompts.

### 2.3 API Surface

- `/openwiki/backend/api/overview.md` — `app/api/router.py` mounts `app/api/v1/router.v1_router` under both `/api/v1` (canonical) and `/api` (legacy alias); v1 sub-routers live under `app/api/v1/` (settings, profile, resume, interview, reports, options, prep, ws). Deprecation policy 2026-10-01.
- `/openwiki/backend/api/settings.md` — BYOK three-stage settings, catalog, stage tests, key update with `_SECRET_KEEP`.
- `/openwiki/backend/api/profile.md` — get/put `UserProfile`, auto-create id=1.
- `/openwiki/backend/api/resume.md` — upload, activate, analyze, magic-byte sniff, path validation.
- `/openwiki/backend/api/interview.md` — session CRUD, start, message, finish, capability-token cookie flow.
- `/openwiki/backend/api/reports.md` — get report, SSE stream, growth history, system insights.
- `/openwiki/backend/api/options.md` — runtime options (roles, levels, companies, workflows, avatars, scenes, voices).
- `/openwiki/backend/api/prep.md` — `app/api/v1/prep.py` (mounted by `app/api/v1/router.py`) prep session sync + SSE endpoints; prep agent at `app/agents/prep/agent.py`.
- `/openwiki/backend/api/websocket.md` — `app/api/v1/ws_interview.py` (mounted by `app/api/v1/router.py`) registers `ws://host/api/v1/ws/interview/{session_id}`; delegates to `InterviewWSHandler`; protocol + single-active-connection mutex.

### 2.4 Interview Domain Services

- `/openwiki/backend/services/interview/overview.md` — agent/runner/consumer/assembler/tools/report map, turn lifecycle.
- `/openwiki/backend/services/interview/agent.md` — `InterviewAgent` state machine, `agent_state`, phase advancement, memory refresh.
- `/openwiki/backend/services/interview/runner.md` — `InterviewRunner` façade, `stream_opening/turn/closing`.
- `/openwiki/backend/services/interview/workflows.md` — `PhaseDef`, `Workflow`, technical/hr/management phases, labels, personalities/styles/strictness.
- `/openwiki/backend/services/interview/streaming.md` — `StreamingConsumer`, `StreamEvent`, token emission, tool rounds, RAG injection.
- `/openwiki/backend/services/interview/prompts.md` — `build_system_prompt`, user content assembly, markers, think-block stripping, emotion detection.
- `/openwiki/backend/services/interview/followup.md` — `FollowupCategory` signal classification, regex probes, `analyze`.
- `/openwiki/backend/services/interview/tools.md` — function tools (GitHub, web search, company, resume), tool-round runner, max rounds.
- `/openwiki/backend/services/interview/report.md` — `generate_and_persist_report`, score breakdown, growth/system-learning write.

### 2.5 AI / Adapter Services

- `/openwiki/backend/services/llm-client.md` — `LLMClient`, chat/stream/json/embed, retry, pinned transport, BYOK decryption.
- `/openwiki/backend/services/stt.md` — STT package overview: `__init__`, `router.py` dispatch, `cloud.py` common adapter, `aliyun.py`, `baidu.py`, `tencent.py`, `volcengine.py`, `xfyun.py`, `openai_compat.py`, local fallback `whisper.py`/`local.py`, `transcribe_utterance` chain; tests `test_cloud_stt.py`, `test_voice_pipeline.py`.
- `/openwiki/backend/services/tts.md` — TTS package overview: `__init__`, `edge.py` Edge TTS, `minimax.py` T2A, `voice_resolve.py` prosody/voice selection, `synthesize_speech`; tests `test_tts_queue.py`, `test_session_tts_flush.py`.
- `/openwiki/backend/services/voice.md` — capability catalog, credential assembly, stage connectivity tests.
- `/openwiki/backend/services/rag/overview.md` — RAG domain map: `RAGBackend` protocol, factory, local backend, StepFun backend, KB data layer, company wrapper, `test_rag_backends.py` anchors.
- `/openwiki/backend/services/rag/protocol.md` — `base.py` `RAGBackend` protocol, `factory.py` `build_rag_backend` + `_NullRAG`, backend selection by `RAGBackendKind`.
- `/openwiki/backend/services/rag/local-backend.md` — `local_backend.py` Chroma + OpenAI-compatible embeddings, `CompanyKnowledgeRAG.ensure_index`.
- `/openwiki/backend/services/rag/stepfun-backend.md` — `stepfun_backend.py` vector store upload, `tools[].type=retrieval` retrieval.
- `/openwiki/backend/services/rag/kb-data.md` — `_kb_data.py` seed documents, collection name, `format_context`, no business-dependency design.
- `/openwiki/backend/services/rag/company-rag.md` — `company_rag.py` backward-compatible wrapper.
- `/openwiki/backend/services/resume-parser.md` — PDF/DOCX/MD/TXT parsing into `CandidateProfile`.
- `/openwiki/backend/services/github.md` — GitHub REST client + OpenAI function tools, MCP-semantic alignment.
- `/openwiki/backend/services/search.md` — DuckDuckGo web search wrapper; `sites.py` 站点白名单（`RESUME_MARKET_SEARCH_SITES` / `RESUME_MARKET_SITE_LABELS`）。
- `/openwiki/backend/services/company-knowledge.md` — built-in 7-company metadata and style descriptions.
- `/openwiki/backend/services/context.md` — `compress_messages` 无 LLM 压缩（`keep_recent=20`、30% 阈值）与 token 估算.
- `/openwiki/backend/services/growth.md` — `GrowthRecord`, `system_learning.json`, system insights.
- `/openwiki/backend/services/seed.md` — idempotent LLM settings seeding.

### 2.6 Realtime WebSocket Layer

- `/openwiki/backend/realtime/overview.md` — WS gateway role, mixin composition (`ConnectionLifecycleMixin`, `TurnCoordinatorMixin`, `VoicePipelineMixin`, `HintServiceMixin`, `ReportSchedulerMixin`).
- `/openwiki/backend/realtime/ws-handler.md` — `app/realtime/ws_handler.py` `InterviewWSHandler` façade composition root, `_spawn`, `_cancel_bg_tasks`, test re-exports.
- `/openwiki/backend/realtime/connection-lifecycle.md` — `app/realtime/connection_lifecycle.py` handshake, single-session mutex, heartbeat, graceful close.
- `/openwiki/backend/realtime/turn-coordinator.md` — `app/realtime/turn_coordinator.py` user turn dispatch, busy mutex, state machine integration.
- `/openwiki/backend/realtime/turn-control.md` — `app/realtime/turn_control.py` barge-in handling (`_on_candidate_barge_in`), finish request (`_on_request_finish`), interrupt stats persistence.
- `/openwiki/backend/realtime/turn-streaming.md` — `app/realtime/turn_streaming.py` `_consume_runner_turn`, `_stream_events_with_tts`, image base64 limit, TTS frame emission.
- `/openwiki/backend/realtime/voice-pipeline.md` — `app/realtime/voice_pipeline.py` STT selection, sentence TTS queue, echo suppression, audio buffer limits.
- `/openwiki/backend/realtime/hint-service.md` — `app/realtime/hint_service.py` reference-hint request/response flow.
- `/openwiki/backend/realtime/report-scheduler.md` — `app/realtime/report_scheduler.py` 后台报告调度：`_schedule_report_generation` 三处触发、防重入、幂等跳过、`_cancel_bg_tasks` 取消.
- `/openwiki/backend/realtime/events.md` — `app/realtime/events.py` `TurnState`, `SessionSnapshot`, `SessionEvent`, `schema_version`.
- `/openwiki/backend/realtime/session-registry.md` — `app/realtime/session_registry.py` `_active_handlers`, claim/release, new-kicks-old.

### 2.7 Agents

- `/openwiki/backend/agents/orchestrator.md` — merges vision + follow-up signals into turn snapshot.
- `/openwiki/backend/agents/vision.md` — placeholder vision agent (face analysis passthrough).
- `/openwiki/backend/agents/prep.md` — prep coach agent with web search/company/GitHub tools.

### 2.8 Testing

- `/openwiki/backend/testing.md` — backend test layout (`backend/tests/`), fixtures, fakes, `FakeLLMClient`, targeted test groups, run commands.
- `/openwiki/backend/integration-tests.md` — root `/test/` integration/session tests (`conftest.py`, `pytest.ini`, session auth/audio buffer/HTTP interview/rate limit/report stream/settings & growth/SSRF pin/TTS flush/WS mutex tests).

## 3. Frontend

### 3.1 Foundation

- `/openwiki/frontend/overview.md` — Next.js 15 App Router, strict TS, Tailwind, directory roles, build/test scripts.
- `/openwiki/frontend/api-client.md` — `src/lib/api.ts` REST/SSE client, `src/types/index.ts` contracts, `src/lib/env.ts` env validation.
- `/openwiki/frontend/config.md` — `src/config/nav.ts`, `phases.ts`, `providers.ts`, `prepPrompts.ts`.

### 3.2 Layout & Shared Components

- `/openwiki/frontend/layout.md` — `layout.tsx`, `AppShell`, `Sidebar`, `ThemeProvider`, `ThemeToggle`, `Toast`, `LoadError`; 路由级反馈页 `error.tsx` / `loading.tsx` / `not-found.tsx`.
- `/openwiki/frontend/components.md` — `MarkdownContent`, `ThinkAnswerMessage`, `StreamingReveal`, effects.

### 3.3 Pages

- `/openwiki/frontend/pages/landing.md` — `src/app/page.tsx` marketing landing.
- `/openwiki/frontend/pages/settings.md` — BYOK three-stage settings page.
- `/openwiki/frontend/pages/profile.md` — user profile form, completion percentage.
- `/openwiki/frontend/pages/resume.md` — upload, list, activate, analyze, deep-analysis display.
- `/openwiki/frontend/pages/interview-setup.md` — interview creation form (`/interview/page.tsx`).
- `/openwiki/frontend/pages/interview-room.md` — real-time room (`/interview/[id]/page.tsx`), chat, turn state, finish.
- `/openwiki/frontend/pages/prep.md` — prep coach chat, quick prompts, SSE streaming.
- `/openwiki/frontend/pages/history.md` — session list, continue, view report.
- `/openwiki/frontend/pages/growth.md` — weak skills, training plans, system insights.
- `/openwiki/frontend/pages/report.md` — report viewer with radar chart and score breakdown.

### 3.4 Media Pipeline & Avatar

- `/openwiki/frontend/media-pipeline.md` — `useInterviewWS`, `useAudioRecorder`, `useTTSPlayer`, `VideoPanel`, WS/SSE event handling, VAD, barge-in, playback, lip-sync.
- `/openwiki/frontend/avatar.md` — `InterviewerAvatar` (CSS/SVG), `TalkingHeadAvatar` (3D GLB fallback), emotion/audio-level mapping; 开发调试路由 `/avatar-debug`.

### 3.5 Testing

- `/openwiki/frontend/testing.md` — vitest config, `cnText.test.ts`, `thinkStream.test.ts`.

## 4. Security & Operations

- `/openwiki/security.md` — threat model, mitigations, API key encryption, SSRF, upload, CORS, WS, rate-limit, error envelopes.
- `/openwiki/development.md` — setup, env files, backend/frontend dev, testing, extension points, CI notes.

## 维护备注（2026-08 骨架审查）

- 概念页一律落在 `backend/services/` 与 `backend/services/rag/` 下；历史遗留的 `backend/interview/`、`backend/rag/` 重复页（`streaming.md` / `tools.md` / `protocol.md`）已于骨架审查时删除，避免双源真相，后续运行不得重建。
- 所有页面的站内相对链接以页面所在目录为基准（如 `architecture/overview.md` 引用后端页用 `../backend/...`，`backend/core/*.md` 引用 `security.md` 用 `../../security.md`）。

## 维护备注（2026-08 二轮事实校准）

- `backend/realtime/report-scheduler.md`：符号名与触发点对齐源码（`_schedule_report_generation`、三处调用点、幂等跳过 + `report.py` 哨兵）。
- `frontend/media-pipeline.md`：按 `useInterviewWS/useAudioRecorder/useTTSPlayer/VideoPanel` 与 `types/index.ts` 重写，修正重连/打断/held 队列/事件清单。
- `backend/services/context.md`：修正为无 LLM 的静态压缩（`compress_messages(messages, max_tokens, *, keep_recent=20, threshold=0.3)`）。
- `backend/services/stt.md`：澄清 `transcribe_utterance` / `transcribe_utterance_result` / `transcribe_with_handler` 三层入口关系。
- `backend/services/llm-client.md`、`backend/services/rag/protocol.md`：补 `PinnedHostTransport` 与新增后端步骤。
