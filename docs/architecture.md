# Project Pulse Architecture

## Current State

The project contains a React frontend in `frontend/` and a Python/SQLite backend in `backend/`.

The backend provides local JSON APIs for projects, members, actions, updates, decisions, Bug DB data, saved bug queries, project phases, phase items, useful links, executive summaries, and project-memory questions. The frontend loads from and writes to those APIs, so project data persists in SQLite. AI extraction, project summaries, follow-up detection, and project-memory answers use OCI Generative AI through LangChain when OCI config is available, with local fallback behavior when it is not.

## Runtime Shape

```text
React Frontend
  |
  | HTTP JSON API
  v
Python Backend API
  |
  | sqlite3
  v
SQLite Database

Python Backend API
  |
  | LangChain ChatOCIGenAI when configured
  v
OCI GenAI for extraction, summaries, and memory answers

Python Backend API
  |
  | URL fetch and optional MCP-backed Bug DB query helpers
  v
Project-scoped Bug DB refresh and import
```

## Frontend Responsibilities

- Render the main dashboard, sidebar navigation, and project overview.
- Manage selected project, All Projects mode, and archived-project visibility.
- Render status lanes, person checklist, Meeting Notes, project memory, and Bug DB views.
- Support review-before-save action extraction flows.
- Support editing project members, notes, decisions, phases, phase items, and useful links.
- Support executive summary and project-memory question workflows.
- Call backend APIs for persisted project data and show local loading and error states.

## Backend Responsibilities

- Store projects, members, actions, updates, decisions, bug rows, bug queries, phases, phase items, and useful links.
- Keep update, decision, and action sync rules centralized.
- Normalize AI extraction results and provide fallback parsing when needed.
- Generate project summaries and memory answers from persisted project data.
- Parse Bug DB spreadsheet uploads and map flexible report columns.
- Provide project-scoped archive, reporting, and query endpoints.

## Data Concepts

- Project: name, classification, summary, owner optional, members, epic, target release, role details, archived state.
- Action item: project, title, owner optional, status, source, completion date optional, meeting date optional.
- Meeting note or update: project, text, meeting date optional, source metadata, derived decisions.
- Decision: project, text, owner optional, status, decision date optional, optional link to originating note.
- Bug: project, external id, title, assignee, status, severity, priority, raw imported fields.
- Bug query: project, saved query name, structured query payload.
- Phase: project, ordered milestone phase with derived progress and status.
- Phase item: ordered checklist entry within a phase.
- Project link: project, label, address, and display text.

## Sync Rules

- Meeting note extraction returns draft actions first, then persists reviewed actions after confirmation.
- Meeting notes can also create or refresh derived decisions for the same project.
- AI companion notes can populate Meeting Notes before extraction.
- Action status drives dashboard counts and status lanes.
- Owner drives the Status by Person checklist.
- Meeting date flows from meeting notes into extracted actions and related filters.
- Bug uploads replace or update rows only inside the selected project.
- Project memory answers draw from notes, decisions, actions, and milestone phases.

## Current Gaps

- No user authentication or permissions model.
- No hosted production deployment story yet.
- No real meeting video transcription pipeline.
- Bug DB integration is still limited to the current local upload, URL, and helper-based fetch flows.
