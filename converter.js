// FOLNEB Converter: real client-side conversions + UI wiring
// Requires vendor libs loaded in converter.html: pdf-lib, jsPDF, Mammoth, XLSX, JSZip, PDF.js, Tesseract

(function () {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const convertBtn = '#convertBtn';
  const sourceFile = '#sourceFile';
  const spinnerSel = '#spinner';
  const resultSel = '#result';
  const fileNameSel = '#fileName';
  const formSel = '#converterForm';
  const typeSel = '#conversionType';
  const fileLabelTextSel = '#fileLabelText';
  const fileHintSel = '#fileHint';
  const summarySel = '#conversionSummary';
  const advListSel = '#advancedOptions';
  const advNoteSel = '#advancedNote';

  const convertBtnEl = $(convertBtn);
  const sourceFileInput = $(sourceFile);
  const spinner = $(spinnerSel);
  const result = $(resultSel);
  const fileNameEl = $(fileNameSel);
  const converterForm = $(formSel);
  const conversionTypeSelect = $(typeSel);
  const fileLabelText = $(fileLabelTextSel);
  const fileHint = $(fileHintSel);
  const conversionSummary = $(summarySel);
  const advancedOptionsList = $(advListSel);
  const advancedNote = $(advNoteSel);

  if (!convertBtnEl || !sourceFileInput || !spinner || !result || !converterForm || !conversionTypeSelect) {
    return;
  }

  // Helpers
  const readFileAsArrayBuffer = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('We couldn’t read this file.'));
    reader.readAsArrayBuffer(file);
  });

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.className = 'download-link';
    a.textContent = `Download ${filename}`;
    result.appendChild(a);
    a.focus();
  };

  const blobFromPdfLibDoc = async (pdfDoc) => {
    const bytes = await pdfDoc.save();
    return new Blob([bytes], { type: 'application/pdf' });
  };

  const renderHtmlToPdf = async (htmlString) => {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) throw new Error('jsPDF not loaded');
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.innerHTML = htmlString;
    document.body.appendChild(container);
    await new Promise((resolve) => {
      doc.html(container, {
        callback: () => resolve(),
        margin: [20, 20, 20, 20],
        autoPaging: 'text',
        html2canvas: { scale: 0.9 },
      });
    });
    document.body.removeChild(container);
    const arrayBuffer = doc.output('arraybuffer');
    return new Blob([arrayBuffer], { type: 'application/pdf' });
  };

  const createError = (msg) => {
    const p = document.createElement('p');
    p.className = 'error';
    p.textContent = msg;
    return p;
  };

  const showBusy = (on, btnLabelIdle, btnLabelBusy) => {
    spinner.hidden = !on;
    convertBtnEl.disabled = on;
    convertBtnEl.setAttribute('aria-busy', String(on));
    convertBtnEl.textContent = on ? btnLabelBusy : btnLabelIdle;
  };

  const setFileName = (files) => {
    if (!fileNameEl) return;
    if (!files || files.length === 0) {
      fileNameEl.textContent = 'No file selected yet.';
    } else if (files.length === 1) {
      fileNameEl.textContent = `Selected: ${files[0].name}`;
    } else {
      fileNameEl.textContent = `Selected ${files.length} files.`;
    }
  };

  const createDownloadName = (originalName, extension) => {
    const base = originalName && originalName.includes('.') ? originalName.replace(/\.[^/.]+$/, '') : (originalName || 'converted');
    return `${base}${extension}`;
  };

  const parseRanges = (input) => {
    const parts = String(input || '').split(',').map(s => s.trim()).filter(Boolean);
    const ranges = [];
    for (const p of parts) {
      const m = p.match(/^(\d+)(?:-(\d+))?$/);
      if (m) {
        const start = parseInt(m[1], 10);
        const end = m[2] ? parseInt(m[2], 10) : start;
        if (start <= end) ranges.push([start, end]);
      }
    }
    return ranges;
  };

  // Conversion handlers
  const handlers = {
    'word-to-pdf': async (files) => {
      const file = files[0];
      const ab = await readFileAsArrayBuffer(file);
      const res = await window.mammoth.convertToHtml({ arrayBuffer: ab });
      const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>${res.value}</body></html>`;
      const blob = await renderHtmlToPdf(html);
      return { blob, suggestedName: createDownloadName(file.name, '.pdf') };
    },
    'pdf-to-word': async (files) => {
      const file = files[0];
      const ab = await readFileAsArrayBuffer(file);
      const loadingTask = window.pdfjsLib.getDocument({ data: new Uint8Array(ab) });
      const pdf = await loadingTask.promise;
      const texts = [];
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        const strings = content.items.map(it => it.str).join(' ');
        texts.push(strings);
      }
      const zip = new window.JSZip();
      zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
      zip.folder('_rels').file('.rels', `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
      const bodyXml = texts.map(t => `<w:p><w:r><w:t>${escapeXml(t)}</w:t></w:r></w:p>`).join('');
      const docXml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}</w:body></w:document>`;
      zip.folder('word').file('document.xml', docXml);
      const blob = await zip.generateAsync({ type: 'blob' });
      return { blob, suggestedName: createDownloadName(file.name, '.docx'), note: 'Text-only DOCX (layout simplified)' };
    },
    'ppt-to-pdf': async (files) => {
      const file = files[0];
      const ab = await readFileAsArrayBuffer(file);
      const zip = await window.JSZip.loadAsync(ab);
      const media = [];
      zip.folder('ppt/media')?.forEach((path, fileObj) => media.push({ path, fileObj }));
      const pdfDoc = await PDFLib.PDFDocument.create();
      if (media.length === 0) {
        const page = pdfDoc.addPage([595, 842]);
        page.drawText('PPTX to PDF preview is limited in browser.', { x: 50, y: 800, size: 14 });
      } else {
        for (const m of media) {
          const bytes = await m.fileObj.async('uint8array');
          let img;
          try { img = await pdfDoc.embedJpg(bytes); } catch { img = await pdfDoc.embedPng(bytes); }
          const { width, height } = img.scale(1);
          const page = pdfDoc.addPage([width, height]);
          page.drawImage(img, { x: 0, y: 0, width, height });
        }
      }
      const blob = await blobFromPdfLibDoc(pdfDoc);
      return { blob, suggestedName: createDownloadName(file.name, '.pdf') };
    },
    'xls-to-pdf': async (files) => {
      const file = files[0];
      const ab = await readFileAsArrayBuffer(file);
      const wb = window.XLSX.read(new Uint8Array(ab), { type: 'array' });
      const sheetName = wb.SheetNames[0];
      const html = window.XLSX.utils.sheet_to_html(wb.Sheets[sheetName]);
      const blob = await renderHtmlToPdf(html);
      return { blob, suggestedName: createDownloadName(file.name, '.pdf') };
    },
    'image-to-pdf': async (files) => {
      const pdfDoc = await PDFLib.PDFDocument.create();
      for (const f of files) {
        const buf = new Uint8Array(await readFileAsArrayBuffer(f));
        let img;
        try { img = await pdfDoc.embedJpg(buf); } catch { img = await pdfDoc.embedPng(buf); }
        const { width, height } = img.scale(1);
        const page = pdfDoc.addPage([width, height]);
        page.drawImage(img, { x: 0, y: 0, width, height });
      }
      const blob = await blobFromPdfLibDoc(pdfDoc);
      const name = files[0] ? files[0].name.replace(/\.[^/.]+$/, '') + '.pdf' : 'images.pdf';
      return { blob, suggestedName: name };
    },
    'pdf-merge': async (files) => {
      const out = await PDFLib.PDFDocument.create();
      for (const f of files) {
        const ab = await readFileAsArrayBuffer(f);
        const src = await PDFLib.PDFDocument.load(ab);
        const pages = await out.copyPages(src, src.getPageIndices());
        pages.forEach(p => out.addPage(p));
      }
      const blob = await blobFromPdfLibDoc(out);
      return { blob, suggestedName: 'merged.pdf' };
    },
    'pdf-split': async (files) => {
      const file = files[0];
      const ab = await readFileAsArrayBuffer(file);
      const src = await PDFLib.PDFDocument.load(ab);
      const total = src.getPageCount();
      const rangeInput = document.getElementById('splitRanges');
      const ranges = parseRanges(rangeInput?.value || `1-${total}`);
      if (ranges.length === 0) throw new Error('Please enter page ranges like 1-3,5');
      const zip = new window.JSZip();
      let idx = 1;
      for (const [s, e] of ranges) {
        const from = Math.max(1, s), to = Math.min(e, total);
        const sub = await PDFLib.PDFDocument.create();
        const pages = await sub.copyPages(src, Array.from({ length: (to - from + 1) }, (_, i) => (from - 1) + i));
        pages.forEach(p => sub.addPage(p));
        const bytes = await sub.save();
        zip.file(`split_${idx}.pdf`, bytes);
        idx++;
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      return { blob, suggestedName: createDownloadName(file.name, '_split.zip') };
    },
    'pdf-compress': async (files) => {
      const file = files[0];
      const ab = await readFileAsArrayBuffer(file);
      const loadingTask = window.pdfjsLib.getDocument({ data: new Uint8Array(ab) });
      const pdf = await loadingTask.promise;
      const out = await PDFLib.PDFDocument.create();
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale: 1.0 });
        const scale = Math.min(1000 / viewport.width, 1000 / viewport.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width * scale);
        canvas.height = Math.floor(viewport.height * scale);
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale }) }).promise;
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        const jpgBytes = Uint8Array.from(atob(dataUrl.split(',')[1]), c => c.charCodeAt(0));
        const img = await out.embedJpg(jpgBytes);
        const pageOut = out.addPage([img.width, img.height]);
        pageOut.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      }
      const blob = await blobFromPdfLibDoc(out);
      return { blob, suggestedName: createDownloadName(file.name, '_compressed.pdf') };
    },
    'pdf-sign': async (files) => {
      const file = files[0];
      const ab = await readFileAsArrayBuffer(file);
      const doc = await PDFLib.PDFDocument.load(ab);
      const pages = doc.getPages();
      const font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
      const addBox = (page, x, y, w, h, label) => {
        page.drawRectangle({ x, y, width: w, height: h, borderColor: PDFLib.rgb(0.2, 0.4, 0.9), borderWidth: 1.5 });
        page.drawText(label, { x: x + 6, y: y + h - 14, size: 10, font, color: PDFLib.rgb(0.2, 0.4, 0.9) });
      };
      pages.forEach((page) => {
        const { width, height } = page.getSize();
        addBox(page, 50, 50, 180, 60, 'Sign Here');
        addBox(page, width - 230, 50, 180, 60, 'Initials');
        addBox(page, 50, height - 120, 200, 40, 'Date');
      });
      const blob = await blobFromPdfLibDoc(doc);
      return { blob, suggestedName: createDownloadName(file.name, '_esign.pdf') };
    },
    'pdf-ocr': async (files) => {
      const file = files[0];
      const ab = await readFileAsArrayBuffer(file);
      const loadingTask = window.pdfjsLib.getDocument({ data: new Uint8Array(ab) });
      const pdf = await loadingTask.promise;
      const out = await PDFLib.PDFDocument.create();
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        const imgBytes = Uint8Array.from(atob(dataUrl.split(',')[1]), c => c.charCodeAt(0));
        const img = await out.embedJpg(imgBytes);
        const pageOut = out.addPage([img.width, img.height]);
        pageOut.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });

        const { data } = await Tesseract.recognize(canvas, 'eng');
        const words = data.words || [];
        const font = await out.embedFont(PDFLib.StandardFonts.Helvetica);
        words.forEach(w => {
          const x = w.bbox.x0;
          const yCanvas = w.bbox.y0;
          const h = w.bbox.y1 - w.bbox.y0;
          const y = img.height - yCanvas - h;
          const text = w.text || '';
          pageOut.drawText(text, { x, y, size: 10, font, color: PDFLib.rgb(0,0,0), opacity: 0 });
        });
      }
      const blob = await blobFromPdfLibDoc(out);
      return { blob, suggestedName: createDownloadName(file.name, '_ocr.pdf') };
    },
  };

  function escapeXml(unsafe) {
    return String(unsafe || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  const conversionOptions = {
    'word-to-pdf': {
      accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      outputExtension: '.pdf',
      handler: handlers['word-to-pdf'],
      buttonIdle: 'Convert to PDF',
      buttonBusy: 'Converting…',
      summary: 'Word → PDF — Preserve your document formatting and fonts.',
      fileLabel: 'Select a Word document',
      fileHint: 'Supported formats: .docx',
      multiple: false,
    },
    'pdf-to-word': {
      accept: '.pdf,application/pdf',
      outputExtension: '.docx',
      handler: handlers['pdf-to-word'],
      buttonIdle: 'Convert to Word',
      buttonBusy: 'Converting…',
      summary: 'PDF → Word — Text-only DOCX (layout simplified).',
      fileLabel: 'Select a PDF file',
      fileHint: 'Supported formats: .pdf',
      multiple: false,
    },
    'ppt-to-pdf': {
      accept: '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation',
      outputExtension: '.pdf',
      handler: handlers['ppt-to-pdf'],
      buttonIdle: 'Convert to PDF',
      buttonBusy: 'Converting…',
      summary: 'PowerPoint → PDF — Best-effort image-based rendering in browser.',
      fileLabel: 'Select a PPTX file',
      fileHint: 'Supported formats: .pptx',
      multiple: false,
    },
    'xls-to-pdf': {
      accept: '.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      outputExtension: '.pdf',
      handler: handlers['xls-to-pdf'],
      buttonIdle: 'Convert to PDF',
      buttonBusy: 'Converting…',
      summary: 'Excel → PDF — Renders first sheet as a table.',
      fileLabel: 'Select an Excel file',
      fileHint: 'Supported formats: .xls, .xlsx',
      multiple: false,
    },
    'image-to-pdf': {
      accept: 'image/png,image/jpeg',
      outputExtension: '.pdf',
      handler: handlers['image-to-pdf'],
      buttonIdle: 'Convert to PDF',
      buttonBusy: 'Converting…',
      summary: 'Images → PDF — Combines multiple images into a single PDF.',
      fileLabel: 'Select image files',
      fileHint: 'Supported formats: .png, .jpg',
      multiple: true,
      minFiles: 1,
    },
    'pdf-merge': {
      accept: '.pdf,application/pdf',
      outputExtension: '.pdf',
      handler: handlers['pdf-merge'],
      buttonIdle: 'Merge PDFs',
      buttonBusy: 'Merging…',
      summary: 'PDF Merge — Upload files in the order to merge.',
      fileLabel: 'Select PDF files',
      fileHint: 'Supported formats: .pdf (2 or more)',
      multiple: true,
      minFiles: 2,
    },
    'pdf-split': {
      accept: '.pdf,application/pdf',
      outputExtension: '.zip',
      handler: handlers['pdf-split'],
      buttonIdle: 'Split PDF',
      buttonBusy: 'Splitting…',
      summary: 'PDF Split — Enter page ranges (e.g., 1-3,5).',
      fileLabel: 'Select a PDF file',
      fileHint: 'Supported formats: .pdf',
      multiple: false,
    },
    'pdf-compress': {
      accept: '.pdf,application/pdf',
      outputExtension: '.pdf',
      handler: handlers['pdf-compress'],
      buttonIdle: 'Compress PDF',
      buttonBusy: 'Compressing…',
      summary: 'PDF Compress — Re-encodes pages as images at lower quality.',
      fileLabel: 'Select a PDF file',
      fileHint: 'Supported formats: .pdf',
      multiple: false,
    },
    'pdf-sign': {
      accept: '.pdf,application/pdf',
      outputExtension: '.pdf',
      handler: handlers['pdf-sign'],
      buttonIdle: 'Prepare for e-sign',
      buttonBusy: 'Tagging…',
      summary: 'E-Sign Prep — Adds signature/date/initials boxes.',
      fileLabel: 'Select a PDF file',
      fileHint: 'Supported formats: .pdf',
      multiple: false,
    },
    'pdf-ocr': {
      accept: '.pdf,application/pdf',
      outputExtension: '.pdf',
      handler: handlers['pdf-ocr'],
      buttonIdle: 'OCR PDF',
      buttonBusy: 'Running OCR…',
      summary: 'OCR — Makes scanned PDFs searchable (may be slow).',
      fileLabel: 'Select a scanned PDF',
      fileHint: 'Supported formats: .pdf',
      multiple: false,
    },
  };

  const renderEnhancements = (type) => {
    advancedOptionsList.innerHTML = '';
    advancedNote.textContent = '';
    if (type === 'pdf-split') {
      const li = document.createElement('li');
      const label = document.createElement('label');
      label.setAttribute('for', 'splitRanges');
      label.textContent = 'Page ranges (e.g., 1-3,5)';
      const input = document.createElement('input');
      input.id = 'splitRanges';
      input.type = 'text';
      input.placeholder = '1-3,5';
      li.appendChild(label);
      li.appendChild(input);
      advancedOptionsList.appendChild(li);
      advancedNote.textContent = 'Ranges outside bounds are clamped.';
    } else if (type === 'pdf-compress') {
      advancedNote.textContent = 'Large PDFs may be slow — try splitting first.';
    } else if (type === 'pdf-ocr') {
      advancedNote.textContent = 'OCR uses Tesseract.js (English). Long documents may take time.';
    }
  };

  const applyConversionConfig = (type) => {
    const cfg = conversionOptions[type] || conversionOptions['word-to-pdf'];
    if (conversionTypeSelect.value !== type && conversionOptions[type]) conversionTypeSelect.value = type;

    fileLabelText.textContent = cfg.fileLabel;
    fileHint.textContent = cfg.fileHint;
    conversionSummary.textContent = cfg.summary;
    sourceFileInput.accept = cfg.accept;
    sourceFileInput.value = '';
    sourceFileInput.multiple = Boolean(cfg.multiple);
    if (cfg.multiple) sourceFileInput.setAttribute('multiple', ''); else sourceFileInput.removeAttribute('multiple');
    convertBtnEl.textContent = cfg.buttonIdle;

    result.innerHTML = '';
    setFileName(null);
    renderEnhancements(type);

    try { localStorage.setItem('folneb:type', type); } catch {}
  };

  const bytes100MB = 100 * 1024 * 1024;
  const matchesAccept = (file, accept) => {
    if (!accept) return true;
    const parts = accept.split(',').map(s => s.trim()).filter(Boolean);
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    return parts.some(p => {
      if (p.startsWith('.')) return p.slice(1).toLowerCase() === ext;
      return file.type === p;
    });
  };

  converterForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = conversionTypeSelect.value;
    const cfg = conversionOptions[type] || conversionOptions['word-to-pdf'];
    const files = Array.from(sourceFileInput.files || []);
    result.innerHTML = '';

    if (!files.length || (cfg.minFiles && files.length < cfg.minFiles)) {
      result.appendChild(createError('Please select the required file(s).'));
      return;
    }
    if (cfg.maxFiles && files.length > cfg.maxFiles) {
      result.appendChild(createError(`You can upload up to ${cfg.maxFiles} files for this tool.`));
      return;
    }
    for (const f of files) {
      if (f.size > bytes100MB) { result.appendChild(createError('File exceeds 100MB limit.')); return; }
      if (!matchesAccept(f, cfg.accept)) { result.appendChild(createError(`This tool accepts: ${cfg.accept}`)); return; }
    }

    showBusy(true, cfg.buttonIdle, cfg.buttonBusy);
    const startedAt = performance.now();
    try {
      const out = await cfg.handler(files, cfg);
      const { blob, suggestedName } = out;
      const name = suggestedName || createDownloadName(files[0]?.name, cfg.outputExtension || '.pdf');
      try {
        if (window.uploadToStorage) {
          await window.uploadToStorage(`inputs/${name}`, files[0]);
          await window.uploadToStorage(`outputs/${name}`, blob);
        }
      } catch {}

      const p = document.createElement('p');
      p.className = 'result-message';
      p.textContent = 'Your file is ready.';
      result.appendChild(p);

      downloadBlob(blob, name);

      try {
        if (window.saveJob) {
          await window.saveJob({
            type,
            status: 'success',
            inputName: files[0]?.name || '',
            outputName: name,
            size: files.reduce((s, f) => s + f.size, 0),
            durationMs: Math.round(performance.now() - startedAt),
          });
          if (window.listRecentJobs) window.listRecentJobs();
        }
      } catch {}

    } catch (err) {
      const message = err && err.message ? err.message : 'Something went wrong.';
      result.appendChild(createError(message));
    } finally {
      showBusy(false, cfg.buttonIdle, cfg.buttonBusy);
    }
  });

  conversionTypeSelect.addEventListener('change', (e) => applyConversionConfig(e.target.value));
  sourceFileInput.addEventListener('change', () => {
    const files = sourceFileInput.files;
    setFileName(files);
    try {
      const recent = JSON.parse(localStorage.getItem('folneb:recent') || '[]');
      const names = Array.from(files || []).map(f => f.name);
      const updated = [...names, ...recent].slice(0, 10);
      localStorage.setItem('folneb:recent', JSON.stringify(updated));
    } catch {}
  });

  const initialType = (localStorage.getItem('folneb:type') || new URLSearchParams(location.search).get('type') || 'word-to-pdf').toLowerCase();
  applyConversionConfig(conversionOptions[initialType] ? initialType : 'word-to-pdf');
})();

