# Spec 024: OCI GenAI Extraction

## Goal

Replace the OpenAI-compatible extraction call with OCI Generative AI through LangChain `ChatOCIGenAI`.

## User Story

As a builder, I want Project Pulse to use OCI GenAI for meeting-note action extraction so the app can run against Oracle-managed AI services.

## Scope

- Use `ChatOCIGenAI` for backend extraction.
- Read OCI GenAI configuration from backend environment variables.
- Keep the frontend extraction API unchanged.
- Keep the server bootable even before OCI/LangChain dependencies are installed.
- Document the required Python packages and OCI configuration.

## Out Of Scope

- Creating OCI tenancy resources.
- Managing OCI API keys or config files from inside the app.
- Streaming extraction responses.
- Persisting raw model prompts or responses.

## Acceptance Criteria

- `POST /api/projects/{projectId}/extract-actions` uses `ChatOCIGenAI`.
- Missing OCI config returns a clear setup error.
- Existing mocked backend test can still verify action persistence without making a live OCI call.
- Backend docs explain `langchain-oci`, `oci`, and required environment variables.
