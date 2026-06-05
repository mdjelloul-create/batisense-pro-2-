"""
BatiSense tester

Run from CMD:
    python tester.py

Optional:
    python tester.py --once
    python tester.py --url https://web-production-0aa50.up.railway.app/
"""

import argparse
import getpass
import json
import random
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone


DEFAULT_URL = "https://web-production-0aa50.up.railway.app"


def post_json(url, payload, token=None):
    data = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            body = res.read().decode("utf-8")
            return res.status, json.loads(body or "{}")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(body)
        except json.JSONDecodeError:
            parsed = {"error": body}
        return exc.code, parsed


def login(base_url, email, password):
    status, body = post_json(
        f"{base_url}/api/pi/login",
        {
            "email": email,
            "password": password,
            "label": "CMD tester",
        },
    )
    if status not in (200, 201) or "token" not in body:
        raise RuntimeError(f"Login failed ({status}): {body}")
    return body["token"]


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def fake_payloads():
    presence = random.choice([0, 0, 0, 1])
    door_open = random.choice([0, 0, 0, 1])

    return [
        {
            "node_id": "kitchen",
            "timestamp": now_iso(),
            "temperature": round(random.uniform(20.0, 29.0), 1),
            "humidity": round(random.uniform(35.0, 68.0), 1),
            "gas_detected": random.choice([0, 0, 0, 0, 1]),
            "presence": presence,
        },
        {
            "node_id": "salon",
            "timestamp": now_iso(),
            "temperature": round(random.uniform(19.0, 28.0), 1),
            "humidity": round(random.uniform(34.0, 65.0), 1),
            "gas_detected": 0,
            "presence": random.choice([0, 0, 1]),
        },
        {
            "node_id": "port",
            "timestamp": now_iso(),
            "door_open": door_open,
            "presence": random.choice([0, 1]),
            "structure_alert": random.choice([0, 0, 0, 1]),
        },
        {
            "node_id": "room",
            "timestamp": now_iso(),
            "presence": random.choice([0, 0, 1]),
            "luminosity": round(random.uniform(80, 780), 0),
            "structure_alert": 0,
        },
        {
            "node_id": "water",
            "timestamp": now_iso(),
            "daily_consumption": round(random.uniform(5, 160), 3),
        },
        {
            "node_id": "electricity",
            "timestamp": now_iso(),
            "daily_consumption": round(random.uniform(0.2, 8.5), 3),
        },
        {
            "node_id": "gas_node",
            "timestamp": now_iso(),
            "daily_consumption": round(random.uniform(0.01, 1.4), 3),
        },
    ]


def send_payload(base_url, token, payload):
    status, body = post_json(f"{base_url}/api/pi/data", payload, token=token)
    ok = status == 201 and body.get("ok") is True
    marker = "OK" if ok else "ERROR"
    sensors = ", ".join(k for k in payload.keys() if k not in {"node_id", "timestamp"})
    print(f"[{marker}] {payload['node_id']}: {sensors} -> HTTP {status}")
    if not ok:
        print(f"       {body}")


def main():
    parser = argparse.ArgumentParser(description="Send fake BatiSense data to the dashboard.")
    parser.add_argument("--url", default=DEFAULT_URL, help="Server URL")
    parser.add_argument("--email", help="BatiSense account email")
    parser.add_argument("--password", help="BatiSense account password")
    parser.add_argument("--delay", type=float, default=2.0, help="Seconds between batches")
    parser.add_argument("--once", action="store_true", help="Send one batch and stop")
    args = parser.parse_args()

    base_url = args.url.rstrip("/")
    email = args.email or input("Email: ").strip()
    password = args.password or getpass.getpass("Password: ")

    print(f"Logging in to {base_url} ...")
    token = login(base_url, email, password)
    print("Login OK. Sending test data. Open the dashboard in your browser to watch it update.")

    while True:
        print(f"\nBatch at {datetime.now().strftime('%H:%M:%S')}")
        for payload in fake_payloads():
            send_payload(base_url, token, payload)
            time.sleep(0.15)

        if args.once:
            break
        time.sleep(args.delay)


if __name__ == "__main__":
    main()
