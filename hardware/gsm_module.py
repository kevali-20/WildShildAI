"""
Sends SMS via a SIM800L/SIM7600 GSM module attached to the field Raspberry Pi over
serial, using standard AT commands. This is the offline-capable alternative to Twilio —
use it when the deployment zone has no reliable internet but does have cellular (GSM)
coverage for SMS.

Two modes:
  --test <phone_number>   Sends a one-off test SMS
  --serve                 Runs a tiny local HTTP server that backend/app/services/
                           sms_service.py POSTs to when SMS_PROVIDER=gsm_module in .env.

Wiring: SIM800L TX/RX -> Pi RX/TX (cross-connected) via a logic-level shim (SIM800L is
3.3V-3.4V logic but needs its own regulated ~4V/2A supply — do NOT power it from the
Pi's 3.3V rail, it will brown out on transmit).
"""
import argparse
import time

try:
    import serial
    SERIAL_AVAILABLE = True
except ImportError:
    SERIAL_AVAILABLE = False
    print("[warn] pyserial not available — running in simulation mode (prints only)")

SERIAL_PORT = "/dev/serial0"  # or /dev/ttyUSB0 for a USB GSM dongle
BAUD_RATE = 9600


def _send_at(ser, command: str, wait_seconds: float = 1.0) -> str:
    ser.write((command + "\r\n").encode())
    time.sleep(wait_seconds)
    return ser.read(ser.in_waiting or 64).decode(errors="ignore")


def send_sms(phone_number: str, message: str) -> bool:
    if not SERIAL_AVAILABLE:
        print(f"[MOCK GSM SMS] to={phone_number} message={message!r}")
        return True

    try:
        with serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=2) as ser:
            _send_at(ser, "AT")  # check module is responsive
            _send_at(ser, "AT+CMGF=1")  # text mode (vs PDU mode)
            ser.write(f'AT+CMGS="{phone_number}"\r\n'.encode())
            time.sleep(0.5)
            ser.write(message.encode() + bytes([26]))  # Ctrl+Z sends the message
            time.sleep(3)
            response = ser.read(ser.in_waiting or 64).decode(errors="ignore")
            return "OK" in response
    except Exception as e:
        print(f"[error] GSM send failed: {e}")
        return False


def run_server(port: int = 8765):
    from flask import Flask, request, jsonify

    app = Flask(__name__)

    @app.route("/send_sms", methods=["POST"])
    def send():
        data = request.get_json(force=True)
        ok = send_sms(data["to"], data["message"])
        return jsonify({"sent": ok}), (200 if ok else 500)

    print(f"GSM controller listening on :{port}")
    app.run(host="0.0.0.0", port=port)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--test", metavar="PHONE_NUMBER", help="Send a one-off test SMS")
    parser.add_argument("--serve", action="store_true")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()

    if args.test:
        ok = send_sms(args.test, "WildShield-AI test message — GSM module is working.")
        print("Sent OK" if ok else "Send failed")
    elif args.serve:
        run_server(args.port)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
