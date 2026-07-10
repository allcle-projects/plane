# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
"""
Shared helpers for the cloud -> self-host Plane migration scripts.

stdlib only (urllib, json, os, argparse, subprocess) so it runs on the
server3 system python3 with no pip installs.

Two Plane deployments are involved, both on workspace slug "motemote":

  CLOUD (source, read-only for us):
    base    https://api.plane.so/api/v1
    auth    X-API-Key: <cloud token>   (+ User-Agent header, REQUIRED or 403)
    token   env PLANE_API_TOKEN, else /srv/shared/app-src/task-bot/.env

  SELF-HOST (destination, WRITES gated behind --execute):
    base    https://plane.motemote.co.kr/api/v1
    auth    X-API-Key: <self-host token>
    token   env SELFHOST_API_TOKEN  (minted on the weekend, see 01_mint_selfhost_token.py)

Nothing here writes on import. Write-capable callers must pass execute=True
explicitly; every write path in the migration scripts defaults to dry-run.
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

WORKSPACE_SLUG = "motemote"

CLOUD_BASE = "https://api.plane.so/api/v1"
SELFHOST_BASE = "https://plane.motemote.co.kr/api/v1"

# A User-Agent is mandatory against app.plane.so (cloud 403s without it).
USER_AGENT = "mote-migration/1.0 (+https://plane.motemote.co.kr)"

# Cloud token fallback location on server3.
TASKBOT_ENV = "/srv/shared/app-src/task-bot/.env"

# Self-host-native projects that DO NOT exist in cloud. Never write to these.
# TEST also has more rows on self-host than cloud, so it is excluded too.
EXCLUDE_IDENTIFIERS = {"PLANE", "IDEA", "MOTEM", "TEST"}


# --------------------------------------------------------------------------- #
# Token loading
# --------------------------------------------------------------------------- #
def _read_env_file(path, key):
    """Return value of KEY=... from a dotenv-style file, or None."""
    try:
        with open(path, "r", encoding="utf-8") as handle:
            for raw in handle:
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                name, _, value = line.partition("=")
                if name.strip() == key:
                    return value.strip().strip('"').strip("'")
    except OSError:
        return None
    return None


def load_cloud_token():
    """Cloud token from env PLANE_API_TOKEN, else task-bot/.env."""
    token = os.environ.get("PLANE_API_TOKEN")
    if token:
        return token.strip()
    token = _read_env_file(TASKBOT_ENV, "PLANE_API_TOKEN")
    if token:
        return token
    raise SystemExit(
        "ERROR: cloud token not found. Set PLANE_API_TOKEN or ensure "
        f"{TASKBOT_ENV} has PLANE_API_TOKEN=..."
    )


def load_selfhost_token():
    """Self-host token from env SELFHOST_API_TOKEN only (never hardcoded)."""
    token = os.environ.get("SELFHOST_API_TOKEN")
    if token:
        return token.strip()
    raise SystemExit(
        "ERROR: SELFHOST_API_TOKEN is not set. Mint one first "
        "(see 01_mint_selfhost_token.py) and export it before running writes."
    )


# --------------------------------------------------------------------------- #
# HTTP client
# --------------------------------------------------------------------------- #
class PlaneError(Exception):
    def __init__(self, status, body, url):
        self.status = status
        self.body = body
        self.url = url
        super().__init__(f"HTTP {status} on {url}: {body[:300]}")


class PlaneClient:
    """Minimal Plane REST client (stdlib urllib).

    Workspace-scoped: paths passed to the helpers are relative to
    /workspaces/<slug>/  e.g. client.get("projects/") ->
    <base>/workspaces/motemote/projects/
    """

    def __init__(self, base_url, token, label, user_agent=USER_AGENT, timeout=60):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.label = label  # "cloud" | "selfhost" (for logs)
        self.user_agent = user_agent
        self.timeout = timeout

    # -- URL building ------------------------------------------------------- #
    def ws_url(self, path, params=None):
        path = path.lstrip("/")
        url = f"{self.base_url}/workspaces/{WORKSPACE_SLUG}/{path}"
        if params:
            url = f"{url}?{urllib.parse.urlencode(params)}"
        return url

    # -- low level ---------------------------------------------------------- #
    def _request(self, method, url, payload=None):
        data = None
        headers = {
            "X-API-Key": self.token,
            "User-Agent": self.user_agent,
            "Accept": "application/json",
        }
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                body = resp.read().decode("utf-8")
                return resp.status, body
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            return exc.code, body
        except urllib.error.URLError as exc:
            raise PlaneError(0, str(exc.reason), url)

    def get_raw(self, path, params=None):
        """GET returning (status, parsed_json_or_text)."""
        url = self.ws_url(path, params)
        status, body = self._request("GET", url)
        parsed = _maybe_json(body)
        return status, parsed

    def get(self, path, params=None):
        status, parsed = self.get_raw(path, params)
        if status >= 400:
            raise PlaneError(status, json.dumps(parsed) if isinstance(parsed, (dict, list)) else str(parsed), self.ws_url(path, params))
        return parsed

    def get_paginated(self, path, params=None, page_size=100):
        """Yield every item across cursor pages.

        Plane list endpoints wrap results as:
          {"results": [...], "next_cursor": "...", "next_page_results": bool}
        A non-paginated endpoint may return a bare list; handle both.
        """
        params = dict(params or {})
        params.setdefault("per_page", page_size)
        cursor = None
        while True:
            call_params = dict(params)
            if cursor:
                call_params["cursor"] = cursor
            data = self.get(path, call_params)
            if isinstance(data, list):
                for item in data:
                    yield item
                return
            for item in data.get("results", []):
                yield item
            if not data.get("next_page_results"):
                return
            cursor = data.get("next_cursor")
            if not cursor:
                return

    def post(self, path, payload):
        """POST returning (status, parsed). Never raises on 409 (dedup)."""
        url = self.ws_url(path)
        status, body = self._request("POST", url, payload)
        return status, _maybe_json(body)

    def patch(self, path, payload):
        """PATCH returning (status, parsed)."""
        url = self.ws_url(path)
        status, body = self._request("PATCH", url, payload)
        return status, _maybe_json(body)

    def download(self, path):
        """GET a workspace path following redirects, returning raw bytes.

        Used for attachment downloads: the endpoint 302-redirects to a
        presigned S3 URL which urllib follows automatically.
        """
        url = self.ws_url(path)
        req = urllib.request.Request(
            url,
            headers={"X-API-Key": self.token, "User-Agent": self.user_agent},
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            return resp.status, resp.read()


def _maybe_json(body):
    if not body:
        return {}
    try:
        return json.loads(body)
    except (ValueError, TypeError):
        return body


# --------------------------------------------------------------------------- #
# Client factories
# --------------------------------------------------------------------------- #
def cloud_client():
    return PlaneClient(CLOUD_BASE, load_cloud_token(), "cloud")


def selfhost_client(require_token=True):
    if not require_token:
        # For read-only preflight paths that only touch cloud/DB.
        token = os.environ.get("SELFHOST_API_TOKEN", "")
        return PlaneClient(SELFHOST_BASE, token, "selfhost")
    return PlaneClient(SELFHOST_BASE, load_selfhost_token(), "selfhost")


# --------------------------------------------------------------------------- #
# Mapping helpers
# --------------------------------------------------------------------------- #
def index_by(items, key):
    """Return {item[key]: item} skipping items missing the key."""
    out = {}
    for item in items:
        value = item.get(key)
        if value is not None:
            out[value] = item
    return out


def selfhost_projects(sh):
    """{identifier(upper): project_dict} for in-scope self-host projects."""
    out = {}
    for proj in sh.get_paginated("projects/"):
        ident = (proj.get("identifier") or "").upper()
        if ident:
            out[ident] = proj
    return out


def cloud_projects(cloud):
    """{identifier(upper): project_dict} for cloud, EXCLUDE set removed."""
    out = {}
    for proj in cloud.get_paginated("projects/"):
        ident = (proj.get("identifier") or "").upper()
        if not ident or ident in EXCLUDE_IDENTIFIERS:
            continue
        out[ident] = proj
    return out


def state_name_map(client, project_id):
    """{state_name.lower(): state_id} for a project."""
    out = {}
    for state in client.get_paginated(f"projects/{project_id}/states/"):
        name = (state.get("name") or "").strip().lower()
        if name:
            out[name] = state["id"]
    return out


def label_maps(client, project_id):
    """Return ({name.lower(): label_id}, {external_id: label_id})."""
    by_name, by_external = {}, {}
    for label in client.get_paginated(f"projects/{project_id}/labels/"):
        name = (label.get("name") or "").strip().lower()
        if name:
            by_name[name] = label["id"]
        ext = label.get("external_id")
        if ext:
            by_external[ext] = label["id"]
    return by_name, by_external


def member_email_map(client):
    """{email.lower(): user_id} from workspace members (needs admin token)."""
    out = {}
    for member in client.get_paginated("members/"):
        email = (member.get("email") or "").strip().lower()
        if email:
            out[email] = member.get("id")
    return out


# --------------------------------------------------------------------------- #
# argparse base
# --------------------------------------------------------------------------- #
def base_parser(description):
    """Parser with the shared --execute / --dry-run / --project flags.

    Default is DRY-RUN. --execute is required to perform any write.
    """
    parser = argparse.ArgumentParser(description=description)
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--execute",
        action="store_true",
        help="Actually perform writes (POST). Without this the script is dry-run.",
    )
    group.add_argument(
        "--dry-run",
        action="store_true",
        help="Explicit dry-run (default behaviour; no writes).",
    )
    parser.add_argument(
        "--project",
        action="append",
        default=None,
        metavar="IDENTIFIER",
        help="Limit to these project identifiers (repeatable). Default: all in-scope.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Cap items processed per project (0 = no cap). Handy for smoke tests.",
    )
    return parser


def resolve_execute(args):
    """True only when --execute was passed."""
    return bool(getattr(args, "execute", False))


def project_filter(args):
    """Uppercased set of requested identifiers, or None for all in-scope."""
    if not getattr(args, "project", None):
        return None
    return {p.upper() for p in args.project}


def mode_banner(execute):
    tag = "EXECUTE (writes enabled)" if execute else "DRY-RUN (no writes)"
    line = "=" * 60
    print(f"{line}\nMODE: {tag}\n{line}")


def log(msg):
    sys.stdout.write(msg + "\n")
    sys.stdout.flush()


def backoff_sleep(attempt):
    time.sleep(min(2 ** attempt, 8))


# --------------------------------------------------------------------------- #
# Self-host DB read-only helpers (verify / preflight)
# --------------------------------------------------------------------------- #
# These shell out to psql inside the plane db container. They are READ-ONLY:
# only SELECT queries are ever sent. POSTGRES_PASSWORD is sourced from
# plane.env at call time (never hardcoded, never printed).
import subprocess  # noqa: E402  (kept local to this section)

PLANE_ENV = "/srv/shared/stack/plane-server3/plane.env"
DB_CONTAINER = "plane-plane-db-1"


def _db_prefix():
    """Command prefix. If we are already on server3, exec directly;
    otherwise wrap through `ssh server3`."""
    on_server3 = os.path.exists(PLANE_ENV)
    if on_server3:
        return []
    return ["ssh", "server3"]


def db_query(sql):
    """Run a read-only SELECT inside the plane db container.

    Returns a list of rows, each row a list of column strings.
    Raises RuntimeError on failure.
    """
    if ";" in sql.rstrip().rstrip(";"):
        raise ValueError("db_query accepts a single SELECT statement only")
    if not sql.lstrip().lower().startswith(("select", "with")):
        raise ValueError("db_query is read-only; only SELECT/WITH allowed")

    # -A unaligned, -t tuples-only, -F $'\t' tab separated.
    remote = (
        f'set -a; . {PLANE_ENV}; set +a; '
        f'docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" {DB_CONTAINER} '
        f"psql -U plane -d plane -h 127.0.0.1 -At -F $'\\t' -c {shell_quote(sql)}"
    )
    cmd = _db_prefix() + ["bash", "-lc", remote]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"DB query failed: {proc.stderr.strip()}")
    rows = []
    for line in proc.stdout.splitlines():
        if line == "":
            continue
        rows.append(line.split("\t"))
    return rows


def shell_quote(value):
    """POSIX single-quote a string for safe embedding in a bash -c command."""
    return "'" + value.replace("'", "'\"'\"'") + "'"


def selfhost_seq_set(identifier):
    """Set of sequence_id ints present on self-host for a project identifier.

    Uses the live projects/issues tables (external_id independent) so it works
    whether or not the migration ran. Excludes soft-deleted rows.
    """
    ident = identifier.upper().replace("'", "")
    sql = (
        "SELECT i.sequence_id FROM issues i "
        "JOIN projects p ON p.id = i.project_id "
        f"WHERE upper(p.identifier) = '{ident}' AND i.deleted_at IS NULL"
    )
    return {int(r[0]) for r in db_query(sql) if r and r[0]}


def selfhost_external_ids(identifier):
    """Set of external_id values (cloud UUIDs) already imported for a project."""
    ident = identifier.upper().replace("'", "")
    sql = (
        "SELECT i.external_id FROM issues i "
        "JOIN projects p ON p.id = i.project_id "
        f"WHERE upper(p.identifier) = '{ident}' AND i.deleted_at IS NULL "
        "AND i.external_id IS NOT NULL"
    )
    return {r[0] for r in db_query(sql) if r and r[0]}
