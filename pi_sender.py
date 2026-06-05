"""
BatiSense Pi Sender — LoRa Version (spidev)
---------------------------------------------
- Uses spidev + RPi.GPIO (works with RA-01 / SX1278)
- Receives JSON from Arduino via LoRa
- Maps sensor names to server format
- Sends to correct node based on "node" field
- Uses Bearer token authentication

Install:
    pip install requests spidev RPi.GPIO --break-system-packages

Run:
    python pi_sender.py
"""

import time
import json
import os
import spidev
import RPi.GPIO as GPIO
import requests
from datetime import datetime, timezone

# ============================================================
#  CONFIG — change these
# ============================================================
SERVER_URL = "https://batisense-production.up.railway.app"
EMAIL       = "m_djelloul@ensta.edu.dz"                  # your BatiSense account email
PASSWORD    = "123456789"
PI_LABEL   = "Mon Raspberry Pi"
TOKEN_FILE = "token.txt"
# ============================================================

# ── LoRa Pin config (BCM numbering) ──────────────────────
PIN_RST  = 25   # GPIO 25 — Pin 22
PIN_CS   = 8    # GPIO 8  — Pin 24
PIN_DIO0 = 24   # GPIO 24 — Pin 18

# ── SX1278 Registers ─────────────────────────────────────
REG_FIFO             = 0x00
REG_OP_MODE          = 0x01
REG_FIFO_ADDR_PTR    = 0x0D
REG_FIFO_RX_CURRENT  = 0x10
REG_IRQ_FLAGS        = 0x12
REG_RX_NB_BYTES      = 0x13
REG_PKT_RSSI_VALUE   = 0x1A
REG_MODEM_CONFIG1    = 0x1D
REG_MODEM_CONFIG2    = 0x1E
REG_MODEM_CONFIG3    = 0x26
REG_FREQ_MSB         = 0x06
REG_FREQ_MID         = 0x07
REG_FREQ_LSB         = 0x08
REG_SYNC_WORD        = 0x39
REG_DIO_MAPPING1     = 0x40
REG_VERSION          = 0x42

MODE_LONG_RANGE      = 0x80
MODE_RX_CONTINUOUS   = 0x85
IRQ_RX_DONE          = 0x40

# ── Sensor name mapping ───────────────────────────────────
# Arduino field name → server sensor_type
SENSOR_MAP = {
    "temp":  "temperature",
    "hum":   "humidity",
    "gas":   "gas_detected",
    "water": "daily_consumption",
    "elec":  "daily_consumption",
    "electricity": "daily_consumption",
    "wh":    "daily_consumption",
    "total": "daily_consumption",
    "energy": "daily_consumption",
    "kwh":   "daily_consumption",
    "power": "daily_consumption",
    "vib":   "structure_alert",
    "pres":  "presence",
    "lux":   "luminosity",
    "door":  "door_open",
}

# ── Node name mapping ─────────────────────────────────────
# Arduino node name → server node_id
NODE_MAP = {
    "kitchen":     "kitchen",
    "salon":       "salon",
    "port":        "port",
    "room":        "room",
    "water":       "water",
    "electricity": "electricity",
    "gas_node":    "gas_node",
}

# ── Conversion thresholds ─────────────────────────────────
GAS_THRESHOLD = 100  # raw analog above this = gas detected

def convert_value(arduino_key, raw_value):
    raw_value = float(raw_value)
    if arduino_key == "gas":
        return 1 if raw_value > GAS_THRESHOLD else 0
    if arduino_key == "water":
        return round(raw_value / 10.23, 2)
    if arduino_key == "wh":
        return round(raw_value / 1000.0, 4)
    if arduino_key == "total":
        return round(raw_value / 1000.0, 4)
    if arduino_key == "vib":
        return 1 if raw_value == 1 else 0
    return raw_value

# ============================================================
#  SPI / GPIO SETUP
# ============================================================
GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)
GPIO.setup(PIN_RST,  GPIO.OUT)
GPIO.setup(PIN_CS,   GPIO.OUT)
GPIO.setup(PIN_DIO0, GPIO.IN)

