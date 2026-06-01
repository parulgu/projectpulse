# Spec 002: Static Dashboard Layout

## Goal

Convert the approved prototype's main dashboard shell into React components without adding interactive behavior yet.

## User Story

As a reviewer, I want to see the Project Pulse dashboard structure in the React app so I can review the visual foundation before data, filters, forms, and tab behavior are wired.

## Scope

- Add static React components for:
  - Sidebar and workspace context.
  - Topbar.
  - Selected project context.
  - Summary metric cards.
  - Dashboard section placeholder.
- Use representative static content from the prototype.
- Keep all data local to React component constants for now.
- Keep the approved static prototype files unchanged.

## Out Of Scope

- Project creation.
- Project selector behavior.
- Tab switching.
- Adding members.
- Adding or editing action items.
- Daily update submission.
- Meeting note extraction.
- Bug DB fetching or filtering.
- Backend integration.

## Acceptance Criteria

- `npm run build` succeeds from `frontend/`.
- The app renders `Project Pulse` as the product name.
- The app renders a sidebar, topbar, project context panel, three summary metrics, and a dashboard placeholder.
- The implementation is organized as React components.
- There is no direct DOM manipulation.
- Existing `prototype/` files are not modified.

## Review Checklist

- The page should look like the beginning of the real dashboard, not a marketing page.
- Static content should be easy to replace with real state in later specs.
- This slice should not contain hidden behavior or backend assumptions.

