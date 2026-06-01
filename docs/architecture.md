# Project Pulse Architecture

## Current State

The current project contains a React frontend in `frontend/` and an initial Python/SQLite backend in `backend/`.

The backend provides local JSON APIs for projects, members, actions, updates, AI action extraction, and project-scoped bug refresh. The frontend loads from and writes to those APIs, so project data persists in SQLite. The default local database starts blank. AI extraction uses OCI Generative AI through LangChain when OCI config is available. There is no video transcription or authenticated Bug DB proxy yet.

## Planned Architecture

```text
React Frontend
  |
  | HTTP JSON API
  v
Python Backend API
  |
  | sqlite3 / later SQLAlchemy
  v
SQLite Database

FastAPI Backend
  |
  | local files
  v
Local Storage

Python Backend API
  |
  | LangChain ChatOCIGenAI
  v
OCI GenAI Action Extraction

FastAPI Backend
  |
  | later
  v
Bug DB Integration
```

## Frontend Responsibilities

- Render the single dashboard.
- Manage selected classification and project.
- Manage project members in the selected project context.
- Show status, actions, Meeting Notes with latest updates, and Bug DB tabs.
- Submit meeting notes for extraction through the backend.
- Submit Bug DB URL and filter controls.
- Call backend APIs for persisted project data.

## Backend Responsibilities

- Store projects, members, actions, updates, and refreshed bugs.
- Keep update/action/status sync rules centralized.
- Provide endpoints for dashboard data.
- Provide AI extraction through OCI GenAI when configured.
- Provide Bug DB URL refresh, with authenticated server-side proxying later.

## Initial Data Concepts

- Project: name, classification, owner, members.
- Action item: project, title, owner optional, status of Active, Blocked, or Done, source.
- Daily update: project, owner optional, text, blocker optional, linked action optional.
- Meeting note: project, title, notes, extracted points, extracted actions.
- Bug: project, external id, title, assignee, status, severity.

## Sync Rules

- Daily updates may create action items.
- Meeting note extraction creates action items.
- AI companion notes can populate meeting notes before extraction.
- Action status drives dashboard counts and status lanes.
- Owner drives the Actions by Person checklist.

## Suggested Next Steps

1. Keep refining the React dashboard around the current project workflows.
2. Harden the Python API around SQLite data validation and migrations.
3. Add backend-proxied Bug DB URL fetching when credentials are available.
4. Improve AI-backed meeting-note action extraction with more real meeting samples.
5. Add authenticated Bug DB integration and user permissions later.
