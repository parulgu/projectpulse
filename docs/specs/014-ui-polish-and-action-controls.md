# Spec 014: UI Polish And Action Controls

## Goal

Refine the local dashboard UI based on design critique while keeping the interface simple.

## User Story

As a reviewer, I want the prototype to feel cleaner, safer, and more usable so the app is easier to evaluate before backend work begins.

## Scope

- Compact the selected project summary to avoid repeating the project name.
- Move destructive project actions into a compact `More` menu.
- Add lightweight toast feedback for create, delete, update, and action changes.
- Improve Bug DB into a more polished risk summary plus filters and list.
- Reduce form density where possible.
- Add focus states, `aria-current` for selected project navigation, and clearer sidebar collapse icons.
- Add quick status buttons for action items.

## Out Of Scope

- Full design system.
- Drag-and-drop.
- Backend persistence.
- Real Bug DB integration.

## Acceptance Criteria

- `npm run build` succeeds from `frontend/`.
- Project summary displays the selected project name once.
- `Delete Project` is available inside a `More` menu, not directly in the project header.
- Toasts appear after project creation, project deletion, member addition, action creation, status changes, daily updates, and meeting extraction.
- Selected project navigation item has `aria-current="page"`.
- Sidebar collapse control has clearer visual icons.
- Action rows include quick buttons to move items to Active, Blocked, or Done.
- Bug DB shows a risk summary and usable filters.

