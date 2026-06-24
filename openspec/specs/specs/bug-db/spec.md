Bug Database

Requirement: Project Scoped Bug Data

The system shall maintain bug information within project context.

Scenario: Project bug isolation

* WHEN bug data is imported or refreshed
* THEN it is associated only with the selected project

Scenario: Switch projects

* WHEN the selected project changes
* THEN only bug data belonging to that project is displayed

Scenario: Delete project

* WHEN a project is deleted
* THEN its bug data is removed

⸻

Requirement: Bug Query URLs

The system shall support project-specific Bug DB query URLs.

Scenario: Save query URL

* WHEN a user saves a Bug DB query URL
* THEN the URL is associated with the selected project

Scenario: Display saved URL

* WHEN a Bug DB URL exists
* THEN it is displayed within the Bug DB view

Scenario: Update query URL

* WHEN a query URL changes
* THEN the updated URL is persisted

⸻

Requirement: Refresh Bug Data

The system shall support refreshing bug information.

Scenario: Refresh bugs

* WHEN a user requests a refresh
* THEN bug data is retrieved using the configured Bug DB source

Scenario: Backend refresh

* WHEN a refresh is executed
* THEN retrieval occurs through backend services

Scenario: Replace project bug data

* WHEN refresh succeeds
* THEN only the selected project’s bug data is replaced

Scenario: Refresh progress

* WHEN refresh is running
* THEN progress feedback is displayed

Scenario: Refresh success

* WHEN refresh succeeds
* THEN success feedback is displayed

Scenario: Refresh failure

* WHEN refresh fails
* THEN an error message is displayed

⸻

Requirement: Upload Bug Reports

The system shall support spreadsheet-based bug imports.

Scenario: Upload CSV

* WHEN a CSV file is uploaded
* THEN bug records are imported

Scenario: Upload XLSX

* WHEN an XLSX file is uploaded
* THEN bug records are imported

Scenario: Unsupported file type

* WHEN an unsupported file type is uploaded
* THEN the upload is rejected with a clear error

Scenario: Import project data

* WHEN upload succeeds
* THEN imported bugs are associated with the selected project

⸻

Requirement: Bug Record Management

The system shall support incremental bug imports.

Scenario: New bug

* WHEN an uploaded bug does not already exist
* THEN a new bug record is created

Scenario: Existing bug

* WHEN an uploaded Bug/Enh Number already exists
* THEN the existing bug record is updated

Scenario: Stable bug identifier

* WHEN bug records are processed
* THEN Bug/Enh Number is used as the primary matching identifier

⸻

Requirement: Bug Fields

The system shall support flexible bug reporting.

Scenario: Standard fields

* WHEN bug data is imported
* THEN the system supports:
    * RPTNO
    * Bug/Enh Number
    * Subject
    * Status
    * Severity
    * Priority
    * Assignee

Scenario: Additional fields

* WHEN additional spreadsheet columns exist
* THEN those fields remain available

Scenario: Preserve imported columns

* WHEN bug data is imported
* THEN uploaded columns remain accessible for reporting

⸻

Requirement: Bug Reporting

The system shall provide bug visibility.

Scenario: Display bug list

* WHEN bug data exists
* THEN bug records are displayed

Scenario: Display risk summary

* WHEN bug data exists
* THEN a risk summary is displayed

Scenario: Display imported fields

* WHEN bug records are displayed
* THEN selected fields appear in reports

⸻

Requirement: Column Selection

The system shall support configurable report columns.

Scenario: Select visible columns

* WHEN a user selects columns
* THEN only selected columns are displayed

Scenario: Preserve available fields

* WHEN imported columns exist
* THEN they remain available for selection

⸻

Requirement: Bug Filtering

The system shall support filtering bug reports.

Scenario: Add filter row

* WHEN a user adds a filter
* THEN a filter name and filter value may be specified

Scenario: Multiple filters

* WHEN multiple filters are defined
* THEN all filters are applied together

Scenario: Filter imported fields

* WHEN imported fields exist
* THEN they may be used in filters

Scenario: Clear filters

* WHEN a user clears filters
* THEN all active filters are removed

⸻

Requirement: Saved Queries

The system shall support reusable bug queries.

Scenario: Save query

* WHEN a user saves a query
* THEN it is associated with the selected project

Scenario: Edit query

* WHEN a saved query is modified
* THEN the updated query is persisted

Scenario: Delete query

* WHEN a saved query is removed
* THEN it is deleted

Scenario: Project isolation

* WHEN saved queries exist
* THEN each project maintains its own query set

⸻

Requirement: Clear Bug Reports

The system shall support clearing project bug data.

Scenario: Clear report

* WHEN a user clears a project bug report
* THEN all bug data for the selected project is removed

Scenario: Preserve other projects

* WHEN a project bug report is cleared
* THEN bug data for other projects remains unchanged

⸻

Requirement: Persistence

The system shall persist bug information.

Scenario: Persist imported bugs

* WHEN bug data is imported
* THEN it survives reloads

Scenario: Persist refreshed bugs

* WHEN bug data is refreshed
* THEN it survives reloads

Scenario: Persist queries

* WHEN bug queries are modified
* THEN changes survive reloads

Scenario: Persist report configuration

* WHEN report settings are changed
* THEN they remain associated with the project