# Spec 038: Bug DB Excel Upload

## Goal

Let users load Bug DB data from an exported spreadsheet while the direct Bug DB integration is still pending.

## User Story

As a project reviewer, I want to upload a Bug DB Excel export so the Bug DB tab can show current bugs without requiring a live Bug DB API connection.

## Scope

- Add a Bug DB upload control next to the existing URL refresh controls.
- Support `.xlsx` and `.csv` uploads.
- Parse uploaded files in the backend.
- Import rows into the selected project only.
- Use `Bug/Enh Number` as the stable row id so later uploads update matching rows.
- Keep all uploaded spreadsheet columns as flexible report fields.
- Support the sample Bug DB export columns:
  - `RPTNO`
  - `Bug/Enh Number`
  - `Subject`
  - `Status`
  - `Severity`
  - `Priority`
  - `Assignee`
- Let users choose which columns to show per project.
- Simplify filtering to repeatable `Filter name` and `Filter value` rows.
- Let users clear all report filters at once.
- Let users clear the selected project's Bug DB report before uploading a fresh report.

## Out Of Scope

- Old binary `.xls` parsing.
- Persistent upload history.
- Authenticated Bug DB refresh.
- Full Bug DB field modeling beyond the current list fields.

## Acceptance Criteria

- Backend accepts `POST /api/projects/:id/bugs/upload`.
- Uploading the sample Bug DB `.xlsx` structure imports bug id, title, assignee, status, and severity.
- Imported bugs display Priority when the export provides it.
- Extra uploaded columns remain available in the column selector.
- Uploading the same Bug/Enh Number updates the existing project row.
- `DELETE /api/projects/:id/bugs` clears the selected project's Bug DB report.
- The Bug DB tab supports multiple filters and applies them together.
- Clear filters resets the selected project's filter rows.
- Unsupported file types return a clear error.
- `python3 -m unittest backend.tests.test_api` passes.
- `npm run build` succeeds from `frontend/`.
