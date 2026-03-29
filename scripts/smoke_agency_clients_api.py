#!/usr/bin/env python3
"""
Smoke-test agency client APIs against a running API gateway (default http://127.0.0.1:8000).

Requires credentials (no secrets committed):
  set SMOKE_EMAIL and SMOKE_PASSWORD
or:
  python scripts/smoke_agency_clients_api.py --email you@x.com --password '...' --agency-id 5

Exercises:
  POST /auth/login
  GET  /agency/{id}/clients
  GET  /agency/{id}/clients/hierarchy?period=7d
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

try:
    import urllib.error
    import urllib.request
except ImportError:
    sys.exit("Python 3 required")


def _post_json(url: str, body: dict) -> tuple[int, dict | list | None]:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            parsed = {"raw": raw[:500]}
        return e.code, parsed


def _get(url: str, token: str, agency_id: str) -> tuple[int, dict | list | None]:
    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {token}",
            "X-Agency-ID": agency_id,
            "Accept": "application/json",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            parsed = {"raw": raw[:500]}
        return e.code, parsed


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--base", default=os.getenv("API_BASE", "http://127.0.0.1:8000"))
    p.add_argument("--email", default=os.getenv("SMOKE_EMAIL", ""))
    p.add_argument("--password", default=os.getenv("SMOKE_PASSWORD", ""))
    p.add_argument("--agency-id", default=os.getenv("SMOKE_AGENCY_ID", "5"))
    args = p.parse_args()

    base = args.base.rstrip("/")
    email = args.email.strip()
    password = args.password
    agency_id = str(args.agency_id).strip()

    if not email or not password:
        print(
            "Set SMOKE_EMAIL and SMOKE_PASSWORD or pass --email / --password.\n"
            "Example:\n"
            "  set SMOKE_EMAIL=you@example.com\n"
            "  set SMOKE_PASSWORD=yourpassword\n"
            f"  python {Path(__file__).name} --agency-id 5",
            file=sys.stderr,
        )
        return 2

    print(f"[1] POST {base}/auth/login …")
    code, login_body = _post_json(
        f"{base}/auth/login",
        {"email": email, "password": password},
    )
    if code != 200 or not isinstance(login_body, dict):
        print(f"    FAIL HTTP {code}: {login_body}")
        return 1
    token = login_body.get("access_token")
    if not token:
        print(f"    FAIL no access_token: {login_body}")
        return 1
    print("    OK token received")

    print(f"[2] GET {base}/agency/{agency_id}/clients …")
    c_code, clients = _get(f"{base}/agency/{agency_id}/clients", token, agency_id)
    if c_code != 200:
        print(f"    FAIL HTTP {c_code}: {clients}")
        return 1
    n = len(clients) if isinstance(clients, list) else 0
    print(f"    OK {n} client(s)")
    if isinstance(clients, list) and clients:
        first = clients[0]
        mp = first.get("markup_percent")
        print(f"    sample[0] id={first.get('id')} name={first.get('name')!r} markup_percent={mp!r}")

    print(f"[3] GET {base}/agency/{agency_id}/clients/hierarchy?period=7d …")
    h_code, hier = _get(
        f"{base}/agency/{agency_id}/clients/hierarchy?period=7d",
        token,
        agency_id,
    )
    if h_code != 200:
        print(f"    FAIL HTTP {h_code}: {hier}")
        return 1
    if not isinstance(hier, dict):
        print(f"    FAIL unexpected body: {type(hier)}")
        return 1
    cc = hier.get("counts") or {}
    print(
        f"    OK period={hier.get('period')!r} clients={cc.get('clients')} "
        f"platforms={cc.get('platforms')} campaigns={cc.get('campaigns')}"
    )

    print("\nAll checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
