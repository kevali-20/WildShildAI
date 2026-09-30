"""
Fires a fake detection at the running backend so you can see the dashboard update
without a camera or trained model yet. Run the backend first, then:

    python scripts/simulate_detection.py --zone-type animal
    python scripts/simulate_detection.py --zone-type restricted
"""
import argparse
import sys

import requests

sys.path.insert(0, "..")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", default="http://localhost:8000")
    parser.add_argument("--zone-type", choices=["animal", "restricted"], default="animal")
    parser.add_argument("--confidence", type=float, default=0.93)
    args = parser.parse_args()

    # Look up a camera in a zone of the requested type
    zones = requests.get(f"{args.backend}/api/zones", headers=_auth_header(args.backend)).json()
    target_zone = next((z for z in zones if z["type"].lower() == args.zone_type), None)
    if not target_zone:
        print(f"No {args.zone_type} zone found — run `python -m app.seed` first.")
        return

    cameras = requests.get(f"{args.backend}/api/cameras", params={"zone_id": target_zone["id"]},
                            headers=_auth_header(args.backend)).json()
    if not cameras:
        print("No camera found in that zone.")
        return

    camera_id = cameras[0]["id"]
    event_type = "ANIMAL_DETECTED" if args.zone_type == "animal" else "PERSON_DETECTED"

    payload = {
        "camera_id": camera_id,
        "event_type": event_type,
        "confidence": args.confidence,
        "species": "Elephant" if args.zone_type == "animal" else None,
        "movement_direction": "South-East",
        "boundary_crossing": True,
    }
    resp = requests.post(f"{args.backend}/api/detections", json=payload)
    print(resp.status_code, resp.json())


def _auth_header(backend):
    # zones/cameras GET endpoints require a logged-in user — log in as the seeded admin.
    token_resp = requests.post(
        f"{backend}/api/auth/login",
        data={"username": "admin", "password": "changeme123"},
    )
    token = token_resp.json().get("access_token")
    return {"Authorization": f"Bearer {token}"} if token else {}


if __name__ == "__main__":
    main()
