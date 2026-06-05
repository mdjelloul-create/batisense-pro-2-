#!/usr/bin/env python3
"""
BatiSense — Water Meter Agent (Camera + Reference Subtraction)
- Logs in with email/password via /api/pi/login
- Fetches OCR'd meter value from ESP32-CAM
- First value ever = reference (saved to reference.txt)
- Sends (current - reference) as consumption to dashboard
"""

import requests
import time
import os
import argparse
from datetime import datetime, timezone

# ─── CONFIG ───────────────────────────────────────────────────────────────────
ESP32_IP       = "10.151.252.204"
RAILWAY_URL    = "https://web-production-0aa50.up.railway.app"
EMAIL          = "m_djelloul@ensta.edu.dz"   # ← your email
PASSWORD       = "123456789"                  # ← your password
PI_LABEL       = "Water Meter ESP32"
POLL_INTERVAL  = 30          # seconds
REFERENCE_FILE = "water_reference.txt"
TOKEN_FILE     = "token.txt"
# ──────────────────────────────────────────────────────────────────────────────


def get_token():
    """Load token from file, or login to get a new one."""
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE, "r") as f:
            token = f.read().strip()
        if token:
            print(f"✓ Token loaded from {TOKEN_FILE}")
            return token

    print("→ No token found, logging in...")
    try:
        res = requests.post(
            f"{RAILWAY_URL}/api/pi/login",
            json={"email": EMAIL, "password": PASSWORD, "label": PI_LABEL},
            timeout=10
        )
        if res.status_code in (200, 201):
            token = res.json()["token"]
            with open(TOKEN_FILE, "w") as f:
                f.write(token)
            print(f"✓ Logged in — token saved to {TOKEN_FILE}")
            return token
        else:
            print(f"✗ Login failed: {res.json().get('error', res.text)}")
            return None
    except Exception as e:
        print(f"✗ Could not connect to server: {e}")
        return None


def load_reference():
    """Load saved reference value from file."""
    if os.path.exists(REFERENCE_FILE):
        with open(REFERENCE_FILE, "r") as f:
            try:
                val = float(f.read().strip())
                print(f"✓ Reference loaded: {val} m³")
                return val
            except ValueError:
                pass
    return None


def save_reference(value):
    """Save reference value to file."""
    with open(REFERENCE_FILE, "w") as f:
        f.write(str(value))
    print(f"✓ Reference saved: {value} m³")


def fetch_esp32():
    """Fetch OCR'd meter value from ESP32-CAM."""
    try:
        r = requests.get(f"http://{ESP32_IP}/json", timeout=5)
        r.raise_for_status()
        data = r.json()

        value = None
        if "main" in data:
            value = data["main"].get("value")
        if not value:
            for k in data:
                if isinstance(data[k], dict) and "value" in data[k]:
                    value = data[k]["value"]
                    break
        if not value and "value" in data:
            value = data["value"]

        # Reject error readings
        if "main" in data and data["main"].get("error", "no error") != "no error":
            print(f"  [ESP32] OCR error: {data['main'].get('error')}")
            return None

        return float(str(value).strip()) if value else None

    except Exception as e:
        print(f"  [ESP32] {e}")
        return None


def send_to_railway(token, consumption):
    """Send consumption value to dashboard."""
    try:
        r = requests.post(
            f"{RAILWAY_URL}/api/pi/data",
            json={
                "node_id":           "water",
                "timestamp":         datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"),
                "daily_consumption": round(consumption, 3)
            },
            headers={"Authorization": f"Bearer {token}"},
            timeout=10
        )
        if r.status_code == 401:
            print("  ✗ Token rejected — will re-login")
            if os.path.exists(TOKEN_FILE):
                os.remove(TOKEN_FILE)
            return False, True   # (failed, need_relogin)
        if not r.ok:
            print(f"  [Railway] {r.status_code} | {r.text}")
            return False, False
        return True, False
    except Exception as e:
        print(f"  [Railway] {e}")
        return False, False


def main():
    # ── Argument parsing ───────────────────────────────────────────────────────
    parser = argparse.ArgumentParser(description="BatiSense Water Monitor")
    parser.add_argument(
        '--reset-reference', type=float, metavar='VALUE',
        help='Force a new reference value (e.g. --reset-reference 39.0)'
    )
    args = parser.parse_args()

    # If --reset-reference is passed, update the file and exit
    if args.reset_reference is not None:
        save_reference(args.reset_reference)
        print(f"✓ Reference manually set to {args.reset_reference} m³")
        print("  Now run the script normally: python water_monitor.py")
        return
    # ──────────────────────────────────────────────────────────────────────────

    print("=" * 52)
    print("  BatiSense — Water Meter Agent (Camera Mode)")
    print(f"  ESP32   : http://{ESP32_IP}/json")
    print(f"  Railway : {RAILWAY_URL}")
    print("=" * 52)

    token = get_token()
    if not token:
        print("❌ Cannot proceed without a valid token. Check credentials.")
        return

    reference = load_reference()
    count = 0

    while True:
        # Re-login if token was invalidated
        if not token:
            token = get_token()
            if not token:
                print("✗ Retrying in 30s...")
                time.sleep(30)
                continue

        count += 1
        now = datetime.now().strftime("%H:%M:%S")
        print(f"[{now}] #{count} Fetching...", end="", flush=True)

        raw = fetch_esp32()

        if raw is None:
            print(" ✗ No reading from ESP32")
            time.sleep(POLL_INTERVAL)
            continue

        # First reading ever → save as reference
        if reference is None:
            save_reference(raw)
            reference = raw
            print(f" {raw:.3f} m³ → Set as reference, consumption = 0.000 m³")
            send_to_railway(token, 0.0)
            time.sleep(POLL_INTERVAL)
            continue

        # ── Sanity check — reject obvious OCR errors (>20% drop) ──────────────
        if raw < reference:
            drop = reference - raw
            if drop > reference * 0.20:
                print(f" ⚠ Reading {raw} < reference {reference} (drop={drop:.1f}) — likely OCR error, skipping")
                time.sleep(POLL_INTERVAL)
                continue
            else:
                # Small drop = possible meter reset, update reference
                print(f" ⚠ Reading slightly below reference — updating reference to {raw:.3f} m³")
                save_reference(raw)
                reference = raw
                time.sleep(POLL_INTERVAL)
                continue
        # ──────────────────────────────────────────────────────────────────────

        consumption = raw - reference
        print(
            f" Raw: {raw:.3f} m³ | Ref: {reference:.3f} m³ | "
            f"Consumption: {consumption:.3f} m³ → Sending...",
            end="", flush=True
        )

        ok, need_relogin = send_to_railway(token, consumption)
        if need_relogin:
            token = None
        print(" ✓" if ok else " ✗ Failed")

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[STOPPED]")