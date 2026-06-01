from __future__ import annotations

import base64
import binascii
import csv
import io
import json
import os
import re
import sqlite3
import zipfile
from datetime import date, datetime, timedelta, timezone
from functools import lru_cache
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

import requests


DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8000
DEFAULT_DB_PATH = Path(__file__).with_name("project_pulse.db")
DEFAULT_CONFIG_PATH = Path(__file__).with_name("project-pulse.config.json")
DEFAULT_OCI_MODEL_ID = "meta.llama-3.3-70b-instruct"
DEFAULT_BUGDB_MCP_ENDPOINT = "https://bug.oraclecorp.com/mcp"
DEFAULT_BUGDB_OAUTH_SCOPE = "bug.rest.idcs"

ACTION_STATUSES = {"active", "blocked", "done"}
GENERIC_ACTION_TITLES = {
    "action",
    "action item",
    "action items",
    "do",
    "do it",
    "follow up",
    "followup",
    "item",
    "task",
    "to do",
    "todo",
    "work",
}
KNOWN_ACTION_ACRONYMS = {"ai", "api", "csv", "db", "oci", "qa", "sql", "ui", "url"}
NEXT_STEPS_HEADER = re.compile(
    r"^\s*(?:#+\s*)?(?:next\s+(?:steps?|actions?)|action\s+items?|follow[-\s]?ups?|to\s+do|todo)\s*:?\s*$",
    flags=re.IGNORECASE,
)
NEXT_STEPS_INLINE_HEADER = re.compile(
    r"\b(?:next\s+(?:steps?|actions?)|action\s+items?|follow[-\s]?ups?|to\s+do|todo)\b\s*:?",
    flags=re.IGNORECASE,
)
SECTION_HEADER = re.compile(
    r"^\s*(?:#+\s*)?(?:summary|quick\s+recap|recap|discussion|updates|recommendation|agent|search|semantic|memory|ai\s+conversation)\b",
    flags=re.IGNORECASE,
)
SECTION_INLINE_HEADER = re.compile(
    r"(?:\n\s*|\.\s+)(?:summary|recommendation\s+system|agent\s+performance|search\s+and\s+enc|semantic\s+search|memory\s+layer|ai\s+conversation)\b",
    flags=re.IGNORECASE,
)
OWNER_TASK_LINE = re.compile(
    r"^\s*(?:[-*]\s*)?(?P<owner>[A-Za-z][A-Za-z0-9 .&/(),'-]{0,80}?)\s*:\s*(?P<body>.+?)\s*$"
)
OWNER_TASK_MARKER = re.compile(
    r"(?<!\w)(?P<owner>[A-Z][A-Za-z0-9.'-]*(?:\s+[A-Z][A-Za-z0-9.'-]*){0,3}(?:\s*(?:&|and|/)\s*Team)?)\s*:\s*"
)
ACTION_SEGMENT_START = re.compile(r"^(?:then|and|also)\s+", flags=re.IGNORECASE)
ACTION_TRIGGER = re.compile(
    r"\b(?:needs?\s+to|need\s+to|must|should|will|has\s+to|have\s+to)\s+(?P<title>.+)",
    flags=re.IGNORECASE,
)
NON_OWNER_LABELS = {
    "action",
    "actions",
    "action item",
    "action items",
    "blocker",
    "blockers",
    "meeting",
    "meeting extraction",
    "notes",
    "priority",
    "recap",
    "status",
    "summary",
}
OWNER_HEADING_ACTION_WORDS = {
    "add",
    "assess",
    "build",
    "check",
    "clarify",
    "clean",
    "close",
    "complete",
    "confirm",
    "coordinate",
    "create",
    "continue",
    "evaluate",
    "fast",
    "finish",
    "fix",
    "follow",
    "include",
    "integrate",
    "investigate",
    "link",
    "loop",
    "move",
    "plan",
    "prepare",
    "provide",
    "record",
    "resolve",
    "review",
    "schedule",
    "set",
    "share",
    "send",
    "talk",
    "test",
    "tighten",
    "update",
    "work",
}

AI_EXTRACTION_SCHEMA = {
    "title": "ProjectActionExtraction",
    "description": "Important points and action items extracted from project meeting notes.",
    "type": "object",
    "properties": {
        "points": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Short important points from the notes.",
        },
        "actions": {
            "type": "array",
            "description": "Project action items.",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Concise action item title."},
                    "owner": {
                        "anyOf": [{"type": "string"}, {"type": "null"}],
                        "description": "Owner name from the provided project members, or null.",
                    },
                    "status": {
                        "type": "string",
                        "enum": ["active", "blocked", "done"],
                        "description": "Current action status.",
                    },
                    "completionDate": {
                        "anyOf": [{"type": "string"}, {"type": "null"}],
                        "description": "Optional action completion date as YYYY-MM-DD when explicitly stated.",
                    },
                },
                "required": ["title", "owner", "status"],
            },
        },
    },
    "required": ["points", "actions"],
}

AI_PROJECT_SUMMARY_SCHEMA = {
    "title": "ProjectStatusSummary",
    "description": "A concise project status summary from saved project notes and action items.",
    "type": "object",
    "properties": {
        "headline": {"type": "string", "description": "Short summary title."},
        "overview": {"type": "string", "description": "One concise paragraph summarizing project status."},
        "pending": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Open active or overdue work still pending, excluding blocked and done work.",
        },
        "blocked": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Blocked work, blockers, or risks preventing progress.",
        },
        "done": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Completed work and action items explicitly marked done.",
        },
        "keyDecisions": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Key decisions, agreements, approvals, or choices captured in project notes.",
        },
    },
    "required": ["headline", "overview", "pending", "blocked", "done", "keyDecisions"],
}

SEED_PROJECTS = [
    {
        "id": 1,
        "name": "Customer Portal Launch",
        "classification": "work",
        "owner": None,
        "summary": "Launch readiness, onboarding docs, and analytics follow-up.",
        "members": ["Asha Rao", "Ben Carter", "Mia Chen"],
    },
    {
        "id": 2,
        "name": "Mobile Quality Sweep",
        "classification": "work",
        "owner": None,
        "summary": "Mobile bug triage and release confidence checks.",
        "members": ["Ben Carter", "Ravi Patel"],
    },
    {
        "id": 3,
        "name": "Home Renovation",
        "classification": "personal",
        "owner": None,
        "summary": "Personal planning project used for local testing.",
        "members": ["Parul"],
    },
    {
        "id": 4,
        "name": "Dashboard UI Refresh",
        "classification": "ui",
        "owner": None,
        "summary": "Prototype polish and interaction review.",
        "members": ["Mia Chen", "Asha Rao"],
    },
]

SEED_ACTIONS = [
    {"id": 1, "projectId": 1, "title": "Finalize launch checklist", "owner": "Asha Rao", "status": "active"},
    {"id": 2, "projectId": 1, "title": "Resolve analytics blocker", "owner": "Ben Carter", "status": "blocked"},
    {"id": 3, "projectId": 2, "title": "Review crash reports", "owner": "Ravi Patel", "status": "active"},
]

SEED_UPDATES = [
    {
        "id": 1,
        "projectId": 1,
        "person": "Asha Rao",
        "status": "In Progress",
        "text": "Launch checklist is moving; analytics remains blocked.",
    }
]

SEED_BUGS = [
    {
        "id": "BUG-1401",
        "projectId": 1,
        "title": "Analytics event missing on portal submit",
        "assignee": "Ben Carter",
        "status": "Open",
        "severity": "High",
    },
    {
        "id": "BUG-1502",
        "projectId": 2,
        "title": "Mobile dashboard card clips on narrow screens",
        "assignee": "Ravi Patel",
        "status": "In Progress",
        "severity": "Medium",
    },
]

BUGDB_TOKEN_CACHE: dict[str, object] = {"access_token": None, "expires_at": 0.0, "cache_key": None}
BUGDB_QUERY_COLUMNS = [
    "rptno",
    "subject",
    "status",
    "severity",
    "product_id",
    "raw_updated_date",
    "reported_by",
    "component",
    "assignee",
]
BUGDB_QUERY_FIELDS = {
    "assignee": "assignee",
    "component": "component",
    "productId": "product_id",
    "product_id": "product_id",
    "reportedBy": "reported_by",
    "reported_by": "reported_by",
    "rptno": "rptno",
    "severity": "severity",
    "status": "status",
}