spi = spidev.SpiDev()
spi.open(0, 0)
spi.max_speed_hz = 5000000
spi.mode = 0b00

# ============================================================
#  LORA REGISTER HELPERS
# ============================================================
def write_reg(reg, val):
    GPIO.output(PIN_CS, GPIO.LOW)
    spi.xfer2([reg | 0x80, val])
    GPIO.output(PIN_CS, GPIO.HIGH)

def read_reg(reg):
    GPIO.output(PIN_CS, GPIO.LOW)
    val = spi.xfer2([reg & 0x7F, 0x00])
    GPIO.output(PIN_CS, GPIO.HIGH)
    return val[1]

def reset_lora():
    GPIO.output(PIN_RST, GPIO.LOW)
    time.sleep(0.01)
    GPIO.output(PIN_RST, GPIO.HIGH)
    time.sleep(0.01)

# ============================================================
#  LORA INIT
# ============================================================
def setup_lora():
    reset_lora()

    version     = read_reg(REG_VERSION)
    print(f"SX1278 Version: 0x{version:02X}")
    if version != 0x12:
        print("✗ LoRa module not detected! Check wiring.")
        return False

    # Sleep mode + LoRa
    write_reg(REG_OP_MODE, MODE_LONG_RANGE | 0x00)
    time.sleep(0.1)

    # Frequency 433 MHz
    freq = int(433E6 / 61.035)
    write_reg(REG_FREQ_MSB, (freq >> 16) & 0xFF)
    write_reg(REG_FREQ_MID, (freq >> 8)  & 0xFF)
    write_reg(REG_FREQ_LSB,  freq        & 0xFF)

    # BW=125kHz, CR=4/5, explicit header
    write_reg(REG_MODEM_CONFIG1, 0x72)

    # SF=7, CRC on
    write_reg(REG_MODEM_CONFIG2, 0x74)

    # AGC on
    write_reg(REG_MODEM_CONFIG3, 0x04)

    # Sync word must match Arduino (0x34)
    write_reg(REG_SYNC_WORD, 0x34)

    # DIO0 = RxDone
    write_reg(REG_DIO_MAPPING1, 0x00)

    # Reset FIFO pointer
    write_reg(REG_FIFO_ADDR_PTR, 0x00)

    # RX Continuous mode
    write_reg(REG_OP_MODE, MODE_RX_CONTINUOUS)
    time.sleep(0.1)

    print("✓ LoRa ready — listening at 433 MHz")
    return True

# ============================================================
#  LORA RECEIVE
# ============================================================
def lora_receive():
    """Check if a packet arrived. Returns message string or None."""
    irq = read_reg(REG_IRQ_FLAGS)

    if not (irq & IRQ_RX_DONE):
        return None

    # Clear IRQ flags
    write_reg(REG_IRQ_FLAGS, 0xFF)

    # CRC error
    if irq & 0x20:
        print("  ⚠ CRC Error — packet dropped")
        write_reg(REG_FIFO_ADDR_PTR, 0x00)
        write_reg(REG_OP_MODE, MODE_RX_CONTINUOUS)
        return None

    nb_bytes = read_reg(REG_RX_NB_BYTES)
    rx_addr  = read_reg(REG_FIFO_RX_CURRENT)
    write_reg(REG_FIFO_ADDR_PTR, rx_addr)

    payload = [read_reg(REG_FIFO) for _ in range(nb_bytes)]
    rssi    = read_reg(REG_PKT_RSSI_VALUE) - 164

    # Reset back to RX
    write_reg(REG_FIFO_ADDR_PTR, 0x00)
    write_reg(REG_OP_MODE, 0x81)
    time.sleep(0.01)
    write_reg(REG_OP_MODE, MODE_RX_CONTINUOUS)
    time.sleep(0.01)

    try:
        message = bytes(payload).decode("utf-8", errors="ignore").strip()
    except Exception:
        return None

    if message:
        print(f"  📨 RSSI: {rssi} dBm | Raw: {message}")
        return message

    return None

