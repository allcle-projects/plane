#!/usr/bin/env python3
# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.
"""
01 - Mint a self-host Plane API token for the weekend migration.

This script does NOT create anything. It PRINTS the exact command you run on
server3 to mint an APIToken, then how to export it. Minting is a self-host
write, so you (otro) run it by hand on the weekend.

Why a shell snippet and not a management command:
  The fork ships no `create_api_token` management command
  (checked apps/api/plane/db/management/commands/*). The APIToken model
  (apps/api/plane/db/models/api.py) auto-generates the token value:
      token = "plane_api_" + uuid4().hex
  so creating one row is all that is needed. Auth is header X-Api-Key,
  matched against APIToken.token where is_active=True and not expired.

IMPORTANT: the migration user MUST be a workspace ADMIN of "motemote" —
  * WorkspaceMemberAPIEndpoint (members list) requires WorkSpaceAdminPermission
  * issue/label/page writes require project membership with a writing role
Pick a user that is already an admin/owner of the motemote workspace.

Usage:
    python3 01_mint_selfhost_token.py --email you@motemote.com
    (prints commands; run them yourself)
"""

import argparse


def build_shell_snippet(email):
    # Runs inside the api container's Django shell via `manage.py shell -c`.
    # Each line is ONE complete statement on a single physical line so the
    # "; ".join() in main() produces valid Python (no wrapped calls).
    lines = [
        "from plane.db.models import User, Workspace, APIToken",
        f'u = User.objects.get(email="{email}")',
        'ws = Workspace.objects.get(slug="motemote")',
        'd = dict(description="Weekend cloud->self-host data migration (delta pull)", is_active=True, user_type=1)',
        'tok, created = APIToken.objects.get_or_create(user=u, workspace=ws, label="cloud-migration", defaults=d)',
        'print("CREATED" if created else "REUSED_EXISTING")',
        "print(tok.token)",
    ]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--email",
        required=True,
        help="Email of an existing motemote workspace ADMIN to own the token.",
    )
    args = parser.parse_args()

    snippet = build_shell_snippet(args.email)
    # Compress to a one-liner for `manage.py shell -c`.
    one_liner = "; ".join(
        line for line in snippet.splitlines() if line.strip()
    )

    print("=" * 72)
    print("STEP 1 - mint the token ON server3 (self-host WRITE - run by hand):")
    print("=" * 72)
    print()
    print("ssh server3")
    print(
        "docker exec -i plane-api-1 python manage.py shell -c "
        + repr(one_liner)
    )
    print()
    print("The command prints two lines: CREATED/REUSED_EXISTING, then the token")
    print('(starts with "plane_api_").')
    print()
    print("=" * 72)
    print("STEP 2 - export it for the migration scripts (same shell session):")
    print("=" * 72)
    print()
    print("export SELFHOST_API_TOKEN='plane_api_xxxxxxxxxxxxxxxx'")
    print()
    print("Verify it works (read-only GET):")
    print("  python3 00_preflight.py")
    print()
    print("=" * 72)
    print("ROLLBACK - revoke the token after the migration:")
    print("=" * 72)
    print()
    revoke = (
        'from plane.db.models import APIToken; '
        'APIToken.objects.filter(label="cloud-migration").update(is_active=False)'
    )
    print(
        "docker exec -i plane-api-1 python manage.py shell -c "
        + repr(revoke)
    )
    print()
    print("NOTE: this script only PRINTED commands. Nothing was created.")


if __name__ == "__main__":
    main()
