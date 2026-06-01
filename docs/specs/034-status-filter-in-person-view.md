# Spec 034: Status Filter In Person View

## Goal

Let users narrow the Status by Person checklist by action status.

## User Story

As a project owner, I want to filter the person checklist by status so I can quickly review active, blocked, or done work for the selected project.

## Scope

- Add a compact status dropdown to the Status by Person tab.
- Keep the existing owner filter.
- Apply owner and status filters together.
- Reset filters when switching projects.

## Out Of Scope

- Saved filter presets.
- Text search.
- Multi-select filters.

## Acceptance Criteria

- Status by Person shows Owner and Status filters.
- Choosing a status hides actions in other statuses.
- Owner and Status filters can be combined.
- Changing projects resets both filters to `All`.
