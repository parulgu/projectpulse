import { Component, useEffect, useMemo, useRef, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_PROJECT_PULSE_API_URL ?? "http://127.0.0.1:8000/api";

const actionStatuses = [
  { label: "Active", value: "active", tone: "active" },
  { label: "Blocked", value: "blocked", tone: "blocked" },
  { label: "Done", value: "done", tone: "done" },
];

const actionStatusRank = { active: 0, blocked: 1, done: 2 };

const dashboardTabs = [
  { id: "status", label: "Status by Project" },
  { id: "people", label: "Status by Person" },
  { id: "notes", label: "Meeting Notes" },
  { id: "bugs", label: "Bug DB" },
];

class DashboardErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <section className="empty-guidance" role="alert">
          <strong>Could not render this dashboard view.</strong>
          <p>{this.state.error.message}</p>
        </section>
      );
    }

    return this.props.children;
  }
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(payload.error || `Request failed with status ${response.status}`);
  }

  return payload;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.split(",", 2)[1] ?? "");
    };
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });
}

function labelForClassification(classification) {
  return classification
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => (part.length <= 2 ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}

function normalizeName(name) {
  return name.trim().replace(/\s+/g, " ");
}

function parseMembers(value) {
  const seen = new Set();
  return value
    .split(",")
    .map(normalizeName)
    .filter((member) => {
      const key = member.toLowerCase();
      if (!member || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function initials(name) {
  if (!name) return "--";
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function todayDateInputValue() {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  return today.toISOString().slice(0, 10);
}

function formatDisplayDate(value) {
  if (!value) return "";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

function parseDateOnly(value) {
  if (!value) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dueDateDetails(action) {
  const dueDate = parseDateOnly(action.completionDate);
  if (!dueDate) return null;
  if (action.status === "done") return { label: "Done", tone: "done" };

  const today = new Date();
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const daysUntilDue = Math.round((dueDate.getTime() - todayOnly.getTime()) / 86400000);

  if (daysUntilDue < 0) return { label: "Overdue", tone: "overdue" };
  if (daysUntilDue === 0) return { label: "Due today", tone: "today" };
  if (daysUntilDue === 1) return { label: "Due tomorrow", tone: "soon" };
  if (daysUntilDue <= 7) return { label: `Due in ${daysUntilDue}d`, tone: "soon" };
  return { label: `Due ${formatDisplayDate(action.completionDate)}`, tone: "later" };
}

function compareActionsByDueDateAndStatus(a, b) {
  const aDate = parseDateOnly(a.completionDate)?.getTime() ?? Number.POSITIVE_INFINITY;
  const bDate = parseDateOnly(b.completionDate)?.getTime() ?? Number.POSITIVE_INFINITY;
  if (aDate !== bDate) return aDate - bDate;

  const aStatus = actionStatusRank[a.status] ?? 99;
  const bStatus = actionStatusRank[b.status] ?? 99;
  if (aStatus !== bStatus) return aStatus - bStatus;

  const aCreated = new Date(a.createdAt || 0).getTime();
  const bCreated = new Date(b.createdAt || 0).getTime();
  if (aCreated !== bCreated) return bCreated - aCreated;

  if ((a.id ?? 0) !== (b.id ?? 0)) return (b.id ?? 0) - (a.id ?? 0);

  return String(a.title).localeCompare(String(b.title));
}

function dedupeActionsForDisplay(actions) {
  const seen = new Set();
  const deduped = [];
  for (const action of actions) {
    const key = [
      normalizeName(action.title).toLowerCase(),
      normalizeName(action.owner || "").toLowerCase(),
      action.status,
      action.completionDate || "",
      action.meetingDate || "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(action);
  }
  return deduped;
}

function includesFilter(value, filter) {
  return String(value ?? "").toLowerCase().includes(filter.trim().toLowerCase());
}

function actionMeetingDates(actions) {
  return Array.from(new Set(actions.map((action) => action.meetingDate).filter(Boolean))).sort((a, b) =>
    String(b).localeCompare(String(a)),
  );
}

function ActionMeetingTag({ action }) {
  if (!action.meetingDate) return null;
  return <span className="meta-pill meeting">Meeting {formatDisplayDate(action.meetingDate)}</span>;
}

function makeDraftActionId() {
  return `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const preferredBugReportColumns = ["rptno", "subject", "status", "severity", "product_id", "raw_updated_date", "reported_by", "component", "assignee"];
const bugColumnAliases = {
  "Bug/Enh Number": "rptno",
  RPTNO: "rptno",
  Assignee: "assignee",
  Priority: "priority",
  Severity: "severity",
  Status: "status",
  Subject: "subject",
};
const emptyBugQuery = {
  assignee: "",
  component: "",
  productId: "",
  reportedBy: "",
  rptno: "",
  severity: "",
  status: "",
};

function bugQueryHasValue(query) {
  return Object.values(query).some((value) => String(value ?? "").trim());
}

function bugFieldValue(bug, column) {
  const fields = bug.fields ?? {};
  const fallbackFields = {
    "Bug/Enh Number": bug.id,
    rptno: bug.id,
    Subject: bug.title,
    subject: bug.title,
    Status: bug.status,
    status: bug.status,
    Severity: bug.severity,
    severity: bug.severity,
    Priority: bug.priority,
    priority: bug.priority,
    Assignee: bug.assignee,
    assignee: bug.assignee,
    product_id: fields.product_id,
    reported_by: fields.reported_by,
    component: fields.component,
  };
  const aliasMatches = Object.entries(bugColumnAliases)
    .filter(([, canonicalColumn]) => canonicalColumn === column)
    .map(([alias]) => fields[alias])
    .find((value) => value !== undefined && value !== "");
  const value = fields[column] ?? aliasMatches ?? fallbackFields[column] ?? "";
  return column === "status" ? String(value).replace(/^Status\s+/i, "") : value;
}

function bugColumnLabel(column) {
  const labels = {
    "Bug/Enh Number": "Bug No",
    rptno: "Bug No",
    product_id: "Product ID",
    raw_updated_date: "Reported Date",
    reported_by: "Reported By",
  };
  return labels[column] ?? column;
}

function orderedBugColumns(bugs) {
  const seen = new Set();
  const columns = [];
  bugs.forEach((bug) => {
    Object.keys(bug.fields ?? {}).forEach((column) => {
      const canonicalColumn = bugColumnAliases[column] ?? column;
      if (canonicalColumn && !seen.has(canonicalColumn)) {
        seen.add(canonicalColumn);
        columns.push(canonicalColumn);
      }
    });
  });

  const preferred = preferredBugReportColumns.filter((column) => seen.has(column));
  const remaining = columns
    .filter((column) => !preferred.includes(column))
    .sort((a, b) => String(a).localeCompare(String(b)));
  return [...preferred, ...remaining];
}

function defaultBugColumns(availableColumns) {
  const preferred = preferredBugReportColumns.filter((column) => availableColumns.includes(column));
  const remaining = availableColumns.filter((column) => !preferred.includes(column));
  return [...preferred, ...remaining];
}

function defaultBugFilters(availableColumns) {
  return [{ id: "filter-1", column: availableColumns[0] ?? "", value: "" }];
}

function bugGridTemplate(columns) {
  return columns
    .map((column) => (column.toLowerCase().includes("subject") ? "minmax(220px, 1.5fr)" : "minmax(96px, 0.8fr)"))
    .join(" ");
}

function compareBugValues(leftValue, rightValue) {
  const left = String(leftValue ?? "").trim();
  const right = String(rightValue ?? "").trim();
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (left && right && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function ProjectPulseLogo() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg className="brand-logo" viewBox="0 0 40 40" focusable="false">
        <rect className="brand-logo-bg" x="1" y="1" width="38" height="38" rx="10" />
        <circle className="brand-logo-node secondary" cx="11" cy="13" r="3" />
        <circle className="brand-logo-node primary" cx="30" cy="13" r="3.5" />
        <path className="brand-logo-pulse" d="M8 24h6l3.5-10 5 16 4-11 2.5 5h4" />
      </svg>
    </span>
  );
}

function TrashIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 3h6" />
      <path d="M4 7h16" />
      <path d="M6 7l1 14h10l1-14" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M18 6 6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function GripIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 6h.01" />
      <path d="M15 6h.01" />
      <path d="M9 12h.01" />
      <path d="M15 12h.01" />
      <path d="M9 18h.01" />
      <path d="M15 18h.01" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3v12" />
      <path d="M7 8l5-5 5 5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function ColumnsIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 5h16" />
      <path d="M4 12h16" />
      <path d="M4 19h16" />
      <path d="M9 5v14" />
      <path d="M15 5v14" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="7" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 12h.01" />
      <path d="M12 12h.01" />
      <path d="M19 12h.01" />
    </svg>
  );
}

function NewProjectForm({ onCancel, onCreateProject }) {
  const [projectName, setProjectName] = useState("");
  const [classification, setClassification] = useState("");
  const [members, setMembers] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    if (!projectName.trim()) {
      setError("Project name is required.");
      return;
    }

    try {
      await onCreateProject({ classification, members, name: projectName });
      setProjectName("");
      setClassification("");
      setMembers("");
      setError("");
      onCancel();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not create project.");
    }
  }

  return (
    <form className="new-project-form" onSubmit={handleSubmit}>
      <label>
        <span>Project name</span>
        <input
          onChange={(event) => setProjectName(event.target.value)}
          placeholder="Name"
          value={projectName}
        />
      </label>

      <label>
        <span>Classification</span>
        <input
          onChange={(event) => setClassification(event.target.value)}
          placeholder="Work"
          value={classification}
        />
      </label>

      <label>
        <span>Members</span>
        <input
          onChange={(event) => setMembers(event.target.value)}
          placeholder="AA, Priya"
          value={members}
        />
      </label>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="icon-form-actions">
        <button aria-label="Create project" className="icon-action-button confirm" title="Create" type="submit">
          <CheckIcon />
        </button>
        <button aria-label="Cancel project creation" className="icon-action-button" onClick={onCancel} title="Cancel" type="button">
          <XIcon />
        </button>
      </div>
    </form>
  );
}

function Sidebar({
  classificationGroups,
  isCollapsed,
  openClassifications,
  selectedProject,
  onCreateProject,
  onProjectSelect,
  onRequestDeleteProject,
  onToggleSidebar,
  onToggleClassification,
}) {
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  return (
    <aside className="sidebar" aria-label="Project navigation">
      <div className="sidebar-header">
        <div className="brand">
          <ProjectPulseLogo />
          {!isCollapsed ? (
            <div>
              <strong>Project Pulse</strong>
            </div>
          ) : null}
        </div>

        <button
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-pressed={isCollapsed}
          className="sidebar-toggle"
          onClick={onToggleSidebar}
          type="button"
        >
          {isCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
        </button>
      </div>

      {!isCollapsed ? (
        <>
          <button
            aria-expanded={isCreatingProject}
            className="primary-action sidebar-new-project"
            onClick={() => setIsCreatingProject(true)}
            type="button"
          >
            <PlusIcon />
            <span>New Project</span>
          </button>

          {isCreatingProject ? (
            <NewProjectForm
              onCancel={() => setIsCreatingProject(false)}
              onCreateProject={onCreateProject}
            />
          ) : null}

          <section className="sidebar-switcher" aria-label="Project navigator">
            <div className="project-tree">
              {classificationGroups.length ? classificationGroups.map((group) => {
                const isOpen = openClassifications.includes(group.classification);

                return (
                  <div className="project-group" key={group.classification}>
                    <button
                      aria-expanded={isOpen}
                      className="project-group-toggle"
                      onClick={() => onToggleClassification(group.classification)}
                      type="button"
                    >
                      <span>{labelForClassification(group.classification)}</span>
                      <span aria-hidden="true">{isOpen ? "-" : "+"}</span>
                    </button>

                    {isOpen ? (
                      <div className="project-list">
                        {group.projects.map((project) => (
                          <div
                            className={`project-nav-row ${project.id === selectedProject?.id ? "active" : ""}`}
                            key={project.id}
                          >
                            <button
                              aria-current={project.id === selectedProject?.id ? "page" : undefined}
                              className={`project-nav-item ${project.id === selectedProject?.id ? "active" : ""}`}
                              onClick={() => onProjectSelect(project)}
                              type="button"
                            >
                              {project.name}
                            </button>
                            <button
                              aria-label={`Delete ${project.name}`}
                              className="project-delete-button"
                              onClick={() => onRequestDeleteProject(project)}
                              type="button"
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              }) : <p className="sidebar-empty">No projects yet.</p>}
            </div>
          </section>
        </>
      ) : null}
    </aside>
  );
}

function ProjectSummary({
  actions,
  hasProjectNotes,
  isSummarizingProject,
  metrics,
  onSummarizeProject,
  onUpdateMembers,
  selectedProject,
}) {
  const [isEditingMembers, setIsEditingMembers] = useState(false);
  const [memberError, setMemberError] = useState("");
  const [membersValue, setMembersValue] = useState(selectedProject.members.join(", "));
  const [summaryError, setSummaryError] = useState("");
  const nextMembers = parseMembers(membersValue);
  const affectedOwners = [
    ...new Set(
      actions
        .map((action) => action.owner)
        .filter((owner) => owner && !nextMembers.includes(owner)),
    ),
  ];

  useEffect(() => {
    setIsEditingMembers(false);
    setMemberError("");
    setSummaryError("");
    setMembersValue(selectedProject.members.join(", "));
  }, [selectedProject.id, selectedProject.members]);

  async function handleSummaryRequest() {
    try {
      setSummaryError("");
      await onSummarizeProject(selectedProject.id);
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : "Could not summarize project notes.");
    }
  }

  async function handleMembersSubmit(event) {
    event.preventDefault();
    try {
      await onUpdateMembers(membersValue);
      setIsEditingMembers(false);
      setMemberError("");
    } catch (error) {
      setMemberError(error instanceof Error ? error.message : "Could not update members.");
    }
  }

  return (
    <section className="surface project-context" aria-label="Selected project context">
      <div className="project-context-main">
        <div className="project-title-group">
          <h2>{selectedProject.name}</h2>
          <div className="project-meta-line">
            <span>{labelForClassification(selectedProject.classification)}</span>
            <span>{selectedProject.members.length} {selectedProject.members.length === 1 ? "member" : "members"}</span>
            <button
              aria-label="Edit project members"
              className="member-edit-button"
              onClick={() => setIsEditingMembers((isEditing) => !isEditing)}
              type="button"
            >
              <EditIcon />
            </button>
          </div>
        </div>
        <div className="project-summary-tools">
          <div className="metric-pills" aria-label="Project action summary">
            {metrics.map((metric) => (
              <span
                aria-label={`${metric.label}: ${metric.value}`}
                className={`metric-pill ${metric.tone}`}
                key={metric.label}
                title={`${metric.label}: ${metric.value}`}
              >
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </span>
            ))}
          </div>
          <button
            className="secondary-action quiet"
            disabled={isSummarizingProject || !hasProjectNotes}
            onClick={handleSummaryRequest}
            title={hasProjectNotes ? "Summarize project notes" : "Add meeting notes before summarizing"}
            type="button"
          >
            {isSummarizingProject ? "Summarizing" : "Summary"}
          </button>
        </div>
      </div>
      {summaryError ? <p className="form-error light">{summaryError}</p> : null}

      {isEditingMembers ? (
        <form className="member-edit-form" onSubmit={handleMembersSubmit}>
          <label>
            Members
            <input
              onChange={(event) => setMembersValue(event.target.value)}
              placeholder="AA, Priya, Ben"
              value={membersValue}
            />
          </label>
          {affectedOwners.length ? (
            <p className="member-warning" role="status">
              Actions owned by {affectedOwners.join(", ")} will become unassigned.
            </p>
          ) : null}
          {memberError ? <p className="form-error light">{memberError}</p> : null}
          <div className="icon-form-actions">
            <button aria-label="Save members" className="icon-action-button confirm" title="Save" type="submit">
              <CheckIcon />
            </button>
            <button
              aria-label="Cancel member edit"
              className="icon-action-button"
              onClick={() => {
                setIsEditingMembers(false);
                setMemberError("");
                setMembersValue(selectedProject.members.join(", "));
              }}
              title="Cancel"
              type="button"
            >
              <XIcon />
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function DeleteProjectDialog({ project, onCancel, onConfirm }) {
  if (!project) return null;

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-describedby="delete-project-description"
        aria-labelledby="delete-project-title"
        aria-modal="true"
        className="confirmation-dialog"
        role="dialog"
      >
        <div>
          <p className="eyebrow">Confirm delete</p>
          <h2 id="delete-project-title">Delete {project.name}?</h2>
        </div>
        <p id="delete-project-description">
          This removes local actions, updates, and bugs for this project. This cannot be undone.
        </p>
        <div className="dialog-actions">
          <button className="secondary-action" onClick={onCancel} type="button">
            Cancel
          </button>
          <button className="danger-action solid" onClick={onConfirm} type="button">
            Delete
          </button>
        </div>
      </section>
    </div>
  );
}

function DeleteActionDialog({ action, onCancel, onConfirm }) {
  if (!action) return null;

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-describedby="delete-action-description"
        aria-labelledby="delete-action-title"
        aria-modal="true"
        className="confirmation-dialog"
        role="dialog"
      >
        <div>
          <p className="eyebrow">Confirm delete</p>
          <h2 id="delete-action-title">Delete action?</h2>
        </div>
        <p id="delete-action-description">
          This removes "{action.title}" from the selected project. This cannot be undone.
        </p>
        <div className="dialog-actions">
          <button className="secondary-action" onClick={onCancel} type="button">
            Cancel
          </button>
          <button className="danger-action solid" onClick={onConfirm} type="button">
            Delete
          </button>
        </div>
      </section>
    </div>
  );
}

function DeleteActionsDialog({ actions, onCancel, onConfirm }) {
  if (!actions?.length) return null;

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-describedby="delete-actions-description"
        aria-labelledby="delete-actions-title"
        aria-modal="true"
        className="confirmation-dialog"
        role="dialog"
      >
        <div>
          <p className="eyebrow">Confirm delete</p>
          <h2 id="delete-actions-title">Delete {actions.length} actions?</h2>
        </div>
        <p id="delete-actions-description">
          This removes the selected action items from the project. This cannot be undone.
        </p>
        <div className="dialog-actions">
          <button className="secondary-action" onClick={onCancel} type="button">
            Cancel
          </button>
          <button className="danger-action solid" onClick={onConfirm} type="button">
            Delete selected
          </button>
        </div>
      </section>
    </div>
  );
}

function DeleteProjectNoteDialog({ note, onCancel, onConfirm }) {
  if (!note) return null;

  const noteLabel = note.meetingDate ? `Meeting on ${formatDisplayDate(note.meetingDate)}` : "Project note";

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-describedby="delete-note-description"
        aria-labelledby="delete-note-title"
        aria-modal="true"
        className="confirmation-dialog"
        role="dialog"
      >
        <div>
          <p className="eyebrow">Confirm delete</p>
          <h2 id="delete-note-title">Delete project note?</h2>
        </div>
        <p id="delete-note-description">
          This removes "{noteLabel}" from the selected project notes feed. This cannot be undone.
        </p>
        <div className="dialog-actions">
          <button className="secondary-action" onClick={onCancel} type="button">
            Cancel
          </button>
          <button className="danger-action solid" onClick={onConfirm} type="button">
            Delete
          </button>
        </div>
      </section>
    </div>
  );
}

function ProjectSummaryDialog({ onClose, project, summary }) {
  if (!summary) return null;

  const sections = [
    { label: "Pending", items: summary.pending ?? [] },
    { label: "Blocked", items: summary.blocked ?? [] },
    { label: "Done", items: summary.done ?? [] },
    { label: "Key decisions", items: summary.keyDecisions ?? [] },
  ];

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-describedby="project-summary-overview"
        aria-labelledby="project-summary-title"
        aria-modal="true"
        className="confirmation-dialog summary-dialog"
        role="dialog"
      >
        <div className="summary-dialog-header">
          <p className="eyebrow">AI summary</p>
          <h2 id="project-summary-title">{summary.headline || project.name}</h2>
        </div>
        <div className="summary-dialog-body">
          <p id="project-summary-overview">{summary.overview}</p>
          <div className="summary-dialog-sections">
            {sections.map((section) =>
              section.items.length ? (
                <section className="summary-dialog-section" key={section.label}>
                  <strong>{section.label}</strong>
                  <ul>
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ) : null,
            )}
          </div>
        </div>
        <div className="dialog-actions">
          <button className="secondary-action" onClick={onClose} type="button">
            Close
          </button>
        </div>
      </section>
    </div>
  );
}

function BlankDashboard() {
  return (
    <section className="surface blank-dashboard" aria-label="Blank dashboard">
      <div>
        <p className="eyebrow">No projects</p>
        <h2>Start with a blank dashboard</h2>
        <p>
          Your local workspace is empty. Create a project from the left panel to begin tracking status,
          actions, updates, notes, and bugs.
        </p>
      </div>
    </section>
  );
}

function DashboardTabs({ activeTab, onTabChange }) {
  return (
    <div className="dashboard-tabs" aria-label="Dashboard sections">
      {dashboardTabs.map((tab) => (
        <button
          className={`dashboard-tab ${activeTab === tab.id ? "active" : ""}`}
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function ActionOwnerSelect({ action, onOwnerChange, project, variant = "row" }) {
  return (
    <label className={`owner-select-label ${variant}`}>
      <select
        aria-label={`Owner for ${action.title}`}
        onChange={(event) => onOwnerChange(action.id, event.target.value || null)}
        value={action.owner || ""}
      >
        <option value="">Unassigned</option>
        {project.members.map((member) => (
          <option key={member} value={member}>
            {member}
          </option>
        ))}
      </select>
    </label>
  );
}

function ActionCompletionDateInput({ action, onCompletionDateChange, variant = "row" }) {
  return (
    <input
      aria-label={`Completion date for ${action.title}`}
      className={`completion-date-input ${variant}`}
      onChange={(event) => onCompletionDateChange(action.id, event.target.value || null)}
      title="Completion date"
      type="date"
      value={action.completionDate || ""}
    />
  );
}

function ActionDueIndicator({ action }) {
  const details = dueDateDetails(action);
  if (!details) return null;
  return <span className={`due-indicator ${details.tone}`}>{details.label}</span>;
}

function ActionTitleEditor({
  action,
  draftTitle,
  error,
  isEditing,
  onCancel,
  onDraftChange,
  onSave,
  variant = "row",
}) {
  if (isEditing) {
    return (
      <form className={`action-title-edit-form ${variant}`} onSubmit={(event) => onSave(event, action)}>
        <input
          aria-label={`Edit action ${action.title}`}
          onChange={(event) => onDraftChange(event.target.value)}
          value={draftTitle}
        />
        {error ? <p className="form-error light">{error}</p> : null}
        <div className="icon-form-actions">
          <button aria-label="Save action title" className="icon-action-button confirm" title="Save" type="submit">
            <CheckIcon />
          </button>
          <button
            aria-label="Cancel action title edit"
            className="icon-action-button"
            onClick={onCancel}
            title="Cancel"
            type="button"
          >
            <XIcon />
          </button>
        </div>
      </form>
    );
  }

  return <strong className={`action-title-display ${variant}`}>{action.title}</strong>;
}

function StatusBoard({
  actions,
  onActionTitleChange,
  onCleanDuplicates,
  onCompletionDateChange,
  onDeleteAction,
  onDeleteActions,
  onOwnerChange,
  onStatusChange,
  project,
}) {
  const [draftTitle, setDraftTitle] = useState("");
  const [draggedActionId, setDraggedActionId] = useState(null);
  const [dragOverStatus, setDragOverStatus] = useState(null);
  const [editingDateActionId, setEditingDateActionId] = useState(null);
  const [editingOwnerActionId, setEditingOwnerActionId] = useState(null);
  const [editError, setEditError] = useState("");
  const [editingActionId, setEditingActionId] = useState(null);
  const [isDoneExpanded, setIsDoneExpanded] = useState(false);
  const [meetingDateFilter, setMeetingDateFilter] = useState("all");
  const [openActionMenuId, setOpenActionMenuId] = useState(null);
  const [density, setDensity] = useState("compact");

  useEffect(() => {
    setDraftTitle("");
    setDraggedActionId(null);
    setDragOverStatus(null);
    setEditingDateActionId(null);
    setEditingOwnerActionId(null);
    setEditError("");
    setEditingActionId(null);
    setIsDoneExpanded(false);
    setMeetingDateFilter("all");
    setOpenActionMenuId(null);
    setDensity("compact");
  }, [project.id]);

  function beginActionEdit(action) {
    setDraftTitle(action.title);
    setEditingDateActionId(null);
    setEditingOwnerActionId(null);
    setEditError("");
    setEditingActionId(action.id);
    setOpenActionMenuId(null);
  }

  function cancelActionEdit() {
    setDraftTitle("");
    setEditError("");
    setEditingActionId(null);
  }

  async function saveActionEdit(event, action) {
    event.preventDefault();
    if (!draftTitle.trim()) {
      setEditError("Action title is required.");
      return;
    }

    try {
      await onActionTitleChange(action.id, draftTitle);
      cancelActionEdit();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Could not update action.");
    }
  }

  async function handleLaneDrop(event, targetStatus) {
    event.preventDefault();
    const droppedActionId = Number(event.dataTransfer.getData("text/plain") || draggedActionId);
    setDraggedActionId(null);
    setDragOverStatus(null);
    if (!droppedActionId) return;

    const action = actions.find((item) => item.id === droppedActionId);
    if (!action || action.status === targetStatus) return;
    await onStatusChange(droppedActionId, targetStatus);
  }

  const displayActions = dedupeActionsForDisplay(actions);
  const hiddenDuplicateCount = actions.length - displayActions.length;
  const meetingDateOptions = actionMeetingDates(displayActions);
  const filteredDisplayActions = displayActions.filter(
    (action) => meetingDateFilter === "all" || action.meetingDate === meetingDateFilter,
  );
  const actionsByStatus = actionStatuses.reduce((collection, status) => {
    collection[status.value] = filteredDisplayActions
      .filter((action) => action.status === status.value)
      .sort(compareActionsByDueDateAndStatus);
    return collection;
  }, {});

  if (!actions.length) {
    return (
      <section className="empty-guidance">
        <strong>No action items yet</strong>
        <p>Add an action from Status by Person, or extract action items from Meeting Notes.</p>
      </section>
    );
  }

  return (
    <div className={`status-board-wrap ${density}`}>
      {hiddenDuplicateCount || meetingDateOptions.length ? (
        <div className="board-toolbar compact">
          {meetingDateOptions.length ? (
            <label className="compact-filter meeting-filter">
              Meeting
              <select onChange={(event) => setMeetingDateFilter(event.target.value)} value={meetingDateFilter}>
                <option value="all">All</option>
                {meetingDateOptions.map((meetingDateOption) => (
                  <option key={meetingDateOption} value={meetingDateOption}>
                    {formatDisplayDate(meetingDateOption)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {hiddenDuplicateCount ? (
            <button
              className="secondary-action quiet compact"
              onClick={onCleanDuplicates}
              title={`${hiddenDuplicateCount} duplicate actions hidden`}
              type="button"
            >
              Clean duplicates
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="board">
      {actionStatuses.map((status) => {
        const laneActions = actionsByStatus[status.value] ?? [];
        const isCollapsedDone = status.value === "done" && !isDoneExpanded;
        const visibleLaneActions = isCollapsedDone ? [] : laneActions;

        return (
          <section
            aria-label={`${status.label} lane. Drop actions here to mark them ${status.label.toLowerCase()}.`}
            className={`lane ${dragOverStatus === status.value ? "drag-over" : ""}`}
            key={status.value}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setDragOverStatus(null);
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setDragOverStatus(status.value);
            }}
            onDrop={(event) => handleLaneDrop(event, status.value)}
          >
            <div className="lane-header">
              <h3>
                {status.label}
                <span>{laneActions.length}</span>
              </h3>
              {status.value === "done" && laneActions.length ? (
                <button
                  className="lane-toggle"
                  onClick={() => setIsDoneExpanded((expanded) => !expanded)}
                  type="button"
                >
                  {isDoneExpanded ? "Collapse" : "Expand"}
                </button>
              ) : null}
            </div>
            {isCollapsedDone && laneActions.length ? (
              <p className="empty-state compact">Done actions are collapsed.</p>
            ) : visibleLaneActions.length ? (
              visibleLaneActions.map((action) => (
                <article
                  className={`task-card ${density} ${draggedActionId === action.id ? "dragging" : ""}`}
                  data-action-id={action.id}
                  draggable={editingActionId !== action.id}
                  key={action.id}
                  title="Drag to another lane to change status"
                  onDragEnd={() => {
                    setDraggedActionId(null);
                    setDragOverStatus(null);
                  }}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", String(action.id));
                    setDraggedActionId(action.id);
                    setOpenActionMenuId(null);
                  }}
                >
                  <div className="task-card-header">
                    <div className="task-title-with-handle">
                      <span className="drag-handle" title="Drag to change status">
                        <GripIcon />
                      </span>
                      <ActionTitleEditor
                        action={action}
                        draftTitle={draftTitle}
                        error={editError}
                        isEditing={editingActionId === action.id}
                        onCancel={cancelActionEdit}
                        onDraftChange={setDraftTitle}
                        onSave={saveActionEdit}
                        variant="card"
                      />
                    </div>
                    <span className="action-card-controls">
                      {editingActionId === action.id ? null : (
                        <>
                          <button
                            aria-expanded={openActionMenuId === action.id}
                            aria-label={`More actions for ${action.title}`}
                            className="more-action-button"
                            onClick={() => setOpenActionMenuId((currentId) => (currentId === action.id ? null : action.id))}
                            type="button"
                          >
                            <MoreIcon />
                          </button>
                          {openActionMenuId === action.id ? (
                            <div className="action-menu" role="menu">
                              <button
                                onClick={() => beginActionEdit(action)}
                                role="menuitem"
                                type="button"
                              >
                                <EditIcon />
                                Edit
                              </button>
                              <button
                                className="danger"
                                onClick={() => {
                                  setOpenActionMenuId(null);
                                  onDeleteAction(action);
                                }}
                                role="menuitem"
                                type="button"
                              >
                                <TrashIcon />
                                Delete
                              </button>
                            </div>
                          ) : null}
                        </>
                      )}
                    </span>
                  </div>
                  <div className="owner-line compact">
                    {density === "compact" && editingOwnerActionId !== action.id ? (
                      <button
                        className="meta-pill owner"
                        onClick={() => {
                          setEditingDateActionId(null);
                          setEditingOwnerActionId(action.id);
                        }}
                        type="button"
                      >
                        {action.owner || "Unassigned"}
                      </button>
                    ) : (
                      <ActionOwnerSelect
                        action={action}
                        onOwnerChange={async (actionId, owner) => {
                          await onOwnerChange(actionId, owner);
                          setEditingOwnerActionId(null);
                        }}
                        project={project}
                        variant="card"
                      />
                    )}
                    {density === "compact" && editingDateActionId !== action.id ? (
                      <button
                        className="meta-pill date"
                        onClick={() => {
                          setEditingOwnerActionId(null);
                          setEditingDateActionId(action.id);
                        }}
                        type="button"
                      >
                        {action.completionDate ? formatDisplayDate(action.completionDate) : "No date"}
                      </button>
                    ) : (
                      <ActionCompletionDateInput
                        action={action}
                        onCompletionDateChange={async (actionId, completionDate) => {
                          await onCompletionDateChange(actionId, completionDate);
                          setEditingDateActionId(null);
                        }}
                        variant="card"
                      />
                    )}
                    <ActionDueIndicator action={action} />
                    <ActionMeetingTag action={action} />
                  </div>
                </article>
              ))
            ) : (
              <p className="empty-state">No {status.label.toLowerCase()} actions.</p>
            )}
          </section>
        );
      })}
      </div>
    </div>
  );
}

function ActionsByPerson({
  actions,
  onActionTitleChange,
  onAddAction,
  onCleanDuplicates,
  onCompletionDateChange,
  onDeleteAction,
  onDeleteActions,
  onOwnerChange,
  onStatusChange,
  project,
}) {
  const [completionDate, setCompletionDate] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [editingDateActionId, setEditingDateActionId] = useState(null);
  const [editError, setEditError] = useState("");
  const [editingActionId, setEditingActionId] = useState(null);
  const [editingOwnerActionId, setEditingOwnerActionId] = useState(null);
  const [editingStatusActionId, setEditingStatusActionId] = useState(null);
  const [isAddingAction, setIsAddingAction] = useState(false);
  const [isDoneExpanded, setIsDoneExpanded] = useState(false);
  const [meetingDateFilter, setMeetingDateFilter] = useState("all");
  const [owner, setOwner] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [selectedActionIds, setSelectedActionIds] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [title, setTitle] = useState("");

  useEffect(() => {
    setDraftTitle("");
    setEditingDateActionId(null);
    setEditError("");
    setEditingActionId(null);
    setEditingOwnerActionId(null);
    setEditingStatusActionId(null);
    setIsAddingAction(false);
    setIsDoneExpanded(false);
    setMeetingDateFilter("all");
    setOwnerFilter("all");
    setSelectedActionIds([]);
    setStatusFilter("all");
  }, [project.id]);

  useEffect(() => {
    const validIds = new Set(actions.map((action) => action.id));
    setSelectedActionIds((currentIds) => currentIds.filter((actionId) => validIds.has(actionId)));
  }, [actions]);

  const displayActions = dedupeActionsForDisplay(actions);
  const hiddenDuplicateCount = actions.length - displayActions.length;
  const meetingDateOptions = actionMeetingDates(displayActions);
  const visibleActions = displayActions
    .filter((action) => {
      const ownerMatches =
        ownerFilter === "all" || (ownerFilter === "" ? action.owner === null : action.owner === ownerFilter);
      const statusMatches =
        statusFilter === "all" ||
        (statusFilter === "overdue" ? dueDateDetails(action)?.tone === "overdue" : action.status === statusFilter);
      const meetingDateMatches = meetingDateFilter === "all" || action.meetingDate === meetingDateFilter;
      return ownerMatches && statusMatches && meetingDateMatches;
    })
    .sort(compareActionsByDueDateAndStatus);
  const openActions = visibleActions.filter((action) => action.status !== "done");
  const doneActions = visibleActions.filter((action) => action.status === "done");
  const hasOverdueActions = actions.some((action) => dueDateDetails(action)?.tone === "overdue");
  const selectedActions = actions.filter((action) => selectedActionIds.includes(action.id));
  const allVisibleSelected = visibleActions.length > 0 && visibleActions.every((action) => selectedActionIds.includes(action.id));

  async function handleSubmit(event) {
    event.preventDefault();
    if (!title.trim()) return;
    await onAddAction({
      completionDate: completionDate || null,
      owner: owner || null,
      status: "active",
      title,
    });
    setCompletionDate("");
    setTitle("");
    setIsAddingAction(false);
  }

  function cancelAddAction() {
    setCompletionDate("");
    setOwner("");
    setTitle("");
    setIsAddingAction(false);
  }

  function handleSelectAction(actionId, checked) {
    setSelectedActionIds((currentIds) => {
      if (checked) {
        return currentIds.includes(actionId) ? currentIds : currentIds.concat(actionId);
      }
      return currentIds.filter((currentId) => currentId !== actionId);
    });
  }

  function handleSelectVisibleActions(checked) {
    const visibleIds = visibleActions.map((action) => action.id);
    setSelectedActionIds((currentIds) => {
      if (checked) {
        return Array.from(new Set(currentIds.concat(visibleIds)));
      }
      const visibleIdSet = new Set(visibleIds);
      return currentIds.filter((actionId) => !visibleIdSet.has(actionId));
    });
  }

  function beginActionEdit(action) {
    setDraftTitle(action.title);
    setEditingDateActionId(null);
    setEditError("");
    setEditingActionId(action.id);
    setEditingOwnerActionId(null);
    setEditingStatusActionId(null);
  }

  function cancelActionEdit() {
    setDraftTitle("");
    setEditError("");
    setEditingActionId(null);
  }

  async function saveActionEdit(event, action) {
    event.preventDefault();
    if (!draftTitle.trim()) {
      setEditError("Action title is required.");
      return;
    }

    try {
      await onActionTitleChange(action.id, draftTitle);
      cancelActionEdit();
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Could not update action.");
    }
  }

  function renderActionRow(action) {
    return (
      <article className={`action-row ${action.status}`} data-action-id={action.id} key={action.id}>
        <label className="action-select-control" title="Select action">
          <input
            checked={selectedActionIds.includes(action.id)}
            onChange={(event) => handleSelectAction(action.id, event.target.checked)}
            type="checkbox"
          />
        </label>
        <div className="action-row-main">
          <ActionTitleEditor
            action={action}
            draftTitle={draftTitle}
            error={editError}
            isEditing={editingActionId === action.id}
            onCancel={cancelActionEdit}
            onDraftChange={setDraftTitle}
            onSave={saveActionEdit}
          />
          <span className="action-meta-row">
            {editingOwnerActionId === action.id ? (
              <ActionOwnerSelect
                action={action}
                onOwnerChange={async (actionId, nextOwner) => {
                  await onOwnerChange(actionId, nextOwner);
                  setEditingOwnerActionId(null);
                }}
                project={project}
              />
            ) : (
              <button
                className="meta-pill owner"
                onClick={() => {
                  setEditingDateActionId(null);
                  setEditingStatusActionId(null);
                  setEditingOwnerActionId(action.id);
                }}
                type="button"
              >
                {action.owner || "Unassigned"}
              </button>
            )}
            {editingDateActionId === action.id ? (
              <ActionCompletionDateInput
                action={action}
                onCompletionDateChange={async (actionId, nextDate) => {
                  await onCompletionDateChange(actionId, nextDate);
                  setEditingDateActionId(null);
                }}
              />
            ) : (
              <button
                className="meta-pill date"
                onClick={() => {
                  setEditingOwnerActionId(null);
                  setEditingStatusActionId(null);
                  setEditingDateActionId(action.id);
                }}
                type="button"
              >
                {action.completionDate ? formatDisplayDate(action.completionDate) : "No date"}
              </button>
            )}
            {editingStatusActionId === action.id ? (
              <div className="quick-status-group compact">
                {actionStatuses.map((status) => (
                  <button
                    aria-pressed={action.status === status.value}
                    className={`quick-status ${status.value}`}
                    key={status.value}
                    onClick={async () => {
                      await onStatusChange(action.id, status.value);
                      setEditingStatusActionId(null);
                    }}
                    type="button"
                  >
                    {status.label}
                  </button>
                ))}
              </div>
            ) : (
              <button
                className={`meta-pill status ${action.status}`}
                onClick={() => {
                  setEditingDateActionId(null);
                  setEditingOwnerActionId(null);
                  setEditingStatusActionId(action.id);
                }}
                type="button"
              >
                {actionStatuses.find((status) => status.value === action.status)?.label ?? "Active"}
              </button>
            )}
            <ActionDueIndicator action={action} />
            <ActionMeetingTag action={action} />
          </span>
        </div>
        <span className="action-row-controls visible">
          {editingActionId === action.id ? null : (
            <>
              <button
                aria-label={`Edit ${action.title}`}
                className="action-edit-button"
                onClick={() => beginActionEdit(action)}
                title="Edit action"
                type="button"
              >
                <EditIcon />
              </button>
              <button
                aria-label={`Delete ${action.title}`}
                className="action-delete-button"
                onClick={() => onDeleteAction(action)}
                title="Delete action"
                type="button"
              >
                <TrashIcon />
              </button>
            </>
          )}
        </span>
      </article>
    );
  }

  return (
    <div className="panel-stack">
      <div className="person-controls">
        <div className="filter-row">
          <label className="compact-filter">
            Owner
            <select onChange={(event) => setOwnerFilter(event.target.value)} value={ownerFilter}>
              <option value="all">All</option>
              <option value="">Unassigned</option>
              {project.members.map((member) => (
                <option key={member} value={member}>
                  {member}
                </option>
              ))}
            </select>
          </label>

          <label className="compact-filter">
            Status
            <select onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
              <option value="all">All</option>
              {actionStatuses.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>

          <button
            aria-pressed={statusFilter === "overdue"}
            className="quick-filter overdue"
            disabled={!hasOverdueActions}
            onClick={() => setStatusFilter((currentFilter) => (currentFilter === "overdue" ? "all" : "overdue"))}
            type="button"
          >
            Overdue
          </button>

          {meetingDateOptions.length ? (
            <label className="compact-filter meeting-filter">
              Meeting
              <select onChange={(event) => setMeetingDateFilter(event.target.value)} value={meetingDateFilter}>
                <option value="all">All</option>
                {meetingDateOptions.map((meetingDateOption) => (
                  <option key={meetingDateOption} value={meetingDateOption}>
                    {formatDisplayDate(meetingDateOption)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="inline-check bulk-select">
            <input
              checked={allVisibleSelected}
              disabled={!visibleActions.length}
              onChange={(event) => handleSelectVisibleActions(event.target.checked)}
              type="checkbox"
            />
            <span>Select visible</span>
          </label>

          <button
            className="danger-action compact"
            disabled={!selectedActions.length}
            onClick={() => onDeleteActions(selectedActions)}
            type="button"
          >
            Delete selected{selectedActions.length ? ` (${selectedActions.length})` : ""}
          </button>

          {hiddenDuplicateCount ? (
            <button
              className="secondary-action quiet compact"
              onClick={onCleanDuplicates}
              title={`${hiddenDuplicateCount} duplicate actions hidden`}
              type="button"
            >
              Clean duplicates
            </button>
          ) : null}
        </div>

        <button
          aria-expanded={isAddingAction}
          aria-label="Add action item"
          className="icon-action-button add-action-button"
          onClick={() => setIsAddingAction((isAdding) => !isAdding)}
          title="Add action item"
          type="button"
        >
          <PlusIcon />
        </button>
      </div>

      {isAddingAction ? (
        <form className="inline-form action-add-form" onSubmit={handleSubmit}>
          <label>
            Owner
            <select onChange={(event) => setOwner(event.target.value)} value={owner}>
              <option value="">Unassigned</option>
              {project.members.map((member) => (
                <option key={member} value={member}>
                  {member}
                </option>
              ))}
            </select>
          </label>

          <label>
            Action item
            <input
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Follow up on launch checklist"
              value={title}
            />
          </label>

          <label>
            Complete by
            <input
              onChange={(event) => setCompletionDate(event.target.value)}
              type="date"
              value={completionDate}
            />
          </label>

          <div className="icon-form-actions">
            <button aria-label="Save action item" className="icon-action-button confirm" title="Save" type="submit">
              <CheckIcon />
            </button>
            <button
              aria-label="Cancel action item"
              className="icon-action-button"
              onClick={cancelAddAction}
              title="Cancel"
              type="button"
            >
              <XIcon />
            </button>
          </div>
        </form>
      ) : null}

      <div className="person-checklist">
        {visibleActions.length ? (
          <>
            {openActions.map(renderActionRow)}
            {doneActions.length ? (
              <section className="person-done-group" aria-label="Completed action items">
                <button
                  aria-expanded={isDoneExpanded}
                  className="person-done-toggle"
                  onClick={() => setIsDoneExpanded((expanded) => !expanded)}
                  type="button"
                >
                  <span>Done</span>
                  <strong>{doneActions.length}</strong>
                  <span>{isDoneExpanded ? "Collapse" : "Expand"}</span>
                </button>
                {isDoneExpanded ? (
                  <div className="person-done-list">{doneActions.map(renderActionRow)}</div>
                ) : (
                  <p className="empty-state compact">Done actions are collapsed.</p>
                )}
              </section>
            ) : null}
          </>
        ) : (
          <p className="empty-state">
            {actions.length
              ? "No action items match these filters."
              : "No action items yet. Use the plus button to add one, or extract actions from Meeting Notes."}
          </p>
        )}
      </div>
    </div>
  );
}

function MeetingNotes({
  onConfirmExtractedActions,
  onDeleteProjectNote,
  onExtractActions,
  onSaveProjectNote,
  onUpdateProjectNote,
  project,
  updates,
}) {
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingNoteDate, setEditingNoteDate] = useState("");
  const [editingNoteText, setEditingNoteText] = useState("");
  const [editingDraftActionId, setEditingDraftActionId] = useState(null);
  const [editingDraftSnapshot, setEditingDraftSnapshot] = useState(null);
  const [extractionStatus, setExtractionStatus] = useState(null);
  const [meetingDate, setMeetingDate] = useState(todayDateInputValue());
  const [notes, setNotes] = useState("");
  const [noteSearch, setNoteSearch] = useState("");
  const [preview, setPreview] = useState(null);
  const [extractError, setExtractError] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isFeedExpanded, setIsFeedExpanded] = useState(false);
  const [lastSavedNoteKey, setLastSavedNoteKey] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    setEditingNoteId(null);
    setEditingNoteDate("");
    setEditingNoteText("");
    setEditingDraftActionId(null);
    setEditingDraftSnapshot(null);
    setExtractionStatus(null);
    setIsFeedExpanded(false);
    setLastSavedNoteKey("");
    setMeetingDate(todayDateInputValue());
    setNoteSearch("");
    setPreview(null);
  }, [project.id]);

  const normalizedNoteSearch = noteSearch.trim().toLowerCase();
  const filteredUpdates = normalizedNoteSearch
    ? updates.filter((update) =>
        [
          update.text,
          update.person,
          update.meetingDate,
          update.meetingDate ? formatDisplayDate(update.meetingDate) : "",
          update.createdAt,
        ].some((value) => String(value ?? "").toLowerCase().includes(normalizedNoteSearch)),
      )
    : updates;

  function beginNoteEdit(update) {
    setEditingNoteId(update.id);
    setEditingNoteDate(update.meetingDate || "");
    setEditingNoteText(update.text);
  }

  async function handleNoteUpdate(event) {
    event.preventDefault();
    if (!editingNoteId || !editingNoteText.trim()) return;
    await onUpdateProjectNote(editingNoteId, {
      meetingDate: editingNoteDate || null,
      text: editingNoteText,
    });
    setEditingNoteId(null);
    setEditingNoteDate("");
    setEditingNoteText("");
  }

  async function extractFromNotes(source) {
    if (!notes.trim()) {
      setExtractError("Add notes before extracting actions.");
      return;
    }

    let noteWasSaved = false;

    try {
      setIsExtracting(true);
      setExtractError("");
      setExtractionStatus({ message: "Saving note", tone: "progress" });
      const noteKey = `${project.id}|${meetingDate}|${notes.trim()}`;
      const noteAlreadySaved = noteKey === lastSavedNoteKey;
      const savedNote = noteAlreadySaved ? true : await onSaveProjectNote({ meetingDate, text: notes, source });
      if (savedNote) {
        noteWasSaved = true;
        setLastSavedNoteKey(noteKey);
        setExtractionStatus({ message: "Note saved", tone: "success" });
      }

      setExtractionStatus({ message: "Extracting", tone: "progress" });
      const extraction = await onExtractActions({ meetingDate, notes, source });
      const extractedActions = Array.isArray(extraction.actions)
        ? extraction.actions.map((action) => ({
            completionDate: action.completionDate || "",
            draftId: makeDraftActionId(),
            meetingDate: action.meetingDate || meetingDate || "",
            owner: action.owner || "",
            source: action.source || source,
            status: action.status || "active",
            title: action.title || "",
          }))
        : [];
      const actionsFound = extractedActions.length;
      setExtractionStatus(
        actionsFound
          ? { message: `${actionsFound} actions ready to review`, tone: "success" }
          : { message: "No actions found", tone: "empty" },
      );
      setPreview({
        actions: extractedActions,
        actionsAdded: 0,
        confirmed: false,
        meetingDate,
        points: extraction.points?.length ? extraction.points : [],
        source,
      });
      setEditingDraftActionId(null);
      setEditingDraftSnapshot(null);
    } catch (error) {
      setExtractError(error instanceof Error ? error.message : "Could not extract actions.");
      if (noteWasSaved) {
        setExtractionStatus({ message: "No actions found", tone: "empty" });
        setPreview({
          actions: [],
          actionsAdded: 0,
          points: ["Meeting notes were saved to the project feed.", "No action items were created."],
          source,
        });
      }
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleCompanionNotesUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      if (!text.trim()) {
        throw new Error("The selected file is empty.");
      }

      setNotes(text);
      setUploadedFileName(file.name);
      setUploadError("");
      setPreview({
        actions: [],
        actionsAdded: 0,
        points: [
          `${file.name} was loaded into the notes area.`,
          "Review the text, then extract actions when ready.",
        ],
        source: "AI companion notes",
      });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Could not read this notes file.");
    } finally {
      event.target.value = "";
    }
  }

  function handleDraftActionChange(draftId, field, value) {
    setPreview((currentPreview) => {
      if (!currentPreview) return currentPreview;
      return {
        ...currentPreview,
        actions: currentPreview.actions.map((action) =>
          action.draftId === draftId ? { ...action, [field]: value } : action,
        ),
      };
    });
  }

  function handleAddDraftAction() {
    const draftId = makeDraftActionId();
    setPreview((currentPreview) => {
      const basePreview = currentPreview ?? {
        actions: [],
        actionsAdded: 0,
        confirmed: false,
        meetingDate,
        points: [],
        source: "meeting",
      };
      return {
        ...basePreview,
        confirmed: false,
        actions: basePreview.actions.concat({
          completionDate: "",
          draftId,
          meetingDate: basePreview.meetingDate || meetingDate || "",
          owner: "",
          source: basePreview.source || "meeting",
          status: "active",
          title: "",
        }),
      };
    });
    setEditingDraftActionId(draftId);
    setEditingDraftSnapshot(null);
  }

  function handleDeleteDraftAction(draftId) {
    setPreview((currentPreview) => {
      if (!currentPreview) return currentPreview;
      return {
        ...currentPreview,
        actions: currentPreview.actions.filter((action) => action.draftId !== draftId),
      };
    });
    if (editingDraftActionId === draftId) {
      setEditingDraftActionId(null);
      setEditingDraftSnapshot(null);
    }
  }

  function beginDraftActionEdit(action) {
    setEditingDraftActionId(action.draftId);
    setEditingDraftSnapshot({ ...action });
  }

  function saveDraftActionEdit() {
    setEditingDraftActionId(null);
    setEditingDraftSnapshot(null);
  }

  function cancelDraftActionEdit() {
    if (editingDraftSnapshot) {
      setPreview((currentPreview) => {
        if (!currentPreview) return currentPreview;
        return {
          ...currentPreview,
          actions: currentPreview.actions.map((action) =>
            action.draftId === editingDraftSnapshot.draftId ? editingDraftSnapshot : action,
          ),
        };
      });
    } else if (editingDraftActionId) {
      handleDeleteDraftAction(editingDraftActionId);
      return;
    }
    setEditingDraftActionId(null);
    setEditingDraftSnapshot(null);
  }

  async function handleConfirmDraftActions() {
    if (!preview?.actions?.length) return;
    const actionsToConfirm = preview.actions
      .map((action) => ({
        completionDate: action.completionDate || null,
        meetingDate: action.meetingDate || preview.meetingDate || meetingDate || null,
        owner: action.owner || null,
        source: action.source || preview.source || "meeting",
        status: action.status || "active",
        title: action.title.trim(),
      }))
      .filter((action) => action.title);

    if (!actionsToConfirm.length) {
      setExtractError("Keep at least one action title before adding to the dashboard.");
      return;
    }

    try {
      setIsExtracting(true);
      setExtractError("");
      const confirmedActions = await onConfirmExtractedActions(actionsToConfirm);
      setExtractionStatus({ message: `${confirmedActions.length} actions added`, tone: "success" });
      setPreview((currentPreview) => ({
        ...(currentPreview ?? preview),
        actions: confirmedActions.map((action) => ({ ...action, draftId: makeDraftActionId() })),
        actionsAdded: confirmedActions.length,
        confirmed: true,
      }));
    } catch (error) {
      setExtractError(error instanceof Error ? error.message : "Could not add reviewed actions.");
    } finally {
      setIsExtracting(false);
    }
  }

  return (
    <div className="meeting-notes-stack">
      <div className={`activity-grid ${preview ? "" : "single"}`}>
        <section className="subsurface">
          <div className="section-title">
            <div>
              <h2>Meeting notes</h2>
            </div>
            <button className="secondary-action" disabled={isExtracting} onClick={() => extractFromNotes("meeting")} type="button">
              {isExtracting ? "Extracting" : "Extract"}
            </button>
          </div>
          {extractionStatus ? (
            <p className={`extract-status ${extractionStatus.tone}`} role="status">
              {extractionStatus.message}
            </p>
          ) : null}

          <label className="meeting-date-field">
            Meeting date
            <input
              onChange={(event) => setMeetingDate(event.target.value)}
              type="date"
              value={meetingDate}
            />
          </label>

          <label>
            Notes
            <textarea
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Paste meeting notes or upload AI companion notes"
              rows="9"
              value={notes}
            />
          </label>

          <div className="upload-row">
            <label className="upload-box">
              <span>Upload notes</span>
              <strong>{uploadedFileName || "Choose text file"}</strong>
              <input
                accept=".txt,.md,.markdown,.vtt,.srt,.json,text/plain,text/markdown,text/vtt,application/json"
                className="upload-input"
                onChange={handleCompanionNotesUpload}
                type="file"
              />
            </label>
          </div>
          {uploadError ? <p className="upload-error" role="alert">{uploadError}</p> : null}
          {extractError ? <p className="upload-error" role="alert">{extractError}</p> : null}
        </section>

        {preview ? (
        <section className="subsurface">
          <div className="section-title">
            <div>
              <p className="eyebrow">Extraction result</p>
              <h2>Extracted actions</h2>
            </div>
          </div>
            <article className="insight-card">
              <div className="preview-section">
                <span>Action items</span>
                {preview.actions?.length ? (
                  <div className="extracted-action-list compact">
                    {preview.actions.map((action) =>
                      preview.confirmed ? (
                        <div className="extracted-action-review-row confirmed" key={action.id ?? action.draftId}>
                          <strong>{action.title}</strong>
                        </div>
                      ) : editingDraftActionId === action.draftId ? (
                        <div className="extracted-action-edit-card" key={action.draftId}>
                          <div className="draft-edit-fields">
                            <label className="draft-title-field">
                              Action
                              <input
                                onChange={(event) => handleDraftActionChange(action.draftId, "title", event.target.value)}
                                placeholder="Action item"
                                value={action.title}
                              />
                            </label>
                            <label>
                              Owner
                              <select
                                onChange={(event) => handleDraftActionChange(action.draftId, "owner", event.target.value)}
                                value={action.owner || ""}
                              >
                                <option value="">Unassigned</option>
                                {project.members.map((member) => (
                                  <option key={member} value={member}>
                                    {member}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Status
                              <select
                                onChange={(event) => handleDraftActionChange(action.draftId, "status", event.target.value)}
                                value={action.status}
                              >
                                {actionStatuses.map((status) => (
                                  <option key={status.value} value={status.value}>
                                    {status.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Complete by
                              <input
                                onChange={(event) => handleDraftActionChange(action.draftId, "completionDate", event.target.value)}
                                type="date"
                                value={action.completionDate || ""}
                              />
                            </label>
                          </div>
                          <div className="draft-row-actions">
                            <button
                              aria-label={`Save draft action ${action.title || "untitled"}`}
                              className="icon-action-button confirm"
                              onClick={saveDraftActionEdit}
                              title="Save"
                              type="button"
                            >
                              <CheckIcon />
                            </button>
                            <button
                              aria-label="Cancel draft action edit"
                              className="icon-action-button"
                              onClick={cancelDraftActionEdit}
                              title="Cancel"
                              type="button"
                            >
                              <XIcon />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="extracted-action-review-row" key={action.draftId}>
                          <strong>{action.title || "Untitled action"}</strong>
                          <div className="draft-row-actions">
                            <button
                              aria-label={`Edit draft action ${action.title || "untitled"}`}
                              className="icon-action-button"
                              onClick={() => beginDraftActionEdit(action)}
                              title="Edit"
                              type="button"
                            >
                              <EditIcon />
                            </button>
                            <button
                              aria-label={`Remove draft action ${action.title || "untitled"}`}
                              className="icon-action-button danger"
                              onClick={() => handleDeleteDraftAction(action.draftId)}
                              title="Remove"
                              type="button"
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                ) : (
                  <p className="empty-state compact">No draft actions. Add one before confirming.</p>
                )}
                {preview.confirmed ? null : (
                  <div className="draft-action-toolbar">
                    <button className="secondary-action quiet" onClick={handleAddDraftAction} type="button">
                      Add action
                    </button>
                    <button
                      className="primary-action"
                      disabled={isExtracting || !preview.actions?.some((action) => action.title.trim())}
                      onClick={handleConfirmDraftActions}
                      type="button"
                    >
                      Add reviewed actions
                    </button>
                  </div>
                )}
              </div>
              {preview.actionsAdded ? <p>{preview.actionsAdded} action items were added.</p> : null}
            </article>
        </section>
        ) : null}
      </div>

      <section className="subsurface collapsible-feed">
        <button
          aria-expanded={isFeedExpanded}
          className="feed-toggle"
          onClick={() => setIsFeedExpanded((expanded) => !expanded)}
          type="button"
        >
          <span>
            <strong>Project notes</strong>
            <em>{updates.length}</em>
          </span>
          <span>{isFeedExpanded ? "Collapse" : "Expand"}</span>
        </button>
        {isFeedExpanded ? (
          <div className="feed-content">
            <div className="note-search-row">
              <label>
                Search notes
                <input
                  onChange={(event) => setNoteSearch(event.target.value)}
                  placeholder="Search project notes"
                  type="search"
                  value={noteSearch}
                />
              </label>
              {noteSearch ? (
                <button
                  aria-label="Clear project notes search"
                  className="icon-action-button"
                  onClick={() => setNoteSearch("")}
                  title="Clear search"
                  type="button"
                >
                  <XIcon />
                </button>
              ) : null}
              <span>
                {filteredUpdates.length} of {updates.length}
              </span>
            </div>
            <div className="updates-feed">
              {filteredUpdates.length ? (
                filteredUpdates.map((update) => (
                <article className="update-card" key={update.id}>
                  <div className="card-row">
                    <strong>
                      {update.meetingDate
                        ? `Meeting on ${formatDisplayDate(update.meetingDate)}`
                        : update.person || "General update"}
                    </strong>
                    <span className="note-card-actions">
                      <button
                        aria-label="Edit project note"
                        className="member-edit-button note"
                        onClick={() => beginNoteEdit(update)}
                        title="Edit note"
                        type="button"
                      >
                        <EditIcon />
                      </button>
                      <button
                        aria-label="Delete project note"
                        className="member-edit-button note danger"
                        onClick={() => onDeleteProjectNote(update)}
                        title="Delete note"
                        type="button"
                      >
                        <TrashIcon />
                      </button>
                    </span>
                  </div>
                  {editingNoteId === update.id ? (
                    <form className="note-edit-form" onSubmit={handleNoteUpdate}>
                      <input
                        aria-label="Meeting date"
                        onChange={(event) => setEditingNoteDate(event.target.value)}
                        type="date"
                        value={editingNoteDate}
                      />
                      <textarea
                        aria-label="Project note text"
                        onChange={(event) => setEditingNoteText(event.target.value)}
                        rows="4"
                        value={editingNoteText}
                      />
                      <div className="icon-form-actions">
                        <button aria-label="Save project note" className="icon-action-button confirm" title="Save" type="submit">
                          <CheckIcon />
                        </button>
                        <button
                          aria-label="Cancel project note edit"
                          className="icon-action-button"
                          onClick={() => setEditingNoteId(null)}
                          title="Cancel"
                          type="button"
                        >
                          <XIcon />
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      {update.meetingDate && update.person ? <p className="update-meta">{update.person}</p> : null}
                      <p>{update.text}</p>
                    </>
                  )}
                </article>
              ))
            ) : (
              <p className="empty-state">
                {updates.length
                  ? "No project notes match this search."
                  : "No project notes yet. Paste meeting notes above and extract actions; the notes will be saved here."}
              </p>
            )}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function BugDb({ bugs, lastRefreshedAt, project, refreshError, selectedColumns }) {
  const [sortByProject, setSortByProject] = useState({});
  const availableColumns = useMemo(() => orderedBugColumns(bugs), [bugs]);
  const availableColumnsKey = availableColumns.join("\u001f");
  const sortState = sortByProject?.[project.id] ?? { column: "", direction: "asc" };
  const bugGridStyle = selectedColumns.length
    ? {
        gridTemplateColumns: bugGridTemplate(selectedColumns),
        minWidth: selectedColumns.length > 4 ? `${selectedColumns.length * 126}px` : "100%",
      }
    : undefined;

  useEffect(() => {
    setSortByProject((currentSortByProject) => {
      const safeSortByProject =
        currentSortByProject && typeof currentSortByProject === "object" && !Array.isArray(currentSortByProject)
          ? currentSortByProject
          : {};
      const currentSort = safeSortByProject[project.id];
      if (!currentSort || !currentSort.column || availableColumns.includes(currentSort.column)) return safeSortByProject;
      const { [project.id]: _removedSort, ...remainingSorts } = safeSortByProject;
      return remainingSorts;
    });
  }, [availableColumns, availableColumnsKey, project.id]);

  const sortedBugs = sortState.column
    ? [...bugs].sort((leftBug, rightBug) => {
        const comparison = compareBugValues(bugFieldValue(leftBug, sortState.column), bugFieldValue(rightBug, sortState.column));
        return sortState.direction === "desc" ? -comparison : comparison;
      })
    : bugs;

  function handleSortBugReport(column) {
    setSortByProject((currentSortByProject) => {
      const safeSortByProject =
        currentSortByProject && typeof currentSortByProject === "object" && !Array.isArray(currentSortByProject)
          ? currentSortByProject
          : {};
      const currentSort = safeSortByProject[project.id] ?? { column: "", direction: "asc" };
      const nextDirection = currentSort.column === column && currentSort.direction === "asc" ? "desc" : "asc";
      return { ...safeSortByProject, [project.id]: { column, direction: nextDirection } };
    });
  }

  if (!bugs.length) {
    return (
      <div className="panel-stack">
        {lastRefreshedAt ? <p className="refresh-status">Last refreshed {lastRefreshedAt}</p> : null}
        {refreshError ? <p className="refresh-error" role="alert">{refreshError}</p> : null}
        <section className="empty-guidance bug-empty-state">
          <strong>No Bug DB report loaded</strong>
          <p>Add a URL or upload an Excel/CSV export to load this project report.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="panel-stack">
      {lastRefreshedAt ? <p className="refresh-status">Last refreshed {lastRefreshedAt}</p> : null}
      {refreshError ? <p className="refresh-error" role="alert">{refreshError}</p> : null}

      <div className="bug-list">
        {sortedBugs.length && selectedColumns.length ? (
          <>
            <div className="bug-card bug-card-header" style={bugGridStyle}>
              {selectedColumns.map((column) => (
                <button
                  aria-label={`Sort by ${bugColumnLabel(column)}`}
                  className="bug-sort-button"
                  key={column}
                  onClick={() => handleSortBugReport(column)}
                  type="button"
                >
                  <span>{bugColumnLabel(column)}</span>
                  {sortState.column === column ? <span aria-hidden="true">{sortState.direction === "asc" ? "↑" : "↓"}</span> : null}
                </button>
              ))}
            </div>
            {sortedBugs.map((bug) => (
              <article className="bug-card" key={bug.id} style={bugGridStyle}>
                {selectedColumns.map((column) => {
                  const value = bugFieldValue(bug, column) || "—";
                  return <span key={column} title={String(value)}>{value}</span>;
                })}
              </article>
            ))}
          </>
        ) : (
          <p className="empty-state">
            {bugs.length
              ? "No bugs match the current filter."
              : "No bugs loaded yet. Paste a Bug DB URL above or upload an Excel/CSV export to load the latest results."}
          </p>
        )}
      </div>
    </div>
  );
}

function DashboardPanel({
  activeTab,
  actions,
  bugs,
  bugLastRefreshedAt,
  bugReportVisible,
  bugRefreshError,
  onActionTitleChange,
  onAddAction,
  onCleanDuplicates,
  onClearBugs,
  onCompletionDateChange,
  onConfirmExtractedActions,
  onDeleteAction,
  onDeleteActions,
  onDeleteProjectNote,
  onExtractActions,
  onOwnerChange,
  onSaveProjectNote,
  onStatusChange,
  onUpdateProjectNote,
  project,
  selectedBugColumns,
  updates,
}) {
  if (activeTab === "people") {
    return (
      <ActionsByPerson
        actions={actions}
        onActionTitleChange={onActionTitleChange}
        onAddAction={onAddAction}
        onCleanDuplicates={onCleanDuplicates}
        onCompletionDateChange={onCompletionDateChange}
        onDeleteAction={onDeleteAction}
        onDeleteActions={onDeleteActions}
        onOwnerChange={onOwnerChange}
        onStatusChange={onStatusChange}
        project={project}
      />
    );
  }

  if (activeTab === "notes") {
    return (
      <MeetingNotes
        onConfirmExtractedActions={onConfirmExtractedActions}
        onDeleteProjectNote={onDeleteProjectNote}
        onExtractActions={onExtractActions}
        onSaveProjectNote={onSaveProjectNote}
        onUpdateProjectNote={onUpdateProjectNote}
        project={project}
        updates={updates}
      />
    );
  }

  if (activeTab === "bugs") {
    if (!bugReportVisible) return null;

    return (
      <BugDb
        bugs={bugs}
        lastRefreshedAt={bugLastRefreshedAt}
        project={project}
        refreshError={bugRefreshError}
        selectedColumns={selectedBugColumns}
      />
    );
  }

  return (
    <StatusBoard
      actions={actions}
      onActionTitleChange={onActionTitleChange}
      onCleanDuplicates={onCleanDuplicates}
      onDeleteAction={onDeleteAction}
      onCompletionDateChange={onCompletionDateChange}
      onOwnerChange={onOwnerChange}
      onStatusChange={onStatusChange}
      project={project}
    />
  );
}

function DashboardShell({
  activeTab,
  actions,
  bugs,
  bugQueries = [],
  onActionTitleChange,
  onAddAction,
  onCreateBugQuery,
  onCleanDuplicates,
  onCompletionDateChange,
  onConfirmExtractedActions,
  onClearBugs,
  onDeleteBugQuery,
  onDeleteAction,
  onDeleteActions,
  onDeleteProjectNote,
  onExtractActions,
  onOwnerChange,
  onRefreshBugs,
  onUploadBugs,
  onSaveProjectNote,
  onStatusChange,
  onTabChange,
  onUpdateBugQuery,
  onUpdateProjectNote,
  project,
  updates,
}) {
  const [bugQuery, setBugQuery] = useState(emptyBugQuery);
  const [selectedBugQueryId, setSelectedBugQueryId] = useState("");
  const [bugQueryName, setBugQueryName] = useState("");
  const [reportColumnsByProject, setReportColumnsByProject] = useState({});
  const [isBugColumnPickerOpen, setIsBugColumnPickerOpen] = useState(false);
  const bugColumnPickerRef = useRef(null);
  const [bugLastRefreshedAt, setBugLastRefreshedAt] = useState("");
  const [bugRefreshError, setBugRefreshError] = useState("");
  const [isBugRefreshing, setIsBugRefreshing] = useState(false);
  const [isBugUploading, setIsBugUploading] = useState(false);
  const hasBugQuery = bugQueryHasValue(bugQuery);
  const projectBugQueries = bugQueries.filter((query) => query.projectId === project.id);
  const selectedBugQuery = projectBugQueries.find((query) => String(query.id) === String(selectedBugQueryId)) ?? null;
  const availableBugColumns = useMemo(() => orderedBugColumns(bugs), [bugs]);
  const availableBugColumnsKey = availableBugColumns.join("\u001f");
  const savedReportColumns = reportColumnsByProject?.[project.id];
  const selectedBugColumns = Array.isArray(savedReportColumns) ? savedReportColumns : defaultBugColumns(availableBugColumns);

  useEffect(() => {
    setReportColumnsByProject((currentColumnsByProject) => {
      const safeColumnsByProject =
        currentColumnsByProject && typeof currentColumnsByProject === "object" && !Array.isArray(currentColumnsByProject)
          ? currentColumnsByProject
          : {};
      const currentColumns = Array.isArray(safeColumnsByProject[project.id]) ? safeColumnsByProject[project.id] : [];
      const stillAvailable = currentColumns.filter((column) => availableBugColumns.includes(column));
      const nextColumns = stillAvailable.length ? stillAvailable : defaultBugColumns(availableBugColumns);
      if (currentColumns.join("\u001f") === nextColumns.join("\u001f")) return safeColumnsByProject;
      return { ...safeColumnsByProject, [project.id]: nextColumns };
    });
  }, [availableBugColumns, availableBugColumnsKey, project.id]);

  useEffect(() => {
    if (!isBugColumnPickerOpen) return undefined;

    function handlePointerDown(event) {
      if (bugColumnPickerRef.current?.contains(event.target)) return;
      setIsBugColumnPickerOpen(false);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [isBugColumnPickerOpen]);

  function updateBugQuery(field, value) {
    setBugQuery((currentQuery) => ({ ...currentQuery, [field]: value }));
  }

  function handleReportColumnToggle(column) {
    setReportColumnsByProject((currentColumnsByProject) => {
      const safeColumnsByProject =
        currentColumnsByProject && typeof currentColumnsByProject === "object" && !Array.isArray(currentColumnsByProject)
          ? currentColumnsByProject
          : {};
      const currentColumns = Array.isArray(safeColumnsByProject[project.id])
        ? safeColumnsByProject[project.id]
        : defaultBugColumns(availableBugColumns);
      const nextColumns = currentColumns.includes(column)
        ? currentColumns.filter((currentColumn) => currentColumn !== column)
        : [...currentColumns, column];
      return { ...safeColumnsByProject, [project.id]: nextColumns.length ? nextColumns : currentColumns };
    });
  }

  function handleSelectSavedBugQuery(queryId) {
    setSelectedBugQueryId(queryId);
    const savedQuery = projectBugQueries.find((query) => String(query.id) === String(queryId));
    if (savedQuery) {
      setBugQueryName(savedQuery.name);
      setBugQuery({ ...emptyBugQuery, ...savedQuery.query });
    } else {
      setBugQueryName("");
    }
  }

  function handleNewBugQuery() {
    setSelectedBugQueryId("");
    setBugQueryName("");
    setBugQuery(emptyBugQuery);
  }

  async function handleSaveBugQuery() {
    const name = normalizeName(bugQueryName);
    if (!hasBugQuery || !name) return;
    try {
      const sameSelectedName = selectedBugQuery && normalizeName(selectedBugQuery.name).toLowerCase() === name.toLowerCase();
      if (sameSelectedName) {
        const saved = await onUpdateBugQuery(selectedBugQuery.id, { name, query: bugQuery });
        setSelectedBugQueryId(String(saved.id));
        setBugQueryName(saved.name);
        return;
      }
      const saved = await onCreateBugQuery(project.id, { name, query: bugQuery });
      setSelectedBugQueryId(String(saved.id));
      setBugQueryName(saved.name);
    } catch (error) {
      setBugRefreshError(error instanceof Error ? error.message : "Could not save Bug DB query.");
    }
  }

  async function handleDeleteSavedBugQuery() {
    if (!selectedBugQuery) return;
    if (!window.confirm(`Delete saved query "${selectedBugQuery.name}"?`)) return;
    try {
      await onDeleteBugQuery(selectedBugQuery.id);
      handleNewBugQuery();
    } catch (error) {
      setBugRefreshError(error instanceof Error ? error.message : "Could not delete Bug DB query.");
    }
  }

  async function handleRefreshBugs(event) {
    event.preventDefault();
    if (!hasBugQuery) return;

    setIsBugRefreshing(true);
    setBugRefreshError("");

    try {
      await onRefreshBugs(project.id, bugQuery);
      setBugLastRefreshedAt(new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" }));
    } catch (error) {
      setBugRefreshError(error instanceof Error ? error.message : "Could not refresh bugs.");
    } finally {
      setIsBugRefreshing(false);
    }
  }

  async function handleBugFileUpload(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    setIsBugUploading(true);
    setBugRefreshError("");

    try {
      const contentBase64 = await fileToBase64(file);
      await onUploadBugs(project.id, { filename: file.name, contentBase64 });
      setBugLastRefreshedAt(new Date().toLocaleString([], { dateStyle: "medium", timeStyle: "short" }));
    } catch (error) {
      setBugRefreshError(error instanceof Error ? error.message : "Could not import bugs from the file.");
    } finally {
      setIsBugUploading(false);
      input.value = "";
    }
  }

  return (
    <section className="surface dashboard-preview">
      <DashboardTabs activeTab={activeTab} onTabChange={onTabChange} />

      {activeTab === "bugs" ? (
        <div className="section-title bug-header-only">
          <div className="bug-header-controls">
            <form className="bug-query-form" onSubmit={handleRefreshBugs}>
              <label>
                <span>Product ID</span>
                <input
                  aria-label="Product ID"
                  inputMode="numeric"
                  onChange={(event) => updateBugQuery("productId", event.target.value)}
                  placeholder="Any"
                  value={bugQuery.productId}
                />
              </label>
              <label>
                <span>Bug No</span>
                <input
                  aria-label="Bug No"
                  onChange={(event) => updateBugQuery("rptno", event.target.value)}
                  placeholder="Any"
                  value={bugQuery.rptno}
                />
              </label>
              <label>
                <span>Status</span>
                <input
                  aria-label="Status"
                  onChange={(event) => updateBugQuery("status", event.target.value)}
                  placeholder="Any"
                  value={bugQuery.status}
                />
              </label>
              <label>
                <span>Severity</span>
                <input
                  aria-label="Severity"
                  onChange={(event) => updateBugQuery("severity", event.target.value)}
                  placeholder="Any"
                  value={bugQuery.severity}
                />
              </label>
              <label>
                <span>Reported by</span>
                <input
                  aria-label="Reported by"
                  onChange={(event) => updateBugQuery("reportedBy", event.target.value)}
                  placeholder="Any"
                  value={bugQuery.reportedBy}
                />
              </label>
              <label>
                <span>Component</span>
                <input
                  aria-label="Component"
                  onChange={(event) => updateBugQuery("component", event.target.value)}
                  placeholder="Any"
                  value={bugQuery.component}
                />
              </label>
              <label>
                <span>Assignee</span>
                <input
                  aria-label="Assignee"
                  onChange={(event) => updateBugQuery("assignee", event.target.value)}
                  placeholder="Any"
                  value={bugQuery.assignee}
                />
              </label>
              <button
                aria-label={isBugRefreshing ? "Refreshing Bug DB report" : "Search Bug DB"}
                className="bug-query-icon-button primary"
                disabled={!hasBugQuery || isBugRefreshing}
                title={isBugRefreshing ? "Refreshing" : "Search"}
                type="submit"
              >
                <SearchIcon />
              </button>
              <button
                aria-label="Clear Bug DB filters"
                className="bug-query-icon-button"
                disabled={!hasBugQuery || isBugRefreshing}
                onClick={handleNewBugQuery}
                title="Clear filters"
                type="button"
              >
                <XIcon />
              </button>
            </form>

            <div className="bug-saved-query-row">
              <label>
                <span className="visually-hidden">Saved query</span>
                <select
                  aria-label="Saved Bug DB query"
                  onChange={(event) => handleSelectSavedBugQuery(event.target.value)}
                  value={selectedBugQueryId}
                >
                  <option value="">Saved queries</option>
                  {projectBugQueries.map((query) => (
                    <option key={query.id} value={query.id}>
                      {query.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="visually-hidden">Query name</span>
                <input
                  aria-label="Query name"
                  onChange={(event) => setBugQueryName(event.target.value)}
                  placeholder="Query name"
                  value={bugQueryName}
                />
              </label>
              <button
                aria-label={selectedBugQuery ? "Save selected Bug DB query" : "Save new Bug DB query"}
                className="bug-query-icon-button"
                disabled={!hasBugQuery || !normalizeName(bugQueryName)}
                onClick={handleSaveBugQuery}
                title={selectedBugQuery ? "Save query" : "Save new query"}
                type="button"
              >
                <CheckIcon />
              </button>
              <button
                aria-label="Delete selected Bug DB query"
                className="bug-query-icon-button danger"
                disabled={!selectedBugQuery}
                onClick={handleDeleteSavedBugQuery}
                title="Delete saved query"
                type="button"
              >
                <TrashIcon />
              </button>
              <div className="bug-saved-query-spacer" aria-hidden="true" />
              <div className="bug-column-picker" ref={bugColumnPickerRef}>
                <button
                  aria-expanded={isBugColumnPickerOpen}
                  aria-label="Choose report columns"
                  className="bug-query-icon-button"
                  onClick={() => setIsBugColumnPickerOpen((isOpen) => !isOpen)}
                  title="Columns"
                  type="button"
                >
                  <ColumnsIcon />
                </button>
                {isBugColumnPickerOpen ? (
                  <div className="bug-column-list">
                    {availableBugColumns.map((column) => (
                      <label className="inline-check bug-column-option" key={column}>
                        <input
                          checked={selectedBugColumns.includes(column)}
                          onChange={() => handleReportColumnToggle(column)}
                          type="checkbox"
                        />
                        <span>{bugColumnLabel(column)}</span>
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
              <label
                aria-disabled={isBugUploading}
                aria-label={isBugUploading ? "Uploading Bug DB Excel or CSV" : "Upload Bug DB Excel or CSV"}
                className="bug-upload-button"
                title={isBugUploading ? "Uploading" : "Upload Excel/CSV"}
              >
                <input
                  accept=".xlsx,.csv"
                  className="upload-input"
                  disabled={isBugUploading}
                  onChange={handleBugFileUpload}
                  type="file"
                />
                <UploadIcon />
              </label>
              <span className="bug-upload-status" aria-live="polite">{isBugUploading ? "Uploading" : ""}</span>
            </div>
          </div>
        </div>
      ) : null}

      <DashboardErrorBoundary resetKey={`${project.id}-${activeTab}-${bugs.length}`}>
        <DashboardPanel
          activeTab={activeTab}
          actions={actions}
          bugs={bugs}
          bugLastRefreshedAt={bugLastRefreshedAt}
          bugReportVisible={hasBugQuery}
          bugRefreshError={bugRefreshError}
          onActionTitleChange={onActionTitleChange}
          onAddAction={onAddAction}
          onCleanDuplicates={onCleanDuplicates}
          onClearBugs={onClearBugs}
          onCompletionDateChange={onCompletionDateChange}
          onConfirmExtractedActions={onConfirmExtractedActions}
          onDeleteAction={onDeleteAction}
          onDeleteActions={onDeleteActions}
          onDeleteProjectNote={onDeleteProjectNote}
          onExtractActions={onExtractActions}
          onOwnerChange={onOwnerChange}
          onSaveProjectNote={onSaveProjectNote}
          onStatusChange={onStatusChange}
          onUpdateProjectNote={onUpdateProjectNote}
          project={project}
          selectedBugColumns={selectedBugColumns}
          updates={updates}
        />
      </DashboardErrorBoundary>
    </section>
  );
}

function App() {
  const [projects, setProjects] = useState([]);
  const [actions, setActions] = useState([]);
  const [updates, setUpdates] = useState([]);
  const [bugs, setBugs] = useState([]);
  const [bugQueries, setBugQueries] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [activeTab, setActiveTab] = useState("status");
  const [apiError, setApiError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [actionPendingDelete, setActionPendingDelete] = useState(null);
  const [actionsPendingDelete, setActionsPendingDelete] = useState([]);
  const [notePendingDelete, setNotePendingDelete] = useState(null);
  const [projectPendingDelete, setProjectPendingDelete] = useState(null);
  const [projectSummaryModal, setProjectSummaryModal] = useState(null);
  const [isSummarizingProject, setIsSummarizingProject] = useState(false);
  const [openClassifications, setOpenClassifications] = useState([]);
  const [toastMessage, setToastMessage] = useState("");
  const toastTimeoutRef = useRef(null);

  function applyBootstrapData(data, preferredProjectId = selectedProjectId) {
    const loadedProjects = data.projects ?? [];
    setProjects(loadedProjects);
    setActions(data.actions ?? []);
    setUpdates(data.updates ?? []);
    setBugs(data.bugs ?? []);
    setBugQueries(data.bugQueries ?? []);
    setOpenClassifications((currentClassifications) => {
      const availableClassifications = [...new Set(loadedProjects.map((project) => project.classification))];
      const stillOpen = currentClassifications.filter((classification) =>
        availableClassifications.includes(classification),
      );
      const merged = [...stillOpen];
      availableClassifications.forEach((classification) => {
        if (!merged.includes(classification)) {
          merged.push(classification);
        }
      });
      return merged;
    });
    setSelectedProjectId((currentSelectedProjectId) => {
      const candidate = preferredProjectId ?? currentSelectedProjectId;
      return loadedProjects.some((project) => project.id === candidate) ? candidate : loadedProjects[0]?.id ?? null;
    });
  }

  async function loadBootstrap(preferredProjectId = selectedProjectId) {
    const data = await apiRequest("/bootstrap");
    applyBootstrapData(data, preferredProjectId);
    return data;
  }

  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      try {
        setIsLoading(true);
        setApiError("");
        const data = await apiRequest("/bootstrap");
        if (isMounted) {
          applyBootstrapData(data, data.projects?.[0]?.id ?? null);
        }
      } catch (error) {
        if (isMounted) {
          setApiError(error instanceof Error ? error.message : "Could not load backend data.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadInitialData();

    return () => {
      isMounted = false;
    };
  }, []);

  const classificationGroups = useMemo(() => {
    const groups = new Map();
    projects.forEach((project) => {
      const groupedProjects = groups.get(project.classification) ?? [];
      groups.set(project.classification, groupedProjects.concat(project));
    });
    return Array.from(groups, ([classification, groupedProjects]) => ({
      classification,
      projects: groupedProjects,
    }));
  }, [projects]);

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? projects[0] ?? null;
  const selectedActions = selectedProject ? actions.filter((action) => action.projectId === selectedProject.id) : [];
  const selectedUpdates = selectedProject ? updates.filter((update) => update.projectId === selectedProject.id) : [];
  const selectedBugs = selectedProject ? bugs.filter((bug) => bug.projectId === selectedProject.id) : [];
  const metrics = actionStatuses.map((status) => ({
    ...status,
    value: selectedActions.filter((action) => action.status === status.value).length,
  }));

  function showToast(message) {
    setToastMessage(message);
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage("");
    }, 2200);
  }

  function handleProjectSelect(project) {
    setSelectedProjectId(project.id);
    setOpenClassifications((currentClassifications) =>
      currentClassifications.includes(project.classification)
        ? currentClassifications
        : currentClassifications.concat(project.classification),
    );
  }

  async function handleCreateProject(projectInput) {
    try {
      setApiError("");
      const { project } = await apiRequest("/projects", {
        body: JSON.stringify({
          classification: projectInput.classification,
          members: parseMembers(projectInput.members),
          name: projectInput.name.trim(),
        }),
        method: "POST",
      });

      await loadBootstrap(project.id);
      setActiveTab("status");
      showToast(`${project.name} created`);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not create project.");
      throw error;
    }
  }

  async function handleUpdateMembers(membersValue) {
    if (!selectedProject) return;

    try {
      setApiError("");
      const members = parseMembers(membersValue);
      const { project: updatedProject } = await apiRequest(`/projects/${selectedProject.id}/members`, {
        body: JSON.stringify({ members }),
        method: "PATCH",
      });

      await loadBootstrap(updatedProject.id);
      showToast("Members updated");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not update members.");
      throw error;
    }
  }

  async function handleSummarizeProject(projectId) {
    const projectToSummarize = projects.find((project) => project.id === projectId);
    if (!projectToSummarize) return;

    try {
      setApiError("");
      setIsSummarizingProject(true);
      const { summary } = await apiRequest(`/projects/${projectId}/summary`, { method: "POST" });
      setProjectSummaryModal({ project: projectToSummarize, summary });
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not summarize project notes.");
      throw error;
    } finally {
      setIsSummarizingProject(false);
    }
  }

  async function handleDeleteProject(projectToDelete) {
    if (!projectToDelete) return;

    try {
      setApiError("");
      await apiRequest(`/projects/${projectToDelete.id}`, { method: "DELETE" });
      const remainingProjects = projects.filter((project) => project.id !== projectToDelete.id);
      const deletedSelectedProject = selectedProjectId === projectToDelete.id;
      const nextProjectId = deletedSelectedProject ? remainingProjects[0]?.id ?? null : selectedProjectId;

      await loadBootstrap(nextProjectId);
      if (deletedSelectedProject) {
        setActiveTab("status");
      }
      setProjectPendingDelete(null);
      showToast(`${projectToDelete.name} deleted`);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not delete project.");
    }
  }

  async function handleAddAction(actionInput) {
    if (!selectedProject) return;

    try {
      setApiError("");
      const { action } = await apiRequest("/actions", {
        body: JSON.stringify({
          owner: actionInput.owner,
          completionDate: actionInput.completionDate,
          projectId: selectedProject.id,
          source: actionInput.source,
          status: actionInput.status,
          title: actionInput.title.trim(),
        }),
        method: "POST",
      });

      setActions((currentActions) => [action, ...currentActions]);
      showToast("Action added");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not add action.");
    }
  }

  async function handleCleanDuplicates() {
    if (!selectedProject) return;

    try {
      setApiError("");
      const { actions: cleanedActions, deletedCount } = await apiRequest(
        `/projects/${selectedProject.id}/actions/clean-duplicates`,
        { method: "POST" },
      );
      setActions((currentActions) =>
        currentActions
          .filter((action) => action.projectId !== selectedProject.id)
          .concat(cleanedActions),
      );
      showToast(deletedCount ? `${deletedCount} duplicates removed` : "No duplicates found");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not clean duplicate actions.");
    }
  }

  async function handleStatusChange(actionId, status) {
    try {
      setApiError("");
      const { action: updatedAction } = await apiRequest(`/actions/${actionId}`, {
        body: JSON.stringify({ status }),
        method: "PATCH",
      });

      setActions((currentActions) =>
        currentActions.map((action) => (action.id === actionId ? updatedAction : action)),
      );
      showToast(`Moved to ${actionStatuses.find((item) => item.value === status)?.label ?? "new status"}`);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not update action.");
    }
  }

  async function handleActionTitleChange(actionId, title) {
    try {
      setApiError("");
      const { action: updatedAction } = await apiRequest(`/actions/${actionId}`, {
        body: JSON.stringify({ title: title.trim() }),
        method: "PATCH",
      });

      setActions((currentActions) =>
        currentActions.map((action) => (action.id === actionId ? updatedAction : action)),
      );
      showToast("Action updated");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not update action.");
      throw error;
    }
  }

  async function handleOwnerChange(actionId, owner) {
    try {
      setApiError("");
      const { action: updatedAction } = await apiRequest(`/actions/${actionId}`, {
        body: JSON.stringify({ owner }),
        method: "PATCH",
      });

      setActions((currentActions) =>
        currentActions.map((action) => (action.id === actionId ? updatedAction : action)),
      );
      showToast(`Owner set to ${updatedAction.owner || "Unassigned"}`);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not update action owner.");
    }
  }

  async function handleCompletionDateChange(actionId, completionDate) {
    try {
      setApiError("");
      const { action: updatedAction } = await apiRequest(`/actions/${actionId}`, {
        body: JSON.stringify({ completionDate }),
        method: "PATCH",
      });

      setActions((currentActions) =>
        currentActions.map((action) => (action.id === actionId ? updatedAction : action)),
      );
      showToast(completionDate ? "Completion date updated" : "Completion date cleared");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not update completion date.");
    }
  }

  async function handleDeleteAction(actionToDelete) {
    if (!actionToDelete) return;

    try {
      setApiError("");
      await apiRequest(`/actions/${actionToDelete.id}`, { method: "DELETE" });
      setActions((currentActions) => currentActions.filter((action) => action.id !== actionToDelete.id));
      setActionPendingDelete(null);
      showToast("Action deleted");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not delete action.");
      throw error;
    }
  }

  async function handleDeleteActions(actionsToDelete) {
    if (!actionsToDelete?.length) return;

    try {
      setApiError("");
      const ids = actionsToDelete.map((action) => action.id);
      const { deletedActions } = await apiRequest("/actions/bulk-delete", {
        body: JSON.stringify({ ids }),
        method: "POST",
      });
      const deletedIds = new Set(deletedActions.map((action) => action.id));
      setActions((currentActions) => currentActions.filter((action) => !deletedIds.has(action.id)));
      setActionsPendingDelete([]);
      showToast(`${deletedActions.length} actions deleted`);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not delete selected actions.");
      throw error;
    }
  }

  async function handleExtractActions(extractionInput) {
    if (!selectedProject) return;

    try {
      setApiError("");
      const extraction = await apiRequest(`/projects/${selectedProject.id}/extract-actions`, {
        body: JSON.stringify({ ...extractionInput, previewOnly: true }),
        method: "POST",
      });

      showToast(`${extraction.actions.length} actions ready to review`);
      return extraction;
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not extract actions.");
      throw error;
    }
  }

  async function handleConfirmExtractedActions(actionDrafts) {
    if (!selectedProject || !actionDrafts?.length) return [];

    try {
      setApiError("");
      const { actions: confirmedActions } = await apiRequest("/actions/bulk", {
        body: JSON.stringify({
          actions: actionDrafts.map((action) => ({
            completionDate: action.completionDate,
            meetingDate: action.meetingDate,
            owner: action.owner,
            projectId: selectedProject.id,
            source: action.source || "meeting",
            status: action.status,
            title: action.title,
          })),
        }),
        method: "POST",
      });

      setActions((currentActions) => confirmedActions.concat(currentActions));
      showToast(`${confirmedActions.length} actions added`);
      return confirmedActions;
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not add reviewed actions.");
      throw error;
    }
  }

  async function handleSaveProjectNote(noteInput) {
    if (!selectedProject || !noteInput.text?.trim()) return null;

    try {
      setApiError("");
      const { update } = await apiRequest("/updates", {
        body: JSON.stringify({
          blocker: "",
          createAction: false,
          meetingDate: noteInput.meetingDate,
          person: null,
          projectId: selectedProject.id,
          text: noteInput.text,
        }),
        method: "POST",
      });

      setUpdates((currentUpdates) => [update, ...currentUpdates]);
      return update;
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not save note to project feed.");
      return null;
    }
  }

  async function handleUpdateProjectNote(updateId, noteInput) {
    try {
      setApiError("");
      const { update } = await apiRequest(`/updates/${updateId}`, {
        body: JSON.stringify({
          meetingDate: noteInput.meetingDate,
          text: noteInput.text,
        }),
        method: "PATCH",
      });

      setUpdates((currentUpdates) =>
        currentUpdates.map((currentUpdate) => (currentUpdate.id === update.id ? update : currentUpdate)),
      );
      showToast("Project note updated");
      return update;
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not update project note.");
      throw error;
    }
  }

  async function handleDeleteProjectNote(noteToDelete) {
    if (!noteToDelete) return;

    try {
      setApiError("");
      await apiRequest(`/updates/${noteToDelete.id}`, { method: "DELETE" });
      setUpdates((currentUpdates) => currentUpdates.filter((update) => update.id !== noteToDelete.id));
      setNotePendingDelete(null);
      showToast("Project note deleted");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not delete project note.");
      throw error;
    }
  }

  async function handleRefreshBugs(projectId, bugQuery) {
    try {
      setApiError("");
      const { bugs: refreshedBugs } = await apiRequest(`/projects/${projectId}/bugs/fetch`, {
        body: JSON.stringify(typeof bugQuery === "string" ? { url: bugQuery } : { query: bugQuery }),
        method: "POST",
      });

      setBugs((currentBugs) => [
        ...refreshedBugs,
        ...currentBugs.filter((bug) => bug.projectId !== projectId),
      ]);
      showToast(`${refreshedBugs.length} bugs refreshed`);
      return refreshedBugs;
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not refresh bugs.");
      throw error;
    }
  }

  async function handleUploadBugs(projectId, fileInput) {
    try {
      setApiError("");
      const { bugs: refreshedBugs } = await apiRequest(`/projects/${projectId}/bugs/upload`, {
        body: JSON.stringify(fileInput),
        method: "POST",
      });

      setBugs((currentBugs) => [
        ...refreshedBugs,
        ...currentBugs.filter((bug) => bug.projectId !== projectId),
      ]);
      showToast(`${refreshedBugs.length} bugs imported`);
      return refreshedBugs;
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not import bugs.");
      throw error;
    }
  }

  async function handleClearBugs(projectId) {
    try {
      setApiError("");
      await apiRequest(`/projects/${projectId}/bugs`, { method: "DELETE" });
      setBugs((currentBugs) => currentBugs.filter((bug) => bug.projectId !== projectId));
      showToast("Bug report cleared");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not clear bug report.");
      throw error;
    }
  }

  async function handleCreateBugQuery(projectId, payload) {
    try {
      setApiError("");
      const { bugQuery } = await apiRequest(`/projects/${projectId}/bug-queries`, {
        body: JSON.stringify(payload),
        method: "POST",
      });
      setBugQueries((currentQueries) => currentQueries.concat(bugQuery));
      showToast("Bug query saved");
      return bugQuery;
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not save bug query.");
      throw error;
    }
  }

  async function handleUpdateBugQuery(queryId, payload) {
    try {
      setApiError("");
      const { bugQuery } = await apiRequest(`/bug-queries/${queryId}`, {
        body: JSON.stringify(payload),
        method: "PATCH",
      });
      setBugQueries((currentQueries) => currentQueries.map((query) => (query.id === bugQuery.id ? bugQuery : query)));
      showToast("Bug query updated");
      return bugQuery;
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not update bug query.");
      throw error;
    }
  }

  async function handleDeleteBugQuery(queryId) {
    try {
      setApiError("");
      await apiRequest(`/bug-queries/${queryId}`, { method: "DELETE" });
      setBugQueries((currentQueries) => currentQueries.filter((query) => query.id !== queryId));
      showToast("Bug query deleted");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not delete bug query.");
      throw error;
    }
  }

  function handleToggleClassification(classification) {
    setOpenClassifications((currentClassifications) =>
      currentClassifications.includes(classification)
        ? currentClassifications.filter((currentClassification) => currentClassification !== classification)
        : currentClassifications.concat(classification),
    );
  }

  return (
    <div className={`app-shell ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <Sidebar
        classificationGroups={classificationGroups}
        isCollapsed={isSidebarCollapsed}
        onCreateProject={handleCreateProject}
        onProjectSelect={handleProjectSelect}
        onRequestDeleteProject={setProjectPendingDelete}
        onToggleSidebar={() => setIsSidebarCollapsed((isCollapsed) => !isCollapsed)}
        onToggleClassification={handleToggleClassification}
        openClassifications={openClassifications}
        selectedProject={selectedProject}
      />
      <main className="workspace">
        {apiError ? (
          <div className="api-banner" role="alert">
            {apiError}
          </div>
        ) : null}
        {isLoading ? (
          <section className="surface loading-state" aria-label="Loading dashboard">
            <p className="eyebrow">Backend</p>
            <h2>Loading Project Pulse data</h2>
          </section>
        ) : selectedProject ? (
          <>
            <ProjectSummary
              actions={selectedActions}
              hasProjectNotes={selectedUpdates.length > 0}
              isSummarizingProject={isSummarizingProject}
              metrics={metrics}
              onSummarizeProject={handleSummarizeProject}
              onUpdateMembers={handleUpdateMembers}
              selectedProject={selectedProject}
            />
            <DashboardShell
              activeTab={activeTab}
              actions={selectedActions}
              bugs={selectedBugs}
              bugQueries={bugQueries}
              onActionTitleChange={handleActionTitleChange}
              onAddAction={handleAddAction}
              onCreateBugQuery={handleCreateBugQuery}
              onCleanDuplicates={handleCleanDuplicates}
              onClearBugs={handleClearBugs}
              onCompletionDateChange={handleCompletionDateChange}
              onConfirmExtractedActions={handleConfirmExtractedActions}
              onDeleteBugQuery={handleDeleteBugQuery}
              onDeleteAction={setActionPendingDelete}
              onDeleteActions={setActionsPendingDelete}
              onDeleteProjectNote={setNotePendingDelete}
              onExtractActions={handleExtractActions}
              onOwnerChange={handleOwnerChange}
              onRefreshBugs={handleRefreshBugs}
              onUploadBugs={handleUploadBugs}
              onSaveProjectNote={handleSaveProjectNote}
              onStatusChange={handleStatusChange}
              onTabChange={setActiveTab}
              onUpdateBugQuery={handleUpdateBugQuery}
              onUpdateProjectNote={handleUpdateProjectNote}
              project={selectedProject}
              updates={selectedUpdates}
            />
          </>
        ) : (
          <BlankDashboard />
        )}
      </main>
      {toastMessage ? (
        <div className="toast" role="status" aria-live="polite">
          {toastMessage}
        </div>
      ) : null}
      {projectPendingDelete ? (
        <DeleteProjectDialog
          onCancel={() => setProjectPendingDelete(null)}
          onConfirm={() => handleDeleteProject(projectPendingDelete)}
          project={projectPendingDelete}
        />
      ) : null}
      {actionPendingDelete ? (
        <DeleteActionDialog
          action={actionPendingDelete}
          onCancel={() => setActionPendingDelete(null)}
          onConfirm={() => handleDeleteAction(actionPendingDelete)}
        />
      ) : null}
      {actionsPendingDelete.length ? (
        <DeleteActionsDialog
          actions={actionsPendingDelete}
          onCancel={() => setActionsPendingDelete([])}
          onConfirm={() => handleDeleteActions(actionsPendingDelete)}
        />
      ) : null}
      {notePendingDelete ? (
        <DeleteProjectNoteDialog
          note={notePendingDelete}
          onCancel={() => setNotePendingDelete(null)}
          onConfirm={() => handleDeleteProjectNote(notePendingDelete)}
        />
      ) : null}
      {projectSummaryModal ? (
        <ProjectSummaryDialog
          onClose={() => setProjectSummaryModal(null)}
          project={projectSummaryModal.project}
          summary={projectSummaryModal.summary}
        />
      ) : null}
    </div>
  );
}

export default App;
