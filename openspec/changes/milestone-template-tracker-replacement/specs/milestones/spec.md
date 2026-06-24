## ADDED Requirements

### Requirement: Milestone Template Import
The system SHALL allow users to upload a text milestone template from the Milestones section for the selected project.

#### Scenario: Import valid template
- **WHEN** a user uploads a valid milestone template
- **THEN** the system creates milestone phases from top-level template entries
- **AND** creates milestone subtypes from indented entries
- **AND** associates the imported milestone structure with the selected project

#### Scenario: Import into project without milestones
- **WHEN** the selected project contains no milestone data and a user imports a valid template
- **THEN** the milestone structure is created from the template

#### Scenario: Import into project with existing milestones
- **WHEN** the selected project already contains milestone data and a user imports a valid template
- **THEN** all existing milestone phases for the selected project are removed
- **AND** all existing milestone subtype items for the selected project are removed
- **AND** the imported template becomes the selected project's new milestone structure

### Requirement: Template Hierarchy Validation
The system SHALL support exactly one level of nesting in milestone templates.

#### Scenario: Top-level entries become phases
- **WHEN** a valid template contains non-empty top-level entries
- **THEN** each top-level entry becomes a milestone phase in template order

#### Scenario: Indented entries become subtypes
- **WHEN** a valid template contains one level of indented entries under a phase
- **THEN** each indented entry becomes a milestone subtype under that phase in template order

#### Scenario: Reject additional nesting
- **WHEN** a template contains entries nested deeper than one level
- **THEN** the import is rejected with a validation error
- **AND** existing milestone data for the selected project remains unchanged

### Requirement: Milestone Subtype Fields
The system SHALL maintain editable information for each milestone subtype.

#### Scenario: Subtype fields
- **WHEN** a milestone subtype exists
- **THEN** it supports title, owner, status, link, and comments

#### Scenario: Edit subtype information
- **WHEN** a user updates a subtype owner, status, link, or comments
- **THEN** the changes are persisted

#### Scenario: Display subtype status
- **WHEN** milestone subtypes are displayed
- **THEN** each subtype status is visible in milestone views

### Requirement: Milestone Status Values
The system SHALL restrict milestone subtype status to the supported status values.

#### Scenario: Default status
- **WHEN** a subtype is created from template import
- **THEN** its status defaults to `Not Started`

#### Scenario: Supported status values
- **WHEN** a user edits subtype status
- **THEN** the status can be set only to `Not Started`, `In Progress`, `Blocked`, `Complete`, or `Not Applicable`

#### Scenario: Persist status changes
- **WHEN** a user changes subtype status
- **THEN** the status change is persisted
- **AND** remains visible after reload

### Requirement: Project-Scoped Milestone Plan
The system SHALL maintain imported milestone data within the selected project scope.

#### Scenario: Project isolation
- **WHEN** multiple projects exist and a template is imported into one project
- **THEN** milestone data for other projects remains unchanged

#### Scenario: Switch projects
- **WHEN** the selected project changes
- **THEN** only milestone phases and subtypes for the selected project are displayed

#### Scenario: Persist milestone plan
- **WHEN** milestone template data or subtype fields are modified
- **THEN** the project milestone plan survives reloads

## REMOVED Requirements

### Requirement: Milestone Phases
**Reason**: Manual phase creation, editing, and deletion are replaced by template import.
**Migration**: Users import a milestone template to create or replace the project's phase structure.

### Requirement: Phase Ordering
**Reason**: Manual phase reordering is retired; phase order is defined by the imported template.
**Migration**: Users update the template order and re-import to replace the project milestone structure.

### Requirement: Phase Items
**Reason**: Manual phase item creation, editing, deletion, and completion tracking are replaced by template-derived milestone subtypes with editable fields and status.
**Migration**: Users import a milestone template to create subtypes and then edit subtype owner, status, link, and comments.

### Requirement: Phase Item Ordering
**Reason**: Manual phase item reordering is retired; subtype order is defined by the imported template.
**Migration**: Users update the template order and re-import to replace the project milestone structure.

### Requirement: Milestone Progress
**Reason**: Boolean item completion and derived phase progress are replaced by explicit subtype status values.
**Migration**: Users track milestone lifecycle state with subtype statuses.

## MODIFIED Requirements

### Requirement: Project Planning Context
The system SHALL maintain planning information within project scope.

#### Scenario: Project-scoped milestones
- **WHEN** milestone templates are imported or milestone subtype fields are updated
- **THEN** milestone phases and subtypes belong to exactly one project

#### Scenario: Project-scoped links
- **WHEN** a user adds a link
- **THEN** the link is associated with the selected project

#### Scenario: Switch projects
- **WHEN** the selected project changes
- **THEN** only milestones and links for the selected project are displayed

### Requirement: Persistence
The system SHALL persist planning information.

#### Scenario: Persist milestone template plan
- **WHEN** milestone templates are imported or subtype fields are modified
- **THEN** changes survive reloads

#### Scenario: Persist links
- **WHEN** useful links are modified
- **THEN** changes survive reloads
