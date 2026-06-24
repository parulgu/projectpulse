## MODIFIED Requirements

### Requirement: Project Memory Knowledge Base
The system shall maintain project knowledge for retrieval.

#### Scenario: Store project notes
- **WHEN** notes are saved
- **THEN** they become available to project memory

#### Scenario: Store actions
- **WHEN** actions are created
- **THEN** they become available to project memory

#### Scenario: Store decisions
- **WHEN** decisions are saved
- **THEN** they become available to project memory

#### Scenario: Store milestone information
- **WHEN** template-based milestone phases and subtypes exist
- **THEN** phase names, subtype titles, owners, statuses, links, and comments become available to project memory

### Requirement: Project Memory Questions
The system shall answer questions about project history.

#### Scenario: Ask project question
- **WHEN** a user submits a project-memory question
- **THEN** the system generates an answer using project knowledge

#### Scenario: Notes-based answer
- **WHEN** relevant notes exist
- **THEN** notes contribute to the answer

#### Scenario: Action-based answer
- **WHEN** relevant actions exist
- **THEN** actions contribute to the answer

#### Scenario: Decision-based answer
- **WHEN** relevant decisions exist
- **THEN** decisions contribute to the answer

#### Scenario: Milestone-based answer
- **WHEN** relevant template-based milestone information exists
- **THEN** milestone phases, subtypes, owners, statuses, links, and comments contribute to the answer

#### Scenario: Project scope
- **WHEN** a question is asked
- **THEN** only the selected project’s information is used

### Requirement: Executive Summaries
The system shall generate project executive summaries.

#### Scenario: Generate summary
- **WHEN** a user requests an executive summary
- **THEN** a project summary is generated

#### Scenario: Summary uses project knowledge
- **WHEN** a summary is generated
- **THEN** project notes contribute to the summary
- **AND** actions contribute to the summary
- **AND** decisions contribute to the summary
- **AND** template-based milestone information contributes to the summary

### Requirement: Persistence
The system shall persist project memory information.

#### Scenario: Persist decisions
- **WHEN** decisions are saved
- **THEN** they survive application reloads

#### Scenario: Persist memory sources
- **WHEN** notes, actions, decisions, and template-based milestones are saved
- **THEN** they remain available for future memory queries

#### Scenario: Persist executive-summary inputs
- **WHEN** project data changes
- **THEN** future summaries reflect the updated project information
