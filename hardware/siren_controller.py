"""
Controls a 12V siren via a relay wired to a Raspberry Pi GPIO pin.

Two modes:
  --test                 One-off relay self-test (activates for 3s, then off)
  --serve                Runs a tiny local HTTP server that backend/app/services/
                          hardware_service.py calls when MOCK_MODE=False, so the
                          cloud/host backend never needs direct GPIO access — only
                          this script, running on the field Pi, does.

Wiring (typical): GPIO pin -> relay IN, relay COM/NO -> siren +12V line, relay powered
from the same 12V/5V supply as the siren. Double-check your relay module's trigger
polarity (active-HIGH vs active-LOW) before wiring — this script assumes active-HIGH.
"""
import argparse
import threading
import time

try:
    import RPi.GPIO as GPIO
    HARDWARE_AVAILABLE = True
except ImportError:
    HARDWARE_AVAILABLE = False
    print("[warn] RPi.GPIO not available — running in simulation mode (prints only)")

SIREN_PIN = 17  # BCM numbering — change to match your wiring


def setup():
    if not HARDWARE_AVAILABLE:
        return
    GPIO.setmode(GPIO.BCM)
    GPIO.setup(SIREN_PIN, GPIO.OUT, initial=GPIO.LOW)


def siren_on():
    if HARDWARE_AVAILABLE:
        GPIO.output(SIREN_PIN, GPIO.HIGH)
    print("[siren] ON")


def siren_off():
    if HARDWARE_AVAILABLE:
        GPIO.output(SIREN_PIN, GPIO.LOW)
    print("[siren] OFF")


def activate_for(duration_seconds: int):
    siren_on()
    timer = threading.Timer(duration_seconds, siren_off)
    timer.daemon = True
    timer.start()


def run_server(port: int = 8766):
    from flask import Flask, request, jsonify

    app = Flask(__name__)

    @app.route("/activate", methods=["POST"])
    def activate():
        data = request.get_json(force=True)
        duration = int(data.get("duration_seconds", 45))
        zone_id = data.get("zone_id", "unknown")
        print(f"[siren] activate requested for zone {zone_id}, duration {duration}s")
        activate_for(duration)
        return jsonify({"status": "activated", "duration_seconds": duration})

    @app.route("/deactivate", methods=["POST"])
    def deactivate():
        data = request.get_json(force=True)
        zone_id = data.get("zone_id", "unknown")
        print(f"[siren] deactivate requested for zone {zone_id}")
        siren_off()
        return jsonify({"status": "deactivated"})

    print(f"Siren controller listening on :{port}")
    app.run(host="0.0.0.0", port=port)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--test", action="store_true", help="One-off 3s relay self-test")
    parser.add_argument("--serve", action="store_true", help="Run the local control server")
    parser.add_argument("--port", type=int, default=8766)
    args = parser.parse_args()

    setup()

    if args.test:
        print("Running 3-second siren self-test...")
        activate_for(3)
        time.sleep(4)
    elif args.serve:
        run_server(args.port)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
