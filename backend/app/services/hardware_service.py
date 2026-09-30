"""
Siren control. The backend does not talk to GPIO pins directly — it sends a command to
the edge device's local controller service (hardware/siren_controller.py --serve),
which is what actually has physical access to the relay. This keeps the backend
deployable in the cloud while hardware stays on-site.

Swap MOCK_MODE off once hardware/siren_controller.py is running on the field Pi.
"""
import logging

logger = logging.getLogger("wildshield.hardware")

MOCK_MODE = True
SIREN_CONTROLLER_URL = "http://localhost:8766"  # runs on the same edge node as the camera


def activate_siren(zone_id: str, duration_seconds: int) -> bool:
    if MOCK_MODE:
        logger.info(f"[MOCK SIREN] zone={zone_id} ON duration={duration_seconds}s")
        return True

    import requests
    try:
        resp = requests.post(
            f"{SIREN_CONTROLLER_URL}/activate",
            json={"zone_id": zone_id, "duration_seconds": duration_seconds},
            timeout=5,
        )
        resp.raise_for_status()
        return True
    except Exception as e:
        logger.error(f"Failed to activate siren for zone {zone_id}: {e}")
        return False


def deactivate_siren(zone_id: str) -> bool:
    if MOCK_MODE:
        logger.info(f"[MOCK SIREN] zone={zone_id} OFF")
        return True

    import requests
    try:
        resp = requests.post(f"{SIREN_CONTROLLER_URL}/deactivate", json={"zone_id": zone_id}, timeout=5)
        resp.raise_for_status()
        return True
    except Exception as e:
        logger.error(f"Failed to deactivate siren for zone {zone_id}: {e}")
        return False
