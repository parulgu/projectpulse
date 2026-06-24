## MODIFIED Requirements

### Requirement: Persistent Storage
The system shall persist project information.

#### Scenario: Persist projects
- **WHEN** projects are created, modified, archived, or deleted
- **THEN** changes survive application reloads and restarts

#### Scenario: Persist members
- **WHEN** project members are modified
- **THEN** changes survive application reloads and restarts

#### Scenario: Persist actions
- **WHEN** actions are created, updated, or deleted
- **THEN** changes survive application reloads and restarts

#### Scenario: Persist notes
- **WHEN** notes are created or edited
- **THEN** changes survive application reloads and restarts

#### Scenario: Persist decisions
- **WHEN** decisions are created, updated, or deleted
- **THEN** changes survive application reloads and restarts

#### Scenario: Persist milestones
- **WHEN** milestone templates are imported or milestone subtype fields change
- **THEN** changes survive application reloads and restarts

#### Scenario: Persist links
- **WHEN** useful links are modified
- **THEN** changes survive application reloads and restarts

#### Scenario: Persist bug data
- **WHEN** bug information changes
- **THEN** changes survive application reloads and restarts

### Requirement: Bootstrap Data
The system shall provide initialization data for the frontend.

#### Scenario: Application startup
- **WHEN** the frontend loads
- **THEN** bootstrap data is returned

#### Scenario: Bootstrap contents
- **WHEN** bootstrap data is requested
- **THEN** it includes:
  - projects
  - members
  - actions
  - notes
  - decisions
  - template-based milestone phases and subtypes
  - links
  - bug information

#### Scenario: Empty workspace
- **WHEN** no projects exist
- **THEN** bootstrap data returns an empty workspace state

### Requirement: Milestone APIs
The system SHALL support template-based milestone management.

#### Scenario: Import milestone template
- **WHEN** a milestone template import request is received for a project
- **THEN** the backend validates the template
- **AND** replaces that project's existing milestone phases and subtypes with the parsed structure
- **AND** persists the imported milestone plan

#### Scenario: Reject invalid nesting
- **WHEN** a milestone template import request contains nesting deeper than one level
- **THEN** the backend rejects the request with a validation error
- **AND** does not change existing milestone data

#### Scenario: Update milestone subtype
- **WHEN** a subtype title, owner, status, link, or comments changes
- **THEN** the backend persists the update

#### Scenario: Enforce status values
- **WHEN** a milestone subtype status update is received
- **THEN** the backend accepts only `Not Started`, `In Progress`, `Blocked`, `Complete`, or `Not Applicable`

#### Scenario: Project-scoped replacement
- **WHEN** a milestone template is imported into one project
- **THEN** milestone data for other projects remains unchanged

## REMOVED Requirements

### Requirement: Legacy milestone phase APIs
**Reason**: Manual phase create, update, reorder, and delete operations are retired by the template-based tracker.
**Migration**: Use the milestone template import operation to create or replace project phases.

### Requirement: Legacy milestone phase item APIs
**Reason**: Manual phase item create, update, reorder, delete, and complete operations are retired by the template-based tracker.
**Migration**: Use template import to create subtypes and subtype update operations to maintain subtype owner, status, link, and comments.
