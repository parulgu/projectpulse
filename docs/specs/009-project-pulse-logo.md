# Spec 009: Project Pulse Logo

## Goal

Replace the temporary `PP` text mark with a simple reusable Project Pulse logo.

## User Story

As a reviewer, I want the app to have a clean brand mark that works in both expanded and collapsed sidebar states without making the interface feel busy.

## Scope

- Add a vector logo mark for Project Pulse.
- Use the logo in the sidebar brand area.
- Keep the expanded brand text as `Project Pulse`.
- Keep the collapsed sidebar readable with the icon only.
- Keep the UI simple and functional.

## Out Of Scope

- Full brand system.
- Multiple logo variants.
- Generated raster assets.
- Marketing page design.

## Acceptance Criteria

- `npm run build` succeeds from `frontend/`.
- The temporary `PP` text mark no longer renders.
- The sidebar renders a reusable logo mark.
- The logo remains visible when the sidebar is collapsed.
- The expanded sidebar still renders `Project Pulse`.

