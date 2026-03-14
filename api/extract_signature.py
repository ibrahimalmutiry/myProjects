#!/usr/bin/env python3
"""
extract_signature.py
استخراج التوقيع من صورة بخلفية شفافة باستخدام OpenCV
الاستخدام: python3 extract_signature.py <input> <output> [--crop]
"""

import sys, json, os, traceback
import cv2
import numpy as np


def extract_signature(input_path: str, output_path: str, crop: bool = False) -> dict:

    img = cv2.imread(input_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        return {"success": False, "error": f"تعذّر قراءة الصورة: {input_path}"}

    if img.ndim == 3 and img.shape[2] == 4:
        img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
    original = img.copy()
    h, w = img.shape[:2]

    # Grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Gaussian Blur
    blurred = cv2.GaussianBlur(gray, (3, 3), 0)

    # Adaptive Threshold
    binary = cv2.adaptiveThreshold(
        blurred, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        blockSize=15, C=8
    )

    # إزالة خطوط الدفتر الأفقية
    horiz_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(40, w // 8), 1))
    lines_mask = cv2.morphologyEx(binary, cv2.MORPH_OPEN, horiz_kernel, iterations=2)
    binary = cv2.subtract(binary, lines_mask)

    # Opening: إزالة نقاط صغيرة
    open_k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2, 2))
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, open_k, iterations=1)

    # Closing: ربط أجزاء التوقيع
    close_k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (4, 4))
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, close_k, iterations=2)

    # Contours
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    min_area = (h * w) * 0.0005
    valid = [c for c in contours if cv2.contourArea(c) > min_area]
    if not valid:
        valid = list(contours)

    if valid:
        mask = np.zeros_like(binary)
        cv2.drawContours(mask, valid, -1, 255, thickness=cv2.FILLED)
        dil_k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        mask = cv2.dilate(mask, dil_k, iterations=1)
    else:
        mask = binary

    # قناة ألفا
    alpha = cv2.GaussianBlur(mask.copy(), (3, 3), 0)
    _, alpha = cv2.threshold(alpha, 25, 255, cv2.THRESH_BINARY)

    result = original.copy()
    result[mask > 0] = [15, 15, 15]

    b, g, r = cv2.split(result)
    rgba = cv2.merge([b, g, r, alpha])

    # قص اختياري
    if crop:
        ys, xs = np.where(alpha > 0)
        if len(xs) > 0:
            pad = 20
            x1 = max(0, int(xs.min()) - pad)
            y1 = max(0, int(ys.min()) - pad)
            x2 = min(w, int(xs.max()) + pad)
            y2 = min(h, int(ys.max()) + pad)
            if x2 > x1 and y2 > y1:
                rgba = rgba[y1:y2, x1:x2]

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    if not cv2.imwrite(output_path, rgba):
        return {"success": False, "error": f"تعذّر حفظ: {output_path}"}

    return {"success": True, "output": output_path,
            "size": {"width": int(rgba.shape[1]), "height": int(rgba.shape[0])}}


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"success": False, "error": "الاستخدام: python3 extract_signature.py <input> <output> [--crop]"}, ensure_ascii=False))
        sys.exit(1)
    try:
        result = extract_signature(sys.argv[1], sys.argv[2], crop='--crop' in sys.argv)
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(0 if result["success"] else 1)
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e), "trace": traceback.format_exc()}, ensure_ascii=False))
        sys.exit(1)