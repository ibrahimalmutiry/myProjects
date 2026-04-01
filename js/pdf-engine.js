/**
 * pdf-engine.js — محرك تصدير PDF الموحد
 * الاستراتيجية: window.print() في نافذة معزولة نظيفة
 * ✅ لا يعتمد على html2canvas — جودة أعلى، أسرع، RTL صحيح
 * ✅ يعمل مع الوضع الداكن والفاتح
 * ✅ يدعم الخطوط الخارجية (ينتظر تحميلها)
 *
 * API:
 *   PdfEngine.print(elementId, filename, css?)    — من عنصر في الصفحة
 *   PdfEngine.fromHTML(htmlString, filename, css?) — من HTML نص
 *   PdfEngine.fromElement(el, filename, css?)      — من DOM element
 *   PdfEngine.download(elementId, filename, css?)  — مرادف لـ print
 *   PdfEngine.button(btnEl, elementId, filename)   — ربط زر بالتحميل
 */

const PdfEngine = (() => {

    // ── CSS الأساسي المشترك لجميع الوثائق ───────────────────
    const BASE_CSS = `
        @page { size: A4 portrait; margin: 8mm 10mm; }
        *, *::before, *::after {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        html, body {
            margin: 0; padding: 0;
            background: #fff !important;
            direction: rtl;
            font-family: Tahoma, 'Segoe UI', Arial, sans-serif;
            font-size: 11px;
            color: #1e293b;
        }
        .no-print,
        .dp-order-controls,
        .rdv2-toolbar,
        .ceo-pdf-btn,
        .arch-viewer-hdr button,
        [data-no-print] { display: none !important; }
        .print-only { display: block !important; }
        table { border-collapse: collapse; width: 100%; }
        th { background: #1e3a5f !important; color: #fff !important; }
        tr, .no-break { page-break-inside: avoid; }
        a { text-decoration: none; color: inherit; }
    `;

    // ── فتح نافذة طباعة نظيفة ────────────────────────────────
    function _openPrintWindow(htmlContent, filename, extraCSS) {
        var win = window.open('', '_blank', 'width=900,height=700,scrollbars=yes');
        if (!win) {
            alert('يرجى السماح بالنوافذ المنبثقة لهذا الموقع لتتمكن من تحميل PDF');
            return false;
        }

        var title = (filename || 'وثيقة').replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');

        win.document.write('<!DOCTYPE html>\n<html dir="rtl" lang="ar">\n<head>\n<meta charset="utf-8">\n<title>' + title + '</title>\n<style>\n' + BASE_CSS + '\n' + (extraCSS || '') + '\n</style>\n</head>\n<body>\n' + htmlContent + '\n<script>\nfunction _doPrint(){\nif(document.fonts&&document.fonts.ready){\ndocument.fonts.ready.then(function(){setTimeout(function(){window.print();},350);});\n}else{\nsetTimeout(function(){window.print();},700);\n}\n}\nif(document.readyState==="loading"){\ndocument.addEventListener("DOMContentLoaded",_doPrint);\n}else{\n_doPrint();\n}\n<\/script>\n</body>\n</html>');
        win.document.close();
        return true;
    }

    // ── إدارة حالة الزر ──────────────────────────────────────
    function _btnState(btn, state, origHTML) {
        if (!btn) return;
        var labels = {
            loading: '⏳ جاري التحضير...',
            success: '✅ تم فتح نافذة الطباعة',
            error: '❌ فشل — حاول مجدداً'
        };
        btn.disabled = (state === 'loading');
        if (labels[state]) btn.innerHTML = labels[state];
        if (state === 'success' || state === 'error') {
            setTimeout(function () { btn.innerHTML = origHTML; btn.disabled = false; }, 2500);
        }
    }

    // ════════════════════════════════════════════════════════
    //  API العامة
    // ════════════════════════════════════════════════════════

    function print(elementId, filename, extraCSS) {
        var el = document.getElementById(elementId);
        if (!el) {
            console.error('[PdfEngine] العنصر "' + elementId + '" غير موجود');
            return false;
        }
        return fromElement(el, filename, extraCSS);
    }

    function fromElement(el, filename, extraCSS) {
        if (!el) { console.error('[PdfEngine] el is null'); return false; }
        return fromHTML(el.innerHTML || '', filename, extraCSS);
    }

    function fromHTML(htmlString, filename, extraCSS) {
        return _openPrintWindow(htmlString, filename || 'وثيقة.pdf', extraCSS || '');
    }

    var download = print;

    function button(btnEl, elementId, filename, extraCSS) {
        if (!btnEl) return;
        var origHTML = btnEl.innerHTML;
        _btnState(btnEl, 'loading', origHTML);
        var ok = print(elementId, filename, extraCSS);
        _btnState(btnEl, ok ? 'success' : 'error', origHTML);
    }

    return { print: print, download: download, fromElement: fromElement, fromHTML: fromHTML, button: button };

})();

// ── توافق مع الكود القديم ─────────────────────────────────────
async function downloadAsPDF(elementId, filename, extraCSS) {
    return PdfEngine.print(elementId, filename, extraCSS);
}