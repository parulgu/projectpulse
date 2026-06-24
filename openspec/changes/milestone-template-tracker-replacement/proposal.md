## Why

Project teams repeatedly recreate the same delivery milestone structure by manually creating phases, phase items, ordering, and completion state for each project. The current tracker is too generic for the desired lifecycle workflow because it does not provide structured milestone subtype ownership, status, links, and review comments.

This change replaces the manual phase and phase-item workflow with a template-based milestone tracker so a project owner can upload a text template and generate the complete project milestone plan in one action.

## What Changes

- Add milestone template upload from the Milestones section.
- Parse top-level template entries as milestone phases and one indented level as milestone subtypes.
- Reject templates with nesting deeper than one level using a validation error.
- Associate imported milestone structures with the selected project.
- Replace the selected project's existing milestone structure whenever a new template is imported.
- Add editable subtype fields for owner, status, link, and comments.
- Default subtype status to `Not Started` and persist status changes.
- Show subtype status in milestone views.
- Keep all milestone data project-scoped and isolated from other projects.
- **BREAKING**: Retire manual phase creation, phase editing, phase reordering, phase-item creation, phase-item editing, phase-item reordering, and phase-item completion tracking.
- **BREAKING**: The imported template-based milestone tracker becomes the only milestone workflow.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `milestones`: Replace phase and phase-item management requirements with template import, project-scoped phases, milestone subtypes, subtype metadata, status tracking, validation, and replacement behavior.
- `backend`: Replace milestone phase/item APIs and persistence expectations with template import, replacement, subtype update, validation, and project-scoped persistence.
- `project-memory`: Update milestone memory requirements so generated answers and summaries use template-based milestone phases, subtypes, statuses, owners, links, and comments.

## Impact

- Frontend Milestones section will change from manual phase/item management to template upload plus editable subtype fields.
- Backend data model and API contract for milestones will change from phases/items/completion to template-derived phases/subtypes/status metadata.
- Existing milestone persistence and bootstrap payloads must represent the new template-based milestone structure.
- Existing project data can import templates; importing replaces only the selected project's milestone data.
- Tests must cover parsing validation, replacement semantics, project isolation, subtype updates, persistence, and removal of retired workflows.
