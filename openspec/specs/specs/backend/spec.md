Backend Services

Requirement: Persistent Storage

The system shall persist project information.

Scenario: Persist projects

* WHEN projects are created, modified, archived, or deleted
* THEN changes survive application reloads and restarts

Scenario: Persist members

* WHEN project members are modified
* THEN changes survive application reloads and restarts

Scenario: Persist actions

* WHEN actions are created, updated, or deleted
* THEN changes survive application reloads and restarts

Scenario: Persist notes

* WHEN notes are created or edited
* THEN changes survive application reloads and restarts

Scenario: Persist decisions

* WHEN decisions are created, updated, or deleted
* THEN changes survive application reloads and restarts

Scenario: Persist milestones

* WHEN phases or phase items change
* THEN changes survive application reloads and restarts

Scenario: Persist links

* WHEN useful links are modified
* THEN changes survive application reloads and restarts

Scenario: Persist bug data

* WHEN bug information changes
* THEN changes survive application reloads and restarts

⸻

Requirement: Bootstrap Data

The system shall provide initialization data for the frontend.

Scenario: Application startup

* WHEN the frontend loads
* THEN bootstrap data is returned

Scenario: Bootstrap contents

* WHEN bootstrap data is requested
* THEN it includes:
    * projects
    * members
    * actions
    * notes
    * decisions
    * milestones
    * links
    * bug information

Scenario: Empty workspace

* WHEN no projects exist
* THEN bootstrap data returns an empty workspace state

⸻

Requirement: Project APIs

The system shall support project management operations.

Scenario: Create project

* WHEN a project creation request is received
* THEN the project is persisted

Scenario: Update project

* WHEN project information changes
* THEN the updated values are persisted

Scenario: Archive project

* WHEN a project is archived
* THEN archived state is persisted

Scenario: Delete project

* WHEN a project is deleted
* THEN associated project-scoped data is removed

⸻

Requirement: Member APIs

The system shall support member management.

Scenario: Add member

* WHEN a member is added
* THEN the member is associated with the project

Scenario: Replace member list

* WHEN the project member list is updated
* THEN the new member list replaces the previous list

Scenario: Remove member ownership

* WHEN removed members own actions
* THEN affected actions become unassigned

⸻

Requirement: Action APIs

The system shall support action management.

Scenario: Create action

* WHEN an action is created
* THEN it is persisted

Scenario: Update action

* WHEN title, owner, status, completion date, or meeting date changes
* THEN the update is persisted

Scenario: Delete action

* WHEN an action is deleted
* THEN it is removed

Scenario: Bulk delete actions

* WHEN multiple actions are deleted
* THEN all selected actions are removed

⸻

Requirement: Notes APIs

The system shall support meeting-note management.

Scenario: Create note

* WHEN a note is saved
* THEN it is persisted

Scenario: Update note

* WHEN a note is edited
* THEN changes are persisted

Scenario: Store meeting date

* WHEN a meeting date exists
* THEN it is stored with the note

⸻

Requirement: Decision APIs

The system shall support decision management.

Scenario: Create decision

* WHEN a decision is created
* THEN it is persisted

Scenario: Update decision

* WHEN a decision changes
* THEN the update is persisted

Scenario: Delete decision

* WHEN a decision is removed
* THEN it is deleted

⸻

Requirement: Milestone APIs

The system shall support milestone management.

Scenario: Maintain phases

* WHEN phases are created, modified, reordered, or deleted
* THEN changes are persisted

Scenario: Maintain phase items

* WHEN phase items are created, modified, reordered, completed, or deleted
* THEN changes are persisted

⸻

Requirement: Useful Link APIs

The system shall support project link management.

Scenario: Create link

* WHEN a link is added
* THEN it is persisted

Scenario: Update link

* WHEN a link is modified
* THEN changes are persisted

Scenario: Delete link

* WHEN a link is removed
* THEN it is deleted

⸻

Requirement: Bug APIs

The system shall support bug management.

Scenario: Refresh bug data

* WHEN bug refresh is requested
* THEN refreshed bug data is stored for the selected project

Scenario: Upload bug report

* WHEN a bug report is uploaded
* THEN imported bug data is stored for the selected project

Scenario: Clear bug report

* WHEN project bug data is cleared
* THEN only the selected project’s bug information is removed

Scenario: Manage saved queries

* WHEN saved bug queries are created, modified, or deleted
* THEN changes are persisted

⸻

Requirement: AI Extraction APIs

The system shall support action extraction workflows.

Scenario: Extract actions

* WHEN extraction is requested
* THEN extracted draft actions are returned

Scenario: Confirm reviewed actions

* WHEN reviewed actions are confirmed
* THEN actions are persisted

Scenario: Extraction failure

* WHEN extraction cannot be completed
* THEN a clear error is returned

⸻

Requirement: Project Memory APIs

The system shall support project-memory operations.

Scenario: Ask project question

* WHEN a project-memory question is submitted
* THEN an answer is returned

Scenario: Generate executive summary

* WHEN a summary is requested
* THEN a project summary is returned

⸻

Requirement: Project Scoped Data Isolation

The system shall isolate project data.

Scenario: Project ownership

* WHEN project-scoped data is created
* THEN it belongs to exactly one project

Scenario: Data retrieval

* WHEN project data is requested
* THEN only information belonging to the requested project is returned

Scenario: Delete project

* WHEN a project is deleted
* THEN associated project-scoped data is removed

Scenario: Preserve unrelated projects

* WHEN data is modified in one project
* THEN data belonging to other projects remains unchanged

⸻

Requirement: Error Handling

The system shall provide actionable errors.

Scenario: Validation error

* WHEN invalid data is submitted
* THEN a clear validation error is returned

Scenario: Configuration error

* WHEN required configuration is missing
* THEN a clear setup error is returned

Scenario: Processing failure

* WHEN an operation fails
* THEN a meaningful error is returned

Scenario: Successful operation

* WHEN an operation succeeds
* THEN success is communicated through the API response