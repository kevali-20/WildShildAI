"""
Runs the trained YOLO model against a live camera (or video file) and POSTs every
detection above the local confidence floor to the backend's /api/detections endpoint.
The backend's alert_engine re-applies the zone's own threshold/cooldown/class-routing
rules (see PRD section 12) — this script does not decide whether to alert, it just
reports what it sees.

Usage:
    python inference.py --weights runs/detect/train/weights/best.pt \
                         --source 0 \
                         --camera-id <camera_id from /api/cameras> \
                         --backend http://localhost:8000

--source accepts a webcam index (0, 1, ...), an RTSP URL, or a video file path.
"""
import argparse
import base64
import time

import cv2
import requests
from ultralytics import YOLO

# Map your dataset's class names (data.yaml) to the backend's two coarse event types.
# Anything not in this map is ignored — e.g. domestic animals you added as negative samples.
ANIMAL_CLASSES = {"elephant", "leopard", "wild_boar", "deer"}
PERSON_CLASSES = {"person"}


def encode_snapshot(frame) -> str:
    _, buf = cv2.imencode(".jpg", frame)
    return base64.b64encode(buf).decode("utf-8")


def send_heartbeat(backend: str, camera_id: str, online: bool = True):
    try:
        requests.post(f"{backend}/api/cameras/{camera_id}/heartbeat", json={"is_online": online}, timeout=5)
    except requests.RequestException as e:
        print(f"[warn] heartbeat failed: {e}")


def send_detection(backend: str, camera_id: str, class_name: str, confidence: float, frame,
                    min_confidence_to_report: float):
    if confidence < min_confidence_to_report:
        return

    event_type = None
    if class_name in ANIMAL_CLASSES:
        event_type = "ANIMAL_DETECTED"
    elif class_name in PERSON_CLASSES:
        event_type = "PERSON_DETECTED"
    else:
        return  # not a class this system cares about

    payload = {
        "camera_id": camera_id,
        "event_type": event_type,
        "confidence": confidence,
        "snapshot_base64": encode_snapshot(frame),
        "species": class_name if event_type == "ANIMAL_DETECTED" else None,
        # movement_direction / boundary_crossing need a multi-frame tracker (e.g. ByteTrack)
        # to compute properly — left as defaults here; see PRD "Future Enhancements".
        "boundary_crossing": False,
    }

    try:
        resp = requests.post(f"{backend}/api/detections", json=payload, timeout=10)
        if resp.status_code == 200 and resp.json():
            print(f"[alert] {class_name} @ {confidence:.2f} -> backend triggered a response")
        else:
            print(f"[info] {class_name} @ {confidence:.2f} -> below zone threshold or in cooldown")
    except requests.RequestException as e:
        print(f"[warn] failed to POST detection: {e}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights", required=True)
    parser.add_argument("--source", default="0", help="Webcam index, RTSP URL, or file path")
    parser.add_argument("--camera-id", required=True, help="Camera ID from /api/cameras")
    parser.add_argument("--backend", default="http://localhost:8000")
    parser.add_argument("--min-confidence", type=float, default=0.5,
                         help="Local floor before even reporting to the backend")
    parser.add_argument("--frame-skip", type=int, default=5,
                         help="Run inference every N frames to save edge-device compute/power")
    parser.add_argument("--heartbeat-interval", type=int, default=30, help="Seconds between heartbeats")
    args = parser.parse_args()

    model = YOLO(args.weights)
    source = int(args.source) if args.source.isdigit() else args.source
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video source: {args.source}")

    frame_count = 0
    last_heartbeat = 0.0

    print(f"Running inference on camera {args.camera_id} — Ctrl+C to stop")
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                print("[warn] frame grab failed — retrying")
                time.sleep(1)
                continue

            frame_count += 1
            now = time.time()
            if now - last_heartbeat > args.heartbeat_interval:
                send_heartbeat(args.backend, args.camera_id)
                last_heartbeat = now

            if frame_count % args.frame_skip != 0:
                continue  # frame-sampling strategy — see PRD 10.5

            results = model.predict(frame, verbose=False)[0]
            for box in results.boxes:
                class_name = model.names[int(box.cls[0])]
                confidence = float(box.conf[0])
                send_detection(args.backend, args.camera_id, class_name, confidence, frame,
                                args.min_confidence)
    except KeyboardInterrupt:
        pass
    finally:
        cap.release()
        send_heartbeat(args.backend, args.camera_id, online=False)


if __name__ == "__main__":
    main()
