# Project Pulse Requirements

## Projects

- Users can create multiple projects.
- Each project has a name, classification, summary, optional epic, optional target release, and role details.
- Project members can be added while creating a project.
- Project members can be edited later as a full comma-separated list.
- Editing members warns when existing action owners will be cleared.
- Projects can be archived and optionally shown again in the sidebar.
- Users can switch between a selected project view and an All Projects view.
- Changing the selected project refreshes actions, notes, decisions, bugs, phases, and useful links for that project.

## Dashboard

- The dashboard shows counts for active, blocked, and done work.
- Counts are based on the selected project in project view.
- The sidebar groups projects by classification.
- The sidebar supports collapsing, project selection, All Projects selection, and archived-project visibility.
- Dashboard sections are organized as tabs:
  - Status by Project
  - Status by Person
  - Meeting Notes
  - Bug DB

## Status By Project

- Shows action items grouped into Active, Blocked, and Done lanes.
- Each action item shows owner or No owner.
- Each action item can show and edit a completion date.
- Action items with completion dates show compact due-date indicators.
- Action items created from meeting notes can show a meeting-date tag.
- Status lanes can be filtered by meeting date.
- Each action item title can be edited.
- Action deletion requires confirmation.

## Status By Person

- Shows a compact checklist of action items.
- Items can be filtered by owner.
- Items can be filtered by status.
- Items can be filtered by meeting date.
- Items can be quickly filtered to overdue work.
- Items are sorted by completion date, then status, then title.
- Items can have no owner.
- Each item can be moved between Active, Blocked, and Done.
- Each item title can be edited from the checklist.
- New action items can be added manually.
- The manual add action form opens from a compact add icon and uses save/cancel icons.
- New action items can include an optional completion date.
- Multiple action rows can be selected and deleted together after confirmation.

## Meeting Notes

- Meeting notes belong to the selected project context.
- Meeting notes start empty for a new project view.
- Meeting Notes shows the latest project notes feed.
- Meeting Notes captures the date when the meeting happened.
- Saved meeting notes show the meeting date in the project notes feed.
- Saved project notes can be edited and deleted from the feed.
- AI companion notes can be uploaded as a text file into the Meeting Notes area.
- Extracting actions from notes calls the backend OCI GenAI extraction endpoint when configured.
- Extraction returns draft actions for review before they are persisted.
- Reviewers can edit or remove extracted draft actions before confirmation.
- Confirmed reviewed actions are persisted to the selected project.
- Extracted actions sync to the project board, person checklist, and dashboard counts.
- Meeting notes are saved to the project notes feed even when extraction produces no action items.
- Meeting Notes shows save/extraction feedback including saved, extracting, and no-action states.
- AI action owners are selected only from the current project member list; unknown names remain unassigned.
- If AI is not configured, extraction shows a clear configuration error and does not create mock actions.

## Decisions And Project Memory

- Project notes can generate decision and blocker suggestions for review.
- Decisions are stored per project with text, owner, status, and decision date.
- Decisions can be created manually and edited or deleted later.
- Project Memory shows a decision log and project notes together in the Meeting Notes area.
- Users can ask project-memory questions against project notes, decisions, actions, and milestones.
- Users can generate an executive summary for a selected project.
- Executive summaries include headline, status, overview, pending work, blocked work, done work, risks, key decisions, customer asks, and next steps.

## Phases And Links

- Each project includes milestone phases with ordered phase items.
- Phases can be created, edited, reordered, and deleted.
- Phase items can be created, edited, reordered, completed, and deleted.
- Projects can store useful links with name, address, and link text.
- Useful links can be added, edited, and deleted from the project overview.

## Bug DB

- Bug DB is scoped to the selected project.
- Users can paste a Bug DB URL and fetch bug details into the selected project through the backend API.
- Users can save Bug DB queries per project and edit or delete them later.
- Users can upload `.xlsx` or `.csv` bug exports and import bug rows into the selected project.
- Bug DB imports support export columns including `RPTNO`, `Bug/Enh Number`, `Subject`, `Status`, `Severity`, `Priority`, and `Assignee`.
- Bug DB imports keep all uploaded spreadsheet columns as project-scoped report fields.
- Uploading another spreadsheet updates matching rows by `Bug/Enh Number` inside the selected project.
- Users can choose which uploaded columns to show in the selected project's report.
- Users can add multiple Filter name and Filter value pairs to narrow the Bug DB report.
- Users can clear all Bug DB report filters at once.
- Users can clear the selected project's Bug DB report before uploading a fresh report.
- Bug DB shows compact summary counts and a simple bug list.

## Out Of Scope For Current Prototype

- Real login and permissions.
- Real meeting video transcription.
- Hosted production AI key management.
- Full authenticated Bug DB production integration beyond the current local and MCP-backed flows.
