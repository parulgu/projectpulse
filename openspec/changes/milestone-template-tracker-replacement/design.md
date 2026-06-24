## Context

The current milestone tracker models milestones as manually managed phases and phase items. Users can create, edit, reorder, delete, and complete those records directly. The replacement workflow treats the milestone plan as a project-scoped structure generated from an uploaded text template, then maintained by editing fields on generated subtype rows.

The change affects the React Milestones section, backend milestone APIs, persistent storage shape, bootstrap data, and project memory sources. It is intentionally narrow: only text template import is supported, and only one nesting level is valid.

## Goals / Non-Goals

**Goals:**

- Replace manual phase and phase-item management with template import.
- Parse a text template into project-scoped phases and subtypes.
- Reject templates with additional nesting levels before replacing existing data.
- Replace only the selected project's milestone structure on successful import.
- Persist subtype owner, status, link, and comments.
- Expose subtype status clearly in milestone views and project memory.
- Remove phase and phase-item create/edit/reorder/complete workflows from the UI and API surface.

**Non-Goals:**

- Multi-level milestone hierarchies.
- Spreadsheet import.
- Template versioning or reusable template libraries.
- Cross-project templates.
- Automatic owner assignment.
- Import from external systems.
- Migration of old phase-item completion values into the new status model beyond replacing data when a template is imported.

## Decisions

1. Template import is a replacement operation.

   Importing a valid template deletes the selected project's existing milestone phases and subtype rows, then inserts the parsed structure. This matches the requested behavior and avoids ambiguous merge rules. The alternative was appending or diffing against existing milestones, but that would preserve stale tracker records and make ownership/status mapping unclear.

2. Parsing is indentation based with exactly two semantic levels.

   Non-empty lines with no leading indentation become phases. Non-empty lines with one indentation level become subtypes under the most recent phase. Any deeper indentation is rejected with a validation error, and no existing project milestone data is changed. Blank lines are ignored. The alternative was permissive normalization of deeper nesting, but rejecting invalid templates keeps user intent explicit.

3. Subtype status replaces item completion.

   Each subtype stores one status value from `Not Started`, `In Progress`, `Blocked`, `Complete`, or `Not Applicable`, defaulting to `Not Started` at import. This supports lifecycle tracking without retaining a separate boolean completion model.

4. Subtype records carry editable metadata.

   Each subtype stores title, owner, status, link, and comments. The phase stores its title and display order. Subtypes store display order within the phase, but users do not manage order manually in this replacement workflow; order comes from the uploaded template.

5. Backend API changes should be explicit.

   The backend should expose a template import operation and subtype update operation rather than preserving legacy phase and phase-item mutation endpoints. Bootstrap data should return the new milestone structure grouped by project so reloads and project switching are consistent.

6. Project memory consumes milestone subtype fields.

   Memory answers and summaries should use template-derived phase names, subtype titles, owners, statuses, links, and comments. This keeps milestone status visible in project-level knowledge without adding a separate memory store.

## Risks / Trade-offs

- Existing UI or tests may depend on manual phase/item controls → Remove those workflows deliberately and replace tests with import/update coverage.
- Invalid templates could otherwise erase existing milestones → Validate the full file before deleting or inserting milestone data.
- Duplicate phase names may exist in valid templates → Preserve template order and create distinct phase records rather than merging by name.
- Import replacement can discard manually entered subtype metadata → Make replacement behavior clear in the workflow and ensure it happens only after a valid import.
- Legacy milestone data shape may remain in local storage/database during transition → Update bootstrap and persistence mapping to the new model and remove old read/write paths used by the retired workflow.

## Migration Plan

1. Introduce the new milestone storage/API shape for template-derived phases and subtypes.
2. Replace frontend Milestones controls with upload/import and subtype field editing.
3. Remove or disable legacy phase and phase-item mutation flows from the UI and backend.
4. Update bootstrap and project memory assembly to use the new milestone structure.
5. Add tests for parsing, validation, replacement, project isolation, subtype updates, persistence, and retired workflow removal.

Rollback is limited because this is a breaking replacement. If rollback is required before release, restore the prior phase/item implementation and database/API contract from version control.

## Open Questions

- Should the import UI require an explicit confirmation before replacing existing milestone data, or is selecting/uploading the file sufficient?
- Should owner remain free text or be constrained to project members in a later change?
