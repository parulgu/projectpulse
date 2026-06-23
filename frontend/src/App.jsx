import { Component, useEffect, useMemo, useRef, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_PROJECT_PULSE_API_URL ?? "http://127.0.0.1:8000/api";

const actionStatuses = [
  { label: "Active", value: "active", tone: "active" },
  { label: "Blocked", value: "blocked", tone: "blocked" },
  { label: "Done", value: "done", tone: "done" },
];

const actionStatusRank = { active: 0, blocked: 1, done: 2 };

const decisionStatuses = [
  { label: "Active", value: "active" },
  { label: "Revisited", value: "revisited" },
  { label: "Reversed", value: "reversed" },
];

const dashboardTabs = [
  { id: "overview", label: "Overview" },
  { id: "status", label: "Action Board" },
  { id: "notes", label: "Meeting Notes" },
  { id: "bugs", label: "Bug DB" },
];

const projectRoleFields = [
  { id: "deliveryManager", label: "Delivery Manager", placeholder: "Name" },
  { id: "productManager", label: "Product Manager", placeholder: "Name" },
  { id: "designers", label: "Designers", placeholder: "Names separated by comma" },
  { id: "developers", label: "Developers", placeholder: "Names separated by comma" },
  { id: "qaMembers", label: "QA Members", placeholder: "Names separated by comma" },
];

const fixedProjectRoleIds = new Set(projectRoleFields.map((field) => field.id));

const meetingTemplates = [
  {
    id: "standup",
    label: "Standup",
    text: "Standup\n\nTag: #\n\nCompleted:\n- \n\nToday:\n- \n\nBlockers:\n- \n\nNext steps:\n- ",
  },
  {
    id: "weekly",
    label: "Weekly review",
    text: "Weekly review\n\nTag: #\n\nCompleted this week:\n- \n\nPending:\n- \n\nBlocked or at risk:\n- \n\nDecisions:\n- \n\nNext steps:\n- ",
  },
  {
    id: "bug-triage",
    label: "Bug triage",
    text: "Bug triage\n\nTag: #\n\nHigh priority bugs:\n- \n\nOwners:\n- \n\nRisks:\n- \n\nDecisions:\n- \n\nNext steps:\n- ",
  },
  {
    id: "planning",
    label: "Planning",
    text: "Planning meeting\n\nTag: #\n\nScope:\n- \n\nDependencies:\n- \n\nDecisions:\n- \n\nAction items:\n- ",
  },
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

function actionTagValue(value) {
  return String(value || "")
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 64);
}

function actionTagLabel(action) {
  const tag = actionTagValue(action?.tag);
  return tag ? `#${tag}` : "";
}

function linkHrefFromText(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  if (/^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(text)) return `https://${text}`;
  return "";
}

function epicLinkFromText(value) {
  const text = String(value || "").trim();
  if (!text) return { href: "", label: "" };
  const keyMatch = text.match(/[A-Z][A-Z0-9]+-\d+/i);
  const label = keyMatch ? keyMatch[0].toUpperCase() : text;
  const href = /^https?:\/\//i.test(text)
    ? text
    : keyMatch
      ? `https://jira.oraclecorp.com/jira/browse/${label}`
      : linkHrefFromText(text);
  return { href, label };
}

function projectRoleLabel(roleId) {
  return projectRoleFields.find((field) => field.id === roleId)?.label ?? roleId;
}

function customProjectRoleKeys(roleDetails = {}) {
  return Object.keys(roleDetails).filter((key) => !fixedProjectRoleIds.has(key));
}

function reorderedIds(items, draggedId, targetId) {
  const ids = items.map((item) => item.id);
  const draggedIndex = ids.indexOf(draggedId);
  const targetIndex = ids.indexOf(targetId);
  if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) return ids;
  const nextIds = ids.slice();
  const [dragged] = nextIds.splice(draggedIndex, 1);
  nextIds.splice(targetIndex, 0, dragged);
  return nextIds;
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

function summaryList(label, items = []) {
  if (!items.length) return "";
  return `${label}:\n${items.map((item) => `- ${item}`).join("\n")}`;
}

function projectSummaryText(project, summary) {
  return [
    summary.headline || project.name,
    summary.reportDate ? `Report date: ${formatDisplayDate(summary.reportDate)}` : "",
    summary.status ? `Overall status: ${summary.status}` : "",
    "",
    summaryList("Completed", summary.done),
    summaryList("Pending", summary.pending),
    summaryList("Blocked", summary.blocked),
    summaryList("Risks", summary.risks),
    summaryList("Key decisions", summary.keyDecisions),
    summaryList("Customer asks", summary.customerAsks),
    summaryList("Next steps", summary.nextSteps),
  ].filter(Boolean).join("\n\n");
}

function formattedActionTitle(action) {
  const owner = action.owner ? ` (${action.owner})` : "";
  const due = action.completionDate ? `, due ${formatDisplayDate(action.completionDate)}` : "";
  const tag = actionTagLabel(action);
  return `${action.title}${owner}${due}${tag ? ` ${tag}` : ""}`;
}

function timestampForSort(value) {
  if (!value) return 0;
  const normalized = String(value).includes("T") ? String(value) : `${String(value).slice(0, 10)}T00:00:00`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function actionStatusLabel(value) {
  return actionStatuses.find((status) => status.value === value)?.label ?? labelForClassification(value || "active");
}

function projectMemoryItems({ actions = [], decisions = [], updates = [] }) {
  const noteItems = updates.map((update) => ({
    date: update.meetingDate || update.createdAt,
    id: `note-${update.id}`,
    meta: update.meetingDate ? `Meeting · ${formatDisplayDate(update.meetingDate)}` : "Project note",
    text: update.text,
    tone: "note",
    type: "Note",
  }));

  const decisionItems = decisions.map((decision) => ({
    date: decision.decisionDate || decision.createdAt,
    id: `decision-${decision.id}`,
    meta: [decision.owner || "Unassigned", labelForClassification(decision.status || "active")].join(" · "),
    text: decision.text,
    tone: "decision",
    type: "Decision",
  }));

  const actionItems = actions.map((action) => ({
    date: action.createdAt,
    id: `action-${action.id}`,
    meta: [
      actionStatusLabel(action.status),
      action.owner || "Unassigned",
      actionTagLabel(action),
      action.completionDate ? `Due ${formatDisplayDate(action.completionDate)}` : "",
    ].filter(Boolean).join(" · "),
    text: action.title,
    tone: action.status === "blocked" ? "blocked" : action.status === "done" ? "done" : "action",
    type: "Action",
  }));

  return [...noteItems, ...decisionItems, ...actionItems]
    .sort((left, right) => timestampForSort(right.date) - timestampForSort(left.date));
}

function normalizeTopic(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\b(the|and|for|with|from|that|this|need|needs|should|will|has|have|todo|action|next|steps)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 6)
    .join(" ");
}

function followUpFlagLabel(flag) {
  return String(flag || "")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
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

function actionMatchesDueFilter(action, dueFilter) {
  if (dueFilter === "all") return true;
  const details = dueDateDetails(action);
  if (!details || action.status === "done") return false;
  if (dueFilter === "overdue") return details.tone === "overdue";
  if (dueFilter === "today") return details.tone === "today";
  if (dueFilter === "week") return ["overdue", "today", "soon"].includes(details.tone);
  return true;
}

function actionMatchesMeetingRange(action, meetingStartDate, meetingEndDate) {
  if (!meetingStartDate && !meetingEndDate) return true;
  if (!action.meetingDate) return false;
  const meetingTime = parseDateOnly(action.meetingDate)?.getTime();
  if (!Number.isFinite(meetingTime)) return false;
  const startTime = meetingStartDate ? parseDateOnly(meetingStartDate)?.getTime() : null;
  const endTime = meetingEndDate ? parseDateOnly(meetingEndDate)?.getTime() : null;
  if (Number.isFinite(startTime) && meetingTime < startTime) return false;
  if (Number.isFinite(endTime) && meetingTime > endTime) return false;
  return true;
}

function actionMatchesTagSearch(action, tagSearch) {
  const query = actionTagValue(tagSearch).toLowerCase();
  if (!query) return true;
  return actionTagValue(action.tag).toLowerCase().includes(query);
}

function actionAgeLabel(action) {
  if (!action?.createdAt || action.status === "done") return "";
  const created = new Date(action.createdAt);
  if (Number.isNaN(created.getTime())) return "";
  const today = new Date();
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const createdOnly = new Date(created.getFullYear(), created.getMonth(), created.getDate());
  const daysOpen = Math.max(0, Math.round((todayOnly.getTime() - createdOnly.getTime()) / 86400000));
  if (daysOpen === 0) return "Opened today";
  if (daysOpen === 1) return "Open 1 day";
  return `Open ${daysOpen} days`;
}

function projectHealth(actions, updates) {
  const overdueCount = actions.filter((action) => dueDateDetails(action)?.tone === "overdue").length;
  const blockedCount = actions.filter((action) => action.status === "blocked").length;
  const unassignedCount = actions.filter((action) => action.status !== "done" && !action.owner).length;
  const latestUpdateTime = updates
    .map((update) => new Date(update.meetingDate || update.createdAt || 0).getTime())
    .filter((time) => Number.isFinite(time))
    .sort((left, right) => right - left)[0];
  const daysSinceUpdate = latestUpdateTime
    ? Math.floor((Date.now() - latestUpdateTime) / (24 * 60 * 60 * 1000))
    : null;
  const staleNotes = !latestUpdateTime || daysSinceUpdate > 7;
  const reasons = [];
  if (blockedCount) reasons.push(`${blockedCount} blocked`);
  if (overdueCount) reasons.push(`${overdueCount} overdue`);
  if (unassignedCount) reasons.push(`${unassignedCount} unassigned`);
  if (staleNotes) reasons.push(latestUpdateTime ? `No update in ${daysSinceUpdate} days` : "No updates yet");

  if (blockedCount > 0 || overdueCount > 0) {
    return { label: "Red", tone: "red", reason: reasons.slice(0, 2).join(" · ") };
  }
  if (staleNotes || unassignedCount > 0) {
    return {
      label: "Yellow",
      tone: "yellow",
      reason: reasons.slice(0, 2).join(" · "),
    };
  }
  return { label: "Green", tone: "green", reason: "On track" };
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
      actionTagValue(action.tag).toLowerCase(),
      action.completionDate || "",
      action.meetingDate || "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(action);
  }
  return deduped;
}

function ActionMeetingTag({ action }) {
  if (!action.meetingDate) return null;
  return <span className="meta-pill meeting">Meeting {formatDisplayDate(action.meetingDate)}</span>;
}

function ActionTagPill({ action }) {
  const tag = actionTagLabel(action);
  if (!tag) return null;
  return <span className="meta-pill tag">{tag}</span>;
}

function makeDraftActionId() {
  return `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeDraftMemoryId() {
  return `memory-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function draftActionKey(action) {
  return [
    normalizeName(action.title).toLowerCase(),
    normalizeName(action.owner).toLowerCase(),
    actionTagValue(action.tag).toLowerCase(),
    action.completionDate || "",
  ].join("|");
}

function dedupeDraftActions(actions) {
  const seen = new Set();
  const deduped = [];
  actions.forEach((action) => {
    const key = draftActionKey(action);
    if (!normalizeName(action.title) || seen.has(key)) return;
    seen.add(key);
    deduped.push(action);
  });
  return deduped;
}

const preferredBugReportColumns = [
  "rptno",
  "subject",
  "assignee",
  "status",
  "severity",
  "reported_by",
  "raw_updated_date",
  "product_id",
  "component",
  "bt_tags",
];
const bugColumnAliases = {
  "Bug/Enh Number": "rptno",
  RPTNO: "rptno",
  Assignee: "assignee",
  Tag: "bt_tags",
  Tags: "bt_tags",
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
  subject: "",
  tag: "",
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
    bt_tags: fields.bt_tags ?? fields.Tag ?? fields.Tags,
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
    product_id: "Product Id",
    raw_updated_date: "Reported Date",
    reported_by: "Reported By",
    subject: "Subject",
    bt_tags: "Tag",
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

function orderBugColumnsForReport(columns, availableColumns) {
  const availableSet = new Set(availableColumns);
  const selectedSet = new Set(columns.filter((column) => availableSet.has(column)));
  const preferred = preferredBugReportColumns.filter((column) => selectedSet.has(column));
  const remaining = columns.filter((column) => selectedSet.has(column) && !preferred.includes(column));
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

function ArchiveIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 7h16" />
      <path d="M6 7v13h12V7" />
      <path d="M9 11h6" />
      <path d="M3 4h18v3H3z" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 7h16" />
      <path d="M6 7v13h12V7" />
      <path d="M12 16V10" />
      <path d="M9 13l3-3 3 3" />
      <path d="M3 4h18v3H3z" />
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

function ChatIcon() {
  return (
    <svg className="icon bot-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="2.5" y="6.5" width="19" height="14" rx="5" />
      <path d="M12 3.5v3" />
      <path d="M8.5 12.5h.01" />
      <path d="M15.5 12.5h.01" />
      <path d="M8.75 16.5h6.5" />
    </svg>
  );
}

function TooltipLayer() {
  const [tooltip, setTooltip] = useState(null);

  useEffect(() => {
    const tooltipSelector = [
      "[data-tooltip]",
      "button[title]",
      "label[title]",
      ".icon-action-button[aria-label]",
      ".project-action-button[aria-label]",
      ".bug-query-icon-button[aria-label]",
      ".bug-upload-button[aria-label]",
      ".compact-icon-button[aria-label]",
      ".project-ask-button[aria-label]",
    ].join(",");

    function textForTooltip(target) {
      if (!target) return "";
      return (
        target.getAttribute("data-tooltip") ||
        target.getAttribute("title") ||
        target.getAttribute("aria-label") ||
        ""
      ).trim();
    }

    function showTooltip(event) {
      const target = event.target.closest(tooltipSelector);
      const text = textForTooltip(target);
      if (!target || !text) return;

      const rect = target.getBoundingClientRect();
      const placement = rect.bottom + 10 > window.innerHeight - 44 ? "top" : "bottom";
      const top = placement === "top" ? rect.top - 10 : rect.bottom + 10;
      const left = Math.min(Math.max(rect.left + rect.width / 2, 96), window.innerWidth - 96);

      setTooltip({ left, placement, text, top });
    }

    function hideTooltip(event) {
      if (event?.type === "mouseout") {
        const currentTarget = event.target.closest?.(tooltipSelector);
        const nextTarget = event.relatedTarget?.closest?.(tooltipSelector);
        if (currentTarget && currentTarget === nextTarget) return;
      }
      setTooltip(null);
    }

    document.addEventListener("mouseover", showTooltip);
    document.addEventListener("focusin", showTooltip);
    document.addEventListener("mouseout", hideTooltip);
    document.addEventListener("focusout", hideTooltip);
    document.addEventListener("click", hideTooltip);
    document.addEventListener("keydown", hideTooltip);
    window.addEventListener("resize", hideTooltip);
    window.addEventListener("scroll", hideTooltip, true);

    return () => {
      document.removeEventListener("mouseover", showTooltip);
      document.removeEventListener("focusin", showTooltip);
      document.removeEventListener("mouseout", hideTooltip);
      document.removeEventListener("focusout", hideTooltip);
      document.removeEventListener("click", hideTooltip);
      document.removeEventListener("keydown", hideTooltip);
      window.removeEventListener("resize", hideTooltip);
      window.removeEventListener("scroll", hideTooltip, true);
    };
  }, []);

  if (!tooltip) return null;

  return (
    <div className={`ui-tooltip ${tooltip.placement}`} role="tooltip" style={{ left: tooltip.left, top: tooltip.top }}>
      {tooltip.text}
    </div>
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
  const [epic, setEpic] = useState("");
  const [targetRelease, setTargetRelease] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    if (!projectName.trim()) {
      setError("Project name is required.");
      return;
    }

    try {
      await onCreateProject({ classification, epic, name: projectName, targetRelease });
      setProjectName("");
      setClassification("");
      setEpic("");
      setTargetRelease("");
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
        <span>EPIC</span>
        <input
          onChange={(event) => setEpic(event.target.value)}
          placeholder="EPIC-123"
          value={epic}
        />
      </label>

      <label>
        <span>Target release</span>
        <input
          onChange={(event) => setTargetRelease(event.target.value)}
          placeholder="25D"
          value={targetRelease}
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
  isAllProjectsSelected,
  isCollapsed,
  openClassifications,
  selectedProject,
  onAllProjectsSelect,
  onCreateProject,
  onArchiveProject,
  onProjectSelect,
  onRequestDeleteProject,
  onRestoreProject,
  onToggleArchivedProjects,
  onToggleSidebar,
  onToggleClassification,
  showArchivedProjects,
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
            <button
              aria-current={isAllProjectsSelected ? "page" : undefined}
              className={`all-projects-button ${isAllProjectsSelected ? "active" : ""}`}
              onClick={onAllProjectsSelect}
              type="button"
            >
              All Projects
            </button>
            <label className="sidebar-archive-toggle">
              <input
                checked={showArchivedProjects}
                onChange={(event) => onToggleArchivedProjects(event.target.checked)}
                type="checkbox"
              />
              <span>Show archived</span>
            </label>
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
                              className={`project-nav-item ${project.id === selectedProject?.id ? "active" : ""} ${project.archivedAt ? "archived" : ""}`}
                              onClick={() => onProjectSelect(project)}
                              type="button"
                            >
                              {project.name}
                            </button>
                            {project.archivedAt ? (
                              <button
                                aria-label={`Restore ${project.name}`}
                                className="project-action-button restore"
                                onClick={() => onRestoreProject(project)}
                                title="Restore project"
                                type="button"
                              >
                                <RestoreIcon />
                              </button>
                            ) : (
                              <button
                                aria-label={`Archive ${project.name}`}
                                className="project-action-button archive"
                                onClick={() => onArchiveProject(project)}
                                title="Archive project"
                                type="button"
                              >
                                <ArchiveIcon />
                              </button>
                            )}
                            <button
                              aria-label={`Delete ${project.name}`}
                              className="project-action-button delete"
                              onClick={() => onRequestDeleteProject(project)}
                              title="Delete project"
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
  hasSummarySource,
  isSummarizingProject,
  metrics,
  onOpenProjectAsk,
  onSummarizeProject,
  onUpdateProjectDetails,
  selectedProject,
  updates,
}) {
  const [summaryError, setSummaryError] = useState("");
  const [isEditingProjectMeta, setIsEditingProjectMeta] = useState(false);
  const [classification, setClassification] = useState(selectedProject.classification ?? "");
  const [epic, setEpic] = useState(selectedProject.epic ?? "");
  const [targetRelease, setTargetRelease] = useState(selectedProject.targetRelease ?? "");
  const health = projectHealth(actions, updates);
  const epicLink = epicLinkFromText(selectedProject.epic);

  useEffect(() => {
    setSummaryError("");
    setIsEditingProjectMeta(false);
    setClassification(selectedProject.classification ?? "");
    setEpic(selectedProject.epic ?? "");
    setTargetRelease(selectedProject.targetRelease ?? "");
  }, [selectedProject.classification, selectedProject.epic, selectedProject.id, selectedProject.targetRelease]);

  async function handleSummaryRequest() {
    try {
      setSummaryError("");
      await onSummarizeProject(selectedProject.id);
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : "Could not summarize project notes.");
    }
  }

  async function handleProjectMetaSubmit(event) {
    event.preventDefault();
    try {
      setSummaryError("");
      await onUpdateProjectDetails({
        classification,
        epic,
        targetRelease,
      });
      setIsEditingProjectMeta(false);
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : "Could not update project details.");
    }
  }

  function cancelProjectMetaEdit() {
    setClassification(selectedProject.classification ?? "");
    setEpic(selectedProject.epic ?? "");
    setTargetRelease(selectedProject.targetRelease ?? "");
    setIsEditingProjectMeta(false);
    setSummaryError("");
  }

  return (
    <section className="surface project-context" aria-label="Selected project context">
      <div className="project-context-main">
        <div className="project-title-group">
          <h2>{selectedProject.name}</h2>
          {isEditingProjectMeta ? (
            <form className="project-meta-edit" onSubmit={handleProjectMetaSubmit}>
              <label>
                <span>Classification</span>
                <input onChange={(event) => setClassification(event.target.value)} value={classification} />
              </label>
              <label>
                <span>EPIC</span>
                <input onChange={(event) => setEpic(event.target.value)} placeholder="EPIC-123" value={epic} />
              </label>
              <label>
                <span>Target release</span>
                <input onChange={(event) => setTargetRelease(event.target.value)} placeholder="25D" value={targetRelease} />
              </label>
              <button aria-label="Save project header" className="icon-action-button confirm" title="Save" type="submit">
                <CheckIcon />
              </button>
              <button aria-label="Cancel project header edit" className="icon-action-button" onClick={cancelProjectMetaEdit} title="Cancel" type="button">
                <XIcon />
              </button>
            </form>
          ) : (
            <div className="project-meta-line">
              <span>{labelForClassification(selectedProject.classification)}</span>
              <span>{selectedProject.members.length} {selectedProject.members.length === 1 ? "person" : "people"}</span>
              {selectedProject.epic ? (
                <span>
                  {epicLink.href ? (
                    <a className="project-meta-link" href={epicLink.href} rel="noreferrer" target="_blank">
                      {epicLink.label}
                    </a>
                  ) : epicLink.label}
                </span>
              ) : null}
              <span>{selectedProject.targetRelease || "Not set"}</span>
              <button
                aria-label="Edit project header"
                className="meta-edit-button"
                onClick={() => setIsEditingProjectMeta(true)}
                title="Edit project details"
                type="button"
              >
                <EditIcon />
              </button>
            </div>
          )}
        </div>
        <div className="project-summary-tools">
          <div className="metric-pills" aria-label="Project action summary">
            <span
              aria-label={`Project health: ${health.label}. ${health.reason}`}
              className={`health-pill ${health.tone}`}
              title={health.reason}
            >
              <span>{health.label}</span>
              <strong>{health.reason}</strong>
            </span>
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
            aria-label="Ask Project Pulse"
            className="primary-action project-ask-button"
            onClick={() => onOpenProjectAsk(selectedProject)}
            title="Ask Project Pulse about this project"
            type="button"
          >
            <ChatIcon />
          </button>
        </div>
      </div>
      {summaryError ? <p className="form-error light">{summaryError}</p> : null}
    </section>
  );
}

function ProjectOverview({
  actions,
  decisions,
  onCreatePhase,
  onCreatePhaseItem,
  onCreateProjectLink,
  onDeletePhase,
  onDeletePhaseItem,
  onDeleteProjectLink,
  onMovePhase,
  onMovePhaseItem,
  onReorderPhaseItems,
  onReorderPhases,
  onUpdatePhase,
  onUpdatePhaseItem,
  onUpdateProjectDetails,
  onUpdateProjectLink,
  phases,
  project,
  projectLinks,
  updates,
}) {
  const [expandedPhaseId, setExpandedPhaseId] = useState(null);
  const [isPhaseTrackerCollapsed, setIsPhaseTrackerCollapsed] = useState(true);
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [roleValues, setRoleValues] = useState({ ...(project.roleDetails ?? {}) });
  const [isAddingRole, setIsAddingRole] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRolePeople, setNewRolePeople] = useState("");
  const [editingPhaseId, setEditingPhaseId] = useState(null);
  const [phaseName, setPhaseName] = useState("");
  const [phaseMilestone, setPhaseMilestone] = useState("");
  const [isPhaseDialogOpen, setIsPhaseDialogOpen] = useState(false);
  const [newPhaseName, setNewPhaseName] = useState("");
  const [newPhaseItems, setNewPhaseItems] = useState("");
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
  const [newItemPhaseId, setNewItemPhaseId] = useState("");
  const [editingItemId, setEditingItemId] = useState(null);
  const [itemTitle, setItemTitle] = useState("");
  const [newItemTitle, setNewItemTitle] = useState("");
  const [editingLinkId, setEditingLinkId] = useState(null);
  const [isAddingLink, setIsAddingLink] = useState(false);
  const [linkName, setLinkName] = useState("");
  const [linkAddress, setLinkAddress] = useState("");
  const [linkText, setLinkText] = useState("");
  const [draggedPhaseId, setDraggedPhaseId] = useState(null);
  const [dragOverPhaseId, setDragOverPhaseId] = useState(null);
  const [draggedItemId, setDraggedItemId] = useState(null);
  const [dragOverItemId, setDragOverItemId] = useState(null);
  const [overviewError, setOverviewError] = useState("");

  const expandedPhase = expandedPhaseId === null ? null : phases.find((phase) => phase.id === expandedPhaseId) ?? phases[0] ?? null;
  const completePhaseCount = phases.filter((phase) => phase.status === "done").length;
  const totalSubtypeCount = phases.reduce((total, phase) => total + phase.items.length, 0);
  const completeSubtypeCount = phases.reduce(
    (total, phase) => total + phase.items.filter((item) => item.completed).length,
    0,
  );
  const overallProgress = totalSubtypeCount ? Math.round((completeSubtypeCount / totalSubtypeCount) * 100) : 0;
  const nextPhase = phases.find((phase) => phase.status !== "done") ?? null;
  const nextSubtype = nextPhase?.items.find((item) => !item.completed) ?? null;
  const projectRoleDetailsKey = JSON.stringify(project.roleDetails ?? {});

  useEffect(() => {
    setExpandedPhaseId(null);
    setIsPhaseTrackerCollapsed(true);
    setIsEditingDetails(false);
    setRoleValues({ ...(project.roleDetails ?? {}) });
    setIsAddingRole(false);
    setNewRoleName("");
    setNewRolePeople("");
    setEditingPhaseId(null);
    setEditingItemId(null);
    setEditingLinkId(null);
    setIsAddingLink(false);
    setLinkName("");
    setLinkAddress("");
    setLinkText("");
    setIsPhaseDialogOpen(false);
    setIsItemDialogOpen(false);
    setDraggedPhaseId(null);
    setDragOverPhaseId(null);
    setDraggedItemId(null);
    setDragOverItemId(null);
    setOverviewError("");
  }, [project.id]);

  useEffect(() => {
    if (isEditingDetails || isAddingRole) return;
    setRoleValues({ ...(project.roleDetails ?? {}) });
  }, [isAddingRole, isEditingDetails, projectRoleDetailsKey]);

  useEffect(() => {
    if (expandedPhaseId === null) return;
    if (expandedPhaseId && phases.some((phase) => phase.id === expandedPhaseId)) return;
    setExpandedPhaseId(phases.find((phase) => phase.status !== "done")?.id ?? phases[0]?.id ?? null);
  }, [expandedPhaseId, phases]);

  async function handleProjectDetailsSubmit(event) {
    event.preventDefault();
    try {
      setOverviewError("");
      await onUpdateProjectDetails({ roleDetails: roleValues });
      setIsEditingDetails(false);
      setIsAddingRole(false);
    } catch (error) {
      setOverviewError(error instanceof Error ? error.message : "Could not update project details.");
    }
  }

  async function handleAddProjectRole(event) {
    event.preventDefault();
    const roleName = normalizeName(newRoleName);
    const rolePeople = normalizeName(newRolePeople);
    if (!roleName || !rolePeople) return;
    const duplicateRole = Object.keys(roleValues).some((roleId) => projectRoleLabel(roleId).toLowerCase() === roleName.toLowerCase());
    if (duplicateRole) {
      setOverviewError("That role already exists.");
      return;
    }
    const nextRoleValues = { ...roleValues, [roleName]: rolePeople };
    try {
      setOverviewError("");
      await onUpdateProjectDetails({ roleDetails: nextRoleValues });
      setRoleValues(nextRoleValues);
      setNewRoleName("");
      setNewRolePeople("");
      setIsAddingRole(false);
      setIsEditingDetails(false);
    } catch (error) {
      setOverviewError(error instanceof Error ? error.message : "Could not add project role.");
    }
  }

  function handleRemoveProjectRole(roleId) {
    setRoleValues((currentRoles) => {
      const nextRoles = { ...currentRoles };
      delete nextRoles[roleId];
      return nextRoles;
    });
  }

  function cancelProjectTeamEdit() {
    setIsEditingDetails(false);
    setRoleValues({ ...(project.roleDetails ?? {}) });
    setIsAddingRole(false);
    setNewRoleName("");
    setNewRolePeople("");
    setOverviewError("");
  }

  async function handleAddPhase(event) {
    event.preventDefault();
    if (!newPhaseName.trim()) return;
    try {
      const phase = await onCreatePhase(project.id, {
        items: newPhaseItems.split("\n").map(normalizeName).filter(Boolean),
        name: newPhaseName,
      });
      setExpandedPhaseId(phase.id);
      setIsPhaseTrackerCollapsed(false);
      setIsPhaseDialogOpen(false);
      setNewPhaseName("");
      setNewPhaseItems("");
    } catch (error) {
      setOverviewError(error instanceof Error ? error.message : "Could not add phase.");
    }
  }

  async function handlePhaseEdit(event) {
    event.preventDefault();
    if (!editingPhaseId || !phaseName.trim()) return;
    try {
      await onUpdatePhase(editingPhaseId, { milestone: phaseMilestone, name: phaseName });
      setEditingPhaseId(null);
    } catch (error) {
      setOverviewError(error instanceof Error ? error.message : "Could not update phase.");
    }
  }

  async function handleAddItem(event) {
    event.preventDefault();
    const targetPhaseId = Number(newItemPhaseId || expandedPhase?.id || phases[0]?.id || 0);
    if (!targetPhaseId || !newItemTitle.trim()) return;
    try {
      await onCreatePhaseItem(targetPhaseId, { title: newItemTitle });
      setExpandedPhaseId(targetPhaseId);
      setIsPhaseTrackerCollapsed(false);
      setNewItemTitle("");
      setNewItemPhaseId("");
      setIsItemDialogOpen(false);
    } catch (error) {
      setOverviewError(error instanceof Error ? error.message : "Could not add subtype.");
    }
  }

  async function handleItemEdit(event) {
    event.preventDefault();
    if (!editingItemId || !itemTitle.trim()) return;
    try {
      await onUpdatePhaseItem(editingItemId, { title: itemTitle });
      setEditingItemId(null);
    } catch (error) {
      setOverviewError(error instanceof Error ? error.message : "Could not update subtype.");
    }
  }

  async function handleAddLink(event) {
    event.preventDefault();
    if (!linkName.trim() || !linkAddress.trim() || !linkText.trim()) return;
    try {
      await onCreateProjectLink(project.id, { address: linkAddress, linkText, name: linkName });
      closeLinkDialog();
    } catch (error) {
      setOverviewError(error instanceof Error ? error.message : "Could not add useful link.");
    }
  }

  async function handleLinkEdit(event) {
    event.preventDefault();
    if (!editingLinkId || !linkName.trim() || !linkAddress.trim() || !linkText.trim()) return;
    try {
      await onUpdateProjectLink(editingLinkId, { address: linkAddress, linkText, name: linkName });
      closeLinkDialog();
    } catch (error) {
      setOverviewError(error instanceof Error ? error.message : "Could not update useful link.");
    }
  }

  function beginPhaseEdit(phase) {
    setEditingPhaseId(phase.id);
    setPhaseName(phase.name);
    setPhaseMilestone(phase.milestone);
  }

  function beginItemEdit(item) {
    setEditingItemId(item.id);
    setItemTitle(item.title);
  }

  function beginLinkEdit(link) {
    setEditingLinkId(link.id);
    setIsAddingLink(false);
    setLinkName(link.name);
    setLinkAddress(link.address ?? "");
    setLinkText(link.linkText ?? "");
  }

  function beginLinkAdd() {
    setIsAddingLink(true);
    setEditingLinkId(null);
    setLinkName("");
    setLinkAddress("");
    setLinkText("");
  }

  function closeLinkDialog() {
    setIsAddingLink(false);
    setEditingLinkId(null);
    setLinkName("");
    setLinkAddress("");
    setLinkText("");
  }

  return (
    <div className="project-overview">
      {overviewError ? <p className="form-error light">{overviewError}</p> : null}

      <div className="overview-top-grid">
        <section className="overview-section">
          <div className="overview-section-heading compact">
            <div>
              <h2>Project team</h2>
              <p>Role names become the project owner list.</p>
            </div>
            <div className="section-heading-actions">
              <button
                aria-expanded={isAddingRole}
                aria-label="Add project role"
                className="icon-action-button confirm"
                onClick={() => {
                  setIsAddingRole((isAdding) => !isAdding);
                  setIsEditingDetails(true);
                }}
                title="Add project role"
                type="button"
              >
                <PlusIcon />
              </button>
              <button
                className="secondary-action quiet compact"
                onClick={() => {
                  if (isEditingDetails) {
                    cancelProjectTeamEdit();
                    return;
                  }
                  setIsEditingDetails(true);
                  setIsAddingRole(false);
                  setRoleValues({ ...(project.roleDetails ?? {}) });
                }}
                type="button"
              >
                {isEditingDetails ? "Cancel" : "Edit"}
              </button>
            </div>
          </div>

          {isEditingDetails ? (
            <form className="overview-table editable role-table" onSubmit={handleProjectDetailsSubmit}>
              <div className="overview-table-head">
                <span>Role</span>
                <span>Details</span>
                <span />
              </div>
              {projectRoleFields.map((field) => (
                <label className="overview-table-row" key={field.id}>
                  <strong>{field.label}</strong>
                  <input
                    onChange={(event) => setRoleValues((current) => ({ ...current, [field.id]: event.target.value }))}
                    placeholder={field.placeholder}
                    value={roleValues?.[field.id] ?? ""}
                  />
                  <span />
                </label>
              ))}
              {customProjectRoleKeys(roleValues).map((roleId) => (
                <div className="overview-table-row custom-role-row" key={roleId}>
                  <strong>{roleId}</strong>
                  <input
                    onChange={(event) => setRoleValues((current) => ({ ...current, [roleId]: event.target.value }))}
                    placeholder="Names separated by comma"
                    value={roleValues?.[roleId] ?? ""}
                  />
                  <button
                    aria-label={`Remove ${roleId} role`}
                    className="icon-action-button danger"
                    onClick={() => handleRemoveProjectRole(roleId)}
                    title="Remove role"
                    type="button"
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
              {isAddingRole ? (
                <div className="overview-table-row add role-add-row">
                  <input onChange={(event) => setNewRoleName(event.target.value)} placeholder="Role" value={newRoleName} />
                  <input onChange={(event) => setNewRolePeople(event.target.value)} placeholder="People" value={newRolePeople} />
                  <button
                    aria-label="Add role to project team"
                    className="icon-action-button confirm"
                    disabled={!newRoleName.trim() || !newRolePeople.trim()}
                    onClick={handleAddProjectRole}
                    title="Add role"
                    type="button"
                  >
                    <CheckIcon />
                  </button>
                </div>
              ) : null}
              <div className="overview-table-actions">
                <button aria-label="Save project details" className="icon-action-button confirm" title="Save" type="submit">
                  <CheckIcon />
                </button>
                <button
                  aria-label="Cancel project details edit"
                  className="icon-action-button"
                  onClick={cancelProjectTeamEdit}
                  title="Cancel"
                  type="button"
                >
                  <XIcon />
                </button>
              </div>
            </form>
          ) : (
            <div className="overview-table role-table">
              <div className="overview-table-head">
                <span>Role</span>
                <span>Details</span>
                <span />
              </div>
              {projectRoleFields.map((field) => (
                <div className="overview-table-row" key={field.id}>
                  <strong>{field.label}</strong>
                  <span>{project.roleDetails?.[field.id] || "Not set"}</span>
                  <span />
                </div>
              ))}
              {customProjectRoleKeys(project.roleDetails).map((roleId) => (
                <div className="overview-table-row" key={roleId}>
                  <strong>{roleId}</strong>
                  <span>{project.roleDetails?.[roleId] || "Not set"}</span>
                  <span />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="overview-section">
          <div className="overview-section-heading compact">
            <div>
              <h2>Useful links</h2>
              <p>Docs, designs, or references.</p>
            </div>
            <button
              aria-expanded={isAddingLink}
              aria-label="Add useful link"
              className="icon-action-button confirm"
              onClick={beginLinkAdd}
              title="Add useful link"
              type="button"
            >
              <PlusIcon />
            </button>
          </div>
          <div className="overview-table links-table">
            <div className="overview-table-head">
              <span>Name</span>
              <span>Link</span>
              <span />
            </div>
            {projectLinks.map((link) => (
              <div className="overview-table-row project-link-row" key={link.id}>
                <strong>{link.name}</strong>
                {link.address ? (
                  <a className="project-link-anchor" href={linkHrefFromText(link.address) || link.address} rel="noreferrer" target="_blank">
                    {link.linkText}
                  </a>
                ) : (
                  <span>{link.linkText}</span>
                )}
                <div className="row-actions">
                  <button aria-label="Edit useful link" className="icon-action-button" onClick={() => beginLinkEdit(link)} type="button"><EditIcon /></button>
                  <button
                    aria-label="Delete useful link"
                    className="icon-action-button danger"
                    onClick={() => {
                      if (window.confirm(`Delete ${link.name}?`)) onDeleteProjectLink(link);
                    }}
                    type="button"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {isAddingLink || editingLinkId ? (
        <div className="modal-backdrop" role="presentation">
          <form
            aria-label={editingLinkId ? "Edit useful link" : "Add useful link"}
            className="confirmation-dialog useful-link-dialog"
            onSubmit={editingLinkId ? handleLinkEdit : handleAddLink}
          >
            <h2>{editingLinkId ? "Edit useful link" : "Add useful link"}</h2>
            <label>
              <span>Name</span>
              <input onChange={(event) => setLinkName(event.target.value)} placeholder="Design doc" value={linkName} />
            </label>
            <label>
              <span>Address</span>
              <input onChange={(event) => setLinkAddress(event.target.value)} placeholder="https://example.com" value={linkAddress} />
            </label>
            <label>
              <span>Link text</span>
              <input onChange={(event) => setLinkText(event.target.value)} placeholder="Open design doc" value={linkText} />
            </label>
            <div className="dialog-actions">
              <button
                className="primary-action"
                disabled={!linkName.trim() || !linkAddress.trim() || !linkText.trim()}
                type="submit"
              >
                Save
              </button>
              <button className="secondary-action" onClick={closeLinkDialog} type="button">Cancel</button>
            </div>
          </form>
        </div>
      ) : null}

      <section className="overview-section milestone-section">
        <div className="overview-section-heading">
          <div>
            <h2>Milestones</h2>
            <p>{completePhaseCount} of {phases.length} phases complete · {overallProgress}% progress</p>
          </div>
          <div className="milestone-header-actions">
            <button
              className="secondary-action compact"
              onClick={() => {
                setIsPhaseTrackerCollapsed((isCollapsed) => {
                  if (isCollapsed) {
                    setExpandedPhaseId(phases.find((phase) => phase.status !== "done")?.id ?? phases[0]?.id ?? null);
                    return false;
                  }
                  setExpandedPhaseId(null);
                  return true;
                });
              }}
              type="button"
            >
              {isPhaseTrackerCollapsed ? "Show phases" : "Collapse phases"}
            </button>
            <button className="secondary-action compact" onClick={() => setIsPhaseDialogOpen(true)} type="button">
              <PlusIcon /> Phase
            </button>
            <button
              className="primary-action compact"
              onClick={() => {
                setNewItemPhaseId(String(expandedPhase?.id ?? phases[0]?.id ?? ""));
                setIsItemDialogOpen(true);
              }}
              type="button"
            >
              <PlusIcon /> Item
            </button>
          </div>
        </div>

        <div className="milestone-progress-panel">
          <div className="progress-ring" style={{ "--progress": `${overallProgress}%` }}>
            <span>{overallProgress}%</span>
          </div>
          <div>
            <strong>Project progress</strong>
            <span>{completeSubtypeCount} of {totalSubtypeCount} checklist items complete</span>
          </div>
          <div>
            <strong>Next</strong>
            <span>{nextSubtype ? `${nextPhase.name}: ${nextSubtype.title}` : "All milestone items are complete"}</span>
          </div>
          <div>
            <strong>Phases</strong>
            <span>{completePhaseCount} complete, {Math.max(phases.length - completePhaseCount, 0)} remaining</span>
          </div>
        </div>

        {!isPhaseTrackerCollapsed ? (
          <>
            <div className="phase-strip" aria-label="Project phases">
              {phases.map((phase, index) => (
                <div
                  className={`phase-step-shell ${expandedPhase?.id === phase.id ? "active" : ""} ${draggedPhaseId === phase.id ? "dragging" : ""} ${dragOverPhaseId === phase.id && draggedPhaseId !== phase.id ? "drop-target" : ""}`}
                  draggable
                  key={phase.id}
                  onDragEnd={() => {
                    setDraggedPhaseId(null);
                    setDragOverPhaseId(null);
                  }}
                  onDragEnter={() => {
                    if (draggedPhaseId && draggedPhaseId !== phase.id) setDragOverPhaseId(phase.id);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (draggedPhaseId && draggedPhaseId !== phase.id) setDragOverPhaseId(phase.id);
                  }}
                  onDragStart={(event) => {
                    setDraggedPhaseId(phase.id);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (!draggedPhaseId || draggedPhaseId === phase.id) return;
                    onReorderPhases(project.id, reorderedIds(phases, draggedPhaseId, phase.id));
                    setDraggedPhaseId(null);
                    setDragOverPhaseId(null);
                  }}
                >
                  <button
                    aria-expanded={expandedPhase?.id === phase.id}
                    className={`phase-step ${phase.status} ${expandedPhase?.id === phase.id ? "active" : ""}`}
                    onClick={() => setExpandedPhaseId((currentPhaseId) => currentPhaseId === phase.id ? null : phase.id)}
                    type="button"
                  >
                    <span className="phase-dot" />
                    <span>{index + 1}. {phase.name}</span>
                    <em>{phase.progress}%</em>
                    <ChevronRightIcon />
                  </button>
                </div>
              ))}
            </div>

            {expandedPhase ? (
              <div className="phase-detail">
            {editingPhaseId === expandedPhase.id ? (
              <form className="phase-title-edit" onSubmit={handlePhaseEdit}>
                <input onChange={(event) => setPhaseName(event.target.value)} value={phaseName} />
                <input onChange={(event) => setPhaseMilestone(event.target.value)} value={phaseMilestone} />
                <button aria-label="Save phase" className="icon-action-button confirm" title="Save" type="submit"><CheckIcon /></button>
                <button aria-label="Cancel phase edit" className="icon-action-button" onClick={() => setEditingPhaseId(null)} title="Cancel" type="button"><XIcon /></button>
              </form>
            ) : (
              <div className="phase-detail-heading">
                <div>
                  <h3>{expandedPhase.name}</h3>
                  <p>{expandedPhase.milestone}</p>
                </div>
                <div className="row-actions visible">
                  <button aria-label="Edit phase" className="icon-action-button" onClick={() => beginPhaseEdit(expandedPhase)} type="button"><EditIcon /></button>
                  <button
                    aria-label="Delete phase"
                    className="icon-action-button danger"
                    onClick={() => {
                      if (window.confirm(`Delete ${expandedPhase.name}?`)) onDeletePhase(expandedPhase);
                    }}
                    type="button"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            )}

            <div className="phase-items table">
              <div className="phase-items-head">
                <span>Item</span>
                <span>Actions</span>
              </div>
              {expandedPhase.items.map((item) => (
                <div
                  className={`phase-item-row ${draggedItemId === item.id ? "dragging" : ""} ${dragOverItemId === item.id && draggedItemId !== item.id ? "drop-target" : ""}`}
                  draggable
                  key={item.id}
                  onDragEnd={() => {
                    setDraggedItemId(null);
                    setDragOverItemId(null);
                  }}
                  onDragEnter={() => {
                    if (draggedItemId && draggedItemId !== item.id) setDragOverItemId(item.id);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (draggedItemId && draggedItemId !== item.id) setDragOverItemId(item.id);
                  }}
                  onDragStart={(event) => {
                    setDraggedItemId(item.id);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (!draggedItemId || draggedItemId === item.id) return;
                    onReorderPhaseItems(expandedPhase.id, reorderedIds(expandedPhase.items, draggedItemId, item.id));
                    setDraggedItemId(null);
                    setDragOverItemId(null);
                  }}
                >
                  <input
                    aria-label={`Mark ${item.title} complete`}
                    checked={item.completed}
                    onChange={(event) => onUpdatePhaseItem(item.id, { completed: event.target.checked })}
                    type="checkbox"
                  />
                  {editingItemId === item.id ? (
                    <form className="phase-item-edit" onSubmit={handleItemEdit}>
                      <input onChange={(event) => setItemTitle(event.target.value)} value={itemTitle} />
                      <button aria-label="Save subtype" className="icon-action-button confirm" title="Save" type="submit"><CheckIcon /></button>
                      <button aria-label="Cancel subtype edit" className="icon-action-button" onClick={() => setEditingItemId(null)} title="Cancel" type="button"><XIcon /></button>
                    </form>
                  ) : (
                    <>
                      <span className={item.completed ? "complete" : ""}>{item.title}</span>
                      <div className="row-actions">
                        <button aria-label="Edit subtype" className="icon-action-button" onClick={() => beginItemEdit(item)} type="button"><EditIcon /></button>
                        <button
                          aria-label="Delete subtype"
                          className="icon-action-button danger"
                          onClick={() => {
                            if (window.confirm(`Delete ${item.title}?`)) onDeletePhaseItem(item);
                          }}
                          type="button"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

              </div>
            ) : null}
          </>
        ) : null}
      </section>

      <ProjectMemoryLane actions={actions} decisions={decisions} updates={updates} />

      {isPhaseDialogOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="add-milestone-phase-title"
            aria-modal="true"
            className="confirmation-dialog milestone-item-dialog"
            role="dialog"
          >
            <div>
              <p className="eyebrow">Milestone phase</p>
              <h2 id="add-milestone-phase-title">Add phase</h2>
            </div>
            <form className="milestone-item-form" onSubmit={handleAddPhase}>
              <label>
                Phase name
                <input
                  autoFocus
                  onChange={(event) => setNewPhaseName(event.target.value)}
                  placeholder="Phase name"
                  value={newPhaseName}
                />
              </label>
              <label>
                Subtypes
                <textarea
                  onChange={(event) => setNewPhaseItems(event.target.value)}
                  placeholder="One subtype per line"
                  value={newPhaseItems}
                />
              </label>
              <div className="dialog-actions">
                <button
                  className="secondary-action"
                  onClick={() => {
                    setIsPhaseDialogOpen(false);
                    setNewPhaseName("");
                    setNewPhaseItems("");
                  }}
                  type="button"
                >
                  Cancel
                </button>
                <button className="primary-action" disabled={!newPhaseName.trim()} type="submit">
                  Add phase
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {isItemDialogOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="add-milestone-item-title"
            aria-modal="true"
            className="confirmation-dialog milestone-item-dialog"
            role="dialog"
          >
            <div>
              <p className="eyebrow">Milestone item</p>
              <h2 id="add-milestone-item-title">Add subtype</h2>
            </div>
            <form className="milestone-item-form" onSubmit={handleAddItem}>
              <label>
                Phase
                <select onChange={(event) => setNewItemPhaseId(event.target.value)} value={newItemPhaseId || String(expandedPhase?.id ?? phases[0]?.id ?? "")}>
                  {phases.map((phase) => (
                    <option key={phase.id} value={phase.id}>
                      {phase.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Subtype
                <input
                  autoFocus
                  onChange={(event) => setNewItemTitle(event.target.value)}
                  placeholder="Subtype name"
                  value={newItemTitle}
                />
              </label>
              <div className="dialog-actions">
                <button
                  className="secondary-action"
                  onClick={() => {
                    setIsItemDialogOpen(false);
                    setNewItemPhaseId("");
                    setNewItemTitle("");
                  }}
                  type="button"
                >
                  Cancel
                </button>
                <button className="primary-action" disabled={!newItemTitle.trim()} type="submit">
                  Add item
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
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

  const [copied, setCopied] = useState(false);
  const sections = [
    { label: "Completed", items: summary.done ?? [] },
    { label: "Pending", items: summary.pending ?? [] },
    { label: "Blocked", items: summary.blocked ?? [] },
    { label: "Risks", items: summary.risks ?? [] },
    { label: "Key Decisions", items: summary.keyDecisions ?? [] },
    { label: "Customer Asks", items: summary.customerAsks ?? [] },
    { label: "Next Steps", items: summary.nextSteps ?? [] },
  ];
  const summaryText = projectSummaryText(project, summary);
  const statusTone = String(summary.status || "Yellow").toLowerCase();

  async function handleCopySummary() {
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

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
          <p className="eyebrow">Executive summary</p>
          <h2 id="project-summary-title">{summary.headline || project.name}</h2>
          <div className="executive-summary-meta">
            <span className={`health-pill ${statusTone}`}>
              <span>Status</span>
              <strong>{summary.status || "Yellow"}</strong>
            </span>
            {summary.reportDate ? <span>{formatDisplayDate(summary.reportDate)}</span> : null}
          </div>
        </div>
        <div className="summary-dialog-body">
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
          <button className="secondary-action" onClick={handleCopySummary} type="button">
            {copied ? "Copied" : "Copy"}
          </button>
          <a
            className="secondary-action"
            download={`${project.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-summary.txt`}
            href={`data:text/plain;charset=utf-8,${encodeURIComponent(summaryText)}`}
          >
            Export text
          </a>
          <button className="secondary-action" onClick={onClose} type="button">
            Close
          </button>
        </div>
      </section>
    </div>
  );
}

function ProjectAskDialog({ onAskQuestion, onClose, project }) {
  const [answer, setAnswer] = useState(null);
  const [error, setError] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [question, setQuestion] = useState("");

  async function handleAsk(event) {
    event.preventDefault();
    if (!question.trim()) return;
    try {
      setIsAsking(true);
      setError("");
      const result = await onAskQuestion(project.id, question);
      setAnswer(result);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not answer from project memory.");
    } finally {
      setIsAsking(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="project-ask-title"
        aria-modal="true"
        className="confirmation-dialog summary-dialog project-ask-dialog"
        role="dialog"
      >
        <div className="summary-dialog-header">
          <p className="eyebrow">Project memory</p>
          <h2 id="project-ask-title">Ask Project Pulse</h2>
        </div>
        <form className="project-ask-form" onSubmit={handleAsk}>
          <label>
            Question
            <input
              autoFocus
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="What is still pending from the last update?"
              value={question}
            />
          </label>
          <button className="primary-action" disabled={isAsking || !question.trim()} type="submit">
            {isAsking ? "Asking" : "Ask"}
          </button>
        </form>
        {error ? <p className="upload-error" role="alert">{error}</p> : null}
        {answer ? (
          <div className="project-ask-answer">
            <strong>Answer</strong>
            <p>{answer.answer}</p>
            {answer.sources?.length ? (
              <div className="project-ask-sources">
                <span>Sources</span>
                {answer.sources.map((source, index) => (
                  <article key={`${source.label}-${source.date}-${index}`}>
                    <strong>
                      {source.label}
                      {source.date ? ` · ${formatDisplayDate(source.date)}` : ""}
                    </strong>
                    <p>{source.text}</p>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="memory-lane-summary">Ask about decisions, pending work, blockers, milestones, or recent notes.</p>
        )}
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

function ActionAgeIndicator({ action }) {
  const label = actionAgeLabel(action);
  if (!label) return null;
  return <span className="age-indicator">{label}</span>;
}

function DecisionStatusDots({ allowAll = false, label = "Status", onChange, value }) {
  const options = allowAll ? [{ label: "All", value: "all" }, ...decisionStatuses] : decisionStatuses;
  return (
    <div className="decision-status-field">
      <span>{label}</span>
      <div className="decision-status-dots">
        {options.map((status) => (
          <button
            aria-label={`${label}: ${status.label}`}
            aria-pressed={value === status.value}
            className={`decision-status-dot ${status.value} ${value === status.value ? "selected" : ""}`}
            key={status.value}
            onClick={() => onChange(status.value)}
            title={status.label}
            type="button"
          />
        ))}
      </div>
    </div>
  );
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
  onAddAction,
  onCleanDuplicates,
  onCompletionDateChange,
  onDeleteAction,
  onDeleteActions,
  onOwnerChange,
  onStatusChange,
  onTagChange,
  project,
}) {
  const [completionDate, setCompletionDate] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draggedActionId, setDraggedActionId] = useState(null);
  const [dragOverStatus, setDragOverStatus] = useState(null);
  const [editingDateActionId, setEditingDateActionId] = useState(null);
  const [editingOwnerActionId, setEditingOwnerActionId] = useState(null);
  const [editingTagActionId, setEditingTagActionId] = useState(null);
  const [editError, setEditError] = useState("");
  const [editingActionId, setEditingActionId] = useState(null);
  const [isDoneExpanded, setIsDoneExpanded] = useState(false);
  const [isAddingAction, setIsAddingAction] = useState(false);
  const [dueFilter, setDueFilter] = useState("all");
  const [meetingEndDate, setMeetingEndDate] = useState("");
  const [meetingStartDate, setMeetingStartDate] = useState("");
  const [openActionMenuId, setOpenActionMenuId] = useState(null);
  const [owner, setOwner] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [selectedActionIds, setSelectedActionIds] = useState([]);
  const [tag, setTag] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [tagSearch, setTagSearch] = useState("");
  const [title, setTitle] = useState("");
  const [density, setDensity] = useState("compact");

  useEffect(() => {
    setCompletionDate("");
    setDraftTitle("");
    setDraggedActionId(null);
    setDragOverStatus(null);
    setEditingDateActionId(null);
    setEditingOwnerActionId(null);
    setEditingTagActionId(null);
    setEditError("");
    setEditingActionId(null);
    setIsDoneExpanded(false);
    setIsAddingAction(false);
    setDueFilter("all");
    setMeetingEndDate("");
    setMeetingStartDate("");
    setOpenActionMenuId(null);
    setOwner("");
    setOwnerFilter("all");
    setSelectedActionIds([]);
    setTag("");
    setTagDraft("");
    setTagSearch("");
    setTitle("");
    setDensity("compact");
  }, [project.id]);

  useEffect(() => {
    const validIds = new Set(actions.map((action) => action.id));
    setSelectedActionIds((currentIds) => currentIds.filter((actionId) => validIds.has(actionId)));
  }, [actions]);

  function beginActionEdit(action) {
    setDraftTitle(action.title);
    setEditingDateActionId(null);
    setEditingOwnerActionId(null);
    setEditingTagActionId(null);
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

  async function handleSubmitNewAction(event) {
    event.preventDefault();
    if (!title.trim()) return;
    await onAddAction({
      completionDate: completionDate || null,
      owner: owner || null,
      status: "active",
      tag: tag || null,
      title,
    });
    setCompletionDate("");
    setOwner("");
    setTag("");
    setTitle("");
    setIsAddingAction(false);
  }

  function cancelAddAction() {
    setCompletionDate("");
    setOwner("");
    setTag("");
    setTitle("");
    setIsAddingAction(false);
  }

  async function saveActionTag(event, action) {
    event.preventDefault();
    await onTagChange(action.id, tagDraft || null);
    setEditingTagActionId(null);
    setTagDraft("");
  }

  function cancelActionTagEdit() {
    setEditingTagActionId(null);
    setTagDraft("");
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
    const visibleIds = filteredDisplayActions.map((action) => action.id);
    setSelectedActionIds((currentIds) => {
      if (checked) {
        return Array.from(new Set(currentIds.concat(visibleIds)));
      }
      const visibleIdSet = new Set(visibleIds);
      return currentIds.filter((actionId) => !visibleIdSet.has(actionId));
    });
  }

  function clearActionBoardFilters() {
    setOwnerFilter("all");
    setDueFilter("all");
    setMeetingStartDate("");
    setMeetingEndDate("");
    setTagSearch("");
  }

  const displayActions = dedupeActionsForDisplay(actions);
  const hiddenDuplicateCount = actions.length - displayActions.length;
  const filteredDisplayActions = displayActions.filter(
    (action) => {
      const ownerMatches =
        ownerFilter === "all" || (ownerFilter === "" ? action.owner === null : action.owner === ownerFilter);
      return (
        ownerMatches &&
        actionMatchesDueFilter(action, dueFilter) &&
        actionMatchesTagSearch(action, tagSearch) &&
        actionMatchesMeetingRange(action, meetingStartDate, meetingEndDate)
      );
    },
  );
  const selectedActions = actions.filter((action) => selectedActionIds.includes(action.id));
  const allVisibleSelected =
    filteredDisplayActions.length > 0 &&
    filteredDisplayActions.every((action) => selectedActionIds.includes(action.id));
  const actionsByStatus = actionStatuses.reduce((collection, status) => {
    collection[status.value] = filteredDisplayActions
      .filter((action) => action.status === status.value)
      .sort(compareActionsByDueDateAndStatus);
    return collection;
  }, {});

  return (
    <div className={`status-board-wrap ${density}`}>
      {hiddenDuplicateCount || actions.length ? (
        <div className="board-toolbar compact">
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
          <label className="compact-filter due-filter">
            Due
            <select onChange={(event) => setDueFilter(event.target.value)} value={dueFilter}>
              <option value="all">All</option>
              <option value="overdue">Overdue</option>
              <option value="today">Today</option>
              <option value="week">This week</option>
            </select>
          </label>
          <label className="compact-filter tag-filter">
            Tag
            <input
              onChange={(event) => setTagSearch(event.target.value)}
              placeholder="#tag"
              type="search"
              value={tagSearch}
            />
          </label>
          <label className="compact-filter date-filter">
            Meeting from
            <input
              onChange={(event) => setMeetingStartDate(event.target.value)}
              type="date"
              value={meetingStartDate}
            />
          </label>
          <label className="compact-filter date-filter">
            Meeting to
            <input
              onChange={(event) => setMeetingEndDate(event.target.value)}
              type="date"
              value={meetingEndDate}
            />
          </label>
          <button
            aria-label="Clear action board filters"
            className="icon-action-button board-clear-filter-button"
            disabled={ownerFilter === "all" && dueFilter === "all" && !tagSearch && !meetingStartDate && !meetingEndDate}
            onClick={clearActionBoardFilters}
            title="Clear filters"
            type="button"
          >
            <XIcon />
          </button>
          <label className="inline-check bulk-select">
            <input
              checked={allVisibleSelected}
              disabled={!filteredDisplayActions.length}
              onChange={(event) => handleSelectVisibleActions(event.target.checked)}
              type="checkbox"
            />
            <span>Select All</span>
          </label>
          <button
            aria-label={`Delete selected actions${selectedActions.length ? ` (${selectedActions.length})` : ""}`}
            className="icon-action-button danger bulk-delete-button"
            disabled={!selectedActions.length}
            onClick={() => onDeleteActions(selectedActions)}
            title={selectedActions.length ? `Delete ${selectedActions.length} selected actions` : "Delete selected actions"}
            type="button"
          >
            <TrashIcon />
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
          <button
            aria-label="Add action item"
            className="icon-action-button add-action-button"
            onClick={() => setIsAddingAction(true)}
            title="Add action item"
            type="button"
          >
            <PlusIcon />
          </button>
        </div>
      ) : null}
      {!actions.length ? (
        <section className="empty-guidance">
          <strong>No action items yet</strong>
          <p>Add a new action here, or extract action items from Meeting Notes.</p>
          <button className="primary-action compact empty-action-button" onClick={() => setIsAddingAction(true)} type="button">
            <PlusIcon />
            Add action
          </button>
        </section>
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
                      <label className="action-select-control board-select-control" title="Select action">
                        <input
                          checked={selectedActionIds.includes(action.id)}
                          onChange={(event) => handleSelectAction(action.id, event.target.checked)}
                          type="checkbox"
                        />
                      </label>
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
                          setEditingTagActionId(null);
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
                          setEditingTagActionId(null);
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
                    {editingTagActionId === action.id ? (
                      <form className="action-tag-edit-form" onSubmit={(event) => saveActionTag(event, action)}>
                        <input
                          aria-label={`Tag for ${action.title}`}
                          autoFocus
                          onChange={(event) => setTagDraft(event.target.value)}
                          placeholder="#tag"
                          value={tagDraft}
                        />
                        <button aria-label="Save action tag" className="icon-action-button confirm" title="Save" type="submit">
                          <CheckIcon />
                        </button>
                        <button
                          aria-label="Cancel action tag edit"
                          className="icon-action-button"
                          onClick={cancelActionTagEdit}
                          title="Cancel"
                          type="button"
                        >
                          <XIcon />
                        </button>
                      </form>
                    ) : (
                      <button
                        className={`meta-pill tag ${action.tag ? "" : "empty"}`}
                        onClick={() => {
                          setEditingOwnerActionId(null);
                          setEditingDateActionId(null);
                          setEditingTagActionId(action.id);
                          setTagDraft(actionTagLabel(action));
                        }}
                        type="button"
                      >
                        {actionTagLabel(action) || "No tag"}
                      </button>
                    )}
                    <ActionDueIndicator action={action} />
                    <ActionAgeIndicator action={action} />
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
      {isAddingAction ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="new-action-title"
            aria-modal="true"
            className="confirmation-dialog action-create-dialog"
            role="dialog"
          >
            <div>
              <p className="eyebrow">Action Board</p>
              <h2 id="new-action-title">Add action</h2>
            </div>
            <form className="stacked-form" onSubmit={handleSubmitNewAction}>
              <label>
                Action item
                <input
                  autoFocus
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Follow up on launch checklist"
                  value={title}
                />
              </label>
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
                Tag
                <input
                  onChange={(event) => setTag(event.target.value)}
                  placeholder="#tag"
                  value={tag}
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
              <div className="dialog-actions">
                <button className="secondary-action" onClick={cancelAddAction} type="button">
                  Cancel
                </button>
                <button className="primary-action" disabled={!title.trim()} type="submit">
                  Add action
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function MeetingNotes({
  onConfirmExtractedActions,
  onAddAction,
  onDeleteDecision,
  onDeleteProjectNote,
  onExtractActions,
  onSaveDecision,
  onSaveProjectNote,
  onUpdateDecision,
  onUpdateProjectNote,
  decisions,
  project,
  updates,
}) {
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingNoteDate, setEditingNoteDate] = useState("");
  const [editingNoteText, setEditingNoteText] = useState("");
  const [editingDecisionId, setEditingDecisionId] = useState(null);
  const [editingDecisionDate, setEditingDecisionDate] = useState("");
  const [editingDecisionOwner, setEditingDecisionOwner] = useState("");
  const [editingDecisionStatus, setEditingDecisionStatus] = useState("active");
  const [editingDecisionText, setEditingDecisionText] = useState("");
  const [editingDraftActionId, setEditingDraftActionId] = useState(null);
  const [editingDraftSnapshot, setEditingDraftSnapshot] = useState(null);
  const [extractionStatus, setExtractionStatus] = useState(null);
  const [meetingActionDueDate, setMeetingActionDueDate] = useState("");
  const [meetingActionOwner, setMeetingActionOwner] = useState("");
  const [meetingActionTag, setMeetingActionTag] = useState("");
  const [meetingActionTitle, setMeetingActionTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState(todayDateInputValue());
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState(null);
  const [selectedDraftActionIds, setSelectedDraftActionIds] = useState([]);
  const [selectedDraftMemoryIds, setSelectedDraftMemoryIds] = useState([]);
  const [extractError, setExtractError] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [isAddingMeetingAction, setIsAddingMeetingAction] = useState(false);
  const [isDecisionLogExpanded, setIsDecisionLogExpanded] = useState(false);
  const [isFeedExpanded, setIsFeedExpanded] = useState(false);
  const [isAddingDecision, setIsAddingDecision] = useState(false);
  const [memoryTab, setMemoryTab] = useState("decisions");
  const [lastSavedNoteKey, setLastSavedNoteKey] = useState("");
  const [bulkDraftDueDate, setBulkDraftDueDate] = useState("");
  const [bulkDraftOwner, setBulkDraftOwner] = useState("");
  const [newDecisionDate, setNewDecisionDate] = useState(todayDateInputValue());
  const [newDecisionOwner, setNewDecisionOwner] = useState("");
  const [newDecisionStatus, setNewDecisionStatus] = useState("active");
  const [newDecisionText, setNewDecisionText] = useState("");
  const [decisionDateFromFilter, setDecisionDateFromFilter] = useState("");
  const [decisionDateToFilter, setDecisionDateToFilter] = useState("");
  const [decisionOwnerFilter, setDecisionOwnerFilter] = useState("all");
  const [decisionStatusFilter, setDecisionStatusFilter] = useState("all");
  const [noteDateFromFilter, setNoteDateFromFilter] = useState("");
  const [noteDateToFilter, setNoteDateToFilter] = useState("");
  const [expandedNoteIds, setExpandedNoteIds] = useState([]);
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    setEditingNoteId(null);
    setEditingNoteDate("");
    setEditingNoteText("");
    setEditingDecisionId(null);
    setEditingDecisionDate("");
    setEditingDecisionOwner("");
    setEditingDecisionStatus("active");
    setEditingDecisionText("");
    setEditingDraftActionId(null);
    setEditingDraftSnapshot(null);
    setExtractionStatus(null);
    setIsDecisionLogExpanded(false);
    setIsFeedExpanded(false);
    setIsAddingDecision(false);
    setLastSavedNoteKey("");
    setIsAddingMeetingAction(false);
    setMeetingActionDueDate("");
    setMeetingActionOwner("");
    setMeetingActionTag("");
    setMeetingActionTitle("");
    setMeetingDate(todayDateInputValue());
    setMemoryTab("decisions");
    setNewDecisionDate(todayDateInputValue());
    setNewDecisionOwner("");
    setNewDecisionStatus("active");
    setNewDecisionText("");
    setDecisionDateFromFilter("");
    setDecisionDateToFilter("");
    setDecisionOwnerFilter("all");
    setDecisionStatusFilter("all");
    setNoteDateFromFilter("");
    setNoteDateToFilter("");
    setExpandedNoteIds([]);
    setPreview(null);
    setSelectedDraftActionIds([]);
    setSelectedDraftMemoryIds([]);
    setBulkDraftDueDate("");
    setBulkDraftOwner("");
  }, [project.id]);

  useEffect(() => {
    const validDraftIds = new Set((preview?.actions ?? []).map((action) => action.draftId));
    setSelectedDraftActionIds((currentIds) => currentIds.filter((draftId) => validDraftIds.has(draftId)));
  }, [preview?.actions]);

  useEffect(() => {
    const validDraftIds = new Set([
      ...(preview?.memorySuggestions?.decisions ?? []),
      ...(preview?.memorySuggestions?.blockers ?? []),
    ].map((item) => item.draftId));
    setSelectedDraftMemoryIds((currentIds) => currentIds.filter((draftId) => validDraftIds.has(draftId)));
  }, [preview?.memorySuggestions]);

  const decisionOwnerOptions = [
    ...new Set(
      decisions
        .map((decision) => decision.owner)
        .filter(Boolean)
        .concat(project.members),
    ),
  ].sort((left, right) => left.localeCompare(right));
  const filteredDecisions = decisions.filter((decision) => {
    const ownerMatches = decisionOwnerFilter === "all" || (decision.owner || "") === decisionOwnerFilter;
    const statusMatches = decisionStatusFilter === "all" || (decision.status || "active") === decisionStatusFilter;
    const dateTime = decision.decisionDate ? parseDateOnly(decision.decisionDate)?.getTime() : null;
    const fromTime = decisionDateFromFilter ? parseDateOnly(decisionDateFromFilter)?.getTime() : null;
    const toTime = decisionDateToFilter ? parseDateOnly(decisionDateToFilter)?.getTime() : null;
    const fromMatches = !Number.isFinite(fromTime) || (Number.isFinite(dateTime) && dateTime >= fromTime);
    const toMatches = !Number.isFinite(toTime) || (Number.isFinite(dateTime) && dateTime <= toTime);
    return ownerMatches && statusMatches && fromMatches && toMatches;
  });
  const hasDecisionFilters =
    decisionOwnerFilter !== "all" || decisionStatusFilter !== "all" || decisionDateFromFilter || decisionDateToFilter;
  const filteredUpdates = updates.filter((update) => {
    const dateTime = update.meetingDate ? parseDateOnly(update.meetingDate)?.getTime() : null;
    const fromTime = noteDateFromFilter ? parseDateOnly(noteDateFromFilter)?.getTime() : null;
    const toTime = noteDateToFilter ? parseDateOnly(noteDateToFilter)?.getTime() : null;
    const fromMatches = !Number.isFinite(fromTime) || (Number.isFinite(dateTime) && dateTime >= fromTime);
    const toMatches = !Number.isFinite(toTime) || (Number.isFinite(dateTime) && dateTime <= toTime);
    return fromMatches && toMatches;
  });
  const hasNoteFilters = noteDateFromFilter || noteDateToFilter;

  function beginNoteEdit(update) {
    setEditingNoteId(update.id);
    setEditingNoteDate(update.meetingDate || "");
    setEditingNoteText(update.text);
    setExpandedNoteIds((currentIds) => (currentIds.includes(update.id) ? currentIds : currentIds.concat(update.id)));
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

  function cancelNoteEdit() {
    setEditingNoteId(null);
    setEditingNoteDate("");
    setEditingNoteText("");
  }

  function toggleProjectNote(updateId) {
    setExpandedNoteIds((currentIds) =>
      currentIds.includes(updateId)
        ? currentIds.filter((currentId) => currentId !== updateId)
        : currentIds.concat(updateId),
    );
  }

  function clearNotesWorkspace() {
    setNotes("");
    setUploadedFileName("");
    setLastSavedNoteKey("");
  }

  async function addNotesWithoutExtraction(source) {
    if (!notes.trim()) {
      setExtractError("Add notes before saving.");
      return;
    }

    try {
      setIsExtracting(true);
      setExtractError("");
      setExtractionStatus({ message: "Saving note", tone: "progress" });
      await onSaveProjectNote({ meetingDate, text: notes, source });
      setExtractionStatus({ message: "Note added", tone: "success" });
      setPreview(null);
      setSelectedDraftActionIds([]);
      setSelectedDraftMemoryIds([]);
      setEditingDraftActionId(null);
      setEditingDraftSnapshot(null);
      clearNotesWorkspace();
    } catch (error) {
      setExtractError(error instanceof Error ? error.message : "Could not add notes.");
    } finally {
      setIsExtracting(false);
    }
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
      const extractedActions = dedupeDraftActions(
        Array.isArray(extraction.actions)
          ? extraction.actions.map((action) => ({
              completionDate: action.completionDate || "",
              draftId: makeDraftActionId(),
              meetingDate: action.meetingDate || meetingDate || "",
              owner: action.owner || "",
              source: action.source || source,
              status: action.status || "active",
              tag: action.tag || "",
              title: action.title || "",
            }))
          : [],
      );
      const memorySuggestions = {
        blockers: Array.isArray(extraction.memorySuggestions?.blockers)
          ? extraction.memorySuggestions.blockers.map((text) => ({ draftId: makeDraftMemoryId(), text }))
          : [],
        decisions: Array.isArray(extraction.memorySuggestions?.decisions)
          ? extraction.memorySuggestions.decisions.map((text) => ({ draftId: makeDraftMemoryId(), text }))
          : [],
      };
      const actionsFound = extractedActions.length;
      const memorySuggestionCount = memorySuggestions.decisions.length + memorySuggestions.blockers.length;
      setExtractionStatus(
        actionsFound
          ? { message: `${actionsFound} actions ready to review`, tone: "success" }
          : memorySuggestionCount
            ? { message: `${memorySuggestionCount} memory updates ready to review`, tone: "success" }
            : { message: "No actions found", tone: "empty" },
      );
      setPreview(actionsFound || memorySuggestionCount ? {
        actions: extractedActions,
        actionsAdded: 0,
        confirmed: false,
        memorySuggestions,
        meetingDate,
        points: extraction.points?.length ? extraction.points : [],
        source,
      } : null);
      setSelectedDraftActionIds([]);
      setSelectedDraftMemoryIds([]);
      setEditingDraftActionId(null);
      setEditingDraftSnapshot(null);
    } catch (error) {
      setExtractError(error instanceof Error ? error.message : "Could not extract actions.");
      if (noteWasSaved) {
        setExtractionStatus({ message: "No actions found", tone: "empty" });
        setPreview(null);
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
      setPreview(null);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Could not read this notes file.");
    } finally {
      event.target.value = "";
    }
  }

  function handleMeetingTemplateSelect(templateText) {
    setNotes(templateText);
    setUploadedFileName("");
    setUploadError("");
    setExtractError("");
    setExtractionStatus(null);
    setPreview(null);
    setSelectedDraftActionIds([]);
    setSelectedDraftMemoryIds([]);
    setBulkDraftOwner("");
    setBulkDraftDueDate("");
    setEditingDraftActionId(null);
    setEditingDraftSnapshot(null);
  }

  async function handleDecisionSubmit(event) {
    event.preventDefault();
    if (!newDecisionText.trim()) return;
    await onSaveDecision({
      decisionDate: newDecisionDate || null,
      owner: newDecisionOwner || null,
      status: newDecisionStatus,
      text: newDecisionText,
    });
    setNewDecisionText("");
    setNewDecisionDate(todayDateInputValue());
    setNewDecisionOwner("");
    setNewDecisionStatus("active");
    setIsAddingDecision(false);
  }

  function beginDecisionEdit(decision) {
    setEditingDecisionId(decision.id);
    setEditingDecisionDate(decision.decisionDate || "");
    setEditingDecisionOwner(decision.owner || "");
    setEditingDecisionStatus(decision.status || "active");
    setEditingDecisionText(decision.text);
    setIsAddingDecision(false);
  }

  async function handleDecisionUpdate(event) {
    event.preventDefault();
    if (!editingDecisionId || !editingDecisionText.trim()) return;
    await onUpdateDecision(editingDecisionId, {
      decisionDate: editingDecisionDate || null,
      owner: editingDecisionOwner || null,
      status: editingDecisionStatus,
      text: editingDecisionText,
    });
    setEditingDecisionId(null);
    setEditingDecisionDate("");
    setEditingDecisionOwner("");
    setEditingDecisionStatus("active");
    setEditingDecisionText("");
  }

  function cancelDecisionEdit() {
    setEditingDecisionId(null);
    setEditingDecisionDate("");
    setEditingDecisionOwner("");
    setEditingDecisionStatus("active");
    setEditingDecisionText("");
  }

  async function handleMeetingActionSubmit(event) {
    event.preventDefault();
    if (!meetingActionTitle.trim()) return;
    await onAddAction({
      completionDate: meetingActionDueDate || null,
      owner: meetingActionOwner || null,
      source: "meeting",
      status: "active",
      tag: meetingActionTag || null,
      title: meetingActionTitle,
    });
    setMeetingActionDueDate("");
    setMeetingActionOwner("");
    setMeetingActionTag("");
    setMeetingActionTitle("");
    setIsAddingMeetingAction(false);
  }

  function cancelMeetingAction() {
    setMeetingActionDueDate("");
    setMeetingActionOwner("");
    setMeetingActionTag("");
    setMeetingActionTitle("");
    setIsAddingMeetingAction(false);
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

  function handleSelectDraftAction(draftId, checked) {
    setSelectedDraftActionIds((currentIds) => {
      if (checked) {
        return currentIds.includes(draftId) ? currentIds : currentIds.concat(draftId);
      }
      return currentIds.filter((currentId) => currentId !== draftId);
    });
  }

  function handleSelectAllDraftActions(checked) {
    setSelectedDraftActionIds(checked ? (preview?.actions ?? []).map((action) => action.draftId) : []);
  }

  function handleDeleteSelectedDraftActions() {
    if (!selectedDraftActionIds.length) return;
    const selectedDraftIdSet = new Set(selectedDraftActionIds);
    setPreview((currentPreview) => {
      if (!currentPreview) return currentPreview;
      return {
        ...currentPreview,
        actions: currentPreview.actions.filter((action) => !selectedDraftIdSet.has(action.draftId)),
      };
    });
    setSelectedDraftActionIds([]);
    if (editingDraftActionId && selectedDraftIdSet.has(editingDraftActionId)) {
      setEditingDraftActionId(null);
      setEditingDraftSnapshot(null);
    }
  }

  function applyOwnerToSelectedDraftActions(ownerValue) {
    if (!selectedDraftActionIds.length) return;
    const selectedDraftIdSet = new Set(selectedDraftActionIds);
    setPreview((currentPreview) => {
      if (!currentPreview) return currentPreview;
      return {
        ...currentPreview,
        actions: currentPreview.actions.map((action) =>
          selectedDraftIdSet.has(action.draftId) ? { ...action, owner: ownerValue } : action,
        ),
      };
    });
  }

  function applyDateToSelectedDraftActions(completionDateValue) {
    if (!selectedDraftActionIds.length) return;
    const selectedDraftIdSet = new Set(selectedDraftActionIds);
    setPreview((currentPreview) => {
      if (!currentPreview) return currentPreview;
      return {
        ...currentPreview,
        actions: currentPreview.actions.map((action) =>
          selectedDraftIdSet.has(action.draftId) ? { ...action, completionDate: completionDateValue } : action,
        ),
      };
    });
  }

  function handleDiscardDraftActions() {
    setPreview((currentPreview) => {
      if (!currentPreview) return currentPreview;
      return { ...currentPreview, actions: [] };
    });
    setSelectedDraftActionIds([]);
    setEditingDraftActionId(null);
    setEditingDraftSnapshot(null);
  }

  function handleAddDraftAction() {
    const draftId = makeDraftActionId();
    setPreview((currentPreview) => {
      const basePreview = currentPreview ?? {
        actions: [],
        actionsAdded: 0,
        confirmed: false,
        memorySuggestions: { blockers: [], decisions: [] },
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
          tag: "",
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

  function handleMemorySuggestionChange(type, draftId, value) {
    setPreview((currentPreview) => {
      if (!currentPreview) return currentPreview;
      return {
        ...currentPreview,
        memorySuggestions: {
          ...(currentPreview.memorySuggestions ?? { blockers: [], decisions: [] }),
          [type]: (currentPreview.memorySuggestions?.[type] ?? []).map((item) =>
            item.draftId === draftId ? { ...item, text: value } : item,
          ),
        },
      };
    });
  }

  function handleDeleteMemorySuggestion(type, draftId) {
    setPreview((currentPreview) => {
      if (!currentPreview) return currentPreview;
      return {
        ...currentPreview,
        memorySuggestions: {
          ...(currentPreview.memorySuggestions ?? { blockers: [], decisions: [] }),
          [type]: (currentPreview.memorySuggestions?.[type] ?? []).filter((item) => item.draftId !== draftId),
        },
      };
    });
    setSelectedDraftMemoryIds((currentIds) => currentIds.filter((currentId) => currentId !== draftId));
  }

  function handleSelectMemorySuggestion(draftId, checked) {
    setSelectedDraftMemoryIds((currentIds) => {
      if (checked) {
        return currentIds.includes(draftId) ? currentIds : currentIds.concat(draftId);
      }
      return currentIds.filter((currentId) => currentId !== draftId);
    });
  }

  function handleSelectAllMemorySuggestions(checked) {
    const allIds = [
      ...(preview?.memorySuggestions?.decisions ?? []),
      ...(preview?.memorySuggestions?.blockers ?? []),
    ].map((item) => item.draftId);
    setSelectedDraftMemoryIds(checked ? allIds : []);
  }

  function handleDiscardSelectedMemorySuggestions() {
    if (!selectedDraftMemoryIds.length) return;
    const selectedIds = new Set(selectedDraftMemoryIds);
    setPreview((currentPreview) => {
      if (!currentPreview) return currentPreview;
      const nextPreview = {
        ...currentPreview,
        memorySuggestions: {
          decisions: (currentPreview.memorySuggestions?.decisions ?? []).filter((item) => !selectedIds.has(item.draftId)),
          blockers: (currentPreview.memorySuggestions?.blockers ?? []).filter((item) => !selectedIds.has(item.draftId)),
        },
      };
      const hasActions = Boolean(nextPreview.actions?.length);
      const hasMemory =
        Boolean(nextPreview.memorySuggestions.decisions.length) ||
        Boolean(nextPreview.memorySuggestions.blockers.length);
      return hasActions || hasMemory ? nextPreview : null;
    });
    setSelectedDraftMemoryIds([]);
  }

  function handleDiscardAllMemorySuggestions() {
    setPreview((currentPreview) => {
      if (!currentPreview) return currentPreview;
      const nextPreview = {
        ...currentPreview,
        memorySuggestions: { blockers: [], decisions: [] },
      };
      return nextPreview.actions?.length ? nextPreview : null;
    });
    setSelectedDraftMemoryIds([]);
  }

  async function handleConfirmMemorySuggestions() {
    if (!preview?.memorySuggestions) return;
    const decisionsToSave = (preview.memorySuggestions.decisions ?? [])
      .map((item) => item.text.trim())
      .filter(Boolean);
    const blockersToSave = (preview.memorySuggestions.blockers ?? [])
      .map((item) => item.text.trim())
      .filter(Boolean);
    if (!decisionsToSave.length && !blockersToSave.length) return;

    try {
      setIsExtracting(true);
      setExtractError("");
      for (const decisionText of decisionsToSave) {
        await onSaveDecision({
          decisionDate: preview.meetingDate || meetingDate || null,
          owner: null,
          status: "active",
          text: decisionText,
        });
      }
      for (const blockerText of blockersToSave) {
        await onAddAction({
          completionDate: null,
          owner: null,
          source: "memory",
          status: "blocked",
          title: blockerText,
        });
      }
      setPreview((currentPreview) => {
        if (!currentPreview) return currentPreview;
        const nextPreview = {
          ...currentPreview,
          memorySuggestions: { blockers: [], decisions: [] },
        };
        return nextPreview.actions?.length ? nextPreview : null;
      });
      setSelectedDraftMemoryIds([]);
      setExtractionStatus({
        message: `${decisionsToSave.length + blockersToSave.length} memory updates added`,
        tone: "success",
      });
      clearNotesWorkspace();
    } catch (error) {
      setExtractError(error instanceof Error ? error.message : "Could not add memory updates.");
    } finally {
      setIsExtracting(false);
    }
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
        tag: action.tag || null,
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
      setPreview(null);
      clearNotesWorkspace();
      setSelectedDraftActionIds([]);
      setSelectedDraftMemoryIds([]);
      setBulkDraftOwner("");
      setBulkDraftDueDate("");
      setEditingDraftActionId(null);
      setEditingDraftSnapshot(null);
    } catch (error) {
      setExtractError(error instanceof Error ? error.message : "Could not add reviewed actions.");
    } finally {
      setIsExtracting(false);
    }
  }

  const draftActions = preview?.actions ?? [];
  const draftMemorySuggestions = preview?.memorySuggestions ?? { blockers: [], decisions: [] };
  const draftMemorySuggestionCount =
    (draftMemorySuggestions.decisions?.length ?? 0) + (draftMemorySuggestions.blockers?.length ?? 0);
  const allDraftMemorySuggestionIds = [
    ...(draftMemorySuggestions.decisions ?? []),
    ...(draftMemorySuggestions.blockers ?? []),
  ].map((item) => item.draftId);
  const selectedDraftMemoryCount = selectedDraftMemoryIds.length;
  const allDraftMemorySelected =
    allDraftMemorySuggestionIds.length > 0 &&
    allDraftMemorySuggestionIds.every((draftId) => selectedDraftMemoryIds.includes(draftId));
  const selectedDraftActionCount = selectedDraftActionIds.length;
  const allDraftActionsSelected =
    draftActions.length > 0 && draftActions.every((action) => selectedDraftActionIds.includes(action.draftId));

  return (
    <div className="meeting-notes-stack">
      <div className={`activity-grid ${preview ? "with-preview" : "single"}`}>
        <section className="subsurface">
          <div className="section-title">
            <div>
              <h2>Meeting notes</h2>
            </div>
            <div className="section-actions">
              <button
                aria-label="Add action from meeting notes"
                className="primary-action compact"
                onClick={() => setIsAddingMeetingAction(true)}
                title="Add action"
                type="button"
              >
                <PlusIcon />
                Add Action
              </button>
            </div>
          </div>
          {extractionStatus ? (
            <p className={`extract-status ${extractionStatus.tone}`} role="status">
              {extractionStatus.message}
            </p>
          ) : null}

          <div className="meeting-capture-panel">
            <label className="meeting-date-field">
              Meeting date
              <input
                onChange={(event) => setMeetingDate(event.target.value)}
                type="date"
                value={meetingDate}
              />
            </label>

            <div className="meeting-template-row" aria-label="Meeting note templates">
              <label className="meeting-template-field">
                Template
                <select
                  aria-label="Meeting note template"
                  onChange={(event) => {
                    const selectedTemplate = meetingTemplates.find((template) => template.id === event.target.value);
                    if (selectedTemplate) {
                      handleMeetingTemplateSelect(selectedTemplate.text);
                    }
                    event.target.value = "";
                  }}
                  value=""
                >
                  <option value="">Choose template</option>
                  {meetingTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="icon-action-button upload-icon-button" title="Upload notes">
                <UploadIcon />
                <input
                  accept=".txt,.md,.markdown,.vtt,.srt,.json,text/plain,text/markdown,text/vtt,application/json"
                  className="upload-input"
                  onChange={handleCompanionNotesUpload}
                  type="file"
                />
              </label>
              <button className="primary-action compact notes-action-button" disabled={isExtracting} onClick={() => extractFromNotes("meeting")} type="button">
                {isExtracting ? "Extracting" : "Extract"}
              </button>
              <button className="primary-action compact notes-action-button" disabled={isExtracting} onClick={() => addNotesWithoutExtraction("meeting")} type="button">
                Add
              </button>
              {uploadedFileName ? <span className="upload-file-name">{uploadedFileName}</span> : null}
            </div>
          </div>

          <label className="notes-editor-field">
            Notes
            <textarea
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Paste meeting notes or upload AI companion notes"
              rows="9"
              value={notes}
            />
          </label>
          {uploadError ? <p className="upload-error" role="alert">{uploadError}</p> : null}
          {extractError ? <p className="upload-error" role="alert">{extractError}</p> : null}
        </section>

        {isAddingMeetingAction ? (
          <div className="modal-backdrop" role="presentation">
            <section
              aria-labelledby="meeting-action-title"
              aria-modal="true"
              className="confirmation-dialog action-create-dialog"
              role="dialog"
            >
              <div>
                <p className="eyebrow">Meeting notes</p>
                <h2 id="meeting-action-title">Add action</h2>
              </div>
              <form className="stacked-form" onSubmit={handleMeetingActionSubmit}>
                <label>
                  Action item
                  <input
                    autoFocus
                    onChange={(event) => setMeetingActionTitle(event.target.value)}
                    placeholder="Follow up on launch checklist"
                    value={meetingActionTitle}
                  />
                </label>
                <label>
                  Owner
                  <select onChange={(event) => setMeetingActionOwner(event.target.value)} value={meetingActionOwner}>
                    <option value="">Unassigned</option>
                    {project.members.map((member) => (
                      <option key={member} value={member}>
                        {member}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Tag
                  <input
                    onChange={(event) => setMeetingActionTag(event.target.value)}
                    placeholder="#tag"
                    value={meetingActionTag}
                  />
                </label>
                <label>
                  Complete by
                  <input
                    onChange={(event) => setMeetingActionDueDate(event.target.value)}
                    type="date"
                    value={meetingActionDueDate}
                  />
                </label>
                <div className="dialog-actions">
                  <button className="secondary-action" onClick={cancelMeetingAction} type="button">
                    Cancel
                  </button>
                  <button className="primary-action" disabled={!meetingActionTitle.trim()} type="submit">
                    Add action
                  </button>
                </div>
              </form>
            </section>
          </div>
        ) : null}

        {preview ? (
        <section className="subsurface">
          <div className="section-title">
            <div>
              <p className="eyebrow">Extraction result</p>
              <h2>{draftActions.length ? "Extracted actions" : "Suggested memory updates"}</h2>
            </div>
          </div>
            <article className="insight-card">
              {draftActions.length ? (
              <div className="preview-section">
                <span>Action items</span>
                  <div className="extracted-action-list compact">
                    {!preview.confirmed ? (
                      <div className="draft-bulk-toolbar">
                        <label className="inline-check draft-select-all">
                          <input
                            checked={allDraftActionsSelected}
                            onChange={(event) => handleSelectAllDraftActions(event.target.checked)}
                            type="checkbox"
                          />
                          <span>Select all</span>
                        </label>
                        <span className="draft-selection-count">
                          {selectedDraftActionCount ? `${selectedDraftActionCount} selected` : "No selection"}
                        </span>
                        <label>
                          Owner
                          <select
                            disabled={!selectedDraftActionCount}
                            onChange={(event) => {
                              setBulkDraftOwner(event.target.value);
                              applyOwnerToSelectedDraftActions(event.target.value);
                            }}
                            value={bulkDraftOwner}
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
                          Due date
                          <input
                            disabled={!selectedDraftActionCount}
                            onChange={(event) => {
                              setBulkDraftDueDate(event.target.value);
                              applyDateToSelectedDraftActions(event.target.value);
                            }}
                            type="date"
                            value={bulkDraftDueDate}
                          />
                        </label>
                        <button
                          aria-label={`Delete selected draft actions${selectedDraftActionCount ? ` (${selectedDraftActionCount})` : ""}`}
                          className="icon-action-button danger bulk-delete-button"
                          disabled={!selectedDraftActionCount}
                          onClick={handleDeleteSelectedDraftActions}
                          title={selectedDraftActionCount ? `Delete ${selectedDraftActionCount} selected draft actions` : "Delete selected draft actions"}
                          type="button"
                        >
                          <TrashIcon />
                        </button>
                        <button className="secondary-action quiet compact" onClick={handleDiscardDraftActions} type="button">
                          Discard all
                        </button>
                      </div>
                    ) : null}
                    {preview.actions.map((action) =>
                      preview.confirmed ? (
                        <div className="extracted-action-review-row confirmed" key={action.id ?? action.draftId}>
                          <strong>{action.title}</strong>
                          {actionTagLabel(action) ? <span>{actionTagLabel(action)}</span> : null}
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
                              Tag
                              <input
                                onChange={(event) => handleDraftActionChange(action.draftId, "tag", event.target.value)}
                                placeholder="#tag"
                                value={action.tag || ""}
                              />
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
                          <label className="action-select-control" title="Select draft action">
                            <input
                              checked={selectedDraftActionIds.includes(action.draftId)}
                              onChange={(event) => handleSelectDraftAction(action.draftId, event.target.checked)}
                              type="checkbox"
                            />
                          </label>
                          <div className="draft-review-main">
                            <strong>{action.title || "Untitled action"}</strong>
                            <span>
                              {action.owner || "Unassigned"}
                              {actionTagLabel(action) ? ` · ${actionTagLabel(action)}` : ""}
                              {action.completionDate ? ` · ${formatDisplayDate(action.completionDate)}` : ""}
                            </span>
                          </div>
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
              ) : null}
              {draftMemorySuggestionCount ? (
                <div className="preview-section memory-suggestion-review">
                  <span>Suggested memory updates</span>
                  <div className="memory-suggestion-toolbar">
                    <label className="inline-check draft-select-all">
                      <input
                        checked={allDraftMemorySelected}
                        onChange={(event) => handleSelectAllMemorySuggestions(event.target.checked)}
                        type="checkbox"
                      />
                      <span>Select all</span>
                    </label>
                    <span className="draft-selection-count">
                      {selectedDraftMemoryCount ? `${selectedDraftMemoryCount} selected` : "No selection"}
                    </span>
                    <button
                      className="secondary-action quiet compact"
                      disabled={!selectedDraftMemoryCount}
                      onClick={handleDiscardSelectedMemorySuggestions}
                      type="button"
                    >
                      Discard selected
                    </button>
                    <button className="secondary-action quiet compact" onClick={handleDiscardAllMemorySuggestions} type="button">
                      Discard all
                    </button>
                  </div>
                  <div className="memory-suggestion-list">
                    {(draftMemorySuggestions.decisions ?? []).map((suggestion) => (
                      <div className="memory-suggestion-row decision" key={suggestion.draftId}>
                        <label className="action-select-control" title="Select suggested decision">
                          <input
                            checked={selectedDraftMemoryIds.includes(suggestion.draftId)}
                            onChange={(event) => handleSelectMemorySuggestion(suggestion.draftId, event.target.checked)}
                            type="checkbox"
                          />
                        </label>
                        <span>Decision</span>
                        <input
                          aria-label="Suggested decision"
                          onChange={(event) => handleMemorySuggestionChange("decisions", suggestion.draftId, event.target.value)}
                          value={suggestion.text}
                        />
                        <button
                          aria-label="Remove suggested decision"
                          className="icon-action-button danger"
                          onClick={() => handleDeleteMemorySuggestion("decisions", suggestion.draftId)}
                          title="Remove"
                          type="button"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    ))}
                    {(draftMemorySuggestions.blockers ?? []).map((suggestion) => (
                      <div className="memory-suggestion-row blocker" key={suggestion.draftId}>
                        <label className="action-select-control" title="Select suggested blocker">
                          <input
                            checked={selectedDraftMemoryIds.includes(suggestion.draftId)}
                            onChange={(event) => handleSelectMemorySuggestion(suggestion.draftId, event.target.checked)}
                            type="checkbox"
                          />
                        </label>
                        <span>Blocker</span>
                        <input
                          aria-label="Suggested blocker"
                          onChange={(event) => handleMemorySuggestionChange("blockers", suggestion.draftId, event.target.value)}
                          value={suggestion.text}
                        />
                        <button
                          aria-label="Remove suggested blocker"
                          className="icon-action-button danger"
                          onClick={() => handleDeleteMemorySuggestion("blockers", suggestion.draftId)}
                          title="Remove"
                          type="button"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="draft-action-toolbar">
                    <button
                      className="primary-action"
                      disabled={isExtracting || !draftMemorySuggestionCount}
                      onClick={handleConfirmMemorySuggestions}
                      type="button"
                    >
                      Add memory updates
                    </button>
                  </div>
                </div>
              ) : null}
              {preview.actionsAdded ? <p>{preview.actionsAdded} action items were added.</p> : null}
            </article>
        </section>
        ) : null}
      </div>

      <section className="subsurface project-memory">
        <div className="project-memory-title">
          <h2>Project memory</h2>
        </div>
        <div className="memory-tabs" role="tablist" aria-label="Project memory">
          <button
            aria-selected={memoryTab === "decisions"}
            className={`memory-tab ${memoryTab === "decisions" ? "active" : ""}`}
            onClick={() => setMemoryTab("decisions")}
            role="tab"
            type="button"
          >
            Decision log <em>{decisions.length}</em>
          </button>
          <button
            aria-selected={memoryTab === "notes"}
            className={`memory-tab ${memoryTab === "notes" ? "active" : ""}`}
            onClick={() => setMemoryTab("notes")}
            role="tab"
            type="button"
          >
            Project notes <em>{updates.length}</em>
          </button>
        </div>

        {memoryTab === "decisions" ? (
          <div className="memory-section decision-log" role="tabpanel">
            <div className="memory-section-header">
              <button
                aria-expanded={isDecisionLogExpanded}
                className="feed-toggle"
                onClick={() => setIsDecisionLogExpanded((expanded) => !expanded)}
                type="button"
              >
                <span>
                  <strong>Decision log</strong>
                  <em>{decisions.length}</em>
                </span>
                <span>{isDecisionLogExpanded ? "Collapse" : "Expand"}</span>
              </button>
              <button
                aria-expanded={isAddingDecision}
                aria-label="Add decision"
                className="icon-action-button add-decision-button"
                onClick={() => {
                  setIsAddingDecision((isAdding) => !isAdding);
                  setIsDecisionLogExpanded(true);
                  cancelDecisionEdit();
                }}
                title="Add decision"
                type="button"
              >
                <PlusIcon />
              </button>
            </div>
            {isDecisionLogExpanded ? (
              <div className="feed-content">
                <div className="filter-row decision-filter-row">
                  <label className="compact-filter">
                    Owner
                    <select onChange={(event) => setDecisionOwnerFilter(event.target.value)} value={decisionOwnerFilter}>
                      <option value="all">All</option>
                      {decisionOwnerOptions.map((owner) => (
                        <option key={owner} value={owner}>
                          {owner}
                        </option>
                      ))}
                    </select>
                  </label>
                  <DecisionStatusDots allowAll label="Status" onChange={setDecisionStatusFilter} value={decisionStatusFilter} />
                  <label className="compact-filter date-filter">
                    From
                    <input onChange={(event) => setDecisionDateFromFilter(event.target.value)} type="date" value={decisionDateFromFilter} />
                  </label>
                  <label className="compact-filter date-filter">
                    To
                    <input onChange={(event) => setDecisionDateToFilter(event.target.value)} type="date" value={decisionDateToFilter} />
                  </label>
                  <button
                    aria-label="Clear decision filters"
                    className="icon-action-button board-clear-filter-button"
                    disabled={!hasDecisionFilters}
                    onClick={() => {
                      setDecisionOwnerFilter("all");
                      setDecisionStatusFilter("all");
                      setDecisionDateFromFilter("");
                      setDecisionDateToFilter("");
                    }}
                    title="Clear filters"
                    type="button"
                  >
                    <XIcon />
                  </button>
                </div>
                {isAddingDecision ? (
                  <form className="decision-edit-form" onSubmit={handleDecisionSubmit}>
                    <label>
                      Date
                      <input
                        onChange={(event) => setNewDecisionDate(event.target.value)}
                        type="date"
                        value={newDecisionDate}
                      />
                    </label>
                    <label>
                      Decision
                      <input
                        autoFocus
                        onChange={(event) => setNewDecisionText(event.target.value)}
                        placeholder="Capture the decision"
                        value={newDecisionText}
                      />
                    </label>
                    <label>
                      Owner / approver
                      <select onChange={(event) => setNewDecisionOwner(event.target.value)} value={newDecisionOwner}>
                        <option value="">Unassigned</option>
                        {project.members.map((member) => (
                          <option key={member} value={member}>
                            {member}
                          </option>
                        ))}
                      </select>
                    </label>
                    <DecisionStatusDots onChange={setNewDecisionStatus} value={newDecisionStatus} />
                    <div className="icon-form-actions">
                      <button aria-label="Save decision" className="icon-action-button confirm" title="Save" type="submit">
                        <CheckIcon />
                      </button>
                      <button
                        aria-label="Cancel decision"
                        className="icon-action-button"
                        onClick={() => {
                          setIsAddingDecision(false);
                          setNewDecisionText("");
                          setNewDecisionDate(todayDateInputValue());
                          setNewDecisionOwner("");
                          setNewDecisionStatus("active");
                        }}
                        title="Cancel"
                        type="button"
                      >
                        <XIcon />
                      </button>
                    </div>
                  </form>
                ) : null}
                {filteredDecisions.length ? (
                  <div className="decision-list">
                    {filteredDecisions.map((decision) => (
                      <article className="decision-item" key={decision.id}>
                        {editingDecisionId === decision.id ? (
                          <form className="decision-edit-form inline" onSubmit={handleDecisionUpdate}>
                            <label>
                              Date
                              <input
                                onChange={(event) => setEditingDecisionDate(event.target.value)}
                                type="date"
                                value={editingDecisionDate}
                              />
                            </label>
                            <label>
                              Decision
                              <input
                                onChange={(event) => setEditingDecisionText(event.target.value)}
                                value={editingDecisionText}
                              />
                            </label>
                            <label>
                              Owner / approver
                              <select onChange={(event) => setEditingDecisionOwner(event.target.value)} value={editingDecisionOwner}>
                                <option value="">Unassigned</option>
                                {project.members.map((member) => (
                                  <option key={member} value={member}>
                                    {member}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <DecisionStatusDots onChange={setEditingDecisionStatus} value={editingDecisionStatus} />
                            <div className="icon-form-actions">
                              <button aria-label="Save decision edit" className="icon-action-button confirm" title="Save" type="submit">
                                <CheckIcon />
                              </button>
                              <button
                                aria-label="Cancel decision edit"
                                className="icon-action-button"
                                onClick={cancelDecisionEdit}
                                title="Cancel"
                                type="button"
                              >
                                <XIcon />
                              </button>
                            </div>
                          </form>
                        ) : (
                          <>
                            <div>
                              <strong>{decision.decisionDate ? formatDisplayDate(decision.decisionDate) : "Decision"}</strong>
                              <div className="decision-meta-row">
                                <span>{decision.owner || "Unassigned"}</span>
                                <span className={`decision-status-inline ${decision.status || "active"}`}>
                                  <i aria-hidden="true" />
                                  {labelForClassification(decision.status || "active")}
                                </span>
                              </div>
                              <p>{decision.text}</p>
                            </div>
                            <span className="decision-actions">
                              <button
                                aria-label="Edit decision"
                                className="action-edit-button"
                                onClick={() => beginDecisionEdit(decision)}
                                title="Edit decision"
                                type="button"
                              >
                                <EditIcon />
                              </button>
                              <button
                                aria-label="Delete decision"
                                className="action-delete-button"
                                onClick={() => onDeleteDecision(decision)}
                                title="Delete decision"
                                type="button"
                              >
                                <TrashIcon />
                              </button>
                            </span>
                          </>
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="empty-state compact">
                    {decisions.length
                      ? "No decisions match the selected filters."
                      : "Decisions with words like decided, agreed, approved, or confirmed will appear here."}
                  </p>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {memoryTab === "notes" ? (
          <div className="memory-section project-notes-section" role="tabpanel">
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
            <div className="filter-row note-filter-row">
              <label className="compact-filter date-filter">
                From
                <input onChange={(event) => setNoteDateFromFilter(event.target.value)} type="date" value={noteDateFromFilter} />
              </label>
              <label className="compact-filter date-filter">
                To
                <input onChange={(event) => setNoteDateToFilter(event.target.value)} type="date" value={noteDateToFilter} />
              </label>
              <button
                aria-label="Clear project note filters"
                className="icon-action-button board-clear-filter-button"
                disabled={!hasNoteFilters}
                onClick={() => {
                  setNoteDateFromFilter("");
                  setNoteDateToFilter("");
                }}
                title="Clear filters"
                type="button"
              >
                <XIcon />
              </button>
            </div>
            <div className="updates-feed">
              {filteredUpdates.length ? (
                filteredUpdates.map((update) => {
                  const isNoteExpanded = expandedNoteIds.includes(update.id) || editingNoteId === update.id;
                  return (
                <article className="update-card" key={update.id}>
                  <div className="card-row">
                    <button
                      aria-expanded={isNoteExpanded}
                      className="project-note-toggle"
                      onClick={() => toggleProjectNote(update.id)}
                      type="button"
                    >
                      {isNoteExpanded ? <ChevronLeftIcon /> : <ChevronRightIcon />}
                      <strong>
                        {update.meetingDate
                          ? `Meeting on ${formatDisplayDate(update.meetingDate)}`
                          : update.person || "General update"}
                      </strong>
                    </button>
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
                        className="project-note-text"
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
                          onClick={cancelNoteEdit}
                          title="Cancel"
                          type="button"
                        >
                          <XIcon />
                        </button>
                      </div>
                    </form>
                  ) : (
                    isNoteExpanded ? (
                    <>
                      {update.meetingDate && update.person ? <p className="update-meta">{update.person}</p> : null}
                      <p className="project-note-text">{update.text}</p>
                    </>
                    ) : null
                  )}
                </article>
                  );
                })
            ) : (
              <p className="empty-state">
                {updates.length
                  ? "No project notes match the selected dates."
                  : "No project notes yet. Paste meeting notes above and extract actions; the notes will be saved here."}
              </p>
            )}
            </div>
            </div>
          ) : null}
        </div>
        ) : null}
      </section>
    </div>
  );
}

function ProjectMemoryLane({ actions, decisions, updates }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const items = projectMemoryItems({ actions, decisions, updates });

  return (
    <section className="overview-section memory-lane-section">
      <div className="overview-section-heading compact">
        <div>
          <h2>Memory lane</h2>
          <p>{updates.length} notes · {decisions.length} decisions · {actions.length} actions</p>
        </div>
        <button
          aria-expanded={isExpanded}
          className="secondary-action compact"
          onClick={() => setIsExpanded((expanded) => !expanded)}
          type="button"
        >
          {isExpanded ? "Collapse" : "Expand"}
        </button>
      </div>

      {isExpanded ? (
        items.length ? (
          <div className="memory-lane-list">
            {items.map((item) => (
              <article className={`memory-lane-item ${item.tone}`} key={item.id}>
                <span className="memory-lane-dot" aria-hidden="true" />
                <div>
                  <div className="memory-lane-meta">
                    <strong>{item.type}</strong>
                    <span>{item.date ? formatDisplayDate(item.date) : "No date"}</span>
                    <span>{item.meta}</span>
                  </div>
                  <p>{item.text}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state compact">Add notes, decisions, or actions to build project memory.</p>
        )
      ) : (
        <p className="memory-lane-summary">
          Expand to review the latest project notes, decisions, and action activity in one place.
        </p>
      )}
    </section>
  );
}

function BugDb({ bugs, lastRefreshedAt, onAddAction, project, refreshError, selectedColumns }) {
  const [sortByProject, setSortByProject] = useState({});
  const availableColumns = useMemo(() => orderedBugColumns(bugs), [bugs]);
  const availableColumnsKey = availableColumns.join("\u001f");
  const sortState = sortByProject?.[project.id] ?? { column: "", direction: "asc" };
  const bugGridStyle = selectedColumns.length
    ? {
        gridTemplateColumns: `${bugGridTemplate(selectedColumns)} minmax(96px, 0.65fr)`,
        minWidth: selectedColumns.length > 4 ? `${selectedColumns.length * 128 + 96}px` : "100%",
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
  const bugInsightItems = [
    ["Severity", "severity"],
    ["Status", "status"],
    ["Assignee", "assignee"],
    ["Component", "component"],
  ].map(([label, field]) => {
    const counts = bugs.reduce((collection, bug) => {
      const value = bugFieldValue(bug, field) || "Unassigned";
      collection.set(value, (collection.get(value) ?? 0) + 1);
      return collection;
    }, new Map());
    const topValues = Array.from(counts.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3);
    return { label, topValues };
  });

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

  async function handleCreateActionFromBug(bug) {
    const bugNumber = bugFieldValue(bug, "rptno") || bug.id;
    const subject = bugFieldValue(bug, "subject") || bug.title || "Bug follow-up";
    const assignee = bugFieldValue(bug, "assignee") || "";
    await onAddAction({
      completionDate: null,
      owner: assignee && assignee !== "—" ? assignee : null,
      source: "bug",
      status: "active",
      title: `Bug ${bugNumber}: ${subject}`,
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

      <section className="bug-insight-panel" aria-label="BugDB insights">
        {bugInsightItems.map((item) => (
          <article key={item.label}>
            <strong>{item.label}</strong>
            <span>{item.topValues.map(([value, count]) => `${value}: ${count}`).join(" · ") || "No data"}</span>
          </article>
        ))}
      </section>

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
              <span className="bug-action-header">Add Action</span>
            </div>
            {sortedBugs.map((bug) => (
              <article className="bug-card" key={bug.id} style={bugGridStyle}>
                {selectedColumns.map((column) => {
                  const value = bugFieldValue(bug, column) || "—";
                  return <span key={column} title={String(value)}>{value}</span>;
                })}
                <button
                  aria-label={`Add action for bug ${bugFieldValue(bug, "rptno") || bug.id}`}
                  className="icon-action-button bug-row-action-button"
                  onClick={() => handleCreateActionFromBug(bug)}
                  title="Add action"
                  type="button"
                >
                  <PlusIcon />
                </button>
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

function DashboardLevelView({
  actions,
  followUpError,
  followUps,
  isFollowUpLoading,
  onCreateFollowUpAction,
  onRefreshFollowUps,
  projects,
  updates,
}) {
  const [projectFilterId, setProjectFilterId] = useState("all");
  const activeProjects = projects.filter((project) => !project.archivedAt);
  const scopedProjects =
    projectFilterId === "all"
      ? activeProjects
      : activeProjects.filter((project) => String(project.id) === projectFilterId);
  const scopedProjectIds = new Set(scopedProjects.map((project) => String(project.id)));
  const activeActions = actions.filter((action) => scopedProjectIds.has(String(action.projectId)));
  const projectById = new Map(activeProjects.map((project) => [String(project.id), project]));
  const dueSoonActions = activeActions
    .filter((action) => {
      const dueDetails = dueDateDetails(action);
      return dueDetails && ["overdue", "today", "soon"].includes(dueDetails.tone) && action.status !== "done";
    })
    .sort(compareActionsByDueDateAndStatus)
    .slice(0, 8);
  const blockedActions = activeActions
    .filter((action) => action.status === "blocked")
    .sort(compareActionsByDueDateAndStatus)
    .slice(0, 8);
  const atRiskProjects = activeProjects
    .filter((project) => scopedProjectIds.has(String(project.id)))
    .map((project) => {
      const projectActions = activeActions.filter((action) => String(action.projectId) === String(project.id));
      const blockedCount = projectActions.filter((action) => action.status === "blocked").length;
      const overdueCount = projectActions.filter((action) => dueDateDetails(action)?.tone === "overdue").length;
      return { project, blockedCount, overdueCount, score: blockedCount + overdueCount };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 6);
  const healthRank = { red: 0, yellow: 1, green: 2 };
  const projectHealthRows = scopedProjects
    .map((project) => {
      const projectActions = activeActions.filter((action) => String(action.projectId) === String(project.id));
      const projectUpdates = updates.filter((update) => String(update.projectId) === String(project.id));
      return { project, health: projectHealth(projectActions, projectUpdates) };
    })
    .sort((left, right) =>
      (healthRank[left.health.tone] ?? 9) - (healthRank[right.health.tone] ?? 9) ||
      left.project.name.localeCompare(right.project.name),
    )
    .slice(0, 8);
  const ownerWorkload = Array.from(
    activeActions
      .filter((action) => action.status !== "done")
      .reduce((owners, action) => {
        const owner = action.owner || "Unassigned";
        const current = owners.get(owner) ?? { owner, active: 0, blocked: 0, overdue: 0 };
        current.active += 1;
        if (action.status === "blocked") current.blocked += 1;
        if (dueDateDetails(action)?.tone === "overdue") current.overdue += 1;
        owners.set(owner, current);
        return owners;
      }, new Map())
      .values(),
  )
    .sort((left, right) => right.overdue - left.overdue || right.blocked - left.blocked || right.active - left.active)
    .slice(0, 8);
  const scopedFollowUps = followUps
    .filter((item) => scopedProjectIds.has(String(item.projectId)))
    .slice(0, 6);

  function projectName(projectId) {
    return projectById.get(String(projectId))?.name ?? "Unknown project";
  }

  return (
    <section className="surface dashboard-preview all-projects-view">
      <div className="section-title">
        <div>
          <p className="eyebrow">All projects</p>
          <h2>Portfolio dashboard</h2>
        </div>
        <label className="portfolio-filter">
          Project
          <select onChange={(event) => setProjectFilterId(event.target.value)} value={projectFilterId}>
            <option value="all">All active projects</option>
            {activeProjects.map((project) => (
              <option key={project.id} value={String(project.id)}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="portfolio-grid">
        <section className="portfolio-panel portfolio-health">
          <h3>Project health</h3>
          {projectHealthRows.length ? (
            projectHealthRows.map(({ project, health }) => (
              <article className="portfolio-item health-row" key={project.id}>
                <strong>{project.name}</strong>
                <span className={`health-dot ${health.tone}`} aria-label={health.label} />
                <span>{health.label} · {health.reason}</span>
              </article>
            ))
          ) : (
            <p className="empty-state">No active projects to monitor.</p>
          )}
        </section>

        <section className="portfolio-panel portfolio-due">
          <h3>Due soon</h3>
          {dueSoonActions.length ? (
            dueSoonActions.map((action) => (
              <article className="portfolio-item" key={action.id}>
                <strong>{action.title}</strong>
                <span>{projectName(action.projectId)} · {action.owner || "Unassigned"}</span>
                <div className="portfolio-item-tags">
                  <ActionTagPill action={action} />
                  <ActionDueIndicator action={action} />
                  <ActionAgeIndicator action={action} />
                </div>
              </article>
            ))
          ) : (
            <p className="empty-state">No active actions are due this week.</p>
          )}
        </section>

        <section className="portfolio-panel portfolio-blocked">
          <h3>Blocked work</h3>
          {blockedActions.length ? (
            blockedActions.map((action) => (
              <article className="portfolio-item" key={action.id}>
                <strong>{action.title}</strong>
                <span>{projectName(action.projectId)} · {action.owner || "Unassigned"}</span>
                <div className="portfolio-item-tags">
                  <ActionTagPill action={action} />
                </div>
              </article>
            ))
          ) : (
            <p className="empty-state">No blocked work across active projects.</p>
          )}
        </section>

        <section className="portfolio-panel portfolio-risk">
          <h3>Projects at risk</h3>
          {atRiskProjects.length ? (
            atRiskProjects.map(({ project, blockedCount, overdueCount }) => (
              <article className="portfolio-item" key={project.id}>
                <strong>{project.name}</strong>
                <span>{blockedCount} blocked · {overdueCount} overdue</span>
              </article>
            ))
          ) : (
            <p className="empty-state">No active projects are currently at risk.</p>
          )}
        </section>

        <section className="portfolio-panel portfolio-workload">
          <h3>Owner workload</h3>
          {ownerWorkload.length ? (
            ownerWorkload.map((owner) => (
              <article className="portfolio-item workload-item" key={owner.owner}>
                <strong>{owner.owner}</strong>
                <span>{owner.active} active · {owner.blocked} blocked · {owner.overdue} overdue</span>
              </article>
            ))
          ) : (
            <p className="empty-state">No open actions across active projects.</p>
          )}
        </section>

        <section className="portfolio-panel portfolio-followup">
          <div className="portfolio-panel-heading">
            <h3>Needs follow-up</h3>
            <button
              aria-label="Refresh follow-up detection"
              className="icon-action-button compact-icon-button"
              disabled={isFollowUpLoading}
              onClick={onRefreshFollowUps}
              title="Refresh"
              type="button"
            >
              <SearchIcon />
            </button>
          </div>
          {isFollowUpLoading ? (
            <p className="empty-state">Checking unresolved topics...</p>
          ) : scopedFollowUps.length ? (
            scopedFollowUps.map((item) => (
              <article className="portfolio-item followup-item" key={`${item.projectId}-${item.topic}`}>
                <strong>{item.topic}</strong>
                <span>{item.projectName || projectName(item.projectId)} · {item.signal}</span>
                {item.flags?.length ? (
                  <div className="portfolio-item-tags followup-flags">
                    {item.flags.slice(0, 3).map((flag) => (
                      <span className="meta-pill" key={flag}>{followUpFlagLabel(flag)}</span>
                    ))}
                  </div>
                ) : null}
                <button
                  className="secondary-action compact-followup-button"
                  onClick={() => onCreateFollowUpAction(item)}
                  type="button"
                >
                  {item.actionId ? "View action" : "Create action"}
                </button>
              </article>
            ))
          ) : (
            <p className="empty-state">
              {followUpError || "No unresolved follow-ups detected yet."}
            </p>
          )}
        </section>
      </div>
    </section>
  );
}

function DashboardPanel({
  activeTab,
  actions,
  bugs,
  bugLastRefreshedAt,
  bugReportVisible,
  bugRefreshError,
  decisions,
  phases,
  projectLinks,
  onActionTitleChange,
  onAddAction,
  onCleanDuplicates,
  onClearBugs,
  onCompletionDateChange,
  onConfirmExtractedActions,
  onDeleteDecision,
  onDeletePhase,
  onDeletePhaseItem,
  onDeleteProjectLink,
  onDeleteAction,
  onDeleteActions,
  onDeleteProjectNote,
  onExtractActions,
  onMovePhase,
  onMovePhaseItem,
  onReorderPhaseItems,
  onReorderPhases,
  onOwnerChange,
  onCreatePhase,
  onCreatePhaseItem,
  onCreateProjectLink,
  onSaveDecision,
  onSaveProjectNote,
  onStatusChange,
  onTagChange,
  onTabChange,
  onUpdatePhase,
  onUpdatePhaseItem,
  onUpdateProjectDetails,
  onUpdateProjectLink,
  onUpdateDecision,
  onUpdateProjectNote,
  project,
  selectedBugColumns,
  updates,
}) {
  if (activeTab === "overview") {
    return (
      <ProjectOverview
        actions={actions}
        decisions={decisions}
        onCreatePhase={onCreatePhase}
        onCreatePhaseItem={onCreatePhaseItem}
        onCreateProjectLink={onCreateProjectLink}
        onDeletePhase={onDeletePhase}
        onDeletePhaseItem={onDeletePhaseItem}
        onDeleteProjectLink={onDeleteProjectLink}
        onMovePhase={onMovePhase}
        onMovePhaseItem={onMovePhaseItem}
        onReorderPhaseItems={onReorderPhaseItems}
        onReorderPhases={onReorderPhases}
        onUpdatePhase={onUpdatePhase}
        onUpdatePhaseItem={onUpdatePhaseItem}
        onUpdateProjectDetails={onUpdateProjectDetails}
        onUpdateProjectLink={onUpdateProjectLink}
        phases={phases}
        project={project}
        projectLinks={projectLinks}
        updates={updates}
      />
    );
  }

  if (activeTab === "notes") {
    return (
      <MeetingNotes
        onConfirmExtractedActions={onConfirmExtractedActions}
        onAddAction={onAddAction}
        onDeleteDecision={onDeleteDecision}
        onDeleteProjectNote={onDeleteProjectNote}
        onExtractActions={onExtractActions}
        onSaveDecision={onSaveDecision}
        onSaveProjectNote={onSaveProjectNote}
        onUpdateDecision={onUpdateDecision}
        onUpdateProjectNote={onUpdateProjectNote}
        decisions={decisions}
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
        onAddAction={onAddAction}
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
      onAddAction={onAddAction}
      onCleanDuplicates={onCleanDuplicates}
      onCompletionDateChange={onCompletionDateChange}
      onDeleteAction={onDeleteAction}
      onDeleteActions={onDeleteActions}
      onOwnerChange={onOwnerChange}
      onStatusChange={onStatusChange}
      onTagChange={onTagChange}
      project={project}
    />
  );
}

function DashboardShell({
  activeTab,
  actions,
  bugs,
  bugQueries = [],
  phases = [],
  projectLinks = [],
  onActionTitleChange,
  onAddAction,
  onCreatePhase,
  onCreatePhaseItem,
  onCreateProjectLink,
  onCreateBugQuery,
  onCleanDuplicates,
  onCompletionDateChange,
  onConfirmExtractedActions,
  onClearBugs,
  onDeleteBugQuery,
  onDeleteAction,
  onDeleteActions,
  onDeleteDecision,
  onDeletePhase,
  onDeletePhaseItem,
  onDeleteProjectLink,
  onDeleteProjectNote,
  onExtractActions,
  onMovePhase,
  onMovePhaseItem,
  onReorderPhaseItems,
  onReorderPhases,
  onOwnerChange,
  onRefreshBugs,
  onUploadBugs,
  onSaveDecision,
  onSaveProjectNote,
  onStatusChange,
  onTagChange,
  onTabChange,
  onUpdatePhase,
  onUpdatePhaseItem,
  onUpdateProjectDetails,
  onUpdateProjectLink,
  onUpdateBugQuery,
  onUpdateDecision,
  onUpdateProjectNote,
  project,
  updates,
  decisions,
}) {
  const [bugQuery, setBugQuery] = useState(emptyBugQuery);
  const [selectedBugQueryId, setSelectedBugQueryId] = useState("");
  const [bugQueryName, setBugQueryName] = useState("");
  const [reportColumnsByProject, setReportColumnsByProject] = useState({});
  const [isBugColumnPickerOpen, setIsBugColumnPickerOpen] = useState(false);
  const bugColumnPickerRef = useRef(null);
  const [bugLastRefreshedAt, setBugLastRefreshedAt] = useState("");
  const [isBugReportVisible, setIsBugReportVisible] = useState(false);
  const [bugRefreshError, setBugRefreshError] = useState("");
  const [isBugRefreshing, setIsBugRefreshing] = useState(false);
  const [isBugUploading, setIsBugUploading] = useState(false);
  const hasBugQuery = bugQueryHasValue(bugQuery);
  const projectBugQueries = bugQueries.filter((query) => query.projectId === project.id);
  const selectedBugQuery = projectBugQueries.find((query) => String(query.id) === String(selectedBugQueryId)) ?? null;
  const availableBugColumns = useMemo(() => orderedBugColumns(bugs), [bugs]);
  const availableBugColumnsKey = availableBugColumns.join("\u001f");
  const savedReportColumns = reportColumnsByProject?.[project.id];
  const selectedBugColumns = Array.isArray(savedReportColumns)
    ? orderBugColumnsForReport(savedReportColumns, availableBugColumns)
    : defaultBugColumns(availableBugColumns);

  useEffect(() => {
    setBugLastRefreshedAt("");
    setBugRefreshError("");
    setIsBugReportVisible(false);
    setSelectedBugQueryId("");
    setBugQueryName("");
    setBugQuery(emptyBugQuery);
  }, [project.id]);

  useEffect(() => {
    setReportColumnsByProject((currentColumnsByProject) => {
      const safeColumnsByProject =
        currentColumnsByProject && typeof currentColumnsByProject === "object" && !Array.isArray(currentColumnsByProject)
          ? currentColumnsByProject
          : {};
      const currentColumns = Array.isArray(safeColumnsByProject[project.id]) ? safeColumnsByProject[project.id] : [];
      const stillAvailable = orderBugColumnsForReport(currentColumns, availableBugColumns);
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
    setIsBugReportVisible(false);
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
      setBugQuery(emptyBugQuery);
      setBugQueryName("");
    }
    setIsBugReportVisible(false);
    setBugLastRefreshedAt("");
  }

  function handleNewBugQuery() {
    setSelectedBugQueryId("");
    setBugQueryName("");
    setBugQuery(emptyBugQuery);
    setIsBugReportVisible(false);
    setBugLastRefreshedAt("");
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
      const refreshedBugs = await onRefreshBugs(project.id, bugQuery);
      const refreshedAt = new Date();
      setBugLastRefreshedAt(refreshedAt.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }));
      setIsBugReportVisible(true);
      return refreshedBugs;
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
      setIsBugReportVisible(true);
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
            <div className="bug-saved-query-row">
              <label>
                <span>Saved Query</span>
                <select
                  aria-label="Saved Bug DB query"
                  onChange={(event) => handleSelectSavedBugQuery(event.target.value)}
                  value={selectedBugQueryId}
                >
                  <option value="">Select query</option>
                  {projectBugQueries.map((query) => (
                    <option key={query.id} value={query.id}>
                      {query.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Query Name</span>
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
                <span>Subject</span>
                <input
                  aria-label="Subject"
                  onChange={(event) => updateBugQuery("subject", event.target.value)}
                  placeholder="Any"
                  value={bugQuery.subject}
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
                <span>Tag</span>
                <input
                  aria-label="Tag"
                  onChange={(event) => updateBugQuery("tag", event.target.value)}
                  placeholder="Any"
                  value={bugQuery.tag}
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

          </div>
        </div>
      ) : null}

      <DashboardErrorBoundary resetKey={`${project.id}-${activeTab}-${bugs.length}`}>
        <DashboardPanel
          activeTab={activeTab}
          actions={actions}
          bugs={bugs}
          bugLastRefreshedAt={bugLastRefreshedAt}
          bugReportVisible={isBugReportVisible}
          bugRefreshError={bugRefreshError}
          decisions={decisions}
          phases={phases}
          projectLinks={projectLinks}
          onActionTitleChange={onActionTitleChange}
          onAddAction={onAddAction}
          onCleanDuplicates={onCleanDuplicates}
          onCreatePhase={onCreatePhase}
          onCreatePhaseItem={onCreatePhaseItem}
          onCreateProjectLink={onCreateProjectLink}
          onClearBugs={onClearBugs}
          onCompletionDateChange={onCompletionDateChange}
          onConfirmExtractedActions={onConfirmExtractedActions}
          onDeleteDecision={onDeleteDecision}
          onDeletePhase={onDeletePhase}
          onDeletePhaseItem={onDeletePhaseItem}
          onDeleteProjectLink={onDeleteProjectLink}
          onDeleteAction={onDeleteAction}
          onDeleteActions={onDeleteActions}
          onDeleteProjectNote={onDeleteProjectNote}
          onExtractActions={onExtractActions}
          onMovePhase={onMovePhase}
          onMovePhaseItem={onMovePhaseItem}
          onReorderPhaseItems={onReorderPhaseItems}
          onReorderPhases={onReorderPhases}
          onOwnerChange={onOwnerChange}
          onSaveDecision={onSaveDecision}
          onSaveProjectNote={onSaveProjectNote}
          onStatusChange={onStatusChange}
          onTagChange={onTagChange}
          onTabChange={onTabChange}
          onUpdatePhase={onUpdatePhase}
          onUpdatePhaseItem={onUpdatePhaseItem}
          onUpdateProjectDetails={onUpdateProjectDetails}
          onUpdateProjectLink={onUpdateProjectLink}
          onUpdateDecision={onUpdateDecision}
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
  const [decisions, setDecisions] = useState([]);
  const [bugs, setBugs] = useState([]);
  const [bugQueries, setBugQueries] = useState([]);
  const [phases, setPhases] = useState([]);
  const [projectLinks, setProjectLinks] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [apiError, setApiError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [actionPendingDelete, setActionPendingDelete] = useState(null);
  const [actionsPendingDelete, setActionsPendingDelete] = useState([]);
  const [notePendingDelete, setNotePendingDelete] = useState(null);
  const [projectPendingDelete, setProjectPendingDelete] = useState(null);
  const [projectAskModal, setProjectAskModal] = useState(null);
  const [projectSummaryModal, setProjectSummaryModal] = useState(null);
  const [isSummarizingProject, setIsSummarizingProject] = useState(false);
  const [followUps, setFollowUps] = useState([]);
  const [isFollowUpLoading, setIsFollowUpLoading] = useState(false);
  const [followUpError, setFollowUpError] = useState("");
  const [openClassifications, setOpenClassifications] = useState([]);
  const [showArchivedProjects, setShowArchivedProjects] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const toastTimeoutRef = useRef(null);

  useEffect(() => {
    if (!dashboardTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab("overview");
    }
  }, [activeTab]);

  function applyBootstrapData(data, preferredProjectId = selectedProjectId) {
    const loadedProjects = data.projects ?? [];
    setProjects(loadedProjects);
    setActions(data.actions ?? []);
    setUpdates(data.updates ?? []);
    setDecisions(data.decisions ?? []);
    setBugs(data.bugs ?? []);
    setBugQueries(data.bugQueries ?? []);
    setPhases(data.phases ?? []);
    setProjectLinks(data.projectLinks ?? []);
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
      if (candidate === "all") return "all";
      const activeProjects = loadedProjects.filter((project) => !project.archivedAt);
      return loadedProjects.some((project) => project.id === candidate)
        ? candidate
        : activeProjects[0]?.id ?? loadedProjects[0]?.id ?? null;
    });
  }

  async function loadBootstrap(preferredProjectId = selectedProjectId) {
    const data = await apiRequest("/bootstrap");
    applyBootstrapData(data, preferredProjectId);
    return data;
  }

  async function loadFollowUps() {
    try {
      setIsFollowUpLoading(true);
      setFollowUpError("");
      const data = await apiRequest("/followups");
      setFollowUps(data.followUps ?? []);
      return data.followUps ?? [];
    } catch (error) {
      setFollowUpError(error instanceof Error ? error.message : "Could not detect follow-ups.");
      return [];
    } finally {
      setIsFollowUpLoading(false);
    }
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

  useEffect(() => {
    if (selectedProjectId !== "all") return;
    loadFollowUps();
  }, [selectedProjectId, projects.length, updates.length, actions.length, decisions.length]);

  const visibleProjects = useMemo(
    () => projects.filter((project) => showArchivedProjects || !project.archivedAt),
    [projects, showArchivedProjects],
  );

  const classificationGroups = useMemo(() => {
    const groups = new Map();
    visibleProjects.forEach((project) => {
      const groupedProjects = groups.get(project.classification) ?? [];
      groups.set(project.classification, groupedProjects.concat(project));
    });
    return Array.from(groups, ([classification, groupedProjects]) => ({
      classification,
      projects: groupedProjects,
    }));
  }, [visibleProjects]);

  const isAllProjectsView = selectedProjectId === "all";
  const selectedProject = isAllProjectsView
    ? null
    : visibleProjects.find((project) => project.id === selectedProjectId) ?? visibleProjects[0] ?? null;
  const selectedActions = selectedProject ? actions.filter((action) => action.projectId === selectedProject.id) : [];
  const selectedUpdates = selectedProject ? updates.filter((update) => update.projectId === selectedProject.id) : [];
  const selectedDecisions = selectedProject ? decisions.filter((decision) => decision.projectId === selectedProject.id) : [];
  const selectedBugs = selectedProject ? bugs.filter((bug) => bug.projectId === selectedProject.id) : [];
  const selectedPhases = selectedProject ? phases.filter((phase) => phase.projectId === selectedProject.id) : [];
  const selectedProjectLinks = selectedProject ? projectLinks.filter((link) => link.projectId === selectedProject.id) : [];
  const hasSummarySource =
    selectedActions.length > 0 ||
    selectedUpdates.length > 0 ||
    selectedDecisions.length > 0 ||
    selectedBugs.length > 0;
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

  function handleAllProjectsSelect() {
    setSelectedProjectId("all");
  }

  async function handleCreateProject(projectInput) {
    try {
      setApiError("");
      const { project } = await apiRequest("/projects", {
        body: JSON.stringify({
          classification: projectInput.classification,
          epic: projectInput.epic,
          name: projectInput.name.trim(),
          targetRelease: projectInput.targetRelease,
        }),
        method: "POST",
      });

      await loadBootstrap(project.id);
      setActiveTab("overview");
      showToast(`${project.name} created`);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not create project.");
      throw error;
    }
  }

  async function handleUpdateProjectDetails(projectDetails) {
    if (!selectedProject) return;

    try {
      setApiError("");
      const { project: updatedProject } = await apiRequest(`/projects/${selectedProject.id}/details`, {
        body: JSON.stringify(projectDetails),
        method: "PATCH",
      });

      await loadBootstrap(updatedProject.id);
      showToast("Project details updated");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not update project details.");
      throw error;
    }
  }

  async function handleSummarizeProject(projectId) {
    const projectToSummarize = projects.find((project) => project.id === projectId);
    if (!projectToSummarize) return;

    try {
      setApiError("");
      setIsSummarizingProject(true);
      const visibleBugs = bugs.filter((bug) => bug.projectId === projectId);
      const { summary } = await apiRequest(`/projects/${projectId}/summary`, {
        body: JSON.stringify({ bugs: visibleBugs }),
        method: "POST",
      });
      setProjectSummaryModal({ project: projectToSummarize, summary });
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not summarize project notes.");
      throw error;
    } finally {
      setIsSummarizingProject(false);
    }
  }

  async function handleAskProjectMemory(projectId, question) {
    try {
      setApiError("");
      const { answer } = await apiRequest(`/projects/${projectId}/memory-question`, {
        body: JSON.stringify({ question }),
        method: "POST",
      });
      return answer;
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not answer from project memory.");
      throw error;
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
        setActiveTab("overview");
      }
      setProjectPendingDelete(null);
      showToast(`${projectToDelete.name} deleted`);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not delete project.");
    }
  }

  async function handleArchiveProject(projectToArchive) {
    if (!projectToArchive) return;

    try {
      setApiError("");
      const { project: archivedProject } = await apiRequest(`/projects/${projectToArchive.id}/archive`, { method: "POST" });
      const nextProjectId =
        selectedProjectId === archivedProject.id
          ? projects.find((project) => project.id !== archivedProject.id && !project.archivedAt)?.id ?? null
          : selectedProjectId;
      await loadBootstrap(nextProjectId);
      if (selectedProjectId === archivedProject.id) {
        setActiveTab("overview");
      }
      showToast(`${archivedProject.name} archived`);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not archive project.");
    }
  }

  async function handleRestoreProject(projectToRestore) {
    if (!projectToRestore) return;

    try {
      setApiError("");
      const { project: restoredProject } = await apiRequest(`/projects/${projectToRestore.id}/restore`, { method: "POST" });
      await loadBootstrap(restoredProject.id);
      setSelectedProjectId(restoredProject.id);
      setActiveTab("overview");
      showToast(`${restoredProject.name} restored`);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not restore project.");
    }
  }

  async function handleAddAction(actionInput) {
    const projectId = actionInput.projectId ?? selectedProject?.id;
    if (!projectId) return;

    try {
      setApiError("");
      const { action } = await apiRequest("/actions", {
        body: JSON.stringify({
          owner: actionInput.owner,
          completionDate: actionInput.completionDate,
          projectId,
          source: actionInput.source,
          status: actionInput.status,
          tag: actionInput.tag,
          title: actionInput.title.trim(),
        }),
        method: "POST",
      });

      setActions((currentActions) =>
        currentActions.some((currentAction) => currentAction.id === action.id)
          ? currentActions
          : [action, ...currentActions],
      );
      showToast(action.duplicate ? "Action already exists" : "Action added");
      return action;
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not add action.");
      throw error;
    }
  }

  async function handleCreateFollowUpAction(followUp) {
    if (followUp.actionId) {
      setSelectedProjectId(followUp.projectId);
      setActiveTab("status");
      showToast("Opened action board");
      return;
    }

    const createdAction = await handleAddAction({
      completionDate: null,
      owner: null,
      projectId: followUp.projectId,
      source: "follow-up",
      status: "active",
      title: followUp.suggestedAction || followUp.topic,
    });
    if (createdAction) {
      setFollowUps((currentFollowUps) =>
        currentFollowUps.filter((item) => `${item.projectId}-${item.topic}` !== `${followUp.projectId}-${followUp.topic}`),
      );
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

  async function handleActionTagChange(actionId, tag) {
    try {
      setApiError("");
      const { action: updatedAction } = await apiRequest(`/actions/${actionId}`, {
        body: JSON.stringify({ tag }),
        method: "PATCH",
      });

      setActions((currentActions) =>
        currentActions.map((action) => (action.id === actionId ? updatedAction : action)),
      );
      showToast(updatedAction.tag ? `Tag set to #${updatedAction.tag}` : "Tag cleared");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not update action tag.");
      throw error;
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
      const { actions: confirmedActions, skippedDuplicates = 0 } = await apiRequest("/actions/bulk", {
        body: JSON.stringify({
          actions: actionDrafts.map((action) => ({
            completionDate: action.completionDate,
            meetingDate: action.meetingDate,
            owner: action.owner,
            projectId: selectedProject.id,
            source: action.source || "meeting",
            status: action.status,
            tag: action.tag,
            title: action.title,
          })),
        }),
        method: "POST",
      });

      setActions((currentActions) => {
        const currentIds = new Set(currentActions.map((action) => action.id));
        return confirmedActions.filter((action) => !currentIds.has(action.id)).concat(currentActions);
      });
      showToast(
        skippedDuplicates
          ? `${confirmedActions.length} actions added, ${skippedDuplicates} duplicates skipped`
          : `${confirmedActions.length} actions added`,
      );
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
      const { update, decisions: projectDecisions } = await apiRequest("/updates", {
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
      if (projectDecisions) {
        setDecisions((currentDecisions) =>
          currentDecisions
            .filter((decision) => decision.projectId !== selectedProject.id)
            .concat(projectDecisions),
        );
      }
      return update;
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not save note to project feed.");
      return null;
    }
  }

  async function handleUpdateProjectNote(updateId, noteInput) {
    try {
      setApiError("");
      const { update, decisions: projectDecisions } = await apiRequest(`/updates/${updateId}`, {
        body: JSON.stringify({
          meetingDate: noteInput.meetingDate,
          text: noteInput.text,
        }),
        method: "PATCH",
      });

      setUpdates((currentUpdates) =>
        currentUpdates.map((currentUpdate) => (currentUpdate.id === update.id ? update : currentUpdate)),
      );
      if (projectDecisions) {
        setDecisions((currentDecisions) =>
          currentDecisions
            .filter((decision) => decision.projectId !== update.projectId)
            .concat(projectDecisions),
        );
      }
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
      const { decisions: projectDecisions } = await apiRequest(`/updates/${noteToDelete.id}`, { method: "DELETE" });
      setUpdates((currentUpdates) => currentUpdates.filter((update) => update.id !== noteToDelete.id));
      if (projectDecisions) {
        setDecisions((currentDecisions) =>
          currentDecisions
            .filter((decision) => decision.projectId !== noteToDelete.projectId)
            .concat(projectDecisions),
        );
      }
      setNotePendingDelete(null);
      showToast("Project note deleted");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not delete project note.");
      throw error;
    }
  }

  async function handleSaveDecision(decisionInput) {
    if (!selectedProject || !decisionInput.text?.trim()) return null;

    try {
      setApiError("");
      const { decision } = await apiRequest("/decisions", {
        body: JSON.stringify({
          decisionDate: decisionInput.decisionDate,
          owner: decisionInput.owner,
          projectId: selectedProject.id,
          status: decisionInput.status,
          text: decisionInput.text,
        }),
        method: "POST",
      });
      setDecisions((currentDecisions) => currentDecisions.concat(decision));
      showToast("Decision added");
      return decision;
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not save decision.");
      throw error;
    }
  }

  async function handleUpdateDecision(decisionId, decisionInput) {
    try {
      setApiError("");
      const { decision } = await apiRequest(`/decisions/${decisionId}`, {
        body: JSON.stringify({
          decisionDate: decisionInput.decisionDate,
          owner: decisionInput.owner,
          status: decisionInput.status,
          text: decisionInput.text,
        }),
        method: "PATCH",
      });
      setDecisions((currentDecisions) =>
        currentDecisions.map((currentDecision) => currentDecision.id === decision.id ? decision : currentDecision),
      );
      showToast("Decision updated");
      return decision;
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not update decision.");
      throw error;
    }
  }

  async function handleDeleteDecision(decisionToDelete) {
    if (!decisionToDelete) return;

    try {
      setApiError("");
      await apiRequest(`/decisions/${decisionToDelete.id}`, { method: "DELETE" });
      setDecisions((currentDecisions) =>
        currentDecisions.filter((decision) => decision.id !== decisionToDelete.id),
      );
      showToast("Decision deleted");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not delete decision.");
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

  async function handleUpdateBugQuery(queryId, payload, options = {}) {
    try {
      setApiError("");
      const { bugQuery } = await apiRequest(`/bug-queries/${queryId}`, {
        body: JSON.stringify(payload),
        method: "PATCH",
      });
      setBugQueries((currentQueries) => currentQueries.map((query) => (query.id === bugQuery.id ? bugQuery : query)));
      if (!options.silent) {
        showToast("Bug query updated");
      }
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

  async function handleCreatePhase(projectId, payload) {
    try {
      setApiError("");
      const { phase } = await apiRequest(`/projects/${projectId}/phases`, {
        body: JSON.stringify(payload),
        method: "POST",
      });
      setPhases((currentPhases) => currentPhases.concat(phase));
      showToast("Phase added");
      return phase;
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not add phase.");
      throw error;
    }
  }

  async function handleUpdatePhase(phaseId, payload) {
    try {
      setApiError("");
      const { phase } = await apiRequest(`/phases/${phaseId}`, {
        body: JSON.stringify(payload),
        method: "PATCH",
      });
      setPhases((currentPhases) => currentPhases.map((currentPhase) => currentPhase.id === phase.id ? phase : currentPhase));
      showToast("Phase updated");
      return phase;
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not update phase.");
      throw error;
    }
  }

  async function handleDeletePhase(phaseToDelete) {
    try {
      setApiError("");
      await apiRequest(`/phases/${phaseToDelete.id}`, { method: "DELETE" });
      setPhases((currentPhases) => currentPhases.filter((phase) => phase.id !== phaseToDelete.id));
      showToast("Phase deleted");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not delete phase.");
      throw error;
    }
  }

  async function handleMovePhase(phaseId, direction) {
    try {
      setApiError("");
      await apiRequest(`/phases/${phaseId}/${direction}`, { method: "POST" });
      await loadBootstrap(selectedProjectId);
      showToast("Phase moved");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not move phase.");
      throw error;
    }
  }

  async function handleReorderPhases(projectId, orderedIds) {
    try {
      setApiError("");
      await apiRequest(`/projects/${projectId}/phases/reorder`, {
        body: JSON.stringify({ ids: orderedIds }),
        method: "POST",
      });
      await loadBootstrap(selectedProjectId);
      showToast("Phases reordered");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not reorder phases.");
      throw error;
    }
  }

  async function handleCreatePhaseItem(phaseId, payload) {
    try {
      setApiError("");
      await apiRequest(`/phases/${phaseId}/items`, {
        body: JSON.stringify(payload),
        method: "POST",
      });
      await loadBootstrap(selectedProjectId);
      showToast("Subtype added");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not add subtype.");
      throw error;
    }
  }

  async function handleUpdatePhaseItem(itemId, payload) {
    try {
      setApiError("");
      await apiRequest(`/phase-items/${itemId}`, {
        body: JSON.stringify(payload),
        method: "PATCH",
      });
      await loadBootstrap(selectedProjectId);
      showToast(payload.completed === true ? "Subtype completed" : payload.completed === false ? "Subtype reopened" : "Subtype updated");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not update subtype.");
      throw error;
    }
  }

  async function handleDeletePhaseItem(itemToDelete) {
    try {
      setApiError("");
      await apiRequest(`/phase-items/${itemToDelete.id}`, { method: "DELETE" });
      await loadBootstrap(selectedProjectId);
      showToast("Subtype deleted");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not delete subtype.");
      throw error;
    }
  }

  async function handleMovePhaseItem(itemId, direction) {
    try {
      setApiError("");
      await apiRequest(`/phase-items/${itemId}/${direction}`, { method: "POST" });
      await loadBootstrap(selectedProjectId);
      showToast("Subtype moved");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not move subtype.");
      throw error;
    }
  }

  async function handleReorderPhaseItems(phaseId, orderedIds) {
    try {
      setApiError("");
      await apiRequest(`/phases/${phaseId}/items/reorder`, {
        body: JSON.stringify({ ids: orderedIds }),
        method: "POST",
      });
      await loadBootstrap(selectedProjectId);
      showToast("Subtypes reordered");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not reorder subtypes.");
      throw error;
    }
  }

  async function handleCreateProjectLink(projectId, payload) {
    try {
      setApiError("");
      const { projectLink } = await apiRequest(`/projects/${projectId}/links`, {
        body: JSON.stringify(payload),
        method: "POST",
      });
      setProjectLinks((currentLinks) => currentLinks.concat(projectLink));
      showToast("Useful link added");
      return projectLink;
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not add useful link.");
      throw error;
    }
  }

  async function handleUpdateProjectLink(linkId, payload) {
    try {
      setApiError("");
      const { projectLink } = await apiRequest(`/project-links/${linkId}`, {
        body: JSON.stringify(payload),
        method: "PATCH",
      });
      setProjectLinks((currentLinks) => currentLinks.map((link) => link.id === projectLink.id ? projectLink : link));
      showToast("Useful link updated");
      return projectLink;
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not update useful link.");
      throw error;
    }
  }

  async function handleDeleteProjectLink(linkToDelete) {
    try {
      setApiError("");
      await apiRequest(`/project-links/${linkToDelete.id}`, { method: "DELETE" });
      setProjectLinks((currentLinks) => currentLinks.filter((link) => link.id !== linkToDelete.id));
      showToast("Useful link deleted");
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "Could not delete useful link.");
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
        isAllProjectsSelected={isAllProjectsView}
        isCollapsed={isSidebarCollapsed}
        onAllProjectsSelect={handleAllProjectsSelect}
        onArchiveProject={handleArchiveProject}
        onCreateProject={handleCreateProject}
        onProjectSelect={handleProjectSelect}
        onRequestDeleteProject={setProjectPendingDelete}
        onRestoreProject={handleRestoreProject}
        onToggleArchivedProjects={setShowArchivedProjects}
        onToggleSidebar={() => setIsSidebarCollapsed((isCollapsed) => !isCollapsed)}
        onToggleClassification={handleToggleClassification}
        openClassifications={openClassifications}
        selectedProject={selectedProject}
        showArchivedProjects={showArchivedProjects}
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
        ) : isAllProjectsView ? (
          <DashboardLevelView
            actions={actions}
            followUpError={followUpError}
            followUps={followUps}
            isFollowUpLoading={isFollowUpLoading}
            onCreateFollowUpAction={handleCreateFollowUpAction}
            onRefreshFollowUps={loadFollowUps}
            projects={projects}
            updates={updates}
          />
        ) : selectedProject ? (
          <>
            <ProjectSummary
              actions={selectedActions}
              hasSummarySource={hasSummarySource}
              isSummarizingProject={isSummarizingProject}
              metrics={metrics}
              onOpenProjectAsk={setProjectAskModal}
              onSummarizeProject={handleSummarizeProject}
              onUpdateProjectDetails={handleUpdateProjectDetails}
              selectedProject={selectedProject}
              updates={selectedUpdates}
            />
            <DashboardShell
              activeTab={activeTab}
              actions={selectedActions}
              bugs={selectedBugs}
              bugQueries={bugQueries}
              decisions={selectedDecisions}
              phases={selectedPhases}
              projectLinks={selectedProjectLinks}
              onActionTitleChange={handleActionTitleChange}
              onAddAction={handleAddAction}
              onCreatePhase={handleCreatePhase}
              onCreatePhaseItem={handleCreatePhaseItem}
              onCreateProjectLink={handleCreateProjectLink}
              onCreateBugQuery={handleCreateBugQuery}
              onCleanDuplicates={handleCleanDuplicates}
              onClearBugs={handleClearBugs}
              onCompletionDateChange={handleCompletionDateChange}
              onConfirmExtractedActions={handleConfirmExtractedActions}
              onDeleteBugQuery={handleDeleteBugQuery}
              onDeleteAction={setActionPendingDelete}
              onDeleteActions={setActionsPendingDelete}
              onDeleteDecision={handleDeleteDecision}
              onDeletePhase={handleDeletePhase}
              onDeletePhaseItem={handleDeletePhaseItem}
              onDeleteProjectLink={handleDeleteProjectLink}
              onDeleteProjectNote={setNotePendingDelete}
              onExtractActions={handleExtractActions}
              onMovePhase={handleMovePhase}
              onMovePhaseItem={handleMovePhaseItem}
              onReorderPhaseItems={handleReorderPhaseItems}
              onReorderPhases={handleReorderPhases}
              onOwnerChange={handleOwnerChange}
              onRefreshBugs={handleRefreshBugs}
              onUploadBugs={handleUploadBugs}
              onSaveDecision={handleSaveDecision}
              onSaveProjectNote={handleSaveProjectNote}
              onStatusChange={handleStatusChange}
              onTagChange={handleActionTagChange}
              onTabChange={setActiveTab}
              onUpdatePhase={handleUpdatePhase}
              onUpdatePhaseItem={handleUpdatePhaseItem}
              onUpdateProjectDetails={handleUpdateProjectDetails}
              onUpdateProjectLink={handleUpdateProjectLink}
              onUpdateBugQuery={handleUpdateBugQuery}
              onUpdateDecision={handleUpdateDecision}
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
      {projectAskModal ? (
        <ProjectAskDialog
          onAskQuestion={handleAskProjectMemory}
          onClose={() => setProjectAskModal(null)}
          project={projectAskModal}
        />
      ) : null}
      <TooltipLayer />
    </div>
  );
}

export default App;
