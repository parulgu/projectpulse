Milestones And Planning

Requirement: Milestone Phases

The system shall support project milestone phases.

Scenario: Create phase

* WHEN a user creates a phase
* THEN the phase is associated with the selected project

Scenario: Edit phase

* WHEN a user updates phase information
* THEN the changes are persisted

Scenario: Delete phase

* WHEN a user deletes a phase
* THEN the phase is removed

Scenario: Project isolation

* WHEN phases exist across multiple projects
* THEN each project’s phases remain independent

⸻

Requirement: Phase Ordering

The system shall support ordered milestone phases.

Scenario: Reorder phase

* WHEN a phase is moved
* THEN the updated ordering is persisted

Scenario: Display ordered phases

* WHEN phases are displayed
* THEN they appear in their defined order

⸻

Requirement: Phase Items

The system shall support checklist items within phases.

Scenario: Create phase item

* WHEN a user creates a phase item
* THEN it is associated with a phase

Scenario: Edit phase item

* WHEN a user updates a phase item
* THEN the changes are persisted

Scenario: Delete phase item

* WHEN a user deletes a phase item
* THEN it is removed

Scenario: Complete phase item

* WHEN a phase item is marked complete
* THEN its completion status is persisted

⸻

Requirement: Phase Item Ordering

The system shall support ordered phase items.

Scenario: Reorder phase item

* WHEN a phase item is moved
* THEN the updated ordering is persisted

Scenario: Display ordered phase items

* WHEN phase items are displayed
* THEN they appear in their defined order

⸻

Requirement: Milestone Progress

The system shall provide milestone progress information.

Scenario: Phase progress

* WHEN phase items exist
* THEN phase progress is derived from item completion state

Scenario: Phase status

* WHEN phase progress changes
* THEN phase status reflects current progress

⸻

Requirement: Useful Links

The system shall support project reference links.

Scenario: Create link

* WHEN a user adds a link
* THEN the link is associated with the selected project

Scenario: Edit link

* WHEN a user updates a link
* THEN the changes are persisted

Scenario: Delete link

* WHEN a user removes a link
* THEN the link is deleted

⸻

Requirement: Link Information

The system shall store project resource references.

Scenario: Save link details

* WHEN a link is created
* THEN it may contain:
    * name
    * address
    * display text

Scenario: Display links

* WHEN project links exist
* THEN they are available from the project overview

⸻

Requirement: Project Planning Context

The system shall maintain planning information within project scope.

Scenario: Project-scoped milestones

* WHEN milestones are created
* THEN they belong to exactly one project

Scenario: Project-scoped links

* WHEN links are created
* THEN they belong to exactly one project

Scenario: Switch projects

* WHEN the selected project changes
* THEN only milestones and links for the selected project are displayed

⸻

Requirement: Persistence

The system shall persist planning information.

Scenario: Persist phases

* WHEN phases are modified
* THEN changes survive reloads

Scenario: Persist phase items

* WHEN phase items are modified
* THEN changes survive reloads

Scenario: Persist links

* WHEN links are modified
* THEN changes survive reloads