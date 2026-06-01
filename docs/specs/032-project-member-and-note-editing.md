# Spec 032: Project Member And Note Editing

## Goal

Let users correct project members and saved project notes without leaving the dashboard.

## User Story

As a project owner, I want to edit the project member list and saved meeting notes so owner assignment and project history stay accurate.

## Scope

- Add a compact edit icon next to the member list in the selected project summary.
- Replace the old add-member-only form with a comma-separated member list editor.
- Persist member list replacements in SQLite.
- Clear action owners that no longer exist in the edited member list.
- Add a compact edit icon to project notes feed entries.
- Persist project note text and meeting date edits.
- Keep AI action owners limited to the selected project's current member list.

## Out Of Scope

- Per-member profile management.
- Audit history for member or note edits.
- Creating new project members from AI extraction.

## Acceptance Criteria

- Editing members can add, remove, and rename project members.
- Updated member lists survive reload.
- Removed members are no longer available as action owners.
- AI extraction receives the current member list and unknown names resolve to `No owner`.
- Feed notes can be edited from the expanded project notes feed.
- Edited notes survive reload.
