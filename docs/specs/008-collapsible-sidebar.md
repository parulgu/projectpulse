# Spec 008: Collapsible Sidebar

## Goal

Add a simple control to collapse and expand the left sidebar.

## User Story

As a reviewer, I want to collapse the sidebar so the main dashboard canvas has more room while keeping a clear way to reopen project navigation.

## Scope

- Add local React state for sidebar collapsed/expanded mode.
- Add a sidebar toggle button.
- In collapsed mode, show only the `PP` brand mark and expand control.
- In expanded mode, show project navigation and the `New Project` action.
- Let the main canvas expand when the sidebar is collapsed.

## Out Of Scope

- Persisting sidebar state.
- Animations beyond simple layout transition.
- Keyboard shortcuts.
- Changing project navigation behavior.

## Acceptance Criteria

- `npm run build` succeeds from `frontend/`.
- The sidebar renders a collapse control when expanded.
- Clicking the collapse control hides project navigation and `New Project`.
- Clicking the expand control restores project navigation and `New Project`.
- The selected project and metrics remain unchanged while the sidebar is collapsed.

