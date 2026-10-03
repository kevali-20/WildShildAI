"""
Runs the trained YOLO model with ByteTrack tracking against a live camera,
RTSP stream, or video file, and POSTs every detection above the local
confidence floor to the backend's /api/detections endpoint.

The backend's alert_engine re-applies the zone's own threshold/cooldown/
class-routing rules — this script does not decide whether to alert, it just
reports what it sees, enriched with tracking-derived metadata.

Usage:
    # Webcam
    python inference.py --weights best.pt --source 0 --camera-id <id>

    # Video file / test clip
    python inference.py --weights best.pt --video path/to/clip.mp4 --camera-id <id>

    # RTSP stream
    python inference.py --weights best.pt --source rtsp://192.168.1.10/stream \
                         --camera-id <id> --backend http://my-server:8000

    # With edge API key + boundary line at 60 % of frame height
    python inference.py --weights best.pt --source 0 --camera-id <id> \
                         --api-key MY_SECRET --boundary-y 0.6

--source / --video both accept a webcam index, RTSP URL, or file path.
--video is a convenient alias for --source that makes intent clearer in scripts.
"""
import argparse
import base64
import collections
import math
import time

import cv2
import requests
from ultralytics import YOLO

# ---------------------------------------------------------------------------
# Class → event-type mapping
# Lowercase model.names before matching so the config is case-insensitive.
# ---------------------------------------------------------------------------
ANIMAL_CLASSES = {"deer", "elephant", "leopard", "lion", "wild_boar", "tiger"}
PERSON_CLASSES = {"human", "person"}   # "person" kept for legacy COCO-trained weights

# ByteTrack centroid history: track_id -> deque of (cx, cy) over last N frames
_CENTROID_HISTORY: dict[int, collections.deque] = {}
CENTROID_HISTORY_LEN = 10   # frames to average direction over

# Anti-spam: track_id -> last POST time
_LAST_SENT: dict[int, float] = {}
TRACK_COOLDOWN_SECONDS = 10  # max 1 detection per track per 10 s