class ApiError(Exception):
    def __init__(self, status: HTTPStatus, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def db_connect(db_path: str | Path) -> sqlite3.Connection:
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db(db_path: str | Path, seed: bool = True) -> None:
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    with db_connect(db_path) as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS projects (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              classification TEXT NOT NULL DEFAULT 'work',
              owner TEXT,
              summary TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS project_members (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
              name TEXT NOT NULL,
              UNIQUE(project_id, name)
            );

            CREATE TABLE IF NOT EXISTS actions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
              title TEXT NOT NULL,
              owner TEXT,
              status TEXT NOT NULL,
              source TEXT,
              completion_date TEXT,
              meeting_date TEXT,
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS updates (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
              person TEXT,
              status TEXT NOT NULL,
              text TEXT NOT NULL,
              blocker TEXT,
              meeting_date TEXT,
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS bugs (
              id TEXT NOT NULL,
              project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
              title TEXT NOT NULL,
              assignee TEXT,
              status TEXT NOT NULL,
              severity TEXT NOT NULL,
              priority TEXT,
              fields_json TEXT,
              refreshed_at TEXT NOT NULL,
              PRIMARY KEY (id, project_id)
            );

            CREATE TABLE IF NOT EXISTS bug_queries (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
              name TEXT NOT NULL,
              query_json TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              UNIQUE(project_id, name)
            );
            """
        )
        ensure_column(connection, "actions", "completion_date", "TEXT")
        ensure_column(connection, "actions", "meeting_date", "TEXT")
        ensure_column(connection, "updates", "meeting_date", "TEXT")
        ensure_column(connection, "bugs", "priority", "TEXT")
        ensure_column(connection, "bugs", "fields_json", "TEXT")
        backfill_action_meeting_dates(connection)

        if seed and connection.execute("SELECT COUNT(*) FROM projects").fetchone()[0] == 0:
            seed_database(connection)


def ensure_column(connection: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    columns = {row["name"] for row in connection.execute(f"PRAGMA table_info({table})")}
    if column not in columns:
        connection.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def backfill_action_meeting_dates(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        UPDATE actions
        SET meeting_date = (
          SELECT updates.meeting_date
          FROM updates
          WHERE updates.project_id = actions.project_id
            AND updates.meeting_date IS NOT NULL
            AND updates.created_at <= actions.created_at
          ORDER BY updates.created_at DESC
          LIMIT 1
        )
        WHERE meeting_date IS NULL
          AND lower(coalesce(source, '')) IN ('meeting', 'ai companion notes')
          AND EXISTS (
            SELECT 1
            FROM updates
            WHERE updates.project_id = actions.project_id
              AND updates.meeting_date IS NOT NULL
              AND updates.created_at <= actions.created_at
          )
        """
    )


def seed_database(connection: sqlite3.Connection) -> None:
    timestamp = now_iso()
    for project in SEED_PROJECTS:
        connection.execute(
            """
            INSERT INTO projects (id, name, classification, owner, summary, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                project["id"],
                project["name"],
                project["classification"],
                project["owner"],
                project["summary"],
                timestamp,
            ),
        )
        for member in project["members"]:
            connection.execute(
                "INSERT INTO project_members (project_id, name) VALUES (?, ?)",
                (project["id"], member),
            )

    for action in SEED_ACTIONS:
        connection.execute(
            """
            INSERT INTO actions (id, project_id, title, owner, status, source, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                action["id"],
                action["projectId"],
                action["title"],
                action["owner"],
                action["status"],
                "seed",
                timestamp,
            ),
        )

    for update in SEED_UPDATES:
        connection.execute(
            """
            INSERT INTO updates (id, project_id, person, status, text, blocker, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                update["id"],
                update["projectId"],
                update["person"],
                update["status"],
                update["text"],
                None,
                timestamp,
            ),
        )

    for bug in SEED_BUGS:
        fields = {
            "Bug/Enh Number": bug["id"],
            "Subject": bug["title"],
            "Status": bug["status"],
            "Severity": bug["severity"],
            "Priority": bug.get("priority", ""),
            "Assignee": bug["assignee"],
        }
        connection.execute(
            """
            INSERT INTO bugs (id, project_id, title, assignee, status, severity, priority, fields_json, refreshed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                bug["id"],
                bug["projectId"],
                bug["title"],
                bug["assignee"],
                bug["status"],
                bug["severity"],
                bug.get("priority", ""),
                json.dumps(fields),
                timestamp,
            ),
        )


def normalize_name(value: object) -> str:
    return " ".join(str(value or "").strip().split())


def normalize_date(value: object, field_name: str) -> str | None:
    normalized = normalize_name(value)
    if not normalized:
        return None
    try:
        return date.fromisoformat(normalized).isoformat()
    except ValueError as error:
        raise ApiError(HTTPStatus.BAD_REQUEST, f"{field_name} must be YYYY-MM-DD.") from error


def normalize_classification(value: object) -> str:
    normalized = "".join(char.lower() if char.isalnum() else "-" for char in str(value or "work").strip())
    normalized = "-".join(part for part in normalized.split("-") if part)
    return normalized or "work"


def parse_members(value: object) -> list[str]:
    raw_members = value if isinstance(value, list) else str(value or "").split(",")
    members: list[str] = []
    seen: set[str] = set()
    for raw_member in raw_members:
        member = normalize_name(raw_member)
        key = member.lower()
        if member and key not in seen:
            members.append(member)
            seen.add(key)
    return members


def normalized_match_text(value: object) -> str:
    return " ".join(
        "".join(char.lower() if char.isalnum() else " " for char in str(value or "")).split()
    )


def match_project_member(value: object, members: list[str]) -> str | None:
    candidate = normalized_match_text(value)
    if not candidate:
        return None

    exact_matches = {normalized_match_text(member): member for member in members}
    if candidate in exact_matches:
        return exact_matches[candidate]

    partial_matches = [
        member
        for member in members
        if candidate in normalized_match_text(member).split()
    ]
    return partial_matches[0] if len(partial_matches) == 1 else None


def infer_action_owner(raw_owner: object, title: object, notes: str, members: list[str]) -> str | None:
    matched_owner = match_project_member(raw_owner, members)
    if matched_owner:
        return matched_owner

    searchable_text = f"{title} {notes}"
    normalized_text = f" {normalized_match_text(searchable_text)} "
    matches = [
        member
        for member in members
        if f" {normalized_match_text(member)} " in normalized_text
    ]
    return matches[0] if len(matches) == 1 else None


def action_title_from_text(value: object) -> str:
    text = normalize_name(value)
    text = re.sub(
        r"\b(by|before|due)\s+(today|tonight|tomorrow(?:\s+morning)?|eod|end of day|next call|the next call|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b.*$",
        "",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"^(to|then|and|also)\s+", "", text, flags=re.IGNORECASE).strip(" .,-")
    if text.isupper() and any(character.isalpha() for character in text):
        words = [
            word.upper() if word.lower() in KNOWN_ACTION_ACRONYMS else word.lower()
            for word in text.split()
        ]
        text = " ".join(words)
    return text[:1].upper() + text[1:] if text else ""


def action_title_is_generic(value: object) -> bool:
    return normalized_match_text(value) in GENERIC_ACTION_TITLES


def repaired_action_title(raw_title: object, notes: str) -> str:
    title = action_title_from_text(raw_title)
    if not title or not action_title_is_generic(title):
        return title

    fallback_actions = fallback_actions_from_notes(notes, [])
    for action in fallback_actions.get("actions", []):
        fallback_title = action_title_from_text(action.get("title"))
        if fallback_title and not action_title_is_generic(fallback_title):
            return fallback_title
    return title


def completion_date_from_text(value: object) -> str | None:
    text = normalized_match_text(value)
    words = text.split()
    today = date.today()
    if "tomorrow" in words:
        return (today + timedelta(days=1)).isoformat()
    if "today" in words or "tonight" in words or "eod" in words:
        return today.isoformat()
    match = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", str(value or ""))
    if match:
        return normalize_date(match.group(1), "Completion date")
    return None


def clean_meeting_line(value: object) -> str:
    text = normalize_name(value)
    return re.sub(r"^\s*(?:[-*]|\d+[.)])\s*", "", text).strip()


def has_next_steps_section(notes: str) -> bool:
    return (
        any(NEXT_STEPS_HEADER.match(clean_meeting_line(line)) for line in notes.splitlines())
        or NEXT_STEPS_INLINE_HEADER.search(str(notes or "")) is not None
    )


def next_step_lines(notes: str) -> list[str]:
    lines: list[str] = []
    in_section = False
    saw_action_line = False
    for raw_line in notes.splitlines():
        line = clean_meeting_line(raw_line)
        if not line:
            continue
        if NEXT_STEPS_HEADER.match(line):
            in_section = True
            saw_action_line = False
            continue
        if not in_section:
            continue
        if SECTION_HEADER.match(line) and saw_action_line:
            break
        if SECTION_HEADER.match(line) and not OWNER_TASK_LINE.match(line):
            break
        lines.append(line)
        saw_action_line = True
    return lines


def next_steps_inline_body(notes: str) -> str:
    text = str(notes or "")
    match = NEXT_STEPS_INLINE_HEADER.search(text)
    if not match:
        return ""
    body = text[match.end():]
    stop = SECTION_INLINE_HEADER.search(body)
    if stop:
        body = body[:stop.start()]
    return normalize_name(body)


def next_step_entries(notes: str) -> list[tuple[str, str]]:
    entries: list[tuple[str, str]] = []
    for line in next_step_lines(notes):
        match = OWNER_TASK_LINE.match(line)
        if match:
            entries.append((match.group("owner"), match.group("body")))

    inline_body = next_steps_inline_body(notes)
    markers = list(OWNER_TASK_MARKER.finditer(inline_body))
    for index, marker in enumerate(markers):
        start = marker.end()
        end = markers[index + 1].start() if index + 1 < len(markers) else len(inline_body)
        body = inline_body[start:end].strip(" .,-")
        if body:
            entries.append((marker.group("owner"), body))

    deduped: list[tuple[str, str]] = []
    seen: set[str] = set()
    for owner, body in entries:
        key = "|".join([normalized_match_text(owner), normalized_match_text(body)])
        if key in seen:
            continue
        deduped.append((owner, body))
        seen.add(key)
    return deduped


def action_body_looks_actionable(value: object) -> bool:
    title = action_title_from_text(value)
    if not title or action_title_is_generic(title):
        return False
    words = normalized_match_text(value).split()
    return bool(words and words[0] in OWNER_HEADING_ACTION_WORDS) or ACTION_TRIGGER.search(str(value or "")) is not None


def owner_colon_entries(notes: str, members: list[str]) -> list[tuple[str, str]]:
    entries: list[tuple[str, str]] = []
    for raw_line in notes.splitlines():
        line = clean_meeting_line(raw_line)
        if not line or NEXT_STEPS_HEADER.match(line) or SECTION_HEADER.match(line):
            continue
        match = OWNER_TASK_LINE.match(line)
        if not match:
            continue

        owner_label = match.group("owner")
        owner_key = normalized_match_text(owner_label)
        body = match.group("body")
        if owner_key in NON_OWNER_LABELS or not action_body_looks_actionable(body):
            continue
        if match_project_member(owner_label, members) or is_owner_heading_line(owner_label, members):
            entries.append((owner_label, body))

    deduped: list[tuple[str, str]] = []
    seen: set[str] = set()
    for owner, body in entries:
        key = "|".join([normalized_match_text(owner), normalized_match_text(body)])
        if key in seen:
            continue
        deduped.append((owner, body))
        seen.add(key)
    return deduped


def is_owner_heading_line(line: object, members: list[str]) -> bool:
    label = clean_meeting_line(line).strip(":").strip()
    if not label or NEXT_STEPS_HEADER.match(label) or SECTION_HEADER.match(label):
        return False
    if match_project_member(label, members):
        return True

    words = label.split()
    if not 1 <= len(words) <= 4:
        return False
    if normalized_match_text(words[0]) in OWNER_HEADING_ACTION_WORDS:
        return False
    return all(re.fullmatch(r"[A-Za-z][A-Za-z.'-]*", word) for word in words)


def owner_heading_entries(notes: str, members: list[str]) -> list[tuple[str, str]]:
    entries: list[tuple[str, str]] = []
    current_owner_label: str | None = None
    in_owner_block = False

    for line in next_step_lines(notes):
        if OWNER_TASK_LINE.match(line):
            current_owner_label = None
            in_owner_block = False
            continue
        if is_owner_heading_line(line, members):
            current_owner_label = line.strip(":").strip()
            in_owner_block = True
            continue
        if not in_owner_block:
            continue
        for segment in split_action_segments(line):
            entries.append((current_owner_label or "", segment))

    deduped: list[tuple[str, str]] = []
    seen: set[str] = set()
    for owner, body in entries:
        key = "|".join([normalized_match_text(owner), normalized_match_text(body)])
        if key in seen:
            continue
        deduped.append((owner, body))
        seen.add(key)
    return deduped


def action_owner_from_label(value: object, members: list[str]) -> str | None:
    label = normalize_name(re.sub(r"\([^)]*\)", "", str(value or "")))
    exact_match = match_project_member(label, members)
    if exact_match:
        return exact_match

    candidates = [part for part in re.split(r"\s*(?:&|/|,|\band\b)\s*", label) if normalize_name(part)]
    matches: list[str] = []
    for candidate in candidates:
        candidate = normalize_name(candidate)
        if normalized_match_text(candidate) == "team":
            continue
        match = match_project_member(candidate, members)
        if match and match not in matches:
            matches.append(match)
    return matches[0] if len(matches) == 1 else None


def split_action_segments(value: object) -> list[str]:
    segments: list[str] = []
    for segment in re.split(r"\s*;\s*", normalize_name(value)):
        segment = ACTION_SEGMENT_START.sub("", segment).strip(" .,-")
        if segment:
            segments.append(segment)
    return segments


def dedupe_action_payloads(actions: list[dict]) -> list[dict]:
    deduped: list[dict] = []
    seen: set[str] = set()
    for action in actions:
        key = "|".join([
            normalized_match_text(action.get("title")),
            normalized_match_text(action.get("owner")),
        ])
        if not normalized_match_text(action.get("title")) or key in seen:
            continue
        deduped.append(action)
        seen.add(key)
    return deduped


def structured_actions_from_next_steps(notes: str, members: list[str]) -> list[dict]:
    actions: list[dict] = []
    entries = [
        *next_step_entries(notes),
        *owner_heading_entries(notes, members),
        *owner_colon_entries(notes, members),
    ]
    for owner_label, body in entries:
        owner = action_owner_from_label(owner_label, members)
        for segment in split_action_segments(body):
            title = action_title_from_text(segment)
            if not title:
                continue
            actions.append({
                "_ownerLocked": True,
                "completionDate": completion_date_from_text(segment),
                "owner": owner,
                "status": "blocked" if "blocked" in normalized_match_text(segment).split() else "active",
                "title": title,
            })
    return dedupe_action_payloads(actions)


def fallback_actions_from_notes(notes: str, members: list[str]) -> dict:
    structured_actions = structured_actions_from_next_steps(notes, members)
    if structured_actions:
        point = (
            "Action items were inferred from the Next steps section."
            if has_next_steps_section(notes)
            else "Action items were inferred from owner assignment lines."
        )
        return {
            "actions": structured_actions,
            "points": [point],
            "strategy": "next_steps",
        }

    actions = []
    fragments = [fragment.strip() for fragment in re.split(r"[\n.;]+", notes) if fragment.strip()]

    for fragment in fragments:
        owner = infer_action_owner(None, "", fragment, members)
        without_owner = fragment
        if owner:
            without_owner = re.sub(rf"\b{re.escape(owner)}\b", "", without_owner, count=1, flags=re.IGNORECASE).strip()

        match = ACTION_TRIGGER.search(without_owner)
        if not match:
            continue

        title = action_title_from_text(match.group("title"))
        if title:
            actions.append({
                "completionDate": completion_date_from_text(fragment),
                "owner": owner,
                "status": "blocked" if "blocked" in normalized_match_text(fragment).split() else "active",
                "title": title,
            })

    actions = dedupe_action_payloads(actions)
    point = (
        "Action items were inferred from the Next steps section."
        if structured_actions
        else "Action items were inferred from clear assignment language."
    )
    return {
        "actions": actions,
        "points": [point] if actions else [],
    }


def row_to_project(connection: sqlite3.Connection, row: sqlite3.Row) -> dict:
    members = [
        member["name"]
        for member in connection.execute(
            "SELECT name FROM project_members WHERE project_id = ? ORDER BY id",
            (row["id"],),
        )
    ]
    return {
        "id": row["id"],
        "name": row["name"],
        "classification": row["classification"],
        "owner": None,
        "summary": row["summary"],
        "members": members,
    }


def row_to_action(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "owner": row["owner"],
        "projectId": row["project_id"],
        "status": row["status"],
        "source": row["source"],
        "completionDate": row["completion_date"],
        "meetingDate": row["meeting_date"],
        "createdAt": row["created_at"],
    }


def row_to_update(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "person": row["person"],
        "projectId": row["project_id"],
        "status": row["status"],
        "text": row["text"],
        "blocker": row["blocker"],
        "meetingDate": row["meeting_date"],
        "createdAt": row["created_at"],
    }


def row_to_bug(row: sqlite3.Row) -> dict:
    try:
        fields = json.loads(row["fields_json"] or "{}")
    except json.JSONDecodeError:
        fields = {}
    if not isinstance(fields, dict):
        fields = {}

    fields = {str(key): str(value) for key, value in fields.items() if value is not None and value != ""}
    fields.setdefault("Bug/Enh Number", row["id"])
    fields.setdefault("Subject", row["title"])
    fields.setdefault("Status", row["status"])
    fields.setdefault("Severity", row["severity"])
    if row["priority"]:
        fields.setdefault("Priority", row["priority"])
    fields.setdefault("Assignee", row["assignee"] or "Unassigned")

    return {
        "id": row["id"],
        "title": row["title"],
        "assignee": row["assignee"],
        "status": row["status"],
        "severity": row["severity"],
        "priority": row["priority"] or "",
        "fields": fields,
        "projectId": row["project_id"],
    }


def row_to_bug_query(row: sqlite3.Row) -> dict:
    try:
        query = json.loads(row["query_json"] or "{}")
    except json.JSONDecodeError:
        query = {}
    if not isinstance(query, dict):
        query = {}
    return {
        "id": row["id"],
        "projectId": row["project_id"],
        "name": row["name"],
        "query": query,
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def require_project(connection: sqlite3.Connection, project_id: int) -> sqlite3.Row:
    project = connection.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    if not project:
        raise ApiError(HTTPStatus.NOT_FOUND, "Project not found.")
    return project


def list_projects(connection: sqlite3.Connection) -> list[dict]:
    return [
        row_to_project(connection, row)
        for row in connection.execute("SELECT * FROM projects ORDER BY id")
    ]


def list_actions(connection: sqlite3.Connection, project_id: int | None = None) -> list[dict]:
    if project_id is None:
        rows = connection.execute("SELECT * FROM actions ORDER BY id")
    else:
        rows = connection.execute("SELECT * FROM actions WHERE project_id = ? ORDER BY id", (project_id,))
    return [row_to_action(row) for row in rows]


def list_updates(connection: sqlite3.Connection, project_id: int | None = None) -> list[dict]:
    if project_id is None:
        rows = connection.execute("SELECT * FROM updates ORDER BY id")
    else:
        rows = connection.execute("SELECT * FROM updates WHERE project_id = ? ORDER BY id", (project_id,))
    return [row_to_update(row) for row in rows]


def list_bugs(connection: sqlite3.Connection, project_id: int | None = None) -> list[dict]:
    if project_id is None:
        rows = connection.execute("SELECT * FROM bugs ORDER BY project_id, id")
    else:
        rows = connection.execute("SELECT * FROM bugs WHERE project_id = ? ORDER BY id", (project_id,))
    return [row_to_bug(row) for row in rows]


def list_bug_queries(connection: sqlite3.Connection, project_id: int | None = None) -> list[dict]:
    if project_id is None:
        rows = connection.execute("SELECT * FROM bug_queries ORDER BY project_id, name COLLATE NOCASE")
    else:
        rows = connection.execute(
            "SELECT * FROM bug_queries WHERE project_id = ? ORDER BY name COLLATE NOCASE",
            (project_id,),
        )
    return [row_to_bug_query(row) for row in rows]


def create_project(connection: sqlite3.Connection, payload: dict) -> dict:
    name = normalize_name(payload.get("name"))
    if not name:
        raise ApiError(HTTPStatus.BAD_REQUEST, "Project name is required.")

    members = parse_members(payload.get("members", []))
    classification = normalize_classification(payload.get("classification"))
    summary = normalize_name(payload.get("summary")) or ""

    cursor = connection.execute(
        """
        INSERT INTO projects (name, classification, owner, summary, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (name, classification, None, summary, now_iso()),
    )
    project_id = cursor.lastrowid

    for member in members:
        connection.execute(
            "INSERT OR IGNORE INTO project_members (project_id, name) VALUES (?, ?)",
            (project_id, member),
        )

    return row_to_project(connection, require_project(connection, project_id))


def add_project_member(connection: sqlite3.Connection, project_id: int, payload: dict) -> dict:
    require_project(connection, project_id)
    member = normalize_name(payload.get("name") or payload.get("member"))
    if not member:
        raise ApiError(HTTPStatus.BAD_REQUEST, "Member name is required.")

    connection.execute(
        "INSERT OR IGNORE INTO project_members (project_id, name) VALUES (?, ?)",
        (project_id, member),
    )
    connection.execute(
        "UPDATE projects SET owner = NULL WHERE id = ?",
        (project_id,),
    )
    return row_to_project(connection, require_project(connection, project_id))


def replace_project_members(connection: sqlite3.Connection, project_id: int, payload: dict | list) -> dict:
    project = require_project(connection, project_id)
    raw_members = payload.get("members", []) if isinstance(payload, dict) else payload
    members = parse_members(raw_members)

    connection.execute("DELETE FROM project_members WHERE project_id = ?", (project_id,))
    for member in members:
        connection.execute(
            "INSERT OR IGNORE INTO project_members (project_id, name) VALUES (?, ?)",
            (project_id, member),
        )

    connection.execute("UPDATE projects SET owner = NULL WHERE id = ?", (project_id,))
    if members:
        placeholders = ",".join("?" for _ in members)
        connection.execute(
            f"""
            UPDATE actions
            SET owner = NULL
            WHERE project_id = ?
              AND owner IS NOT NULL
              AND owner NOT IN ({placeholders})
            """,
            (project_id, *members),
        )
    else:
        connection.execute("UPDATE actions SET owner = NULL WHERE project_id = ?", (project_id,))

    return row_to_project(connection, require_project(connection, project_id))


def delete_project(connection: sqlite3.Connection, project_id: int) -> dict:
    project = require_project(connection, project_id)
    deleted_project = row_to_project(connection, project)
    connection.execute("DELETE FROM projects WHERE id = ?", (project_id,))
    return {"deletedProject": deleted_project}


def create_action(connection: sqlite3.Connection, payload: dict) -> dict:
    project_id = int(payload.get("projectId") or payload.get("project_id") or 0)
    require_project(connection, project_id)

    title = normalize_name(payload.get("title"))
    if not title:
        raise ApiError(HTTPStatus.BAD_REQUEST, "Action title is required.")

    status = str(payload.get("status") or "active").lower()
    if status not in ACTION_STATUSES:
        raise ApiError(HTTPStatus.BAD_REQUEST, "Action status must be active, blocked, or done.")

    completion_date = normalize_date(
        payload.get("completionDate") or payload.get("completion_date"),
        "Completion date",
    )
    meeting_date = normalize_date(
        payload.get("meetingDate") or payload.get("meeting_date"),
        "Meeting date",
    )
    cursor = connection.execute(
        """
        INSERT INTO actions (project_id, title, owner, status, source, completion_date, meeting_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            project_id,
            title,
            normalize_name(payload.get("owner")) or None,
            status,
            normalize_name(payload.get("source")) or "manual",
            completion_date,
            meeting_date,
            now_iso(),
        ),
    )
    row = connection.execute("SELECT * FROM actions WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return row_to_action(row)


def update_action(connection: sqlite3.Connection, action_id: int, payload: dict) -> dict:
    existing = connection.execute("SELECT * FROM actions WHERE id = ?", (action_id,)).fetchone()
    if not existing:
        raise ApiError(HTTPStatus.NOT_FOUND, "Action not found.")

    title = normalize_name(payload.get("title")) or existing["title"]
    owner = normalize_name(payload.get("owner")) if "owner" in payload else existing["owner"]
    status = str(payload.get("status") or existing["status"]).lower()
    if status not in ACTION_STATUSES:
        raise ApiError(HTTPStatus.BAD_REQUEST, "Action status must be active, blocked, or done.")
    completion_date = (
        normalize_date(payload.get("completionDate") or payload.get("completion_date"), "Completion date")
        if "completionDate" in payload or "completion_date" in payload
        else existing["completion_date"]
    )
    meeting_date = (
        normalize_date(payload.get("meetingDate") or payload.get("meeting_date"), "Meeting date")
        if "meetingDate" in payload or "meeting_date" in payload
        else existing["meeting_date"]
    )

    connection.execute(
        "UPDATE actions SET title = ?, owner = ?, status = ?, completion_date = ?, meeting_date = ? WHERE id = ?",
        (title, owner or None, status, completion_date, meeting_date, action_id),
    )
    row = connection.execute("SELECT * FROM actions WHERE id = ?", (action_id,)).fetchone()
    return row_to_action(row)


def delete_action(connection: sqlite3.Connection, action_id: int) -> dict:
    existing = connection.execute("SELECT * FROM actions WHERE id = ?", (action_id,)).fetchone()
    if not existing:
        raise ApiError(HTTPStatus.NOT_FOUND, "Action not found.")

    deleted_action = row_to_action(existing)
    connection.execute("DELETE FROM actions WHERE id = ?", (action_id,))
    return {"deletedAction": deleted_action}


def clean_duplicate_actions(connection: sqlite3.Connection, project_id: int) -> dict:
    require_project(connection, project_id)
    rows = connection.execute(
        "SELECT * FROM actions WHERE project_id = ? ORDER BY id",
        (project_id,),
    ).fetchall()

    seen: set[str] = set()
    duplicate_ids: list[int] = []
    for row in rows:
        key = "|".join([
            normalized_match_text(row["title"]),
            normalized_match_text(row["owner"]),
            normalized_match_text(row["status"]),
            normalized_match_text(row["completion_date"]),
            normalized_match_text(row["meeting_date"]),
        ])
        if key in seen:
            duplicate_ids.append(row["id"])
        else:
            seen.add(key)

    if duplicate_ids:
        placeholders = ",".join("?" for _ in duplicate_ids)
        connection.execute(f"DELETE FROM actions WHERE id IN ({placeholders})", duplicate_ids)

    return {
        "deletedCount": len(duplicate_ids),
        "actions": list_actions(connection, project_id),
    }


def create_update(connection: sqlite3.Connection, payload: dict) -> dict:
    project_id = int(payload.get("projectId") or payload.get("project_id") or 0)
    require_project(connection, project_id)

    text = normalize_name(payload.get("text"))
    if not text:
        raise ApiError(HTTPStatus.BAD_REQUEST, "Update text is required.")

    blocker = normalize_name(payload.get("blocker")) or None
    meeting_date = normalize_date(
        payload.get("meetingDate") or payload.get("meeting_date"),
        "Meeting date",
    )
    status = "Blocked" if blocker else "In Progress"
    cursor = connection.execute(
        """
        INSERT INTO updates (project_id, person, status, text, blocker, meeting_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            project_id,
            normalize_name(payload.get("person")) or None,
            status,
            text,
            blocker,
            meeting_date,
            now_iso(),
        ),
    )

    created_action = None
    if payload.get("createAction"):
        created_action = create_action(
            connection,
            {
                "projectId": project_id,
                "title": text,
                "owner": payload.get("person"),
                "status": "blocked" if blocker else "active",
                "source": "daily",
                "completionDate": payload.get("completionDate") or payload.get("completion_date"),
                "meetingDate": meeting_date,
            },
        )

    update = connection.execute("SELECT * FROM updates WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return {"update": row_to_update(update), "createdAction": created_action}


def update_project_note(connection: sqlite3.Connection, update_id: int, payload: dict) -> dict:
    existing = connection.execute("SELECT * FROM updates WHERE id = ?", (update_id,)).fetchone()
    if not existing:
        raise ApiError(HTTPStatus.NOT_FOUND, "Project note not found.")

    if "text" in payload:
        text = normalize_name(payload.get("text"))
        if not text:
            raise ApiError(HTTPStatus.BAD_REQUEST, "Update text is required.")
    else:
        text = existing["text"]

    meeting_date = (
        normalize_date(payload.get("meetingDate") or payload.get("meeting_date"), "Meeting date")
        if "meetingDate" in payload or "meeting_date" in payload
        else existing["meeting_date"]
    )

    connection.execute(
        "UPDATE updates SET text = ?, meeting_date = ? WHERE id = ?",
        (text, meeting_date, update_id),
    )
    updated = connection.execute("SELECT * FROM updates WHERE id = ?", (update_id,)).fetchone()
    return row_to_update(updated)


def delete_project_note(connection: sqlite3.Connection, update_id: int) -> dict:
    existing = connection.execute("SELECT * FROM updates WHERE id = ?", (update_id,)).fetchone()
    if not existing:
        raise ApiError(HTTPStatus.NOT_FOUND, "Project note not found.")

    deleted_update = row_to_update(existing)
    connection.execute("DELETE FROM updates WHERE id = ?", (update_id,))
    return {"deletedUpdate": deleted_update}


def normalize_bug_status(value: str) -> str:
    normalized = normalize_name(value)
    return normalized or "Open"


def normalize_bug_severity(value: str) -> str:
    normalized = normalize_name(value)
    severity_codes = {
        "1": "Critical",
        "2": "High",
        "3": "Medium",
        "4": "Low",
        "5": "Low",
    }
    return severity_codes.get(normalized, normalized or "Medium")


def normalize_bug_record(record: dict, project_id: int, index: int) -> dict:
    def readable(*keys: str, fallback: str) -> str:
        for key in keys:
            value = record.get(key)
            if value is not None and value != "":
                if isinstance(value, dict):
                    return str(value.get("name") or value.get("displayName") or value.get("label") or fallback)
                return str(value)
        return fallback

    bug = {
        "id": readable("Bug/Enh Number", "RPTNO", "rptno", "bugNumber", "bugId", "id", "key", "number", fallback=f"BUG-{project_id}-{index + 1}"),
        "title": readable("Subject", "title", "summary", "subject", "description", fallback="Untitled bug"),
        "assignee": readable("Assignee", "assignee", "owner", "assignedTo", "assigneeName", fallback="Unassigned"),
        "status": normalize_bug_status(readable("Status", "status", "state", fallback="Open")),
        "severity": normalize_bug_severity(readable("Severity", "severity", fallback="Medium")),
        "priority": readable("Priority", "priority", fallback=""),
        "projectId": project_id,
    }

    source_fields = record.get("fields") if isinstance(record.get("fields"), dict) else record
    fields = {}
    for key, value in source_fields.items():
        if key == "fields" or value is None or value == "":
            continue
        if isinstance(value, dict):
            display_value = value.get("name") or value.get("displayName") or value.get("label") or ""
        else:
            display_value = value
        normalized_value = normalize_name(display_value)
        if normalized_value:
            fields[normalize_name(key)] = normalized_value

    fields.setdefault("rptno", bug["id"])
    fields.setdefault("subject", bug["title"])
    fields.setdefault("status", bug["status"])
    fields.setdefault("severity", readable("Severity", "severity", fallback=bug["severity"]))
    fields.setdefault("assignee", bug["assignee"])
    bug["fields"] = fields
    return bug


def extract_bug_records(payload: object) -> list[dict]:
    if isinstance(payload, list):
        return payload
    if not isinstance(payload, dict):
        return []
    for key in ("bugs", "items", "results", "data"):
        value = payload.get(key)
        if isinstance(value, list):
            return value
    return []


BUG_RECORD_HINT_KEYS = {
    "Assignee",
    "Bug/Enh Number",
    "Priority",
    "Severity",
    "Status",
    "Subject",
    "assignee",
    "bugId",
    "bugNumber",
    "id",
    "key",
    "number",
    "priority",
    "severity",
    "status",
    "subject",
    "summary",
    "title",
}


def looks_like_bug_record(value: object) -> bool:
    return isinstance(value, dict) and any(key in value for key in BUG_RECORD_HINT_KEYS)


def first_bug_record_list(payload: object) -> list[dict]:
    records = extract_bug_records(payload)
    if records and all(looks_like_bug_record(record) for record in records):
        return records

    if isinstance(payload, dict):
        for value in payload.values():
            records = first_bug_record_list(value)
            if records:
                return records
    if isinstance(payload, list):
        if payload and all(looks_like_bug_record(item) for item in payload):
            return payload
        for item in payload:
            records = first_bug_record_list(item)
            if records:
                return records
    return []


def saved_search_id_from_url(raw_url: object) -> str | None:
    url = normalize_name(raw_url)
    parsed_url = urlparse(url)
    if not parsed_url.scheme or not parsed_url.netloc:
        return None

    query = parse_qs(parsed_url.query)
    candidate = (
        query.get("id", [None])[0]
        or query.get("report_id", [None])[0]
        or query.get("reportId", [None])[0]
        or query.get("savedSearchId", [None])[0]
    )
    if "WEBBUG_REPORTS.Saved_Search".lower() in parsed_url.path.lower() and candidate:
        return normalize_name(candidate)
    return None


BUG_UPLOAD_HEADER_ALIASES = {
    "bug": "id",
    "bugid": "id",
    "bugenhnumber": "bugNumber",
    "bugnumber": "bugNumber",
    "bugno": "bugNumber",
    "id": "id",
    "issue": "id",
    "issueid": "id",
    "issuekey": "key",
    "key": "key",
    "number": "number",
    "rptno": "id",
    "title": "title",
    "summary": "summary",
    "subject": "subject",
    "description": "description",
    "assignedto": "assignedTo",
    "assignee": "assignee",
    "assigneename": "assigneeName",
    "owner": "owner",
    "status": "status",
    "state": "state",
    "severity": "severity",
    "prio": "priority",
    "priority": "priority",
}


def normalize_upload_header(value: object) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").lower())


def table_rows_to_bug_records(rows: list[list[str]]) -> list[dict]:
    header_index = next((index for index, row in enumerate(rows) if any(cell.strip() for cell in row)), None)
    if header_index is None:
        return []

    headers = rows[header_index]
    records = []
    for row in rows[header_index + 1 :]:
        if not any(cell.strip() for cell in row):
            continue

        record = {}
        fields = {}
        for index, header in enumerate(headers):
            header_label = normalize_name(header)
            if not header_label:
                continue

            value = row[index].strip() if index < len(row) else ""
            if value:
                fields[header_label] = value

            header_key = BUG_UPLOAD_HEADER_ALIASES.get(normalize_upload_header(header))
            if not header_key:
                continue

            if value:
                record[header_key] = value

        if fields:
            record["fields"] = fields
            records.append(record)
    return records


def parse_csv_bug_upload(raw_file: bytes) -> list[dict]:
    try:
        text = raw_file.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise ApiError(HTTPStatus.BAD_REQUEST, "CSV bug upload must be UTF-8 encoded.") from error

    reader = csv.reader(io.StringIO(text))
    rows = [[str(cell or "").strip() for cell in row] for row in reader]
    return table_rows_to_bug_records(rows)


def xlsx_cell_column_index(cell_reference: str) -> int:
    letters = re.match(r"[A-Z]+", cell_reference.upper())
    if not letters:
        return 1

    column = 0
    for letter in letters.group(0):
        column = column * 26 + (ord(letter) - ord("A") + 1)
    return column


def xlsx_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []

    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    values = []
    for string_item in root.findall(".//{*}si"):
        values.append("".join(text.text or "" for text in string_item.findall(".//{*}t")))
    return values


def xlsx_cell_value(cell: ET.Element, shared_strings: list[str]) -> str:
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        return "".join(text.text or "" for text in cell.findall(".//{*}t")).strip()

    value = cell.find("{*}v")
    raw_value = value.text if value is not None and value.text is not None else ""
    if cell_type == "s" and raw_value:
        try:
            return shared_strings[int(raw_value)].strip()
        except (IndexError, ValueError):
            return ""
    return raw_value.strip()


def parse_xlsx_bug_upload(raw_file: bytes) -> list[dict]:
    try:
        with zipfile.ZipFile(io.BytesIO(raw_file)) as archive:
            worksheet_names = sorted(
                name for name in archive.namelist() if name.startswith("xl/worksheets/sheet") and name.endswith(".xml")
            )
            if not worksheet_names:
                raise ApiError(HTTPStatus.BAD_REQUEST, "Excel bug upload does not contain a worksheet.")

            shared_strings = xlsx_shared_strings(archive)
            worksheet = ET.fromstring(archive.read(worksheet_names[0]))
    except zipfile.BadZipFile as error:
        raise ApiError(HTTPStatus.BAD_REQUEST, "Excel bug upload must be a valid .xlsx file.") from error
    except ET.ParseError as error:
        raise ApiError(HTTPStatus.BAD_REQUEST, "Excel bug upload contains invalid worksheet XML.") from error

    rows = []
    for row in worksheet.findall(".//{*}sheetData/{*}row"):
        values: list[str] = []
        for cell in row.findall("{*}c"):
            column_index = xlsx_cell_column_index(cell.attrib.get("r", "")) - 1
            while len(values) <= column_index:
                values.append("")
            values[column_index] = xlsx_cell_value(cell, shared_strings)
        rows.append(values)

    return table_rows_to_bug_records(rows)


def parse_uploaded_bug_file(payload: dict) -> list[dict]:
    if not isinstance(payload, dict):
        raise ApiError(HTTPStatus.BAD_REQUEST, "Bug upload requires a JSON object.")

    filename = normalize_name(payload.get("filename"))
    content_base64 = normalize_name(payload.get("contentBase64") or payload.get("base64"))
    text_content = payload.get("content")

    if content_base64:
        encoded = content_base64.split(",", 1)[1] if content_base64.startswith("data:") else content_base64
        try:
            raw_file = base64.b64decode(encoded, validate=True)
        except (binascii.Error, ValueError) as error:
            raise ApiError(HTTPStatus.BAD_REQUEST, "Bug upload contentBase64 is not valid base64.") from error
    elif isinstance(text_content, str):
        raw_file = text_content.encode("utf-8")
    else:
        raise ApiError(HTTPStatus.BAD_REQUEST, "Bug upload requires contentBase64 or text content.")

    lowered_filename = filename.lower()
    if lowered_filename.endswith(".csv"):
        return parse_csv_bug_upload(raw_file)
    if lowered_filename.endswith(".xlsx"):
        return parse_xlsx_bug_upload(raw_file)

    raise ApiError(HTTPStatus.BAD_REQUEST, "Bug upload supports .xlsx and .csv files.")


def fetch_json_from_url(raw_url: object) -> object:
    url = normalize_name(raw_url)
    parsed_url = urlparse(url)
    if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
        raise ApiError(HTTPStatus.BAD_REQUEST, "Bug DB URL must be a valid http or https URL.")

    request = Request(url, headers={"Accept": "application/json", "User-Agent": "ProjectPulse/0.1"})
    try:
        with urlopen(request, timeout=15) as response:
            body = response.read()
    except HTTPError as error:
        raise ApiError(HTTPStatus.BAD_GATEWAY, f"Bug DB URL returned HTTP {error.code}.") from error
    except URLError as error:
        raise ApiError(HTTPStatus.BAD_GATEWAY, f"Could not fetch Bug DB URL: {error.reason}") from error

    try:
        return json.loads(body.decode("utf-8"))
    except json.JSONDecodeError as error:
        raise ApiError(HTTPStatus.BAD_GATEWAY, "Bug DB URL did not return valid JSON.") from error


def bugdb_configured_settings() -> dict:
    config = load_app_config()
    return {
        "access_token": setting_first(
            config,
            ("PROJECT_PULSE_BUGDB_ACCESS_TOKEN", "BUGDB_OAUTH_TOKEN"),
            ("bugdb.accessToken", "bugdb.access_token", "BUGDB_OAUTH_TOKEN"),
        ),
        "client_id": setting_first(
            config,
            ("PROJECT_PULSE_BUGDB_CLIENT_ID", "BUGDB_CLIENT_ID"),
            ("bugdb.clientId", "bugdb.client_id", "BUGDB_CLIENT_ID"),
        ),
        "client_secret": setting_first(
            config,
            ("PROJECT_PULSE_BUGDB_CLIENT_SECRET", "BUGDB_CLIENT_SECRET"),
            ("bugdb.clientSecret", "bugdb.client_secret", "BUGDB_CLIENT_SECRET"),
        ),
        "mcp_endpoint": setting_first(
            config,
            ("PROJECT_PULSE_BUGDB_MCP_ENDPOINT", "BUGDB_MCP_ENDPOINT"),
            ("bugdb.mcpEndpoint", "bugdb.mcp_endpoint", "BUGDB_MCP_ENDPOINT"),
            DEFAULT_BUGDB_MCP_ENDPOINT,
        ),
        "scope": setting_first(
            config,
            ("PROJECT_PULSE_BUGDB_OAUTH_SCOPE", "BUGDB_OAUTH_SCOPE"),
            ("bugdb.oauthScope", "bugdb.oauth_scope", "BUGDB_OAUTH_SCOPE"),
            DEFAULT_BUGDB_OAUTH_SCOPE,
        ),
        "token_url": setting_first(
            config,
            ("PROJECT_PULSE_BUGDB_TOKEN_URL", "BUGDB_TOKEN_URL"),
            ("bugdb.tokenUrl", "bugdb.token_url", "BUGDB_TOKEN_URL"),
        ),
        "ca_bundle_path": setting_first(
            config,
            ("PROJECT_PULSE_BUGDB_CA_BUNDLE_PATH", "BUGDB_CA_BUNDLE_PATH"),
            ("bugdb.caBundlePath", "bugdb.ca_bundle_path", "BUGDB_CA_BUNDLE_PATH"),
        ),
        "verify_ssl": setting_first(
            config,
            ("PROJECT_PULSE_BUGDB_VERIFY_SSL", "BUGDB_VERIFY_SSL"),
            ("bugdb.verifySsl", "bugdb.verify_ssl", "BUGDB_VERIFY_SSL"),
            "true",
        ),
    }


def require_bugdb_setting(settings: dict, key: str, label: str) -> str:
    value = normalize_name(settings.get(key))
    if not value:
        raise ApiError(
            HTTPStatus.SERVICE_UNAVAILABLE,
            f"BugDB MCP is not configured. Set bugdb.{label} in {config_path()} or the matching environment variable.",
        )
    return value


def setting_is_false(value: object) -> bool:
    return str(value or "").strip().lower() in {"0", "false", "no", "off"}


def bugdb_requests_verify(settings: dict) -> bool | str:
    if setting_is_false(settings.get("verify_ssl")):
        return False

    ca_bundle_path = normalize_name(settings.get("ca_bundle_path"))
    if ca_bundle_path:
        if not Path(ca_bundle_path).exists():
            raise ApiError(HTTPStatus.SERVICE_UNAVAILABLE, f"BugDB CA bundle could not be loaded: {ca_bundle_path}")
        return ca_bundle_path
    return True


def fetch_bugdb_access_token(settings: dict | None = None) -> str:
    settings = settings or bugdb_configured_settings()
    configured_token = normalize_name(settings.get("access_token"))
    if configured_token:
        return configured_token

    token_url = require_bugdb_setting(settings, "token_url", "tokenUrl")
    client_id = require_bugdb_setting(settings, "client_id", "clientId")
    client_secret = require_bugdb_setting(settings, "client_secret", "clientSecret")
    scope = normalize_name(settings.get("scope"))
    cache_key = "|".join([token_url, client_id, scope])
    now_timestamp = datetime.now(timezone.utc).timestamp()
    if (
        BUGDB_TOKEN_CACHE.get("cache_key") == cache_key
        and BUGDB_TOKEN_CACHE.get("access_token")
        and float(BUGDB_TOKEN_CACHE.get("expires_at") or 0) > now_timestamp + 60
    ):
        return str(BUGDB_TOKEN_CACHE["access_token"])

    form = {"grant_type": "client_credentials"}
    if scope:
        form["scope"] = scope
    try:
        response = requests.post(
            token_url,
            data=form,
            auth=(client_id, client_secret),
            headers={
                "Accept": "application/json",
                "User-Agent": "ProjectPulse/0.1",
            },
            allow_redirects=False,
            timeout=20,
            verify=bugdb_requests_verify(settings),
        )
        if response.status_code >= 400:
            raise ApiError(HTTPStatus.BAD_GATEWAY, f"BugDB OAuth token request returned HTTP {response.status_code}.")
        token_payload = response.json()
    except requests.exceptions.SSLError as error:
        raise ApiError(HTTPStatus.BAD_GATEWAY, f"Could not request BugDB OAuth token due to SSL verification: {error}") from error
    except requests.exceptions.RequestException as error:
        raise ApiError(HTTPStatus.BAD_GATEWAY, f"Could not request BugDB OAuth token: {error}") from error
    except ValueError as error:
        raise ApiError(HTTPStatus.BAD_GATEWAY, "BugDB OAuth token response was not valid JSON.") from error

    access_token = normalize_name(token_payload.get("access_token"))
    if not access_token:
        raise ApiError(HTTPStatus.BAD_GATEWAY, "BugDB OAuth token response did not include access_token.")
    expires_in = int(token_payload.get("expires_in") or token_payload.get("expires") or 3600)
    BUGDB_TOKEN_CACHE.update({
        "access_token": access_token,
        "cache_key": cache_key,
        "expires_at": now_timestamp + max(60, expires_in),
    })
    return access_token


def bugdb_mcp_tool_call(tool_name: str, arguments: dict, settings: dict | None = None) -> object:
    settings = settings or bugdb_configured_settings()
    endpoint = require_bugdb_setting(settings, "mcp_endpoint", "mcpEndpoint")
    access_token = fetch_bugdb_access_token(settings)
    rpc_payload = {
        "jsonrpc": "2.0",
        "id": f"project-pulse-{int(datetime.now(timezone.utc).timestamp())}",
        "method": "tools/call",
        "params": {
            "name": tool_name,
            "arguments": arguments,
        },
    }
    try:
        response = requests.post(
            endpoint,
            json=rpc_payload,
            headers={
                "Accept": "application/json, text/event-stream",
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
                "User-Agent": "ProjectPulse/0.1",
            },
            timeout=45,
            verify=bugdb_requests_verify(settings),
        )
        if response.status_code >= 400:
            raise ApiError(HTTPStatus.BAD_GATEWAY, f"BugDB MCP request returned HTTP {response.status_code}.")
        body = response.text
    except requests.exceptions.SSLError as error:
        raise ApiError(HTTPStatus.BAD_GATEWAY, f"Could not call BugDB MCP due to SSL verification: {error}") from error
    except requests.exceptions.RequestException as error:
        raise ApiError(HTTPStatus.BAD_GATEWAY, f"Could not call BugDB MCP: {error}") from error

    return parse_mcp_response_body(body)


def parse_mcp_response_body(body: str) -> object:
    text = body.strip()
    if not text:
        raise ApiError(HTTPStatus.BAD_GATEWAY, "BugDB MCP returned an empty response.")

    candidates = [text]
    data_lines = []
    for raw_line in text.splitlines():
        line = raw_line.lstrip()
        if not line.startswith("data:"):
            continue
        data_text = line.removeprefix("data:").strip()
        if data_text not in {"", "[DONE]"}:
            data_lines.append(data_text)
    candidates.extend(reversed(data_lines))

    payload = None
    decode_error: json.JSONDecodeError | None = None
    for candidate in candidates:
        try:
            payload = json.loads(candidate)
            break
        except json.JSONDecodeError as error:
            decode_error = error
    if payload is None:
        raise ApiError(HTTPStatus.BAD_GATEWAY, "BugDB MCP response was not valid JSON.") from decode_error
    if isinstance(payload, dict) and payload.get("error"):
        message = payload["error"].get("message") if isinstance(payload["error"], dict) else payload["error"]
        raise ApiError(HTTPStatus.BAD_GATEWAY, f"BugDB MCP error: {message}")
    return payload


def bug_records_from_mcp_response(payload: object) -> list[dict]:
    root = payload.get("result", payload) if isinstance(payload, dict) else payload
    if isinstance(root, dict):
        records = first_bug_record_list(root.get("structuredContent"))
        if records:
            return records

    records = first_bug_record_list(root)
    if records:
        return records

    if isinstance(root, dict):
        for content_item in root.get("content", []):
            if not isinstance(content_item, dict):
                continue
            text = content_item.get("text")
            if not isinstance(text, str) or not text.strip():
                continue
            try:
                parsed_text = json.loads(text)
            except json.JSONDecodeError:
                continue
            records = first_bug_record_list(parsed_text)
            if records:
                return records
    return []


def fetch_bugdb_saved_search_report(raw_url: object) -> object:
    report_id = saved_search_id_from_url(raw_url)
    if not report_id:
        raise ApiError(HTTPStatus.BAD_REQUEST, "BugDB saved search URL must include an id query parameter.")

    attempts = [
        {"report_id": report_id},
        {"reportId": report_id},
        {"id": report_id},
    ]
    last_error: ApiError | None = None
    for arguments in attempts:
        try:
            return bugdb_mcp_tool_call("get_bug_report", arguments)
        except ApiError as error:
            last_error = error
            if "BugDB MCP error" not in error.message:
                break
    if last_error:
        raise last_error
    raise ApiError(HTTPStatus.BAD_GATEWAY, "BugDB MCP report request failed.")


def bugdb_query_value(value: object) -> object:
    if isinstance(value, list):
        values = [normalize_name(item) for item in value if normalize_name(item)]
    else:
        values = [part for part in (normalize_name(part) for part in str(value or "").split(",")) if part]
    if not values:
        return None
    return values[0] if len(values) == 1 else values


def bugdb_generic_query_payload(query_input: object) -> dict:
    if not isinstance(query_input, dict):
        raise ApiError(HTTPStatus.BAD_REQUEST, "Bug query requires a JSON object.")

    query = {}
    for input_key, bugdb_key in BUGDB_QUERY_FIELDS.items():
        value = bugdb_query_value(query_input.get(input_key))
        if value is not None:
            query[bugdb_key] = value

    if not query:
        raise ApiError(HTTPStatus.BAD_REQUEST, "Add at least one Bug DB query field before refreshing.")

    return {
        "columns": BUGDB_QUERY_COLUMNS,
        "query": query,
    }


def fetch_bugdb_generic_query(query_input: object) -> object:
    arguments = {
        "size": 1000,
        "start": 0,
        "data": json.dumps(bugdb_generic_query_payload(query_input), separators=(",", ":")),
    }
    return bugdb_mcp_tool_call("get_bug_report", arguments)


def refresh_project_bugs(connection: sqlite3.Connection, project_id: int, payload: object) -> list[dict]:
    require_project(connection, project_id)
    records = extract_bug_records(payload)
    if not records:
        raise ApiError(HTTPStatus.BAD_REQUEST, "Bug refresh requires a JSON array or a bugs/items/results/data array.")

    refreshed_at = now_iso()
    bugs = [normalize_bug_record(record, project_id, index) for index, record in enumerate(records)]
    connection.execute("DELETE FROM bugs WHERE project_id = ?", (project_id,))
    save_project_bugs(connection, project_id, bugs, refreshed_at)
    return list_bugs(connection, project_id)


def save_project_bugs(connection: sqlite3.Connection, project_id: int, bugs: list[dict], refreshed_at: str) -> None:
    for bug in bugs:
        connection.execute(
            """
            INSERT INTO bugs (id, project_id, title, assignee, status, severity, priority, fields_json, refreshed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id, project_id) DO UPDATE SET
              title = excluded.title,
              assignee = excluded.assignee,
              status = excluded.status,
              severity = excluded.severity,
              priority = excluded.priority,
              fields_json = excluded.fields_json,
              refreshed_at = excluded.refreshed_at
            """,
            (
                bug["id"],
                project_id,
                bug["title"],
                bug["assignee"],
                bug["status"],
                bug["severity"],
                bug["priority"],
                json.dumps(bug["fields"]),
                refreshed_at,
            ),
        )


def fetch_and_refresh_project_bugs(connection: sqlite3.Connection, project_id: int, payload: dict) -> list[dict]:
    if isinstance(payload, dict) and isinstance(payload.get("query"), dict):
        bug_payload = fetch_bugdb_generic_query(payload["query"])
        records = bug_records_from_mcp_response(bug_payload)
        if not records:
            raise ApiError(HTTPStatus.BAD_GATEWAY, "BugDB generic query did not return usable bug rows.")
        return refresh_project_bugs(connection, project_id, {"bugs": records})

    raw_url = payload.get("url") or payload.get("bugDbUrl")
    if saved_search_id_from_url(raw_url):
        bug_payload = fetch_bugdb_saved_search_report(raw_url)
        records = bug_records_from_mcp_response(bug_payload)
        if not records:
            raise ApiError(HTTPStatus.BAD_GATEWAY, "BugDB MCP report did not return usable bug rows.")
        return refresh_project_bugs(connection, project_id, {"bugs": records})

    bug_payload = fetch_json_from_url(raw_url)
    return refresh_project_bugs(connection, project_id, bug_payload)


def upload_and_refresh_project_bugs(connection: sqlite3.Connection, project_id: int, payload: dict) -> list[dict]:
    require_project(connection, project_id)
    records = parse_uploaded_bug_file(payload)
    if not records:
        raise ApiError(HTTPStatus.BAD_REQUEST, "Uploaded bug file did not contain usable bug rows.")
    bugs = [normalize_bug_record(record, project_id, index) for index, record in enumerate(records)]
    save_project_bugs(connection, project_id, bugs, now_iso())
    return list_bugs(connection, project_id)


def clear_project_bugs(connection: sqlite3.Connection, project_id: int) -> dict:
    require_project(connection, project_id)
    cursor = connection.execute("DELETE FROM bugs WHERE project_id = ?", (project_id,))
    return {"deletedBugs": cursor.rowcount}


def normalized_bug_query_payload(payload: dict) -> tuple[str, dict]:
    name = normalize_name(payload.get("name"))
    query = payload.get("query")
    if not name:
        raise ApiError(HTTPStatus.BAD_REQUEST, "Bug query name is required.")
    if not isinstance(query, dict) or not any(normalize_name(value) for value in query.values()):
        raise ApiError(HTTPStatus.BAD_REQUEST, "Bug query must include at least one filter.")
    return name, {key: normalize_name(value) for key, value in query.items() if normalize_name(value)}


def create_bug_query(connection: sqlite3.Connection, project_id: int, payload: dict) -> dict:
    require_project(connection, project_id)
    name, query = normalized_bug_query_payload(payload)
    timestamp = now_iso()
    try:
        cursor = connection.execute(
            """
            INSERT INTO bug_queries (project_id, name, query_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (project_id, name, json.dumps(query), timestamp, timestamp),
        )
    except sqlite3.IntegrityError as error:
        raise ApiError(HTTPStatus.CONFLICT, "A Bug DB query with this name already exists for this project.") from error
    return row_to_bug_query(connection.execute("SELECT * FROM bug_queries WHERE id = ?", (cursor.lastrowid,)).fetchone())


def update_bug_query(connection: sqlite3.Connection, query_id: int, payload: dict) -> dict:
    current = connection.execute("SELECT * FROM bug_queries WHERE id = ?", (query_id,)).fetchone()
    if not current:
        raise ApiError(HTTPStatus.NOT_FOUND, "Bug DB query not found.")
    name, query = normalized_bug_query_payload({
        "name": payload.get("name", current["name"]),
        "query": payload.get("query", json.loads(current["query_json"] or "{}")),
    })
    try:
        connection.execute(
            """
            UPDATE bug_queries
            SET name = ?, query_json = ?, updated_at = ?
            WHERE id = ?
            """,
            (name, json.dumps(query), now_iso(), query_id),
        )
    except sqlite3.IntegrityError as error:
        raise ApiError(HTTPStatus.CONFLICT, "A Bug DB query with this name already exists for this project.") from error
    return row_to_bug_query(connection.execute("SELECT * FROM bug_queries WHERE id = ?", (query_id,)).fetchone())


def delete_bug_query(connection: sqlite3.Connection, query_id: int) -> dict:
    row = connection.execute("SELECT * FROM bug_queries WHERE id = ?", (query_id,)).fetchone()
    if not row:
        raise ApiError(HTTPStatus.NOT_FOUND, "Bug DB query not found.")
    deleted_query = row_to_bug_query(row)
    connection.execute("DELETE FROM bug_queries WHERE id = ?", (query_id,))
    return {"deletedBugQuery": deleted_query}


def env_first(*names: str) -> str | None:
    for name in names:
        value = os.environ.get(name)
        if value:
            return value
    return None


def config_path() -> Path:
    return Path(os.environ.get("PROJECT_PULSE_CONFIG_PATH") or DEFAULT_CONFIG_PATH)


def load_app_config() -> dict:
    path = config_path()
    if not path.exists():
        return {}
    try:
        with path.open(encoding="utf-8") as config_file:
            config = json.load(config_file)
    except json.JSONDecodeError as error:
        raise ApiError(HTTPStatus.SERVICE_UNAVAILABLE, f"Project Pulse config is not valid JSON: {path}") from error

    if not isinstance(config, dict):
        raise ApiError(HTTPStatus.SERVICE_UNAVAILABLE, f"Project Pulse config must be a JSON object: {path}")
    return config


def config_value(config: dict, *paths: str) -> str | None:
    for path in paths:
        current: object = config
        for part in path.split("."):
            if not isinstance(current, dict) or part not in current:
                current = None
                break
            current = current[part]
        if current not in (None, ""):
            return str(current)
    return None


def setting_first(config: dict, env_names: tuple[str, ...], config_paths: tuple[str, ...], default: str | None = None) -> str | None:
    return env_first(*env_names) or config_value(config, *config_paths) or default


def configured_ai_settings() -> dict[str, str]:
    config = load_app_config()
    compartment_id = setting_first(
        config,
        ("PROJECT_PULSE_OCI_COMPARTMENT_ID", "OCI_GENAI_COMPARTMENT_ID"),
        ("oci.compartmentId", "oci.compartment_id", "PROJECT_PULSE_OCI_COMPARTMENT_ID", "OCI_GENAI_COMPARTMENT_ID"),
    )
    service_endpoint = setting_first(
        config,
        ("PROJECT_PULSE_OCI_SERVICE_ENDPOINT", "OCI_GENAI_SERVICE_ENDPOINT"),
        ("oci.serviceEndpoint", "oci.service_endpoint", "PROJECT_PULSE_OCI_SERVICE_ENDPOINT", "OCI_GENAI_SERVICE_ENDPOINT"),
    )
    model_id = setting_first(
        config,
        ("PROJECT_PULSE_OCI_MODEL_ID", "OCI_GENAI_MODEL_ID"),
        ("oci.modelId", "oci.model_id", "PROJECT_PULSE_OCI_MODEL_ID", "OCI_GENAI_MODEL_ID"),
        DEFAULT_OCI_MODEL_ID,
    )
    auth_type = setting_first(
        config,
        ("PROJECT_PULSE_OCI_AUTH_TYPE", "OCI_GENAI_AUTH_TYPE"),
        ("oci.authType", "oci.auth_type", "PROJECT_PULSE_OCI_AUTH_TYPE", "OCI_GENAI_AUTH_TYPE"),
        "API_KEY",
    )
    auth_profile = setting_first(
        config,
        ("PROJECT_PULSE_OCI_AUTH_PROFILE", "OCI_GENAI_AUTH_PROFILE"),
        ("oci.authProfile", "oci.auth_profile", "PROJECT_PULSE_OCI_AUTH_PROFILE", "OCI_GENAI_AUTH_PROFILE"),
        "DEFAULT",
    )

    missing = []
    if not compartment_id:
        missing.append("OCI_GENAI_COMPARTMENT_ID")
    if not service_endpoint:
        missing.append("OCI_GENAI_SERVICE_ENDPOINT")
    if missing:
        raise ApiError(
            HTTPStatus.SERVICE_UNAVAILABLE,
            f"OCI AI extraction is not configured. Set {', '.join(missing)} in {config_path()} or as environment variables.",
        )

    return {
        "auth_profile": auth_profile,
        "auth_type": auth_type,
        "compartment_id": compartment_id,
        "model_id": model_id,
        "service_endpoint": service_endpoint,
    }


def load_chat_oci_gen_ai() -> type:
    try:
        from langchain_oci import ChatOCIGenAI
    except ImportError:
        try:
            from langchain_community.chat_models import ChatOCIGenAI
        except ImportError as error:
            raise ApiError(
                HTTPStatus.SERVICE_UNAVAILABLE,
                "OCI AI extraction dependencies are not installed. Run pip install -r backend/requirements.txt.",
            ) from error
    return ChatOCIGenAI


@lru_cache(maxsize=4)
def oci_chat_model(
    model_id: str,
    service_endpoint: str,
    compartment_id: str,
    auth_type: str,
    auth_profile: str,
) -> object:
    ChatOCIGenAI = load_chat_oci_gen_ai()
    kwargs = {
        "auth_type": auth_type,
        "compartment_id": compartment_id,
        "model_id": model_id,
        "service_endpoint": service_endpoint,
    }
    if auth_type in {"API_KEY", "SECURITY_TOKEN"}:
        kwargs["auth_profile"] = auth_profile
    return ChatOCIGenAI(**kwargs)


def parse_ai_json(content: str) -> dict:
    cleaned = content.strip()
    decoder = json.JSONDecoder()
    candidates = [cleaned]

    if "```" in cleaned:
        fenced_blocks = cleaned.split("```")
        for block in fenced_blocks[1::2]:
            block = block.strip()
            if block.lower().startswith("json"):
                block = block[4:].strip()
            candidates.append(block)

    for candidate in candidates:
        if not candidate:
            continue
        try:
            payload = json.loads(candidate)
            break
        except json.JSONDecodeError:
            payload = None
    else:
        payload = None
        for index, character in enumerate(cleaned):
            if character != "{":
                continue
            try:
                payload, _ = decoder.raw_decode(cleaned[index:])
                break
            except json.JSONDecodeError:
                continue

    if payload is None:
        raise ApiError(
            HTTPStatus.BAD_GATEWAY,
            "AI response was not valid JSON. Try again; the model returned text instead of the required JSON object.",
        )

    if not isinstance(payload, dict):
        raise ApiError(HTTPStatus.BAD_GATEWAY, "AI response must be a JSON object.")
    return payload


def response_content_text(content: object) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, dict):
                text = part.get("text") or part.get("content")
                if text:
                    parts.append(str(text))
            elif part:
                parts.append(str(part))
        return "\n".join(parts)
    return str(content)


def normalize_ai_payload(payload: object) -> dict:
    if hasattr(payload, "model_dump"):
        payload = payload.model_dump()
    if not isinstance(payload, dict):
        raise ApiError(HTTPStatus.BAD_GATEWAY, "AI response must be a JSON object.")
    points = payload.get("points")
    if points is None:
        points = payload.get("importantPoints") or payload.get("important_points") or payload.get("summaryPoints")
    actions = payload.get("actions")
    if actions is None:
        actions = payload.get("actionItems") or payload.get("action_items") or payload.get("tasks") or []
    normalized = dict(payload)
    normalized["points"] = points if isinstance(points, list) else []
    normalized["actions"] = actions if isinstance(actions, list) else []
    return normalized


def summary_date_label(value: object) -> str:
    normalized = normalize_name(value)
    if not normalized:
        return "Undated"
    try:
        parsed = date.fromisoformat(normalized[:10])
    except ValueError:
        return normalized
    return parsed.strftime("%b %d, %Y").replace(" 0", " ")


def compact_summary_text(value: object, limit: int = 170) -> str:
    text = normalize_name(value)
    if len(text) <= limit:
        return text
    clipped = text[:limit].rsplit(" ", 1)[0].strip()
    return f"{clipped}..."


def clean_key_point(value: object) -> str:
    text = normalize_name(value)
    text = re.sub(
        r"^(?:meeting\s+on\s+)?(?:[A-Z][a-z]{2,9}\s+\d{1,2},\s+\d{4}|\d{4}-\d{2}-\d{2})\s*:\s*",
        "",
        text,
        flags=re.IGNORECASE,
    )
    return text


def plural_label(count: int, singular: str, plural: str | None = None) -> str:
    return f"{count} {singular if count == 1 else plural or singular + 's'}"


def dedupe_summary_items(items: list[str]) -> list[str]:
    deduped = []
    seen = set()
    for item in items:
        key = normalized_match_text(item)
        if not key or key in seen:
            continue
        deduped.append(item)
        seen.add(key)
    return deduped


def formatted_action_summary(action: dict, status_label: str | None = None) -> str:
    title = normalize_name(action.get("title"))
    if not title:
        return ""
    owner = normalize_name(action.get("owner")) or "No owner"
    status = status_label or normalize_name(action.get("status")) or "active"
    due = f", due {summary_date_label(action.get('completionDate'))}" if action.get("completionDate") else ""
    return f"{title} ({owner}, {status}{due})."


def action_dedupe_key(title: object, owner: object) -> str:
    return "|".join([normalized_match_text(title), normalized_match_text(owner)])


def note_decisions(updates: list[dict]) -> list[str]:
    decision_pattern = re.compile(
        r"\b(decided|decision|agreed|approved|confirmed|chose|chosen|selected|finalized|committed|go with)\b",
        flags=re.IGNORECASE,
    )
    decisions = []
    for update in reversed(updates):
        text = compact_summary_text(update.get("text"))
        if text and decision_pattern.search(text):
            decisions.append(text)
    return dedupe_summary_items(decisions)


def completed_from_notes(updates: list[dict]) -> list[str]:
    completed_pattern = re.compile(
        r"\b(completed|done|finished|resolved|closed|shipped|released|delivered|launched)\b",
        flags=re.IGNORECASE,
    )
    completed = []
    for update in reversed(updates):
        text = compact_summary_text(update.get("text"))
        if text and completed_pattern.search(text):
            completed.append(text)
    return dedupe_summary_items(completed)


def blocked_from_notes(updates: list[dict]) -> list[str]:
    blocked_pattern = re.compile(
        r"\b(blocked|blocker|blocking|risk|issue|stuck|waiting|dependency|gap|inconsistencies)\b",
        flags=re.IGNORECASE,
    )
    blocked = []
    for update in reversed(updates):
        text = compact_summary_text(update.get("text"))
        blocker = compact_summary_text(update.get("blocker"))
        if blocker:
            blocked.append(blocker)
        elif text and blocked_pattern.search(text):
            blocked.append(text)
    return dedupe_summary_items(blocked)


def local_project_summary(project: dict, updates: list[dict], actions: list[dict]) -> dict:
    project_name = normalize_name(project.get("name")) or "Project"
    recent_updates = list(reversed(updates))[:5]
    active_actions = [action for action in actions if action.get("status") == "active"]
    blocked_actions = [action for action in actions if action.get("status") == "blocked"]
    done_actions = [action for action in actions if action.get("status") == "done"]

    today = date.today()
    pending = []
    for action in active_actions:
        status = "active"
        due_date = action.get("completionDate")
        try:
            if due_date and date.fromisoformat(str(due_date)) < today:
                status = "overdue"
        except ValueError:
            pass
        item = formatted_action_summary(action, status)
        if item:
            pending.append(item)
    pending = dedupe_summary_items(pending)

    blocked = dedupe_summary_items([
        formatted_action_summary(action, "blocked")
        for action in blocked_actions
        if formatted_action_summary(action, "blocked")
    ] + blocked_from_notes(updates))

    done = dedupe_summary_items([
        formatted_action_summary(action, "done")
        for action in done_actions
        if formatted_action_summary(action, "done")
    ] + completed_from_notes(updates))
    decisions = note_decisions(updates)

    overview = (
        f"{project_name} has {plural_label(len(updates), 'saved meeting note')} and "
        f"{plural_label(len(actions), 'action item')}: "
        f"{len(active_actions)} pending, {len(blocked_actions)} blocked, and {len(done_actions)} done."
    )
    if recent_updates:
        overview = f"{overview} Latest activity: {compact_summary_text(recent_updates[0].get('text'), 120)}"

    return {
        "headline": f"{project_name} summary",
        "overview": overview,
        "pending": pending[:5] or ["No pending action items were found."],
        "blocked": blocked[:5] or ["No blocked work is captured."],
        "done": done[:5] or ["No action items are marked done."],
        "keyDecisions": decisions[:5] or ["No key decisions captured yet."],
    }


def summary_overview_is_sparse(value: object) -> bool:
    text = normalize_name(value)
    normalized = normalized_match_text(text)
    generic_phrases = {
        "the team",
        "the team discussed progress",
        "the team discussed project progress",
        "progress was discussed",
        "project progress was discussed",
    }
    return (
        not text
        or len(text) < 40
        or normalized in generic_phrases
        or ("discussed progress" in normalized and len(text) < 120)
    )


def normalize_summary_payload(payload: object, fallback: dict | None = None) -> dict:
    normalized = normalize_ai_payload(payload)

    def string_list(*keys: str) -> list[str]:
        for key in keys:
            value = normalized.get(key)
            if isinstance(value, list):
                return [normalize_name(item) for item in value if normalize_name(item)]
        return []

    summary = {
        "headline": normalize_name(normalized.get("headline")) or "Project summary",
        "overview": normalize_name(normalized.get("overview")) or "No summary returned.",
        "pending": dedupe_summary_items(
            string_list("pending", "pendingItems", "pending_items", "nextSteps", "next_steps")
        ),
        "blocked": dedupe_summary_items(string_list("blocked", "blockedItems", "blocked_items", "blockers")),
        "done": dedupe_summary_items(string_list("done", "doneItems", "done_items")),
        "keyDecisions": dedupe_summary_items(
            string_list("keyDecisions", "key_decisions", "decisions")
        ),
    }
    if fallback:
        if summary["headline"] == "Project summary":
            summary["headline"] = fallback["headline"]
        if summary_overview_is_sparse(summary["overview"]):
            summary["overview"] = fallback["overview"]
        for key in ("pending", "blocked", "done", "keyDecisions"):
            if not summary[key]:
                summary[key] = fallback[key]
    return summary


def extract_actions_with_ai(notes: str, project: dict) -> dict:
    settings = configured_ai_settings()
    allowed_owners = project.get("members") or []
    example_response = {
        "points": [
            "Semantic search, schema validation, memory layer, and data flow updates were discussed."
        ],
        "actions": [
            {
                "title": "Integrate the current primitive supervisor agent with actual agents and test the flow",
                "owner": "Sreenath" if "Sreenath" in allowed_owners else None,
                "status": "active",
                "completionDate": None,
            },
            {
                "title": "Plan to demo the updated flow in the next call",
                "owner": "Sreenath" if "Sreenath" in allowed_owners else None,
                "status": "active",
                "completionDate": None,
            },
            {
                "title": "Continue investigating APIs to retrieve complete conversation history for gap analysis",
                "owner": "Kriti" if "Kriti" in allowed_owners else None,
                "status": "active",
                "completionDate": None,
            },
        ],
    }
    system_prompt = (
        "You are Project Pulse's meeting action extractor. "
        "Your job is to extract every concrete follow-up action from meeting notes and return valid JSON only. "
        "Return exactly one JSON object with two keys: points and actions. "
        "Do not include markdown, code fences, comments, labels, explanations, or text outside the JSON object. "
        "The first character of your response must be { and the last character must be }. "
        "points must be a short array of important factual meeting points, not generic text. "
        "actions must be an array of action objects with exactly these fields: title, owner, status, completionDate. "
        "title must be a clear imperative task without the owner name prefix. "
        "status must be one of active, blocked, or done; use active unless the note explicitly says blocked or done. "
        "owner must be null or exactly one value from the provided members array. "
        "Never invent owners. If a person is mentioned but is not in members, owner must be null. "
        "Treat sections named Next steps, Next action, Action items, Follow-ups, To do, or Todo as the highest priority source. "
        "Parse every clear line shaped like 'Owner: task' as one or more action items, even when the heading says Next action. "
        "Also parse owner-heading blocks: when a standalone line contains a person's name, treat it as the owner "
        "for each concrete task line that follows until the next standalone person name or section heading. "
        "If that heading name is not in members, keep extracting the tasks but set owner to null. "
        "When one owner line contains semicolon-separated follow-ups, split each meaningful follow-up into its own action. "
        "Example: 'Sreenath: Integrate agents; plan demo' becomes two actions owned by Sreenath if Sreenath is in members. "
        "Example: 'Kriti\\nAssess feasibility\\nReport effort' becomes two actions owned by Kriti if Kriti is in members. "
        "Keep compound work together when it is one task joined by 'and', but split separate semicolon follow-ups. "
        "Use completionDate only when the note gives an explicit YYYY-MM-DD date; otherwise use null. "
        "Do not return vague actions such as 'Work', 'Action items', 'Meeting extraction', or 'Follow up' when the notes contain specific tasks."
    )
    user_prompt = {
        "project": project["name"],
        "members": allowed_owners,
        "notes": notes,
        "extractionRules": [
            "First inspect the Next steps or Action items section if present.",
            "Treat Next Action or Next Actions headings as action sections too.",
            "Extract all owner-colon lines from that section.",
            "If a standalone owner-colon line appears outside a known section and the body starts with an action verb, extract it.",
            "Extract owner-heading blocks where the owner appears alone on one line and task lines follow below.",
            "Split semicolon-separated follow-ups into separate actions.",
            "Treat each task line below an owner heading as a separate action unless it is clearly a continuation line.",
            "Use only project members as owner values; otherwise owner is null.",
            "Return all concrete tasks, not just one summary action.",
        ],
        "schema": {
            "points": ["string"],
            "actions": [
                {
                    "completionDate": "YYYY-MM-DD|null",
                    "owner": "string|null",
                    "status": "active|blocked|done",
                    "title": "string",
                }
            ],
        },
        "exampleOutputShape": example_response,
    }

    model = oci_chat_model(**settings)
    messages = [
        ("system", system_prompt),
        ("human", json.dumps(user_prompt)),
    ]

    try:
        structured_model = model.with_structured_output(AI_EXTRACTION_SCHEMA, method="json_mode")
        return normalize_ai_payload(structured_model.invoke(messages))
    except ApiError:
        raise
    except Exception:
        pass

    try:
        response = model.invoke(messages)
    except ApiError:
        raise
    except Exception as error:
        raise ApiError(HTTPStatus.BAD_GATEWAY, f"OCI AI extraction request failed: {error}") from error

    return parse_ai_json(response_content_text(getattr(response, "content", response)))


def summarize_project_with_ai(project: dict, updates: list[dict], actions: list[dict]) -> dict:
    settings = configured_ai_settings()
    fallback_summary = local_project_summary(project, updates, actions)
    system_prompt = (
        "You summarize project status from saved meeting notes and action items. "
        "Return only one JSON object with keys headline, overview, pending, blocked, done, and keyDecisions. "
        "Do not include markdown, code fences, explanations, or any text outside the JSON object. "
        "The first character must be { and the last character must be }. "
        "Do not summarize notes date by date. "
        "Keep overview to one useful paragraph about overall project status. "
        "pending, blocked, done, and keyDecisions must each be short arrays of strings with at least one item. "
        "pending is open active or overdue work that is not blocked and not done. "
        "blocked is blocked work, risks, blockers, dependencies, or issues preventing progress. "
        "done is completed work and action items explicitly marked done. "
        "keyDecisions is decisions, approvals, agreements, or choices captured in notes. "
        "Mention concrete saved note details, action titles, owners, due dates, or blocked items when present. "
        "Never return vague phrases such as 'the team discussed progress' without specifics. "
        "Use only the provided project notes and action items; do not invent facts."
    )
    user_prompt = {
        "project": {
            "name": project["name"],
            "classification": project["classification"],
            "members": project.get("members") or [],
        },
        "meetingNotes": [
            {
                "createdAt": update.get("createdAt"),
                "meetingDate": update.get("meetingDate"),
                "text": update.get("text"),
            }
            for update in updates
        ],
        "actions": [
            {
                "completionDate": action.get("completionDate"),
                "owner": action.get("owner"),
                "status": action.get("status"),
                "title": action.get("title"),
            }
            for action in actions
        ],
        "schema": {
            "headline": "string",
            "overview": "string",
            "pending": ["string"],
            "blocked": ["string"],
            "done": ["string"],
            "keyDecisions": ["string"],
        },
    }

    model = oci_chat_model(**settings)
    messages = [
        ("system", system_prompt),
        ("human", json.dumps(user_prompt)),
    ]

    try:
        structured_model = model.with_structured_output(AI_PROJECT_SUMMARY_SCHEMA, method="json_mode")
        return normalize_summary_payload(structured_model.invoke(messages), fallback_summary)
    except ApiError:
        raise
    except Exception:
        pass

    try:
        response = model.invoke(messages)
    except ApiError:
        raise
    except Exception as error:
        raise ApiError(HTTPStatus.BAD_GATEWAY, f"OCI AI summary request failed: {error}") from error

    return normalize_summary_payload(
        parse_ai_json(response_content_text(getattr(response, "content", response))),
        fallback_summary,
    )


def action_payloads_from_ai(
    connection: sqlite3.Connection,
    project_id: int,
    source: str,
    ai_payload: dict,
    notes: str,
    members: list[str],
    meeting_date: str | None = None,
) -> dict:
    raw_actions = ai_payload.get("actions", [])
    if not isinstance(raw_actions, list):
        raise ApiError(HTTPStatus.BAD_GATEWAY, "AI actions must be an array.")

    actions = []
    skipped_duplicates = 0
    seen_actions = {
        action_dedupe_key(row["title"], row["owner"])
        for row in connection.execute("SELECT title, owner FROM actions WHERE project_id = ?", (project_id,))
    }
    for action in raw_actions:
        if not isinstance(action, dict):
            continue
        title = repaired_action_title(action.get("title"), notes)
        if not title:
            continue
        status = str(action.get("status") or "active").lower()
        if status not in ACTION_STATUSES:
            status = "active"
        if action.get("_ownerLocked"):
            owner = match_project_member(action.get("owner"), members)
        else:
            owner = infer_action_owner(action.get("owner"), title, notes, members)
        dedupe_key = action_dedupe_key(title, owner)
        if dedupe_key in seen_actions:
            skipped_duplicates += 1
            continue
        seen_actions.add(dedupe_key)
        actions.append({
            "completionDate": action.get("completionDate") or action.get("completion_date") or action.get("dueDate"),
            "meetingDate": meeting_date,
            "owner": owner,
            "projectId": project_id,
            "source": source,
            "status": status,
            "title": title,
        })

    raw_points = ai_payload.get("points", [])
    points = [str(point) for point in raw_points if str(point).strip()] if isinstance(raw_points, list) else []
    if skipped_duplicates:
        points.append("Matching action items already exist and were not duplicated.")
    return {"actions": actions, "points": points, "skippedDuplicates": skipped_duplicates}


def create_actions_from_ai(
    connection: sqlite3.Connection,
    project_id: int,
    source: str,
    ai_payload: dict,
    notes: str,
    members: list[str],
    meeting_date: str | None = None,
) -> dict:
    prepared = action_payloads_from_ai(connection, project_id, source, ai_payload, notes, members, meeting_date)
    created_actions = [create_action(connection, action) for action in prepared["actions"]]
    return {
        "actions": created_actions,
        "points": prepared["points"],
        "skippedDuplicates": prepared["skippedDuplicates"],
    }


def preview_actions_from_ai(
    connection: sqlite3.Connection,
    project_id: int,
    source: str,
    ai_payload: dict,
    notes: str,
    members: list[str],
    meeting_date: str | None = None,
) -> dict:
    prepared = action_payloads_from_ai(connection, project_id, source, ai_payload, notes, members, meeting_date)
    return {**prepared, "previewOnly": True}


def create_actions_bulk(connection: sqlite3.Connection, payload: dict) -> dict:
    raw_actions = payload.get("actions")
    if not isinstance(raw_actions, list):
        raise ApiError(HTTPStatus.BAD_REQUEST, "Actions must be an array.")

    created_actions = []
    for action in raw_actions:
        if not isinstance(action, dict):
            continue
        created_actions.append(create_action(connection, action))

    if not created_actions:
        raise ApiError(HTTPStatus.BAD_REQUEST, "At least one valid action is required.")
    return {"actions": created_actions}


def delete_actions_bulk(connection: sqlite3.Connection, payload: dict) -> dict:
    raw_ids = payload.get("ids") or payload.get("actionIds") or payload.get("action_ids")
    if not isinstance(raw_ids, list):
        raise ApiError(HTTPStatus.BAD_REQUEST, "Action ids must be an array.")

    action_ids = []
    seen_ids: set[int] = set()
    for raw_id in raw_ids:
        action_id = int(raw_id)
        if action_id > 0 and action_id not in seen_ids:
            action_ids.append(action_id)
            seen_ids.add(action_id)
    if not action_ids:
        raise ApiError(HTTPStatus.BAD_REQUEST, "At least one action id is required.")

    placeholders = ",".join("?" for _ in action_ids)
    rows = connection.execute(f"SELECT * FROM actions WHERE id IN ({placeholders})", action_ids).fetchall()
    deleted_actions = [row_to_action(row) for row in rows]
    if deleted_actions:
        connection.execute(f"DELETE FROM actions WHERE id IN ({placeholders})", action_ids)
    return {"deletedActions": deleted_actions}


def missing_action_payload(actions: list[dict], existing_actions: list[dict]) -> list[dict]:
    existing_titles = {normalized_match_text(action.get("title")) for action in existing_actions}
    missing: list[dict] = []
    for action in actions:
        title_key = normalized_match_text(action.get("title"))
        if title_key and title_key not in existing_titles:
            missing.append(action)
            existing_titles.add(title_key)
    return missing


def merge_extraction_results(base: dict, supplement: dict) -> dict:
    points: list[str] = []
    seen_points: set[str] = set()
    for point in [*base.get("points", []), *supplement.get("points", [])]:
        point_text = normalize_name(point)
        point_key = normalized_match_text(point_text)
        if point_text and point_key not in seen_points:
            points.append(point_text)
            seen_points.add(point_key)
    return {
        "actions": [*base.get("actions", []), *supplement.get("actions", [])],
        "points": points,
    }


def extract_project_actions(connection: sqlite3.Connection, project_id: int, payload: dict) -> dict:
    project_row = require_project(connection, project_id)
    project = row_to_project(connection, project_row)
    notes = str(payload.get("notes") or "").strip()
    source = normalize_name(payload.get("source")) or "meeting"
    meeting_date = normalize_date(
        payload.get("meetingDate") or payload.get("meeting_date"),
        "Meeting date",
    )
    preview_only = bool(payload.get("previewOnly") or payload.get("preview_only"))
    if not notes:
        raise ApiError(HTTPStatus.BAD_REQUEST, "Meeting notes are required for AI extraction.")

    try:
        ai_payload = extract_actions_with_ai(notes, project)
    except ApiError as error:
        if error.status != HTTPStatus.BAD_GATEWAY or "not valid JSON" not in error.message:
            raise
        ai_payload = {"actions": [], "points": []}

    fallback_payload = fallback_actions_from_notes(notes, project["members"])
    action_handler = preview_actions_from_ai if preview_only else create_actions_from_ai

    if fallback_payload.get("strategy") == "next_steps" and fallback_payload["actions"]:
        extracted = action_handler(
            connection,
            project_id,
            source,
            fallback_payload,
            notes,
            project["members"],
            meeting_date,
        )
        if extracted["actions"] or extracted.get("skippedDuplicates"):
            return extracted

    extracted = action_handler(connection, project_id, source, ai_payload, notes, project["members"], meeting_date)
    if not extracted["actions"] and fallback_payload["actions"]:
        extracted = action_handler(
            connection,
            project_id,
            source,
            fallback_payload,
            notes,
            project["members"],
            meeting_date,
        )
    elif has_next_steps_section(notes) and fallback_payload["actions"]:
        supplement_payload = {
            "actions": missing_action_payload(fallback_payload["actions"], extracted["actions"]),
            "points": fallback_payload.get("points", []),
        }
        if supplement_payload["actions"]:
            extracted = merge_extraction_results(
                extracted,
                action_handler(
                    connection,
                    project_id,
                    source,
                    supplement_payload,
                    notes,
                    project["members"],
                    meeting_date,
                ),
            )
    if not extracted["actions"]:
        extracted = action_handler(
            connection,
            project_id,
            source,
            fallback_payload,
            notes,
            project["members"],
            meeting_date,
        )
    if not extracted["actions"] and extracted.get("skippedDuplicates"):
        return extracted
    if not extracted["actions"]:
        raise ApiError(HTTPStatus.BAD_GATEWAY, "AI did not return any usable action items.")
    return extracted


def summarize_project_discussions(connection: sqlite3.Connection, project_id: int) -> dict:
    project = row_to_project(connection, require_project(connection, project_id))
    updates = list_updates(connection, project_id)
    if not updates:
        raise ApiError(HTTPStatus.BAD_REQUEST, "No project notes are available to summarize.")
    return {"summary": summarize_project_with_ai(project, updates, list_actions(connection, project_id))}


def dashboard_payload(connection: sqlite3.Connection, project_id: int) -> dict:
    project = row_to_project(connection, require_project(connection, project_id))
    actions = list_actions(connection, project_id)
    metrics = [
        {"label": "Active", "value": sum(action["status"] == "active" for action in actions), "tone": "active"},
        {"label": "Blocked", "value": sum(action["status"] == "blocked" for action in actions), "tone": "blocked"},
        {"label": "Done", "value": sum(action["status"] == "done" for action in actions), "tone": "done"},
    ]
    return {
        "project": project,
        "metrics": metrics,
        "actions": actions,
        "updates": list_updates(connection, project_id),
        "bugs": list_bugs(connection, project_id),
        "bugQueries": list_bug_queries(connection, project_id),
    }


class ProjectPulseHandler(BaseHTTPRequestHandler):
    server_version = "ProjectPulseAPI/0.1"

    def do_OPTIONS(self) -> None:
        self.send_json({}, HTTPStatus.NO_CONTENT)

    def do_GET(self) -> None:
        self.handle_request("GET")

    def do_POST(self) -> None:
        self.handle_request("POST")

    def do_PATCH(self) -> None:
        self.handle_request("PATCH")

    def do_DELETE(self) -> None:
        self.handle_request("DELETE")

    def handle_request(self, method: str) -> None:
        try:
            parsed = urlparse(self.path)
            parts = [part for part in parsed.path.split("/") if part]
            if not parts or parts[0] != "api":
                raise ApiError(HTTPStatus.NOT_FOUND, "Route not found.")

            payload = self.route(method, parts[1:])
            status = payload.pop("_status", HTTPStatus.OK) if isinstance(payload, dict) else HTTPStatus.OK
            self.send_json(payload, status)
        except ApiError as error:
            self.send_json({"error": error.message}, error.status)
        except json.JSONDecodeError:
            self.send_json({"error": "Request body must be valid JSON."}, HTTPStatus.BAD_REQUEST)
        except ValueError:
            self.send_json({"error": "Invalid numeric identifier."}, HTTPStatus.BAD_REQUEST)
        except Exception as error:  # pragma: no cover - keeps local API failures JSON-shaped.
            self.send_json({"error": str(error)}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def route(self, method: str, parts: list[str]) -> dict:
        with db_connect(self.server.db_path) as connection:  # type: ignore[attr-defined]
            if method == "GET" and parts == ["health"]:
                return {"status": "ok", "service": "project-pulse-api"}

            if method == "GET" and parts == ["bootstrap"]:
                return {
                    "projects": list_projects(connection),
                    "actions": list_actions(connection),
                    "updates": list_updates(connection),
                    "bugs": list_bugs(connection),
                    "bugQueries": list_bug_queries(connection),
                }

            if method == "GET" and parts == ["projects"]:
                return {"projects": list_projects(connection)}

            if method == "POST" and parts == ["projects"]:
                return {"project": create_project(connection, self.read_json()), "_status": HTTPStatus.CREATED}

            if len(parts) == 2 and parts[0] == "projects" and parts[1].isdigit() and method == "DELETE":
                return {**delete_project(connection, int(parts[1])), "_status": HTTPStatus.OK}

            if len(parts) == 3 and parts[0] == "projects" and parts[2] == "dashboard" and method == "GET":
                return dashboard_payload(connection, int(parts[1]))

            if len(parts) == 3 and parts[0] == "projects" and parts[2] == "members" and method == "POST":
                return {"project": add_project_member(connection, int(parts[1]), self.read_json())}

            if len(parts) == 3 and parts[0] == "projects" and parts[2] == "members" and method == "PATCH":
                return {"project": replace_project_members(connection, int(parts[1]), self.read_json())}

            if len(parts) == 4 and parts[0] == "projects" and parts[2:] == ["bugs", "refresh"] and method == "POST":
                return {"bugs": refresh_project_bugs(connection, int(parts[1]), self.read_json())}

            if len(parts) == 4 and parts[0] == "projects" and parts[2:] == ["bugs", "fetch"] and method == "POST":
                return {"bugs": fetch_and_refresh_project_bugs(connection, int(parts[1]), self.read_json())}

            if len(parts) == 4 and parts[0] == "projects" and parts[2:] == ["bugs", "upload"] and method == "POST":
                return {"bugs": upload_and_refresh_project_bugs(connection, int(parts[1]), self.read_json())}

            if len(parts) == 3 and parts[0] == "projects" and parts[2] == "bugs" and method == "DELETE":
                return clear_project_bugs(connection, int(parts[1]))

            if len(parts) == 3 and parts[0] == "projects" and parts[2] == "bug-queries" and method == "GET":
                return {"bugQueries": list_bug_queries(connection, int(parts[1]))}

            if len(parts) == 3 and parts[0] == "projects" and parts[2] == "bug-queries" and method == "POST":
                return {"bugQuery": create_bug_query(connection, int(parts[1]), self.read_json()), "_status": HTTPStatus.CREATED}

            if len(parts) == 3 and parts[0] == "projects" and parts[2] == "summary" and method == "POST":
                return summarize_project_discussions(connection, int(parts[1]))

            if len(parts) == 3 and parts[0] == "projects" and parts[2] == "extract-actions" and method == "POST":
                return extract_project_actions(connection, int(parts[1]), self.read_json())

            if len(parts) == 4 and parts[0] == "projects" and parts[2:] == ["actions", "clean-duplicates"] and method == "POST":
                return clean_duplicate_actions(connection, int(parts[1]))

            if method == "POST" and parts == ["actions", "bulk"]:
                return {**create_actions_bulk(connection, self.read_json()), "_status": HTTPStatus.CREATED}

            if method == "POST" and parts == ["actions", "bulk-delete"]:
                return delete_actions_bulk(connection, self.read_json())

            if method == "POST" and parts == ["actions"]:
                return {"action": create_action(connection, self.read_json()), "_status": HTTPStatus.CREATED}

            if len(parts) == 2 and parts[0] == "actions" and method == "PATCH":
                return {"action": update_action(connection, int(parts[1]), self.read_json())}

            if len(parts) == 2 and parts[0] == "actions" and method == "DELETE":
                return delete_action(connection, int(parts[1]))

            if method == "POST" and parts == ["updates"]:
                return {**create_update(connection, self.read_json()), "_status": HTTPStatus.CREATED}

            if len(parts) == 2 and parts[0] == "updates" and method == "PATCH":
                return {"update": update_project_note(connection, int(parts[1]), self.read_json())}

            if len(parts) == 2 and parts[0] == "updates" and method == "DELETE":
                return delete_project_note(connection, int(parts[1]))

            if len(parts) == 2 and parts[0] == "bug-queries" and method == "PATCH":
                return {"bugQuery": update_bug_query(connection, int(parts[1]), self.read_json())}

            if len(parts) == 2 and parts[0] == "bug-queries" and method == "DELETE":
                return delete_bug_query(connection, int(parts[1]))

        raise ApiError(HTTPStatus.NOT_FOUND, "Route not found.")

    def read_json(self) -> dict | list:
        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length == 0:
            return {}
        return json.loads(self.rfile.read(content_length).decode("utf-8"))

    def send_json(self, payload: object, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = b"" if status == HTTPStatus.NO_CONTENT else json.dumps(payload, ensure_ascii=True).encode("utf-8")
        self.send_response(int(status))
        self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin", "*"))
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept")
        self.send_header("Access-Control-Max-Age", "86400")
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        if os.environ.get("PROJECT_PULSE_API_LOGS"):
            super().log_message(format, *args)


def make_server(
    host: str = DEFAULT_HOST,
    port: int = DEFAULT_PORT,
    db_path: str | Path | None = None,
    seed: bool = False,
) -> ThreadingHTTPServer:
    resolved_db_path = Path(db_path or os.environ.get("PROJECT_PULSE_DB_PATH") or DEFAULT_DB_PATH)
    init_db(resolved_db_path, seed=seed)
    server = ThreadingHTTPServer((host, port), ProjectPulseHandler)
    server.db_path = resolved_db_path  # type: ignore[attr-defined]
    return server


def main() -> None:
    host = os.environ.get("PROJECT_PULSE_API_HOST", DEFAULT_HOST)
    port = int(os.environ.get("PROJECT_PULSE_API_PORT", DEFAULT_PORT))
    server = make_server(host=host, port=port)
    print(f"Project Pulse API running at http://{host}:{port}")
    print(f"SQLite database: {server.db_path}")  # type: ignore[attr-defined]
    server.serve_forever()


if __name__ == "__main__":
    main()
