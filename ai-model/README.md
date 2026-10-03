# ai-model

YOLOv8 + ByteTrack training and real-time inference for WildShield-AI, per PRD section 10.

## Status
This folder is a **runnable skeleton, not a trained model** — `data/train` and
`data/val` are empty. Nothing will detect anything until you:

1. Collect/annotate a dataset (see PRD 10.1–10.2) and drop it into `data/train/`
   and `data/val/` in YOLO format (one `.txt` label file per image, same basename).
2. Verify `data/data.yaml` — 7 classes in Colab-dataset order (deer, elephant, human,
   leopard, lion, wild_boar, tiger).
3. Run `python train.py --data data/data.yaml --epochs 100`.
4. Point `inference.py` at the resulting `best.pt`.

## Files
- `train.py` — fine-tunes a pretrained YOLOv8 checkpoint on your dataset.
- `inference.py` — runs ByteTrack tracking on a live camera/RTSP/video file and
  POSTs enriched detections (movement direction, boundary crossing) to `/api/detections`.
- `data/data.yaml` — dataset + class config (7 classes, Ultralytics format).

## Running inference

### Webcam
```bash
python inference.py \
  --weights runs/detect/train/weights/best.pt \
  --source 0 \
  --camera-id <camera_id from /api/cameras> \
  --backend http://localhost:8000
```

### Video file / test clip
```bash
python inference.py \
  --weights best.pt \
  --video path/to/clip.mp4 \
  --camera-id <camera_id> \
  --min-confidence 0.4
```
`--video` is a friendly alias for `--source`. The process exits cleanly when the
file ends (no infinite retry loop unlike a live camera).

### RTSP stream with API key and boundary line
```bash
python inference.py \
  --weights best.pt \
  --source rtsp://192.168.1.10/stream \
  --camera-id <camera_id> \
  --api-key MY_EDGE_SECRET \
  --boundary-y 0.6          # boundary at 60 % of frame height
```
`boundary_crossing=True` is sent whenever a track's centroid crosses the
horizontal line at `--boundary-y × frame_height` between consecutive frames.

### Key flags
| Flag | Default | Description |
|---|---|---|
| `--weights` | *(required)* | Path to `best.pt` or `.onnx` |
| `--source` / `--video` | `0` | Webcam index, RTSP URL, or file path |
| `--camera-id` | *(required)* | Camera ID registered in the backend |
| `--backend` | `http://localhost:8000` | Backend base URL |
| `--api-key` | *(none)* | `X-API-Key` header value |
| `--min-confidence` | `0.5` | Local floor before reporting to backend |
| `--imgsz` | `640` | Inference resolution passed to YOLO |
| `--frame-skip` | `5` | Run tracker every N frames |
| `--heartbeat-interval` | `30` | Seconds between heartbeat POSTs |
| `--boundary-y` | *(none)* | Boundary line as fraction of frame height |

## Getting a camera ID
```bash
curl -X POST http://localhost:8000/api/cameras \
  -H "Authorization: Bearer <admin token>" \
  -H "Content-Type: application/json" \
  -d '{"zone_id": "<zone id>", "name": "North Ridge Trail Cam", "stream_source": "0"}'
```
Or use the camera IDs created by `backend/app/seed.py` for local testing.

## ONNX export
Once training is validated, export for faster on-device inference:
```bash
# Standard ONNX (works on any CPU/GPU)
yolo export model=runs/detect/train/weights/best.pt format=onnx imgsz=640

# TensorRT engine for NVIDIA Jetson
yolo export model=best.pt format=engine imgsz=640

# Then point inference.py at the exported file:
python inference.py --weights best.onnx --source 0 --camera-id <id>
```

## Two-model vs. one-model (PRD 10.3)
`inference.py` maps every class name to `ANIMAL_DETECTED` or `PERSON_DETECTED`
before posting — the backend doesn't care whether that came from one multi-class
model or two separate ones. If edge hardware struggles with the 7-class model, split
it: train a 6-class animal model and a 1-class human model, run two `inference.py`
processes pointing at the same camera, different `--camera-id` registrations.

## Anti-spam / tracking notes
- ByteTrack (`persist=True, tracker="bytetrack.yaml"`) assigns a stable integer
  track ID to each physical object across frames.
- At most **one detection is POSTed per track ID per 10 seconds** to avoid
  flooding the backend with redundant detections of the same animal.
- Movement direction (N, NE, E, SE, S, SW, W, NW) is computed from the centroid
  trail over the last ~10 processed frames.
