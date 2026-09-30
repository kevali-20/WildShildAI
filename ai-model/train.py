"""
Trains a YOLOv8 model on the annotated dataset described by data.yaml.

Usage:
    python train.py --data data/data.yaml --epochs 100 --model yolov8n.pt

Start with yolov8n (nano) to validate the pipeline end-to-end quickly, then move to
yolov8s/yolov8m for better accuracy once you know the dataset and training loop work —
see PRD section 10.3 for the transfer-learning rationale and the two-model vs.
combined-model trade-off.
"""
import argparse

from ultralytics import YOLO


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="data/data.yaml", help="Path to dataset yaml")
    parser.add_argument("--model", default="yolov8n.pt", help="Pretrained checkpoint to start from")
    parser.add_argument("--epochs", type=int, default=100)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--device", default="", help="'cpu', '0' for first GPU, etc. Empty = auto")
    args = parser.parse_args()

    model = YOLO(args.model)  # loads pretrained COCO weights — transfer learning, not from scratch

    results = model.train(
        data=args.data,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device or None,
        patience=20,  # early stopping if val mAP stalls
        augment=True,
    )

    metrics = model.val()
    print(f"mAP50: {metrics.box.map50:.3f}  mAP50-95: {metrics.box.map:.3f}")
    print(f"Trained weights saved under: {results.save_dir}/weights/best.pt")
    print("Next: export to ONNX for edge deployment —")
    print(f"  yolo export model={results.save_dir}/weights/best.pt format=onnx")


if __name__ == "__main__":
    main()
