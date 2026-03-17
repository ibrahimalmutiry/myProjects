#!/usr/bin/env python3
"""
pdf_python.py
سكريبت Python لتوليد PDF من HTML باستخدام pdfkit + wkhtmltopdf

الاستخدام:
    python3 pdf_python.py <html_file> <output_pdf>
"""

import sys
import os
import json
import tempfile

def generate_pdf(html_path, output_path):
    import pdfkit
    import shutil

    # البحث عن wkhtmltopdf في مسارات Mac الشائعة
    candidates = [
        '/usr/local/bin/wkhtmltopdf',
        '/opt/homebrew/bin/wkhtmltopdf',
        '/Applications/wkhtmltopdf/bin/wkhtmltopdf',
        shutil.which('wkhtmltopdf') or '',
    ]
    wkhtmltopdf_path = next((p for p in candidates if p and __import__('os').path.isfile(p)), None)
    if not wkhtmltopdf_path:
        raise RuntimeError('wkhtmltopdf غير موجود. ثبّته بـ: brew install wkhtmltopdf')
    config = pdfkit.configuration(wkhtmltopdf=wkhtmltopdf_path)

    options = {
        'page-size':          'A4',
        'orientation':        'Portrait',
        'margin-top':         '10mm',
        'margin-right':       '8mm',
        'margin-bottom':      '10mm',
        'margin-left':        '8mm',
        'encoding':           'UTF-8',
        'enable-local-file-access': None,
        'no-stop-slow-scripts': None,
        'javascript-delay':   '2000',    # انتظر 2 ثانية للخطوط والـ JS
        'load-error-handling':'ignore',
        'load-media-error-handling': 'ignore',
        'print-media-type':   None,
        'disable-smart-shrinking': None,
        'zoom':               '1',
        'dpi':                '150',
    }

    pdfkit.from_file(html_path, output_path, options=options, configuration=config)
    return os.path.getsize(output_path)


def main():
    if len(sys.argv) < 3:
        print(json.dumps({
            'success': False,
            'error':   'Usage: python3 pdf_python.py <html_file> <output_pdf>'
        }))
        sys.exit(1)

    html_path   = sys.argv[1]
    output_path = sys.argv[2]

    if not os.path.exists(html_path):
        print(json.dumps({'success': False, 'error': f'HTML file not found: {html_path}'}))
        sys.exit(1)

    try:
        size = generate_pdf(html_path, output_path)
        print(json.dumps({
            'success': True,
            'path':    output_path,
            'size':    size,
        }))
    except Exception as e:
        print(json.dumps({'success': False, 'error': str(e)}))
        sys.exit(1)


if __name__ == '__main__':
    main()