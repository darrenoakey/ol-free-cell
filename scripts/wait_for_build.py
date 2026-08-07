#!/usr/bin/env python3
"""Wait for one uploaded FreeCell build to finish App Store processing."""

import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import jwt

BUNDLE_ID = "com.darrenoakey.olFreeCell"
CONFIG_PATH = Path.home() / ".appstoreconnect" / "api_key.json"
BASE_URL = "https://api.appstoreconnect.apple.com"
POLL_SECONDS = 30
TIMEOUT_SECONDS = 60 * 60
MAX_CONSECUTIVE_ERRORS = 10


def api_config() -> dict[str, str]:
    return json.loads(CONFIG_PATH.read_text())


def token() -> str:
    config = api_config()
    now = int(time.time())
    encoded = jwt.encode(
        {
            "iss": config["issuer_id"],
            "iat": now,
            "exp": now + 20 * 60,
            "aud": "appstoreconnect-v1",
        },
        config["key"],
        algorithm="ES256",
        headers={"kid": config["key_id"]},
    )
    return encoded.decode() if isinstance(encoded, bytes) else encoded


def get(path: str) -> dict:
    request = urllib.request.Request(
        BASE_URL + path,
        headers={"Authorization": f"Bearer {token()}"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def find_build(app_id: str, target: str) -> dict | None:
    builds = get(
        f"/v1/builds?filter[app]={app_id}&filter[version]={target}&limit=1"
        "&fields[builds]=version,uploadedDate,processingState,expired"
    ).get("data")
    return builds[0] if builds else None


def main() -> int:
    if len(sys.argv) != 2 or not sys.argv[1].strip():
        print("usage: wait_for_build.py <build-version>", file=sys.stderr)
        return 2

    target = sys.argv[1].strip()
    apps = get(f"/v1/apps?filter[bundleId]={BUNDLE_ID}").get("data") or []
    if not apps:
        print(f"No app record for {BUNDLE_ID}", file=sys.stderr)
        return 1

    app_id = apps[0]["id"]
    print(f"waiting for build {target}")
    deadline = time.time() + TIMEOUT_SECONDS
    errors = 0

    while True:
        try:
            build = find_build(app_id, target)
            errors = 0
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as error:
            errors += 1
            print(f"poll error ({errors}/{MAX_CONSECUTIVE_ERRORS}): {error}")
            if errors >= MAX_CONSECUTIVE_ERRORS:
                print("too many consecutive poll failures", file=sys.stderr)
                return 1
            time.sleep(POLL_SECONDS)
            continue

        if build is None:
            print(f"build {target} not visible yet")
        else:
            attributes = build["attributes"]
            state = attributes.get("processingState")
            print(f"build {attributes.get('version')}: {state}")
            if state == "VALID":
                print(f"build {target} is VALID")
                return 0
            if state in {"INVALID", "FAILED"}:
                print(f"build {target} failed processing: {state}", file=sys.stderr)
                return 1

        if time.time() > deadline:
            print("timed out waiting for build processing", file=sys.stderr)
            return 1
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    raise SystemExit(main())
