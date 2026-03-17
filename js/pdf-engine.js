/**
 * pdf-engine.js — محرك تصدير PDF
 * يستخدم html2canvas + jsPDF مباشرة (بدون html2pdf bundle)
 */

const PdfEngine = (() => {

    async function _render(sourceEl, filename) {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(255,255,255,.92);z-index:2147483646;display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML = `<div style="background:#fff;border-radius:12px;padding:1.5rem 2.5rem;box-shadow:0 4px 24px rgba(0,0,0,.15);text-align:center;font-family:sans-serif;direction:rtl;">
            <div style="font-size:2rem;margin-bottom:.4rem">📄</div>
            <div style="font-weight:600;color:#1e293b;font-size:.95rem">جاري تصدير PDF...</div>
        </div>`;

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'direction:rtl;unicode-bidi:embed;position:fixed;top:0;left:0;width:794px;min-height:10px;background:#fff;direction:rtl;z-index:2147483645;overflow:visible;max-height:none;padding:0;margin:0;';
        wrapper.innerHTML = sourceEl.innerHTML || '';
        wrapper.querySelectorAll('.no-print').forEach(e => e.style.setProperty('display', 'none', 'important'));

        document.body.appendChild(overlay);
        document.body.appendChild(wrapper);
        await new Promise(r => setTimeout(r, 600));

        try {
            const canvas = await html2canvas(wrapper, {
                scale: 2,
                useCORS: true,
                allowTaint: false,
                backgroundColor: '#ffffff',
                scrollX: 0,
                scrollY: 0,
                windowWidth: 794,
                width: wrapper.scrollWidth,
                height: wrapper.scrollHeight,
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.97);
            const pdfW = 210, pdfH = 297;
            const imgW = pdfW;
            const imgH = (canvas.height / canvas.width) * imgW;

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

            let yPos = 0, remaining = imgH;
            while (remaining > 0) {
                const pageH = Math.min(pdfH, remaining);
                const srcY = (yPos / imgH) * canvas.height;
                const srcH = (pageH / imgH) * canvas.height;

                const pc = document.createElement('canvas');
                pc.width = canvas.width; pc.height = srcH;
                pc.getContext('2d').drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);

                if (yPos > 0) doc.addPage();
                doc.addImage(pc.toDataURL('image/jpeg', 0.97), 'JPEG', 0, 0, imgW, pageH);
                yPos += pageH; remaining -= pageH;
            }

            doc.save(filename || 'document.pdf');
        } finally {
            if (document.body.contains(wrapper)) document.body.removeChild(wrapper);
            if (document.body.contains(overlay)) document.body.removeChild(overlay);
        }
    }

    async function fromElement(el, filename) {
        if (typeof html2canvas === 'undefined') { console.error('[PdfEngine] html2canvas غير محمّل'); return; }
        if (typeof window.jspdf === 'undefined') { console.error('[PdfEngine] jsPDF غير محمّل'); return; }
        await _render(el, filename);
    }

    async function download(elementId, filename) {
        const el = document.getElementById(elementId);
        if (!el) { console.error('[PdfEngine] element not found:', elementId); return; }
        await fromElement(el, filename);
    }

    async function button(btnEl, elementId, filename) {
        if (!btnEl) return;
        const orig = btnEl.innerHTML;
        btnEl.disabled = true; btnEl.innerHTML = '⏳ جاري التحضير...';
        try { await download(elementId, filename); }
        finally { btnEl.disabled = false; btnEl.innerHTML = orig; }
    }

    function print(elementId, title, extraCSS) {
        const el = document.getElementById(elementId);
        if (!el) { console.error('[PdfEngine] element not found:', elementId); return; }
        const win = window.open('', '_blank', 'width=900,height=700');
        win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${title || 'وثيقة'}</title>
<style>@page{size:A4 portrait;margin:7mm 8mm;}body{margin:0;direction:rtl;background:#fff;font-family:sans-serif;}.no-print{display:none!important;}${extraCSS || ''}</style>
</head><body>${el.innerHTML}<script>window.onload=function(){setTimeout(function(){window.print();},700);}<\/script></body></html>`);
        win.document.close();
    }

    return { fromElement, download, button, print };
})();

async function downloadAsPDF(elementId, filename) {
    await PdfEngine.download(elementId, filename);
}