# Direction bins (8-point compass from arctangent of dy/dx)
_DIRS = ["E", "NE", "N", "NW", "W", "SW", "S", "SE"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def encode_snapshot(frame) -> str:
    _, buf = cv2.imencode(".jpg", frame)
    return base64.b64encode(buf).decode("utf-8")


def compute_direction(centroid_history: collections.deque) -> str | None:
    """Return 8-point compass direction from first to last centroid, or None
    if the track has fewer than 2 points (stationary / just appeared)."""
    if len(centroid_history) < 2:
        return None
    x0, y0 = centroid_history[0]
    x1, y1 = centroid_history[-1]
    dx, dy = x1 - x0, y1 - y0
    if abs(dx) < 1 and abs(dy) < 1:
        return None  # sub-pixel drift — not meaningful
    # atan2 gives angle in radians; image Y increases downward so negate dy for N-up
    angle = math.degrees(math.atan2(-dy, dx))  # 0° = East, 90° = North
    idx = int((angle + 360 + 22.5) / 45) % 8
    return _DIRS[idx]


def send_heartbeat(backend: str, camera_id: str, online: bool = True):
    try:
        requests.post(
            f"{backend}/api/cameras/{camera_id}/heartbeat",
            json={"is_online": online},
            timeout=5,
        )
    except requests.RequestException as e:
        print(f"[warn] heartbeat failed: {e}")


def send_detection(
    *,
    backend: str,
    camera_id: str,
    track_id: int,
    class_name: str,
    confidence: float,
    frame,
    min_confidence_to_report: float,
    movement_direction: str | None,
    boundary_crossing: bool,
    api_key: str | None = None,
):
    if confidence < min_confidence_to_report:
        return

    # Anti-spam: skip if this track was reported within the cooldown window
    now = time.time()
    if now - _LAST_SENT.get(track_id, 0) < TRACK_COOLDOWN_SECONDS:
        return

    class_lower = class_name.lower()
    if class_lower in ANIMAL_CLASSES:
        event_type = "ANIMAL_DETECTED"
    elif class_lower in PERSON_CLASSES:
        event_type = "PERSON_DETECTED"
    else:
        return  # unknown class — ignore

    payload = {
        "camera_id": camera_id,
        "event_type": event_type,
        "confidence": confidence,
        "snapshot_base64": encode_snapshot(frame),
        "species": class_lower if event_type == "ANIMAL_DETECTED" else None,
        "movement_direction": movement_direction,
        "boundary_crossing": boundary_crossing,
    }

    headers = {}
    if api_key:
        headers["X-API-Key"] = api_key

    try:
        resp = requests.post(
            f"{backend}/api/detections",
            json=payload,
            headers=headers if headers else None,
            timeout=10,
        )
        _LAST_SENT[track_id] = now
        if resp.status_code == 200 and resp.json():
            print(f"[alert] track={track_id} {class_lower} @ {confidence:.2f} → backend triggered")
        else:
            print(f"[info]  track={track_id} {class_lower} @ {confidence:.2f} → below threshold / cooldown")
    except requests.RequestException as e:
        print(f"[warn] failed to POST detection: {e}")


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="WildShield-AI inference with ByteTrack")
    parser.add_argument("--weights", required=True, help="Path to best.pt (or .onnx)")
    parser.add_argument("--source", default=None,
                        help="Webcam index (0), RTSP URL, or file path")
    parser.add_argument("--video", default=None,
                        help="Alias for --source; convenient for test clips")
    parser.add_argument("--camera-id", required=True, help="Camera ID from /api/cameras")
    parser.add_argument("--backend", default="http://localhost:8000")
    parser.add_argument("--api-key", default=None,
                        help="Edge device API key for X-API-Key header")
    parser.add_argument("--min-confidence", type=float, default=0.5,
                        help="Local confidence floor before reporting to backend (default 0.5)")
    parser.add_argument("--imgsz", type=int, default=640,
                        help="Inference image size (default 640)")
    parser.add_argument("--frame-skip", type=int, default=5,
                        help="Run tracking every N frames (default 5)")
    parser.add_argument("--heartbeat-interval", type=int, default=30,
                        help="Seconds between heartbeat POSTs (default 30)")
    parser.add_argument("--boundary-y", type=float, default=None,
                        help="Fraction of frame height (0.0–1.0) for the boundary line. "
                             "boundary_crossing=True is sent when a track's centroid crosses "
                             "this line between frames.")
    args = parser.parse_args()

    # --video is a friendly alias for --source
    source_raw = args.video or args.source or "0"
    source = int(source_raw) if str(source_raw).isdigit() else source_raw

    model = YOLO(args.weights)
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video source: {source_raw!r}")

    frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 480
    boundary_px = int(args.boundary_y * frame_h) if args.boundary_y is not None else None

    frame_count = 0
    last_heartbeat = 0.0

    # prev_cy[track_id] = cy in the last processed frame (for boundary crossing)
    prev_cy: dict[int, float] = {}

    print(f"WildShield-AI  |  camera={args.camera_id}  |  source={source_raw!r}  |  Ctrl+C to stop")
    if boundary_px is not None:
        print(f"Boundary line at y={boundary_px} px ({args.boundary_y:.0%} of {frame_h} px)")

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                # End of video file — exit cleanly instead of retrying forever
                if args.video:
                    print("[info] end of video file — exiting")
                    break
                print("[warn] frame grab failed — retrying")
                time.sleep(1)
                continue

            frame_count += 1
            now = time.time()

            # Heartbeat
            if now - last_heartbeat > args.heartbeat_interval:
                send_heartbeat(args.backend, args.camera_id)
                last_heartbeat = now

            if frame_count % args.frame_skip != 0:
                continue  # frame-sampling strategy — saves edge-device compute

            # ------------------------------------------------------------------
            # ByteTrack tracking (replaces model.predict)
            # persist=True keeps the tracker state across frames so the same
            # physical object retains the same track ID throughout the clip.
            # ------------------------------------------------------------------
            results = model.track(
                frame,
                persist=True,
                tracker="bytetrack.yaml",
                imgsz=args.imgsz,
                verbose=False,
            )[0]

            if results.boxes is None:
                continue

            for box in results.boxes:
                # Skip boxes without a confirmed track ID
                if box.id is None:
                    continue
                track_id = int(box.id[0])

                class_name = model.names[int(box.cls[0])].lower()
                confidence = float(box.conf[0])

                # Centroid (cx, cy) in pixels
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                cx = (x1 + x2) / 2.0
                cy = (y1 + y2) / 2.0

                # Update centroid history
                if track_id not in _CENTROID_HISTORY:
                    _CENTROID_HISTORY[track_id] = collections.deque(maxlen=CENTROID_HISTORY_LEN)
                _CENTROID_HISTORY[track_id].append((cx, cy))

                # Movement direction from centroid trail
                movement_direction = compute_direction(_CENTROID_HISTORY[track_id])

                # Boundary crossing: True when centroid moves from one side of
                # boundary_px to the other between consecutive tracked frames.
                crossing = False
                if boundary_px is not None and track_id in prev_cy:
                    old_cy = prev_cy[track_id]
                    crossing = (old_cy < boundary_px) != (cy < boundary_px)
                prev_cy[track_id] = cy

                send_detection(
                    backend=args.backend,
                    camera_id=args.camera_id,
                    track_id=track_id,
                    class_name=class_name,
                    confidence=confidence,
                    frame=frame,
                    min_confidence_to_report=args.min_confidence,
                    movement_direction=movement_direction,
                    boundary_crossing=crossing,
                    api_key=args.api_key,
                )

    except KeyboardInterrupt:
        pass
    finally:
        cap.release()
        send_heartbeat(args.backend, args.camera_id, online=False)


if __name__ == "__main__":
    main()
