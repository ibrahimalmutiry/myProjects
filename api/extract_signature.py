#!/usr/bin/env python3
"""
extract_signature.py — remove.bg API
"""
import sys, json, urllib.request, urllib.parse, os

API_KEY = 'qgF73rbGY9Ahcr5yUYbHQsDr'

def remove_bg(input_path, output_path):
    with open(input_path, 'rb') as f:
        image_data = f.read()

    # multipart/form-data يدوي
    CRLF = b'\r\n'
    boundary = b'RemoveBgBoundary'
    
    body = b''
    # حقل size
    body += b'--' + boundary + CRLF
    body += b'Content-Disposition: form-data; name="size"' + CRLF + CRLF
    body += b'auto' + CRLF
    # حقل الصورة
    body += b'--' + boundary + CRLF
    body += b'Content-Disposition: form-data; name="image_file"; filename="image.png"' + CRLF
    body += b'Content-Type: image/png' + CRLF + CRLF
    body += image_data + CRLF
    body += b'--' + boundary + b'--' + CRLF

    req = urllib.request.Request(
        'https://api.remove.bg/v1.0/removebg',
        data=body,
        headers={
            'X-Api-Key': API_KEY,
            'Content-Type': 'multipart/form-data; boundary=' + boundary.decode(),
        },
        method='POST'
    )

    try:
        with urllib.request.urlopen(req) as resp:
            result = resp.read()
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8', errors='replace')
        raise Exception(f'HTTP {e.code}: {err_body}')

    with open(output_path, 'wb') as f:
        f.write(result)

    # احسب الأبعاد
    try:
        from PIL import Image
        img = Image.open(output_path)
        w, h = img.width, img.height
    except:
        w, h = 0, 0

    print(json.dumps({
        "success": True,
        "output": output_path,
        "size": {"width": w, "height": h}
    }, ensure_ascii=False))

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print(json.dumps({"success": False, "error": "الاستخدام: python3 extract_signature.py <input> <output>"}))
        sys.exit(1)
    try:
        remove_bg(sys.argv[1], sys.argv[2])
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False))
        sys.exit(1)