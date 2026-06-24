Project Memory

Requirement: Decision Management

The system shall support project-scoped decision tracking.

Scenario: Create decision

* WHEN a user creates a decision
* THEN the decision is associated with the selected project

Scenario: Store decision details

* WHEN a decision is saved
* THEN it may contain:
    * decision text
    * owner
    * status
    * decision date

Scenario: Edit decision

* WHEN a user edits a decision
* THEN the updated decision is persisted

Scenario: Delete decision

* WHEN a user deletes a decision
* THEN the decision is removed from the project

Scenario: Project isolation

* WHEN decisions exist in multiple projects
* THEN each project displays only its own decisions

⸻

Requirement: Decision Log

The system shall maintain a history of project decisions.

Scenario: Display decision log

* WHEN decisions exist
* THEN they are displayed within project memory views

Scenario: Decision persistence

* WHEN decisions are saved
* THEN they remain available after reloads

Scenario: Decision ordering

* WHEN multiple decisions exist
* THEN decisions remain available as historical project records

⸻

Requirement: Project Memory Knowledge Base

The system shall maintain project knowledge for retrieval.

Scenario: Store project notes

* WHEN notes are saved
* THEN they become available to project memory

Scenario: Store actions

* WHEN actions are created
* THEN they become available to project memory

Scenario: Store decisions

* WHEN decisions are saved
* THEN they become available to project memory

Scenario: Store milestone information

* WHEN milestone information exists
* THEN it becomes available to project memory

⸻

Requirement: Project Memory Questions

The system shall answer questions about project history.

Scenario: Ask project question

* WHEN a user submits a project-memory question
* THEN the system generates an answer using project knowledge

Scenario: Notes-based answer

* WHEN relevant notes exist
* THEN notes contribute to the answer

Scenario: Action-based answer

* WHEN relevant actions exist
* THEN actions contribute to the answer

Scenario: Decision-based answer

* WHEN relevant decisions exist
* THEN decisions contribute to the answer

Scenario: Milestone-based answer

* WHEN relevant milestone information exists
* THEN milestone information contributes to the answer

Scenario: Project scope

* WHEN a question is asked
* THEN only the selected project’s information is used

⸻

Requirement: Executive Summaries

The system shall generate project executive summaries.

Scenario: Generate summary

* WHEN a user requests an executive summary
* THEN a project summary is generated

Scenario: Summary uses project knowledge

* WHEN a summary is generated
* THEN project notes contribute to the summary
* AND actions contribute to the summary
* AND decisions contribute to the summary
* AND milestone information contributes to the summary

⸻

Requirement: Executive Summary Structure

The system shall generate consistent summary sections.

Scenario: Summary sections

* WHEN an executive summary is generated
* THEN it includes:
    * Headline
    * Status
    * Overview
    * Pending Work
    * Blocked Work
    * Done Work
    * Risks
    * Key Decisions
    * Customer Asks
    * Next Steps

⸻

Requirement: Project Context Preservation

The system shall maintain project-scoped knowledge.

Scenario: Project isolation

* WHEN multiple projects exist
* THEN memory content remains isolated per project

Scenario: Project switch

* WHEN the selected project changes
* THEN project memory reflects the newly selected project

Scenario: Archived project

* WHEN a project is archived
* THEN its memory remains associated with that project

⸻

Requirement: Persistence

The system shall persist project memory information.

Scenario: Persist decisions

* WHEN decisions are saved
* THEN they survive application reloads

Scenario: Persist memory sources

* WHEN notes, actions, and milestones are saved
* THEN they remain available for future memory queries

Scenario: Persist executive-summary inputs

* WHEN project data changes
* THEN future summaries reflect the updated project information