# Spec 007: Collapsible Classification Sidebar

## Goal

Replace the sidebar classification/project controls with a grouped project navigator where each classification is a collapsible section.

## User Story

As a reviewer, I want the left panel to show projects grouped by classification so I can switch project context quickly and see that custom classifications can be added later without changing the navigation structure.

## Scope

- Derive classification groups from project data.
- Render each classification as a collapsible sidebar section.
- Render project buttons inside each expanded classification.
- Move the `New Project` action into the sidebar.
- Selecting a project refreshes the main canvas and metrics.
- Include a sample custom classification beyond `Work` and `Personal` to prove the data model supports arbitrary classification labels.

## Out Of Scope

- Creating new projects.
- Editing classifications.
- Persisting collapsed state.
- Backend integration.

## Acceptance Criteria

- `npm run build` succeeds from `frontend/`.
- Sidebar renders classification groups from project data.
- Sidebar renders the `New Project` action.
- Sidebar renders `Work`, `Personal`, and `UI` groups.
- Classification headers are collapsible with `aria-expanded`.
- The topbar no longer renders the `New Project` action.
- Clicking `Analytics Migration` refreshes the main canvas metrics to `0 / 1 / 0`.
- Clicking a project under `UI` refreshes the main canvas to that project.
- The old segmented classification control and project dropdown no longer render.
