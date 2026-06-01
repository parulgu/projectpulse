# Project Pulse

Project Pulse is a local-first team project tracker for keeping project status, meeting notes, latest updates, action items, and Bug DB signals in sync.

The current version has a React frontend wired to a local Python/SQLite backend. It starts with an empty local dashboard, persists user-created project data in SQLite, and can call OCI Generative AI through LangChain for meeting-note action extraction when OCI config is available. Bug DB supports spreadsheet upload and can refresh BugDB saved-search URLs through the BugDB MCP endpoint when OAuth client credentials are configured.

## Frontend

Run the React frontend from:

```bash
cd "/Users/parulgu/Documents/Codex/Project Pulse/frontend"
npm run dev
```

Then open:

```text
http://127.0.0.1:5173/
```

## Backend

Run the local API from:

```bash
cd "/Users/parulgu/Documents/Codex/Project Pulse"
python3 backend/app.py
```

The API starts at:

```text
http://127.0.0.1:8000/
```

## Current Capabilities

- Single dashboard experience.
- Project classification and project selector.
- Status by project.
- Actions by person.
- Meeting Notes with latest updates and AI-backed action extraction when configured.
- Compact Bug DB tab with Excel/CSV upload, BugDB MCP refresh, report columns, and filters.
- SQLite persistence for projects, members, actions, updates, and refreshed bugs.

## BugDB MCP Configuration

To refresh BugDB data from the in-app query form or from a saved-search URL such as `https://bug.oraclecorp.com/pls/bug/WEBBUG_REPORTS.Saved_Search?id=...`, add BugDB OAuth and MCP settings to `backend/project-pulse.config.json`:

```json
{
  "bugdb": {
    "mcpEndpoint": "https://bug.oraclecorp.com/mcp",
    "tokenUrl": "https://<idcs-token-endpoint>/oauth2/v1/token",
    "clientId": "<client-id>",
    "clientSecret": "<client-secret>",
    "oauthScope": "bug.rest.idcs",
    "caBundlePath": "/path/to/oracle-corp-ca.pem",
    "verifySsl": true
  }
}
```

The backend caches the access token until shortly before it expires. If Python cannot verify the internal Oracle certificate chain, set `caBundlePath` to a PEM bundle that contains the corporate CA. For local-only testing, `verifySsl` can be set to `false`, but a CA bundle is preferred.

Environment variables with matching names are also supported: `BUGDB_MCP_ENDPOINT`, `BUGDB_TOKEN_URL`, `BUGDB_CLIENT_ID`, `BUGDB_CLIENT_SECRET`, `BUGDB_OAUTH_SCOPE`, `BUGDB_CA_BUNDLE_PATH`, and `BUGDB_VERIFY_SSL`.

## Future Build Direction

The implementation target is:

- Frontend: React
- Backend: Python API with SQLite first, FastAPI-compatible shape later
- Database: SQLite first
- Storage: local filesystem first
- AI: OCI GenAI through LangChain now, local LLM later
- Bug DB: spreadsheet import and BugDB MCP saved-search refresh now, fuller field mapping later
