Meeting Notes

Requirement: Project Scoped Notes

The system shall store notes within project context.

Scenario: Create note

* WHEN a user saves meeting notes
* THEN the notes are associated with the selected project

Scenario: Separate project notes

* WHEN multiple projects exist
* THEN each project’s notes remain isolated

Scenario: Switch projects

* WHEN the selected project changes
* THEN only notes belonging to that project are displayed

⸻

Requirement: Meeting Dates

The system shall track when meetings occurred.

Scenario: Save meeting date

* WHEN a meeting date is supplied
* THEN the meeting date is stored with the note

Scenario: Display meeting date

* WHEN a note has a meeting date
* THEN the meeting date is displayed in the notes feed

Scenario: Edit meeting date

* WHEN a note’s meeting date is updated
* THEN the updated date is persisted

⸻

Requirement: Note Feed

The system shall maintain a project notes history.

Scenario: Save note to feed

* WHEN note extraction completes successfully
* THEN the note is added to the project notes feed

Scenario: Save note without actions

* WHEN extraction produces no actions
* THEN the note is still saved

Scenario: Display note feed

* WHEN notes exist
* THEN they are displayed in chronological feed form

Scenario: Feed location

* WHEN the Meeting Notes view is displayed
* THEN the notes feed appears below the notes workspace

⸻

Requirement: Collapsible Feed

The system shall minimize note history clutter.

Scenario: Feed collapsed by default

* WHEN a project is opened
* THEN the notes feed is collapsed

Scenario: Expand feed

* WHEN a user expands the feed
* THEN saved notes become visible

Scenario: Collapse feed

* WHEN a user collapses the feed
* THEN note history is hidden

Scenario: Project switch

* WHEN the selected project changes
* THEN the notes feed returns to collapsed state

⸻

Requirement: Edit Notes

The system shall support correcting saved notes.

Scenario: Edit note text

* WHEN a saved note is edited
* THEN the updated text is persisted

Scenario: Persist edits

* WHEN a note edit is saved
* THEN changes survive reloads

Scenario: Edit meeting date

* WHEN a note’s meeting date changes
* THEN the updated meeting date is persisted

⸻

Requirement: AI Companion Notes Upload

The system shall support importing meeting content.

Scenario: Upload companion notes

* WHEN a user uploads a supported text file
* THEN the file contents populate the notes editor

Scenario: Display uploaded file

* WHEN a file is uploaded
* THEN the uploaded filename is displayed

Scenario: Upload error

* WHEN a file cannot be processed
* THEN an upload error is displayed

⸻

Requirement: Meeting Workspace

The system shall provide a dedicated workspace for project updates.

Scenario: Open Meeting Notes

* WHEN a user navigates to Meeting Notes
* THEN note entry controls are available

Scenario: Empty note editor

* WHEN a new workspace is opened
* THEN the note editor starts empty

Scenario: Maintain project context

* WHEN notes are entered
* THEN all activity remains associated with the selected project

⸻

Requirement: Project Updates

The system shall surface project updates within Meeting Notes.

Scenario: Display latest updates

* WHEN project updates exist
* THEN they are displayed within the Meeting Notes area

Scenario: Consolidated workflow

* WHEN users review updates
* THEN updates and meeting notes appear within the same workspace

Scenario: Persist update history

* WHEN updates are created
* THEN they remain available in the project history

⸻

Requirement: Extraction Feedback

The system shall provide clear extraction status.

Scenario: Extracting

* WHEN extraction is in progress
* THEN extracting status is displayed

Scenario: Note saved

* WHEN note persistence succeeds
* THEN save confirmation is displayed

Scenario: No actions found

* WHEN extraction produces no actions
* THEN no-action feedback is displayed

Scenario: Extraction failure

* WHEN extraction fails
* THEN an error message is displayed

⸻

Requirement: Project Scoped Memory Source

The system shall preserve information used by downstream AI workflows.

Scenario: Save note for memory

* WHEN a note is stored
* THEN it becomes available to project memory workflows

Scenario: Save note for summaries

* WHEN a note is stored
* THEN it becomes available to executive summary generation

Scenario: Save note for decisions

* WHEN decisions are derived from notes
* THEN the originating project context is preserved

⸻

Requirement: Data Persistence

The system shall persist note-related information.

Scenario: Persist notes

* WHEN notes are saved
* THEN they survive application reloads

Scenario: Persist meeting dates

* WHEN meeting dates are saved
* THEN they survive application reloads

Scenario: Persist note edits

* WHEN edited notes are saved
* THEN changes survive application reloads