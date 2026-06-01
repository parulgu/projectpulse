# Project Pulse Requirements

## Projects

- Users can create multiple projects.
- Each project has a name and custom classification.
- Project members can be added while creating a project.
- Project members can be added later from the selected project dashboard.
- Project members can be edited as a full comma-separated list.
- Editing members warns when existing action owners will be cleared.
- The dashboard always works against one selected project.
- Changing the selected project refreshes status, actions, updates, notes context, and Bug DB.

## Dashboard

- The dashboard shows counts for active, blocked, and done work.
- Counts are based only on the selected project.
- Dashboard sections are organized as tabs:
  - Status by Project
  - Status by Person
  - Meeting Notes
  - Bug DB

## Status By Project

- Shows action items grouped into status lanes.
- Supported statuses:
  - Active
  - Blocked
  - Done
- Each action item shows owner or No owner.
- Each action item can show and edit a completion date.
- Action items with completion dates show compact due-date indicators.
- Each action item title can be edited.
- Action deletion requires confirmation.

## Actions By Person

- Shows a compact checklist of action items.
- Items can be filtered by owner.
- Items can be filtered by status.
- Items can be quickly filtered to overdue work.
- Items are sorted by completion date, then status, then title.
- Items can have no owner.
- Each item can be moved between Active, Blocked, and Done.
- Each item title can be edited from the checklist.
- New action items can be added manually.
- The manual add action form opens from a compact add icon and uses save/cancel icons.
- New action items can include an optional completion date.

## Meeting Notes

- Meeting notes belong to the selected project context.
- Meeting notes start empty for a new project view.
- Meeting Notes shows the latest project updates feed.
- Meeting Notes captures the date when the meeting happened.
- Saved meeting notes show the meeting date in the project notes feed.
- Extracting actions from notes calls the backend OCI GenAI extraction endpoint.
- Extracted actions are persisted to the selected project.
- Extracted actions sync to the project board, person checklist, and dashboard counts.
- Meeting notes are saved to the project notes feed even when extraction produces no action items.
- Meeting Notes shows save/extraction feedback including saved, extracting, and no-action states.
- Saved project notes can be edited from the project notes feed.
- AI action owners are selected only from the current project member list; unknown names remain unassigned.
- If AI is not configured, extraction shows a clear configuration error and does not create mock actions.

## Uploads

- AI companion notes can be uploaded as a text file into the Meeting Notes area.
- Meeting video upload is not part of the current UI.

## Bug DB

- Bug DB is scoped to the selected project.
- Users can paste a Bug DB JSON URL and fetch bug details into the selected project.
- Bug DB URL fetching runs through the backend API.
- Users can upload `.xlsx` or `.csv` bug exports and import bug rows into the selected project.
- Bug DB Excel imports support Bug DB export columns including `RPTNO`, `Bug/Enh Number`, `Subject`, `Status`, `Severity`, `Priority`, and `Assignee`.
- Bug DB imports keep all uploaded spreadsheet columns as project-scoped report fields.
- Uploading another spreadsheet updates matching rows by `Bug/Enh Number` inside the selected project.
- Users can choose which uploaded columns to show in the selected project's report.
- Users can add multiple Filter name and Filter value pairs to narrow the Bug DB report.
- Users can clear all Bug DB report filters at once.
- Users can clear the selected project's Bug DB report before uploading a fresh report.
- Bug DB shows compact summary counts and a simple bug list.

## Out Of Scope For Current Prototype

- Real login/auth.
- Real video transcription.
- Backend-proxied Bug DB integration with authentication and CORS handling.
- Hosted production AI key management.