# ============================================================
#  PARSE ARDUINO MESSAGE
# ============================================================
def parse_message(raw):
    """
    Arduino sends:
    {"node":"kitchen","temp":23.5,"hum":60.2,"gas":230,"vib":0,"water":512}

    Returns:
    node_id = "kitchen"
    sensors = {"temperature":23.5, "humidity":60.2, "gas_detected":0, ...}
    """
    try:
        data = json.loads(raw.strip())
    except json.JSONDecodeError:
        print(f"  ✗ Invalid JSON: {raw}")
        return None, None

    arduino_node = data.get("node", "").lower()
    node_id      = NODE_MAP.get(arduino_node)

    if not node_id:
        print(f"  ✗ Unknown node: '{arduino_node}' — add it to NODE_MAP")
        return None, None

    sensors = {}
    for key, value in data.items():
        if key == "node":
            continue
        server_key = SENSOR_MAP.get(key)
        if server_key:
            sensors[server_key] = convert_value(key, value)
        else:
            print(f"  ⚠ Unknown sensor '{key}' — add it to SENSOR_MAP")

    return node_id, sensors

# ============================================================
#  TOKEN MANAGEMENT
# ============================================================
def get_token():
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE, "r") as f:
            token = f.read().strip()
        if token:
            print(f"✓ Token loaded from {TOKEN_FILE}")
            return token

    print("→ No token found, logging in...")
    try:
        res = requests.post(
            f"{SERVER_URL}/api/pi/login",
            json={"email": EMAIL, "password": PASSWORD, "label": PI_LABEL},
            timeout=10
        )
        if res.status_code in (200, 201):
            token = res.json()["token"]
            with open(TOKEN_FILE, "w") as f:
                f.write(token)
            print(f"✓ Token saved to {TOKEN_FILE}")
            return token
        else:
            print(f"✗ Login failed: {res.json().get('error', res.text)}")
            return None
    except Exception as e:
        print(f"✗ Could not connect to server: {e}")
        return None

# ============================================================
#  SEND TO SERVER
# ============================================================
def send_to_server(token, node_id, sensors):
    payload = {
        "node_id":   node_id,
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
        **sensors
    }
    try:
        res = requests.post(
            f"{SERVER_URL}/api/pi/data",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
            timeout=8
        )
        if res.status_code == 201:
            return True
        elif res.status_code == 401:
            print("  ✗ Token rejected — will re-login")
            if os.path.exists(TOKEN_FILE):
                os.remove(TOKEN_FILE)
            return False
        else:
            print(f"  ✗ Server error: {res.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print("  ✗ No internet connection")
        return False
    except Exception as e:
        print(f"  ✗ Error: {e}")
        return False

# ============================================================
#  MAIN LOOP
# ============================================================
def main():
    print("=" * 45)
    print("  BatiSense Pi Sender — LoRa Version")
    print(f"  Server: {SERVER_URL}")
    print("=" * 45)

    token = get_token()
    if not token:
        print("✗ Could not get token. Check email/password.")
        return

    if not setup_lora():
        print("✗ LoRa init failed.")
        spi.close()
        GPIO.cleanup()
        return

    print("\n✓ Ready — listening for LoRa messages...\n")

    try:
        while True:
            # Re-login if token expired
            if not token:
                token = get_token()
                if not token:
                    print("✗ Retrying in 30s...")
                    time.sleep(30)
                    continue

            # Check for LoRa message
            message = lora_receive()

            if message:
                now = datetime.now().strftime("%H:%M:%S")

                # Parse JSON from Arduino
                node_id, sensors = parse_message(message)

                if node_id and sensors:
                    success = send_to_server(token, node_id, sensors)
                    if success:
                        print(f"[{now}] ✓ {node_id} → {list(sensors.keys())}")
                    else:
                        if not os.path.exists(TOKEN_FILE):
                            token = None

            time.sleep(0.05)  # poll every 50ms

    except KeyboardInterrupt:
        print("\n✓ Stopped by user")
    finally:
        write_reg(REG_OP_MODE, 0x00)
        spi.close()
        GPIO.cleanup()

if __name__ == "__main__":
    main()
