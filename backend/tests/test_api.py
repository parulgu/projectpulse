from __future__ import annotations

import base64
import http.client
import io
import json
import os
import tempfile
import threading
import unittest
import zipfile
from datetime import date, timedelta
from pathlib import Path
from xml.sax.saxutils import escape

from unittest.mock import patch

from backend.app import (
    configured_ai_settings,
    fallback_followups,
    local_project_summary,
    make_server,
    memory_suggestions_from_notes,
    normalize_ai_payload,
    normalize_summary_payload,
    parse_ai_json,
)


class ApiClient:
    def __init__(self, port: int):
        self.port = port

    def request(self, method: str, path: str, payload: object | None = None) -> tuple[int, dict]:
        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        headers = {"Content-Type": "application/json"} if payload is not None else {}
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        try:
            connection.request(method, path, body=body, headers=headers)
            response = connection.getresponse()
            raw = response.read()
            data = json.loads(raw.decode("utf-8")) if raw else {}
            return response.status, data
        finally:
            connection.close()


def xlsx_column_name(index: int) -> str:
    name = ""
    index += 1
    while index:
        index, remainder = divmod(index - 1, 26)
        name = chr(ord("A") + remainder) + name
    return name


def make_xlsx(rows: list[list[str]]) -> bytes:
    sheet_rows = []
    for row_index, row in enumerate(rows, start=1):
        cells = []
        for column_index, value in enumerate(row):
            if value == "":
                continue
            cell_reference = f"{xlsx_column_name(column_index)}{row_index}"
            cells.append(
                f'<c r="{cell_reference}" t="inlineStr"><is><t>{escape(str(value))}</t></is></c>'
            )
        sheet_rows.append(f'<row r="{row_index}">{"".join(cells)}</row>')

    worksheet = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<sheetData>{"".join(sheet_rows)}</sheetData>'
        "</worksheet>"
    )

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("xl/worksheets/sheet1.xml", worksheet)
    return buffer.getvalue()


class ProjectPulseApiTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tempdir.name) / "test-project-pulse.db"
        self.server = make_server(port=0, db_path=self.db_path, seed=True)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.client = ApiClient(self.server.server_address[1])

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)
        self.tempdir.cleanup()

    def test_health_and_bootstrap(self) -> None:
        status, health = self.client.request("GET", "/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(health["status"], "ok")

        status, bootstrap = self.client.request("GET", "/api/bootstrap")
        self.assertEqual(status, 200)
        self.assertEqual(len(bootstrap["projects"]), 4)
        self.assertGreaterEqual(len(bootstrap["actions"]), 1)
        self.assertEqual(bootstrap["bugs"], [])
        self.assertEqual(bootstrap["phases"], [])
        self.assertIn("projectLinks", bootstrap)

    def test_followups_endpoint_returns_detected_items(self) -> None:
        fake_followups = [
            {
                "projectId": 1,
                "topic": "Analytics blocker",
                "signal": "Mentioned in multiple meetings.",
                "flags": ["repeated_blocker"],
                "suggestedAction": "Confirm owner and next step for analytics blocker",
            }
        ]

        with patch("backend.app.detect_followups_with_ai", return_value=fake_followups) as detect:
            status, payload = self.client.request("GET", "/api/followups")

        self.assertEqual(status, 200)
        self.assertEqual(payload["followUps"][0]["topic"], "Analytics blocker")
        self.assertEqual(payload["followUps"][0]["projectName"], "Customer Portal Launch")
        projects, updates, actions, decisions = detect.call_args.args
        self.assertGreaterEqual(len(projects), 1)
        self.assertGreaterEqual(len(updates), 1)
        self.assertGreaterEqual(len(actions), 1)
        self.assertIsInstance(decisions, list)

    def test_followup_fallback_uses_repeated_topics_not_action_hygiene(self) -> None:
        projects = [{"id": 1, "name": "Sales", "archivedAt": None}]
        followups = fallback_followups(
            projects,
            [
                {"projectId": 1, "text": "Customer ask is still pending for UX timeline."},
                {"projectId": 1, "text": "Customer ask is still pending for UX timeline."},
            ],
            [
                {
                    "completionDate": None,
                    "id": 1,
                    "owner": "AA",
                    "projectId": 1,
                    "source": "manual",
                    "status": "active",
                    "title": "Normal active task",
                },
                {
                    "completionDate": None,
                    "id": 2,
                    "owner": None,
                    "projectId": 1,
                    "source": "manual",
                    "status": "active",
                    "title": "Needs owner",
                },
            ],
            [],
        )

        self.assertEqual(len(followups), 1)
        self.assertIsNone(followups[0]["actionId"])
        self.assertIn("Customer ask", followups[0]["topic"])

    def test_project_create_member_and_delete_cascade(self) -> None:
        status, created = self.client.request(
            "POST",
            "/api/projects",
            {"name": "Backend Build", "classification": "Work", "roleDetails": {"developers": "Parul, Asha"}},
        )
        self.assertEqual(status, 201)
        project = created["project"]
        self.assertEqual(project["classification"], "work")
        self.assertEqual(project["members"], ["Parul", "Asha"])

        status, with_member = self.client.request("POST", f"/api/projects/{project['id']}/members", {"name": "Mia"})
        self.assertEqual(status, 200)
        self.assertIn("Mia", with_member["project"]["members"])

        status, action = self.client.request(
            "POST",
            "/api/actions",
            {
                "completionDate": "2026-06-01",
                "owner": "Asha",
                "projectId": project["id"],
                "status": "active",
                "tag": "#frontend",
                "title": "Wire frontend API",
            },
        )
        self.assertEqual(status, 201)
        self.assertEqual(action["action"]["projectId"], project["id"])
        self.assertEqual(action["action"]["completionDate"], "2026-06-01")
        self.assertEqual(action["action"]["tag"], "frontend")

        status, tagged = self.client.request("PATCH", f"/api/actions/{action['action']['id']}", {"tag": "#api"})
        self.assertEqual(status, 200)
        self.assertEqual(tagged["action"]["tag"], "api")

        status, replaced_members = self.client.request(
            "PATCH",
            f"/api/projects/{project['id']}/members",
            {"members": ["Parul", "Mia"]},
        )
        self.assertEqual(status, 200)
        self.assertEqual(replaced_members["project"]["members"], ["Parul", "Mia"])

        status, dashboard = self.client.request("GET", f"/api/projects/{project['id']}/dashboard")
        self.assertEqual(status, 200)
        self.assertIsNone(
            next(item for item in dashboard["actions"] if item["id"] == action["action"]["id"])["owner"]
        )

        status, deleted = self.client.request("DELETE", f"/api/projects/{project['id']}")
        self.assertEqual(status, 200)
        self.assertEqual(deleted["deletedProject"]["name"], "Backend Build")

        status, dashboard = self.client.request("GET", f"/api/projects/{project['id']}/dashboard")
        self.assertEqual(status, 404)
        self.assertEqual(dashboard["error"], "Project not found.")

    def test_project_archive_and_restore_keeps_project_data(self) -> None:
        status, archived = self.client.request("POST", "/api/projects/1/archive")
        self.assertEqual(status, 200)
        self.assertIsNotNone(archived["project"]["archivedAt"])

        status, dashboard = self.client.request("GET", "/api/projects/1/dashboard")
        self.assertEqual(status, 200)
        self.assertEqual(dashboard["project"]["id"], 1)
        self.assertGreaterEqual(len(dashboard["actions"]), 1)

        status, restored = self.client.request("POST", "/api/projects/1/restore")
        self.assertEqual(status, 200)
        self.assertIsNone(restored["project"]["archivedAt"])

    def test_project_overview_details_milestones_and_links(self) -> None:
        status, created = self.client.request(
            "POST",
            "/api/projects",
            {
                "name": "Milestone Project",
                "classification": "Work",
                "epic": "EPIC-001",
                "targetRelease": "25D",
                "roleDetails": {"deliveryManager": "Parul"},
            },
        )
        self.assertEqual(status, 201)
        project_id = created["project"]["id"]
        self.assertEqual(created["project"]["epic"], "EPIC-001")
        self.assertEqual(created["project"]["targetRelease"], "25D")

        status, details = self.client.request(
            "PATCH",
            f"/api/projects/{project_id}/details",
            {
                "classification": "Customer Delivery",
                "epic": "EPIC-101",
                "targetRelease": "26A",
                "roleDetails": {
                    "deliveryManager": "Parul",
                    "developers": "Asha, Ben",
                    "qaMembers": "Mia",
                    "productManager": "Ravi",
                    "designers": "Kriti",
                    "Release Manager": "Noor",
                },
            },
        )
        self.assertEqual(status, 200)
        self.assertEqual(details["project"]["classification"], "customer-delivery")
        self.assertEqual(details["project"]["epic"], "EPIC-101")
        self.assertEqual(details["project"]["targetRelease"], "26A")
        self.assertNotIn("epic", details["project"]["roleDetails"])
        self.assertEqual(details["project"]["roleDetails"]["Release Manager"], "Noor")
        self.assertEqual(details["project"]["members"], ["Parul", "Asha", "Ben", "Mia", "Ravi", "Kriti", "Noor"])

        status, phases = self.client.request("GET", f"/api/projects/{project_id}/phases")
        self.assertEqual(status, 200)
        self.assertEqual(phases["phases"], [])

        status, imported = self.client.request(
            "POST",
            f"/api/projects/{project_id}/phases/import",
            {"templateText": "Discovery\n    Problem Statement\n    Scope\nDelivery\n    Demo\n    FAR"},
        )
        self.assertEqual(status, 200)
        self.assertEqual(imported["phases"][0]["name"], "Discovery")
        self.assertEqual(imported["phases"][0]["subtypes"][0]["title"], "Problem Statement")
        self.assertEqual(imported["phases"][0]["subtypes"][0]["status"], "Not Started")

        first_subtype = imported["phases"][0]["subtypes"][0]
        status, updated_subtype = self.client.request(
            "PATCH",
            f"/api/milestone-subtypes/{first_subtype['id']}",
            {
                "comments": "Reviewed in weekly sync",
                "link": "https://example.test/design",
                "owner": "Asha",
                "status": "Blocked",
                "title": "Problem statement",
            },
        )
        self.assertEqual(status, 200)
        self.assertEqual(updated_subtype["subtype"]["owner"], "Asha")
        self.assertEqual(updated_subtype["subtype"]["status"], "Blocked")
        self.assertEqual(updated_subtype["subtype"]["comments"], "Reviewed in weekly sync")

        status, rejected_owner = self.client.request(
            "PATCH",
            f"/api/milestone-subtypes/{first_subtype['id']}",
            {"owner": "Someone Else"},
        )
        self.assertEqual(status, 400)
        self.assertEqual(rejected_owner["error"], "Milestone owner must be a member of the selected project.")

        status, replace_requires_confirmation = self.client.request(
            "POST",
            f"/api/projects/{project_id}/phases/import",
            {"templateText": "Requirements\n    Stories"},
        )
        self.assertEqual(status, 400)
        self.assertEqual(
            replace_requires_confirmation["error"],
            "Import confirmation is required before replacing existing milestones.",
        )

        status, replaced = self.client.request(
            "POST",
            f"/api/projects/{project_id}/phases/import",
            {"templateText": "Requirements\n    Stories", "confirmReplacement": True},
        )
        self.assertEqual(status, 200)
        self.assertEqual(len(replaced["phases"]), 1)
        self.assertEqual(replaced["phases"][0]["name"], "Requirements")
        self.assertEqual(replaced["phases"][0]["subtypes"][0]["title"], "Stories")

        status, invalid_nesting = self.client.request(
            "POST",
            f"/api/projects/{project_id}/phases/import",
            {"templateText": "Discovery\n    Problem Statement\n        Too deep", "confirmReplacement": True},
        )
        self.assertEqual(status, 400)
        self.assertEqual(invalid_nesting["error"], "Only one level of nesting is supported.")

        status, unchanged = self.client.request("GET", f"/api/projects/{project_id}/phases")
        self.assertEqual(status, 200)
        self.assertEqual(unchanged["phases"][0]["name"], "Requirements")

        status, link = self.client.request(
            "POST",
            f"/api/projects/{project_id}/links",
            {"name": "Epic", "address": "https://example.test/EPIC-101", "linkText": "EPIC-101"},
        )
        self.assertEqual(status, 201)
        self.assertEqual(link["projectLink"]["name"], "Epic")
        self.assertEqual(link["projectLink"]["address"], "https://example.test/EPIC-101")
        self.assertEqual(link["projectLink"]["linkText"], "EPIC-101")

        status, updated_link = self.client.request(
            "PATCH",
            f"/api/project-links/{link['projectLink']['id']}",
            {"name": "Main Epic", "address": "https://example.test/EPIC-202", "linkText": "EPIC-202"},
        )
        self.assertEqual(status, 200)
        self.assertEqual(updated_link["projectLink"]["address"], "https://example.test/EPIC-202")
        self.assertEqual(updated_link["projectLink"]["linkText"], "EPIC-202")

    def test_milestone_import_accepts_tab_indentation(self) -> None:
        status, payload = self.client.request(
            "POST",
            "/api/projects/1/phases/import",
            {"templateText": "Discovery\n\tProblem Statement\n\tScope\nDelivery\n\tDemo"},
        )
        self.assertEqual(status, 200)
        self.assertEqual(payload["phases"][0]["name"], "Discovery")
        self.assertEqual([subtype["title"] for subtype in payload["phases"][0]["subtypes"]], ["Problem Statement", "Scope"])

    def test_update_can_create_action_and_patch_status(self) -> None:
        status, payload = self.client.request(
            "POST",
            "/api/updates",
            {
                "projectId": 1,
                "person": "Asha Rao",
                "text": "Finish backend API tests",
                "blocker": "",
                "completionDate": "2026-06-05",
                "createAction": True,
                "meetingDate": "2026-05-29",
            },
        )
        self.assertEqual(status, 201)
        self.assertEqual(payload["update"]["status"], "In Progress")
        self.assertEqual(payload["update"]["meetingDate"], "2026-05-29")
        self.assertEqual(payload["createdAction"]["status"], "active")
        self.assertEqual(payload["createdAction"]["completionDate"], "2026-06-05")
        self.assertEqual(payload["createdAction"]["meetingDate"], "2026-05-29")

        update_id = payload["update"]["id"]
        status, updated_note = self.client.request(
            "PATCH",
            f"/api/updates/{update_id}",
            {"meetingDate": "2026-05-30", "text": "Finish backend API tests and update notes"},
        )
        self.assertEqual(status, 200)
        self.assertEqual(updated_note["update"]["meetingDate"], "2026-05-30")
        self.assertEqual(updated_note["update"]["text"], "Finish backend API tests and update notes")

        status, deleted_note = self.client.request("DELETE", f"/api/updates/{update_id}")
        self.assertEqual(status, 200)
        self.assertEqual(deleted_note["deletedUpdate"]["id"], update_id)

        status, missing_note = self.client.request("DELETE", f"/api/updates/{update_id}")
        self.assertEqual(status, 404)
        self.assertEqual(missing_note["error"], "Project note not found.")

        action_id = payload["createdAction"]["id"]
        status, patched = self.client.request("PATCH", f"/api/actions/{action_id}", {"status": "done"})
        self.assertEqual(status, 200)
        self.assertEqual(patched["action"]["status"], "done")

        status, owned = self.client.request("PATCH", f"/api/actions/{action_id}", {"owner": "Ben Carter"})
        self.assertEqual(status, 200)
        self.assertEqual(owned["action"]["owner"], "Ben Carter")

        status, dated = self.client.request("PATCH", f"/api/actions/{action_id}", {"completionDate": "2026-06-10"})
        self.assertEqual(status, 200)
        self.assertEqual(dated["action"]["completionDate"], "2026-06-10")

        status, renamed = self.client.request("PATCH", f"/api/actions/{action_id}", {"title": "Finish API tests"})
        self.assertEqual(status, 200)
        self.assertEqual(renamed["action"]["title"], "Finish API tests")

        status, deleted = self.client.request("DELETE", f"/api/actions/{action_id}")
        self.assertEqual(status, 200)
        self.assertEqual(deleted["deletedAction"]["id"], action_id)

        status, dashboard = self.client.request("GET", "/api/projects/1/dashboard")
        self.assertEqual(status, 200)
        self.assertNotIn(action_id, [action["id"] for action in dashboard["actions"]])

    def test_project_note_does_not_auto_create_decision_log_entries(self) -> None:
        status, payload = self.client.request(
            "POST",
            "/api/updates",
            {
                "projectId": 1,
                "meetingDate": "2026-06-01",
                "text": "The team agreed to use the Redwood design. General discussion continued.",
            },
        )

        self.assertEqual(status, 201)
        self.assertEqual(payload["decisions"], [])

        update_id = payload["update"]["id"]
        status, updated = self.client.request(
            "PATCH",
            f"/api/updates/{update_id}",
            {"text": "The team discussed options without a final choice.", "meetingDate": "2026-06-02"},
        )
        self.assertEqual(status, 200)
        self.assertEqual(updated["decisions"], [])

        suggestions = memory_suggestions_from_notes("The team agreed to use the Redwood design.")
        self.assertIn("agreed to use the Redwood design", suggestions["decisions"][0])

    def test_project_note_preserves_and_repairs_meeting_formatting(self) -> None:
        formatted_note = (
            "Dynamic Caching – Meeting Summary\n\n"
            "Purpose The Dynamic Caching initiative aims to improve visibility.\n\n"
            "Phase 1 – Cache Visibility and Sizing\n"
            "- Measure memory usage of cache objects.\n"
            "- Improve diagnostics and logging."
        )
        status, payload = self.client.request(
            "POST",
            "/api/updates",
            {
                "projectId": 1,
                "text": formatted_note,
                "meetingDate": "2026-06-23",
            },
        )
        self.assertEqual(status, 201)
        self.assertEqual(payload["update"]["text"], formatted_note)

        flattened_note = (
            "Dynamic Caching – Meeting Summary Purpose The Dynamic Caching initiative aims to improve visibility. "
            "Phase 1 – Cache Visibility and Sizing - Measure memory usage of cache objects. "
            "- Improve diagnostics and logging. Conclusion Measure → Plan → Automate"
        )
        status, updated = self.client.request(
            "PATCH",
            f"/api/updates/{payload['update']['id']}",
            {"text": flattened_note},
        )
        self.assertEqual(status, 200)
        self.assertIn("\n\nPurpose", updated["update"]["text"])
        self.assertIn("\n\nPhase 1", updated["update"]["text"])
        self.assertIn("\n- Measure memory usage", updated["update"]["text"])
        self.assertIn("\n\nConclusion", updated["update"]["text"])

    def test_manual_decision_can_be_created_updated_and_deleted(self) -> None:
        status, created = self.client.request(
            "POST",
            "/api/decisions",
            {
                "projectId": 1,
                "decisionDate": "2026-06-01",
                "owner": "Asha Rao",
                "status": "active",
                "text": "Use compact action board as the primary action view.",
            },
        )
        self.assertEqual(status, 201)
        decision_id = created["decision"]["id"]
        self.assertIsNone(created["decision"]["updateId"])
        self.assertEqual(created["decision"]["owner"], "Asha Rao")
        self.assertEqual(created["decision"]["status"], "active")

        status, updated = self.client.request(
            "PATCH",
            f"/api/decisions/{decision_id}",
            {
                "decisionDate": "2026-06-02",
                "owner": "Ben Carter",
                "status": "revisited",
                "text": "Use Action Board as the primary action view.",
            },
        )
        self.assertEqual(status, 200)
        self.assertEqual(updated["decision"]["decisionDate"], "2026-06-02")
        self.assertEqual(updated["decision"]["owner"], "Ben Carter")
        self.assertEqual(updated["decision"]["status"], "revisited")
        self.assertEqual(updated["decision"]["text"], "Use Action Board as the primary action view.")

        status, deleted = self.client.request("DELETE", f"/api/decisions/{decision_id}")
        self.assertEqual(status, 200)
        self.assertEqual(deleted["deletedDecision"]["id"], decision_id)

        status, missing = self.client.request("DELETE", f"/api/decisions/{decision_id}")
        self.assertEqual(status, 404)
        self.assertEqual(missing["error"], "Decision not found.")

    def test_bug_refresh_returns_rows_without_persisting_them(self) -> None:
        status, refreshed = self.client.request(
            "POST",
            "/api/projects/1/bugs/refresh",
            {
                "bugs": [
                    {
                        "id": "BUG-9001",
                        "title": "Backend refreshed bug",
                        "assignee": "Asha Rao",
                        "status": "Open",
                        "severity": "High",
                    }
                ]
            },
        )
        self.assertEqual(status, 200)
        self.assertEqual([bug["id"] for bug in refreshed["bugs"]], ["BUG-9001"])
        self.assertEqual(refreshed["bugs"][0]["projectId"], 1)
        self.assertIn("refreshedAt", refreshed["bugs"][0])

        status, project_one = self.client.request("GET", "/api/projects/1/dashboard")
        self.assertEqual(status, 200)
        self.assertEqual(project_one["bugs"], [])

        status, project_two = self.client.request("GET", "/api/projects/2/dashboard")
        self.assertEqual(status, 200)
        self.assertEqual(project_two["bugs"], [])

    def test_bug_fetch_uses_backend_url_request(self) -> None:
        with patch(
            "backend.app.fetch_json_from_url",
            return_value={
                "bugs": [
                    {
                        "id": "BUG-9100",
                        "title": "Fetched backend bug",
                        "assignee": "Ben Carter",
                        "status": "Open",
                        "severity": "Medium",
                    }
                ]
            },
        ) as fetch_json:
            status, refreshed = self.client.request(
                "POST",
                "/api/projects/1/bugs/fetch",
                {"url": "https://bugdb.example.com/query"},
            )

        self.assertEqual(status, 200)
        fetch_json.assert_called_once_with("https://bugdb.example.com/query")
        self.assertEqual([bug["id"] for bug in refreshed["bugs"]], ["BUG-9100"])

    def test_bug_fetch_uses_bugdb_mcp_for_saved_search_url(self) -> None:
        saved_search_url = "https://bug.oraclecorp.com/pls/bug/WEBBUG_REPORTS.Saved_Search?id=795056111225034420"
        mcp_payload = {
            "jsonrpc": "2.0",
            "id": "test",
            "result": {
                "content": [
                    {
                        "type": "text",
                        "text": json.dumps({
                            "bugs": [
                                {
                                    "Bug/Enh Number": "39155296",
                                    "Subject": "MCP imported bug",
                                    "Status": "Open",
                                    "Severity": "2",
                                    "Priority": "P1",
                                    "Assignee": "PARULGU",
                                }
                            ]
                        }),
                    }
                ]
            },
        }

        with patch("backend.app.bugdb_mcp_tool_call", return_value=mcp_payload) as mcp_call:
            with patch("backend.app.fetch_json_from_url") as fetch_json:
                status, refreshed = self.client.request(
                    "POST",
                    "/api/projects/1/bugs/fetch",
                    {"url": saved_search_url},
                )

        self.assertEqual(status, 200)
        fetch_json.assert_not_called()
        mcp_call.assert_called_once_with("get_bug_report", {"report_id": "795056111225034420"})
        self.assertEqual([bug["id"] for bug in refreshed["bugs"]], ["39155296"])
        self.assertEqual(refreshed["bugs"][0]["title"], "MCP imported bug")
        self.assertEqual(refreshed["bugs"][0]["severity"], "High")
        self.assertEqual(refreshed["bugs"][0]["assignee"], "PARULGU")

    def test_bug_fetch_reports_missing_bugdb_mcp_config_for_saved_search_url(self) -> None:
        missing_config_path = Path(self.tempdir.name) / "missing-project-pulse.config.json"
        with patch.dict(os.environ, {"PROJECT_PULSE_CONFIG_PATH": str(missing_config_path)}, clear=True):
            status, payload = self.client.request(
                "POST",
                "/api/projects/1/bugs/fetch",
                {"url": "https://bug.oraclecorp.com/pls/bug/WEBBUG_REPORTS.Saved_Search?id=795056111225034420"},
            )

        self.assertEqual(status, 503)
        self.assertIn("BugDB MCP is not configured", payload["error"])

    def test_bug_fetch_uses_bugdb_generic_query_fields(self) -> None:
        bug_payload = {
            "result": {
                "structuredContent": {
                    "items": [
                        {
                            "rptno": "39155296",
                            "subject": "Generic query bug",
                            "status": "Open",
                            "severity": "2",
                            "priority": "P1",
                            "assignee": "PARULGU",
                            "component": "UI",
                            "tags": "redwood",
                        }
                    ]
                }
            }
        }

        with patch("backend.app.fetch_bugdb_generic_query", return_value=bug_payload) as generic_query:
            with patch("backend.app.fetch_json_from_url") as fetch_json:
                status, refreshed = self.client.request(
                    "POST",
                    "/api/projects/1/bugs/fetch",
                    {
                        "query": {
                            "productId": "1408",
                            "rptno": "39155296",
                            "severity": "1, 2",
                            "status": "11, 15",
                            "reportedBy": "PARULGU",
                            "assignee": "PARULGU",
                            "component": "UI",
                        }
                    },
                )

        self.assertEqual(status, 200)
        fetch_json.assert_not_called()
        generic_query.assert_called_once()
        query_input = generic_query.call_args.args[0]
        self.assertEqual(query_input["productId"], "1408")
        self.assertEqual(query_input["status"], "11, 15")
        self.assertEqual([bug["id"] for bug in refreshed["bugs"]], ["39155296"])
        self.assertEqual(refreshed["bugs"][0]["severity"], "High")

    def test_bugdb_generic_query_payload_maps_fields(self) -> None:
        from backend.app import bugdb_generic_query_payload

        payload = bugdb_generic_query_payload({
            "productId": "1408",
            "rptno": "39155296",
            "severity": "1, 2",
            "status": "11, 15",
            "subject": "semantic search",
            "reportedBy": "PARULGU",
            "assignee": "PARULGU",
            "component": "UI",
            "tag": "regression",
        })

        self.assertEqual(payload["query"]["product_id"], "1408")
        self.assertEqual(payload["query"]["rptno"], "39155296")
        self.assertEqual(payload["query"]["severity"], ["1", "2"])
        self.assertEqual(payload["query"]["status"], ["11", "15"])
        self.assertEqual(payload["query"]["subject"], {"$like": "%semantic search%"})
        self.assertEqual(payload["query"]["reported_by"], "PARULGU")
        self.assertEqual(payload["query"]["assignee"], "PARULGU")
        self.assertEqual(payload["query"]["component"], "UI")
        self.assertEqual(payload["query"]["bt_tags"], {"$like": "%regression%"})
        self.assertEqual(payload["columns"], ["rptno", "subject", "status", "severity", "product_id", "raw_updated_date", "reported_by", "component", "bt_tags", "assignee"])

    def test_bugdb_generic_query_uses_mcp_get_bug_report(self) -> None:
        from backend.app import fetch_bugdb_generic_query

        with patch("backend.app.bugdb_mcp_tool_call", return_value={"items": []}) as mcp_call:
            payload = fetch_bugdb_generic_query({"assignee": "PARULGU"})

        self.assertEqual(payload, {"items": []})
        mcp_call.assert_called_once()
        tool_name, arguments = mcp_call.call_args.args
        self.assertEqual(tool_name, "get_bug_report")
        self.assertEqual(arguments["size"], 1000)
        self.assertEqual(arguments["start"], 0)
        self.assertEqual(json.loads(arguments["data"])["query"], {"assignee": "PARULGU"})

    def test_parse_mcp_response_body_accepts_event_stream(self) -> None:
        from backend.app import parse_mcp_response_body

        payload = parse_mcp_response_body(
            'event: message\n'
            'data: {"jsonrpc":"2.0","id":"test","result":{"content":[]}}\n\n'
        )

        self.assertEqual(payload["result"], {"content": []})

    def test_bug_records_from_mcp_response_prefers_structured_content(self) -> None:
        from backend.app import bug_records_from_mcp_response

        records = bug_records_from_mcp_response({
            "result": {
                "content": [{"type": "text", "text": "not json"}],
                "structuredContent": {
                    "items": [
                        {
                            "rptno": 10599477,
                            "subject": "Structured bug",
                            "status": 92,
                            "severity": 2,
                            "assignee": "PARULGU",
                        }
                    ]
                },
            }
        })

        self.assertEqual(records[0]["rptno"], 10599477)
        self.assertEqual(records[0]["subject"], "Structured bug")

    def test_bug_upload_imports_xlsx_rows(self) -> None:
        status, cleared = self.client.request("DELETE", "/api/projects/1/bugs")
        self.assertEqual(status, 200)
        self.assertEqual(cleared["deletedBugs"], 0)

        workbook = make_xlsx(
            [
                ["RPTNO", "Bug/Enh Number", "Subject", "Status", "Severity", "Priority", "Assignee", "Component"],
                ["RPT-1", "39155296", "Excel imported bug", "93", "3", "P2", "Asha Rao", "PROD_ADMN"],
                ["RPT-2", "38368789", "Second imported bug", "80", "2", "P1", "Ben Carter", "SRVR_INFRA"],
            ]
        )

        status, refreshed = self.client.request(
            "POST",
            "/api/projects/1/bugs/upload",
            {
                "filename": "bug-export.xlsx",
                "contentBase64": base64.b64encode(workbook).decode("ascii"),
            },
        )

        self.assertEqual(status, 200)
        imported_by_id = {bug["id"]: bug for bug in refreshed["bugs"]}
        self.assertEqual(set(imported_by_id), {"39155296", "38368789"})
        self.assertEqual(imported_by_id["39155296"]["title"], "Excel imported bug")
        self.assertEqual(imported_by_id["39155296"]["assignee"], "Asha Rao")
        self.assertEqual(imported_by_id["39155296"]["status"], "93")
        self.assertEqual(imported_by_id["39155296"]["severity"], "Medium")
        self.assertEqual(imported_by_id["39155296"]["priority"], "P2")
        self.assertEqual(imported_by_id["39155296"]["fields"]["Component"], "PROD_ADMN")
        self.assertNotIn("RPT-1", imported_by_id)
        self.assertEqual(imported_by_id["38368789"]["severity"], "High")
        self.assertEqual(imported_by_id["38368789"]["priority"], "P1")

        updated_workbook = make_xlsx(
            [
                ["Bug/Enh Number", "Subject", "Status", "Severity", "Priority", "Assignee", "Component"],
                ["39155296", "Updated imported bug", "80", "2", "P0", "Mia Chen", "CORE"],
            ]
        )
        status, updated = self.client.request(
            "POST",
            "/api/projects/1/bugs/upload",
            {
                "filename": "bug-export-update.xlsx",
                "contentBase64": base64.b64encode(updated_workbook).decode("ascii"),
            },
        )
        self.assertEqual(status, 200)
        updated_by_id = {bug["id"]: bug for bug in updated["bugs"]}
        self.assertEqual(set(updated_by_id), {"39155296"})
        self.assertEqual(updated_by_id["39155296"]["title"], "Updated imported bug")
        self.assertEqual(updated_by_id["39155296"]["assignee"], "Mia Chen")
        self.assertEqual(updated_by_id["39155296"]["priority"], "P0")
        self.assertEqual(updated_by_id["39155296"]["fields"]["Component"], "CORE")

        status, after_clear = self.client.request("DELETE", "/api/projects/1/bugs")
        self.assertEqual(status, 200)
        self.assertEqual(after_clear["deletedBugs"], 0)
        status, project_one = self.client.request("GET", "/api/projects/1/dashboard")
        self.assertEqual(status, 200)
        self.assertEqual(project_one["bugs"], [])

    def test_project_summary_uses_ai_without_persistence(self) -> None:
        fake_summary = {
            "headline": "Launch readiness summary",
            "overview": "Launch work is moving, with analytics still needing attention.",
            "pending": ["Resolve analytics blocker."],
            "blocked": ["Analytics blocker is preventing release readiness."],
            "done": ["Launch checklist is marked done."],
            "keyDecisions": ["Team agreed to keep analytics as the release blocker."],
        }

        with patch("backend.app.summarize_project_with_ai", return_value=fake_summary) as summarize:
            status, payload = self.client.request("POST", "/api/projects/1/summary")

        self.assertEqual(status, 200)
        self.assertEqual(payload["summary"], fake_summary)
        project, updates, actions, bugs = summarize.call_args.args
        self.assertEqual(project["name"], "Customer Portal Launch")
        self.assertGreaterEqual(len(updates), 1)
        self.assertGreaterEqual(len(actions), 1)
        self.assertIsInstance(bugs, list)

        status, bootstrap = self.client.request("GET", "/api/bootstrap")
        self.assertEqual(status, 200)
        self.assertNotIn("summaryModal", bootstrap)

    def test_project_summary_requires_data(self) -> None:
        status, created = self.client.request(
            "POST",
            "/api/projects",
            {"name": "No Notes", "classification": "Work", "roleDetails": {"developers": "AA"}},
        )
        self.assertEqual(status, 201)

        status, payload = self.client.request("POST", f"/api/projects/{created['project']['id']}/summary")

        self.assertEqual(status, 400)
        self.assertEqual(payload["error"], "No project data is available to summarize.")

    def test_project_summary_allows_action_only_project(self) -> None:
        status, created = self.client.request(
            "POST",
            "/api/projects",
            {"name": "Action Only", "classification": "Work", "roleDetails": {"developers": "AA"}},
        )
        self.assertEqual(status, 201)
        project_id = created["project"]["id"]
        status, _action = self.client.request(
            "POST",
            "/api/actions",
            {"projectId": project_id, "title": "Prepare launch checklist", "owner": "AA", "status": "active"},
        )
        self.assertEqual(status, 201)

        fake_summary = {
            "headline": "Action-only summary",
            "overview": "The project has one active action.",
            "pending": ["Prepare launch checklist."],
            "blocked": ["No blocked work is captured."],
            "done": ["No action items are marked done."],
            "keyDecisions": ["No key decisions captured yet."],
        }
        with patch("backend.app.summarize_project_with_ai", return_value=fake_summary) as summarize:
            status, payload = self.client.request("POST", f"/api/projects/{project_id}/summary")

        self.assertEqual(status, 200)
        self.assertEqual(payload["summary"], fake_summary)
        _project, updates, actions, bugs = summarize.call_args.args
        self.assertEqual(updates, [])
        self.assertEqual(len(actions), 1)
        self.assertEqual(bugs, [])

    def test_project_summary_allows_request_bug_only_project(self) -> None:
        status, created = self.client.request(
            "POST",
            "/api/projects",
            {"name": "Bug Only", "classification": "Work", "roleDetails": {"developers": "AA"}},
        )
        self.assertEqual(status, 201)
        project_id = created["project"]["id"]
        visible_bugs = [
            {
                "assignee": "AA",
                "id": "BUG-1",
                "severity": "High",
                "status": "Open",
                "title": "Important customer bug",
            }
        ]
        fake_summary = {
            "headline": "Bug-only summary",
            "overview": "The project has one visible bug.",
            "pending": ["No pending action items were found."],
            "blocked": ["No blocked work is captured."],
            "done": ["No action items are marked done."],
            "keyDecisions": ["No key decisions captured yet."],
        }
        with patch("backend.app.summarize_project_with_ai", return_value=fake_summary) as summarize:
            status, payload = self.client.request(
                "POST",
                f"/api/projects/{project_id}/summary",
                {"bugs": visible_bugs},
            )

        self.assertEqual(status, 200)
        self.assertEqual(payload["summary"], fake_summary)
        _project, updates, actions, bugs = summarize.call_args.args
        self.assertEqual(updates, [])
        self.assertEqual(actions, [])
        self.assertEqual(bugs, visible_bugs)

    def test_summary_payload_enriches_sparse_ai_response(self) -> None:
        fallback = local_project_summary(
            {"name": "sales"},
            [
                {
                    "createdAt": "2026-05-29T10:30:00+00:00",
                    "meetingDate": "2026-05-29",
                    "text": "ANU HAS TO WORK ON TESTING",
                },
                {
                    "createdAt": "2026-05-29T10:31:00+00:00",
                    "meetingDate": "2026-05-29",
                    "text": "ANU HAS TO WORK ON TESTING",
                },
                {
                    "createdAt": "2026-05-29T10:32:00+00:00",
                    "meetingDate": "2026-05-29",
                    "text": "Team decided to keep testing in scope.",
                }
            ],
            [
                {
                    "completionDate": None,
                    "owner": None,
                    "status": "active",
                    "title": "Work on testing",
                },
                {
                    "completionDate": None,
                    "owner": "BB",
                    "status": "blocked",
                    "title": "Resolve test environment issue",
                },
                {
                    "completionDate": None,
                    "owner": None,
                    "status": "active",
                    "title": "Work on testing",
                },
                {
                    "completionDate": None,
                    "owner": "AA",
                    "status": "done",
                    "title": "Finish UI",
                }
            ],
        )

        summary = normalize_summary_payload(
            {"headline": "Sales Project Update", "overview": "The team"},
            fallback,
        )

        self.assertEqual(summary["headline"], "Sales Project Update")
        self.assertIn("3 saved meeting notes", summary["overview"])
        self.assertEqual(summary["pending"], fallback["pending"])
        self.assertEqual(len(summary["pending"]), 1)
        self.assertEqual(summary["blocked"], fallback["blocked"])
        self.assertEqual(len(summary["blocked"]), 1)
        self.assertEqual(summary["done"], fallback["done"])
        self.assertEqual(len(summary["done"]), 1)
        self.assertEqual(summary["keyDecisions"], fallback["keyDecisions"])
        self.assertEqual(summary["keyDecisions"], ["Team decided to keep testing in scope."])

    def test_ai_extraction_creates_actions(self) -> None:
        fake_ai_payload = {
            "points": ["Launch follow-up was discussed."],
            "actions": [
                {"title": "Send launch notes", "owner": "Asha Rao", "status": "active"},
                {"title": "Confirm release analytics owner", "owner": "Ben Carter", "status": "blocked"},
            ],
        }

        with patch("backend.app.extract_actions_with_ai", return_value=fake_ai_payload):
            status, extracted = self.client.request(
                "POST",
                "/api/projects/1/extract-actions",
                {"notes": "Asha will send notes. Ben is blocked.", "source": "meeting"},
            )

        self.assertEqual(status, 200)
        self.assertEqual(extracted["points"], ["Launch follow-up was discussed."])
        self.assertEqual([action["title"] for action in extracted["actions"]], [
            "Send launch notes",
            "Confirm release analytics owner",
        ])
        self.assertEqual(extracted["actions"][1]["status"], "blocked")

    def test_ai_extraction_skips_duplicate_existing_actions(self) -> None:
        fake_ai_payload = {
            "points": ["Existing blocker was discussed again."],
            "actions": [
                {"title": "Resolve analytics blocker", "owner": "Ben Carter", "status": "blocked"},
            ],
        }

        with patch("backend.app.extract_actions_with_ai", return_value=fake_ai_payload):
            status, extracted = self.client.request(
                "POST",
                "/api/projects/1/extract-actions",
                {"notes": "Ben Carter will resolve analytics blocker.", "source": "meeting"},
            )

        self.assertEqual(status, 200)
        self.assertEqual(extracted["actions"], [])
        self.assertIn("Matching action items already exist", " ".join(extracted["points"]))

    def test_duplicate_action_create_returns_existing_action(self) -> None:
        duplicate = {
            "completionDate": "2026-06-01",
            "owner": "Asha Rao",
            "projectId": 1,
            "source": "manual",
            "status": "active",
            "title": "Send duplicate update",
        }
        status, first = self.client.request("POST", "/api/actions", duplicate)
        self.assertEqual(status, 201)
        status, second = self.client.request("POST", "/api/actions", duplicate)
        self.assertEqual(status, 201)
        self.assertEqual(second["action"]["id"], first["action"]["id"])
        self.assertTrue(second["action"]["duplicate"])

        status, cleaned = self.client.request("POST", "/api/projects/1/actions/clean-duplicates")

        self.assertEqual(status, 200)
        self.assertEqual(cleaned["deletedCount"], 0)
        action_ids = [action["id"] for action in cleaned["actions"]]
        self.assertIn(first["action"]["id"], action_ids)

    def test_bulk_action_create_skips_duplicates(self) -> None:
        duplicate = {
            "owner": "Asha Rao",
            "projectId": 1,
            "source": "manual",
            "status": "active",
            "title": "Send duplicate update",
        }
        status, first = self.client.request("POST", "/api/actions", duplicate)
        self.assertEqual(status, 201)

        status, bulk = self.client.request("POST", "/api/actions/bulk", {"actions": [duplicate]})
        self.assertEqual(status, 201)
        self.assertEqual(bulk["actions"], [])
        self.assertEqual(bulk["skippedDuplicates"], 1)

        status, dashboard = self.client.request("GET", "/api/projects/1/dashboard")
        self.assertEqual(status, 200)
        matching = [action for action in dashboard["actions"] if action["title"] == duplicate["title"]]
        self.assertEqual(len(matching), 1)
        self.assertEqual(matching[0]["id"], first["action"]["id"])

    def test_ai_extraction_infers_owner_from_notes(self) -> None:
        fake_ai_payload = {
            "points": ["Launch notes were discussed."],
            "actions": [
                {"title": "Send launch notes", "owner": None, "status": "active"},
            ],
        }

        with patch("backend.app.extract_actions_with_ai", return_value=fake_ai_payload):
            status, extracted = self.client.request(
                "POST",
                "/api/projects/1/extract-actions",
                {"notes": "Asha Rao will send launch notes today.", "source": "meeting"},
            )

        self.assertEqual(status, 200)
        self.assertEqual(extracted["actions"][0]["owner"], "Asha Rao")

    def test_ai_extraction_uses_null_owner_for_unknown_names(self) -> None:
        fake_ai_payload = {
            "points": ["An outside person was mentioned."],
            "actions": [
                {"title": "Send follow-up", "owner": "New Person", "status": "active"},
            ],
        }

        with patch("backend.app.extract_actions_with_ai", return_value=fake_ai_payload):
            status, extracted = self.client.request(
                "POST",
                "/api/projects/1/extract-actions",
                {"notes": "New Person will send follow-up.", "source": "meeting"},
            )

        self.assertEqual(status, 200)
        self.assertIsNone(extracted["actions"][0]["owner"])

    def test_ai_extraction_repairs_generic_action_title(self) -> None:
        status, created = self.client.request(
            "POST",
            "/api/projects",
            {"name": "Generic Title Test", "classification": "Work", "roleDetails": {"developers": "AA, BB"}},
        )
        self.assertEqual(status, 201)
        project_id = created["project"]["id"]
        fake_ai_payload = {
            "points": ["Testing work was discussed."],
            "actions": [
                {"title": "Work", "owner": "ANU", "status": "active"},
            ],
        }

        with patch("backend.app.extract_actions_with_ai", return_value=fake_ai_payload):
            status, extracted = self.client.request(
                "POST",
                f"/api/projects/{project_id}/extract-actions",
                {"notes": "ANU HAS TO WORK ON TESTING", "source": "meeting"},
            )

        self.assertEqual(status, 200)
        self.assertEqual(extracted["actions"][0]["title"], "Work on testing")
        self.assertIsNone(extracted["actions"][0]["owner"])

    def test_ai_extraction_falls_back_for_simple_assignment(self) -> None:
        status, created = self.client.request(
            "POST",
            "/api/projects",
            {"name": "Fallback Test", "classification": "Work", "roleDetails": {"developers": "AA"}},
        )
        self.assertEqual(status, 201)
        project_id = created["project"]["id"]

        with patch("backend.app.extract_actions_with_ai", return_value={"points": [], "actions": []}):
            status, extracted = self.client.request(
                "POST",
                f"/api/projects/{project_id}/extract-actions",
                {"meetingDate": "2026-05-29", "notes": "AA need to complete UI by today", "source": "meeting"},
            )

        self.assertEqual(status, 200)
        self.assertEqual(extracted["actions"][0]["title"], "Complete UI")
        self.assertEqual(extracted["actions"][0]["owner"], "AA")
        self.assertEqual(extracted["actions"][0]["meetingDate"], "2026-05-29")
        self.assertEqual(extracted["actions"][0]["completionDate"], date.today().isoformat())

    def test_ai_extraction_uses_hashtag_as_action_tag(self) -> None:
        status, created = self.client.request(
            "POST",
            "/api/projects",
            {"name": "Tagged Extraction", "classification": "Work", "roleDetails": {"developers": "AA"}},
        )
        self.assertEqual(status, 201)
        project_id = created["project"]["id"]

        with patch("backend.app.extract_actions_with_ai", return_value={"points": [], "actions": []}):
            status, extracted = self.client.request(
                "POST",
                f"/api/projects/{project_id}/extract-actions",
                {
                    "meetingDate": "2026-05-29",
                    "notes": "Next steps:\nTag: #redwood\nAA: Complete UI #frontend",
                    "source": "meeting",
                },
            )

        self.assertEqual(status, 200)
        self.assertEqual(extracted["actions"][0]["title"], "Complete UI")
        self.assertEqual(extracted["actions"][0]["tag"], "frontend")

    def test_ai_extraction_preview_can_be_confirmed_and_bulk_deleted(self) -> None:
        status, created = self.client.request(
            "POST",
            "/api/projects",
            {"name": "Review Before Add", "classification": "Work", "roleDetails": {"developers": "AA"}},
        )
        self.assertEqual(status, 201)
        project_id = created["project"]["id"]

        with patch("backend.app.extract_actions_with_ai", return_value={"points": [], "actions": []}):
            status, preview = self.client.request(
                "POST",
                f"/api/projects/{project_id}/extract-actions",
                {
                    "meetingDate": "2026-05-29",
                    "notes": "AA need to complete UI by today",
                    "previewOnly": True,
                    "source": "meeting",
                },
            )

        self.assertEqual(status, 200)
        self.assertTrue(preview["previewOnly"])
        self.assertNotIn("id", preview["actions"][0])
        self.assertEqual(preview["actions"][0]["projectId"], project_id)
        self.assertEqual(preview["actions"][0]["meetingDate"], "2026-05-29")

        status, dashboard = self.client.request("GET", f"/api/projects/{project_id}/dashboard")
        self.assertEqual(status, 200)
        self.assertEqual(dashboard["actions"], [])

        preview["actions"][0]["title"] = "Complete polished UI"
        status, confirmed = self.client.request("POST", "/api/actions/bulk", {"actions": preview["actions"]})
        self.assertEqual(status, 201)
        self.assertEqual(confirmed["actions"][0]["title"], "Complete polished UI")
        self.assertEqual(confirmed["actions"][0]["meetingDate"], "2026-05-29")

        action_id = confirmed["actions"][0]["id"]
        status, deleted = self.client.request("POST", "/api/actions/bulk-delete", {"ids": [action_id]})
        self.assertEqual(status, 200)
        self.assertEqual([action["id"] for action in deleted["deletedActions"]], [action_id])

        status, dashboard = self.client.request("GET", f"/api/projects/{project_id}/dashboard")
        self.assertEqual(status, 200)
        self.assertEqual(dashboard["actions"], [])

    def test_ai_extraction_preview_falls_back_for_next_action_owner_line(self) -> None:
        status, created = self.client.request(
            "POST",
            "/api/projects",
            {"name": "Next Action Test", "classification": "Work", "roleDetails": {"developers": "Parul"}},
        )
        self.assertEqual(status, 201)
        project_id = created["project"]["id"]

        with patch("backend.app.extract_actions_with_ai", return_value={"points": [], "actions": []}):
            status, preview = self.client.request(
                "POST",
                f"/api/projects/{project_id}/extract-actions",
                {
                    "notes": "Next Action\nParul: Add updated UI.",
                    "previewOnly": True,
                    "source": "meeting",
                },
            )

        self.assertEqual(status, 200)
        self.assertTrue(preview["previewOnly"])
        self.assertEqual(len(preview["actions"]), 1)
        self.assertEqual(preview["actions"][0]["title"], "Add updated UI")
        self.assertEqual(preview["actions"][0]["owner"], "Parul")
        self.assertNotIn("id", preview["actions"][0])

        status, dashboard = self.client.request("GET", f"/api/projects/{project_id}/dashboard")
        self.assertEqual(status, 200)
        self.assertEqual(dashboard["actions"], [])

    def test_ai_extraction_falls_back_for_next_steps_owner_lines(self) -> None:
        status, created = self.client.request(
            "POST",
            "/api/projects",
            {
                "name": "Structured Notes Test",
                "classification": "Work",
                "roleDetails": {"developers": "Sreenath, Surya, Kriti, Umesha"},
            },
        )
        self.assertEqual(status, 201)
        project_id = created["project"]["id"]
        notes = """
        Meeting summary

        Next steps

        Sreenath: Integrate the current primitive supervisor agent with actual agents and test the flow; plan to demo the updated flow in the next call.
        Surya: Loop Sreenath in with Shilpa, Sudhar, Madhou (QA), and Melissa regarding the environment where products, catalog, and category are indexed; keep Pratima and Rajneet in the loop and fast track environment setup.
        Kriti: Continue investigating APIs to retrieve complete conversation history for gap analysis; highlight any gaps to the OCI team.
        Surya: Clean up and share the memory layer code (and related recordings) by tonight or tomorrow morning with the team.
        Umesha: Update the data flow diagram and share with the relevant team.

        Summary
        The team discussed semantic search and memory layer progress.
        """

        with patch("backend.app.extract_actions_with_ai", return_value={"points": [], "actions": []}):
            status, extracted = self.client.request(
                "POST",
                f"/api/projects/{project_id}/extract-actions",
                {"notes": notes, "source": "meeting"},
            )

        self.assertEqual(status, 200)
        actions_by_title = {action["title"]: action for action in extracted["actions"]}
        self.assertIn("Integrate the current primitive supervisor agent with actual agents and test the flow", actions_by_title)
        self.assertIn("Plan to demo the updated flow in the next call", actions_by_title)
        self.assertIn("Continue investigating APIs to retrieve complete conversation history for gap analysis", actions_by_title)
        self.assertIn("Highlight any gaps to the OCI team", actions_by_title)
        self.assertIn("Keep Pratima and Rajneet in the loop and fast track environment setup", actions_by_title)
        self.assertEqual(
            actions_by_title["Integrate the current primitive supervisor agent with actual agents and test the flow"]["owner"],
            "Sreenath",
        )
        self.assertEqual(actions_by_title["Highlight any gaps to the OCI team"]["owner"], "Kriti")
        self.assertEqual(
            actions_by_title["Clean up and share the memory layer code (and related recordings)"]["completionDate"],
            (date.today() + timedelta(days=1)).isoformat(),
        )

    def test_ai_extraction_falls_back_for_next_steps_owner_heading_blocks(self) -> None:
        status, created = self.client.request(
            "POST",
            "/api/projects",
            {
                "name": "Owner Heading Notes Test",
                "classification": "Work",
                "roleDetails": {"developers": "Govindraja, Kriti, Lalit, Mamatha, Rajani, Rakesh, Umesha"},
            },
        )
        self.assertEqual(status, 201)
        project_id = created["project"]["id"]
        notes = """
        Next steps

        Govindraja

        Coordinate with Vivek and Kunal to get updates on what UX/chat features are available in drop 1 and drop 2, and clarify requirements/timelines; set up a 30-minute call if needed to close out open questions by tomorrow
        Talk to Shweta to clarify the status of UX requirement discussions with Kunal and ensure all relevant team members are kept in the loop
        Fast-track coordination with Kunal/Vivek and PMs to provide required use case details and get updated timelines/plans from the UX team

        Kriti

        Assess feasibility of implementing required capabilities using Open Integration, and report back on doability and effort

        Lalit

        Review the line graph files received and provide feedback by today evening or tomorrow morning; coordinate a quick sync-up if needed

        Mamatha

        Follow up with Pallavi to confirm if the edit functionality in the application view can be implemented as per Figma, and await PM feedback

        Rajani

        Check with Wasu and Mansi to understand their evaluation matrix and test strategy for AI prompts, and share relevant Confluence pages with the team
        Review the referenced conference page and dev assistant test strategy, and prepare a proposal for AI test evaluation metrics relevant to the telco use case

        Rakesh

        Set up a call with Ganesh to review and finalize use cases and requirements for June scope, especially around add item, delete, reconfigure, and required API support
        Review Umesha's proposal for LOV handling and evaluate dependencies and implementation feasibility
        Include in the requirements list for Kunal's team the need to ensure the new chat component aligns with Redwood theme and Figma design
        Link and update the Confluence page with the current status of requirements, marking items as available/not available and updating priority/move-by dates
        Record the outcome of the call with Ganesh and share with Lalit if Lalit is unable to attend

        Umesha

        Update the data flow diagram and share with the relevant team
        Provide proposal for LOV handling, including possibility of building a separate LOV tool/API and integrating with LLM, and share with Rakesh
        """

        with patch("backend.app.extract_actions_with_ai", return_value={"points": [], "actions": []}):
            status, extracted = self.client.request(
                "POST",
                f"/api/projects/{project_id}/extract-actions",
                {"notes": notes, "source": "meeting"},
            )

        self.assertEqual(status, 200)
        actions_by_title = {action["title"]: action for action in extracted["actions"]}
        self.assertEqual(len(extracted["actions"]), 17)
        self.assertEqual(
            actions_by_title[
                "Coordinate with Vivek and Kunal to get updates on what UX/chat features are available in drop 1 and drop 2, and clarify requirements/timelines"
            ]["owner"],
            "Govindraja",
        )
        self.assertEqual(actions_by_title["Set up a 30-minute call if needed to close out open questions"]["owner"], "Govindraja")
        self.assertEqual(
            actions_by_title["Set up a 30-minute call if needed to close out open questions"]["completionDate"],
            (date.today() + timedelta(days=1)).isoformat(),
        )
        self.assertEqual(
            actions_by_title["Assess feasibility of implementing required capabilities using Open Integration, and report back on doability and effort"]["owner"],
            "Kriti",
        )
        self.assertEqual(actions_by_title["Coordinate a quick sync-up if needed"]["owner"], "Lalit")
        self.assertEqual(actions_by_title["Update the data flow diagram and share with the relevant team"]["owner"], "Umesha")
        self.assertEqual(
            actions_by_title["Provide proposal for LOV handling, including possibility of building a separate LOV tool/API and integrating with LLM, and share with Rakesh"]["owner"],
            "Umesha",
        )

    def test_ai_extraction_handles_collapsed_next_steps_text(self) -> None:
        status, created = self.client.request(
            "POST",
            "/api/projects",
            {
                "name": "Collapsed Notes Test",
                "classification": "Work",
                "roleDetails": {"developers": "Sreenath, Surya, Kriti, Umesha"},
            },
        )
        self.assertEqual(status, 201)
        project_id = created["project"]["id"]
        notes = (
            "Meeting summary Quick recap Umesha provided updates on account creation, noting some "
            "inconsistencies with repeated requests that need to be addressed. Next steps "
            "Sreenath: Integrate the current primitive supervisor agent with actual agents and test the flow; "
            "plan to demo the updated flow in the next call. "
            "Surya: Clean up and share the memory layer code (and related recordings) by tonight or tomorrow morning with the team. "
            "Kriti: Continue investigating APIs to retrieve complete conversation history for gap analysis; "
            "highlight any gaps to the OCI team. "
            "Umesha: Tighten the account creation script to ensure consistent behavior on repeated account creation requests "
            "and resolve session-related issues; then move on to update case of entities. "
            "Summary Recommendation System and Context Updates Sreenath provided updates."
        )
        fake_ai_payload = {
            "points": ["Weak extraction."],
            "actions": [{"title": "Be addressed", "owner": "Umesha", "status": "active"}],
        }

        with patch("backend.app.extract_actions_with_ai", return_value=fake_ai_payload):
            status, extracted = self.client.request(
                "POST",
                f"/api/projects/{project_id}/extract-actions",
                {"notes": notes, "source": "meeting"},
            )

        self.assertEqual(status, 200)
        titles = [action["title"] for action in extracted["actions"]]
        self.assertNotIn("Be addressed", titles)
        self.assertIn("Integrate the current primitive supervisor agent with actual agents and test the flow", titles)
        self.assertIn("Plan to demo the updated flow in the next call", titles)
        self.assertIn("Continue investigating APIs to retrieve complete conversation history for gap analysis", titles)
        self.assertIn("Highlight any gaps to the OCI team", titles)
        self.assertIn("Move on to update case of entities", titles)

    def test_ai_extraction_supplements_weak_ai_with_next_steps(self) -> None:
        status, created = self.client.request(
            "POST",
            "/api/projects",
            {"name": "Weak AI Test", "classification": "Work", "roleDetails": {"developers": "Sreenath, Kriti"}},
        )
        self.assertEqual(status, 201)
        project_id = created["project"]["id"]
        notes = """
        Next steps
        Sreenath: Integrate the supervisor agent with actual agents; plan the next demo.
        Kriti: Continue investigating APIs for conversation history.
        """
        fake_ai_payload = {
            "points": ["AI extracted action items from these notes."],
            "actions": [{"title": "Action items", "owner": None, "status": "active"}],
        }

        with patch("backend.app.extract_actions_with_ai", return_value=fake_ai_payload):
            status, extracted = self.client.request(
                "POST",
                f"/api/projects/{project_id}/extract-actions",
                {"notes": notes, "source": "meeting"},
            )

        self.assertEqual(status, 200)
        titles = [action["title"] for action in extracted["actions"]]
        self.assertIn("Integrate the supervisor agent with actual agents", titles)
        self.assertIn("Plan the next demo", titles)
        self.assertIn("Continue investigating APIs for conversation history", titles)

    def test_ai_extraction_requires_oci_config(self) -> None:
        missing_config_path = Path(self.tempdir.name) / "missing-project-pulse.config.json"
        with patch.dict(os.environ, {"PROJECT_PULSE_CONFIG_PATH": str(missing_config_path)}, clear=True):
            status, payload = self.client.request(
                "POST",
                "/api/projects/1/extract-actions",
                {"notes": "Asha will send notes.", "source": "meeting"},
            )

        self.assertEqual(status, 503)
        self.assertIn("OCI AI extraction is not configured", payload["error"])
        self.assertIn("OCI_GENAI_COMPARTMENT_ID", payload["error"])
        self.assertIn("OCI_GENAI_SERVICE_ENDPOINT", payload["error"])

    def test_ai_settings_read_config_file(self) -> None:
        config_path = Path(self.tempdir.name) / "project-pulse.config.json"
        config_path.write_text(
            json.dumps(
                {
                    "oci": {
                        "compartmentId": "ocid1.compartment.oc1..test",
                        "serviceEndpoint": "https://inference.generativeai.us-chicago-1.oci.oraclecloud.com",
                        "modelId": "meta.llama-3.3-70b-instruct",
                        "authType": "API_KEY",
                        "authProfile": "LOCAL",
                    }
                }
            ),
            encoding="utf-8",
        )

        with patch.dict(os.environ, {"PROJECT_PULSE_CONFIG_PATH": str(config_path)}, clear=True):
            settings = configured_ai_settings()

        self.assertEqual(settings["compartment_id"], "ocid1.compartment.oc1..test")
        self.assertEqual(settings["service_endpoint"], "https://inference.generativeai.us-chicago-1.oci.oraclecloud.com")
        self.assertEqual(settings["model_id"], "meta.llama-3.3-70b-instruct")
        self.assertEqual(settings["auth_type"], "API_KEY")
        self.assertEqual(settings["auth_profile"], "LOCAL")

    def test_ai_json_parser_accepts_wrapped_json(self) -> None:
        payload = parse_ai_json(
            """
            Here is the extraction:

            ```json
            {
              "points": ["Launch plan reviewed."],
              "actions": [{"title": "Send notes", "owner": null, "status": "active"}]
            }
            ```
            """
        )

        self.assertEqual(payload["points"], ["Launch plan reviewed."])
        self.assertEqual(payload["actions"][0]["title"], "Send notes")

    def test_ai_payload_normalizes_common_action_keys(self) -> None:
        payload = normalize_ai_payload({
            "importantPoints": ["Launch plan reviewed."],
            "actionItems": [{"title": "Send notes", "owner": None, "status": "active"}],
        })

        self.assertEqual(payload["points"], ["Launch plan reviewed."])
        self.assertEqual(payload["actions"][0]["title"], "Send notes")


if __name__ == "__main__":
    unittest.main()
