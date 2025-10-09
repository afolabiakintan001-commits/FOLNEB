// FOLNEB Converter — real client-side conversions + UI wiring
// Requires vendor CDNs loaded in converter.html: pdfjs-dist (+worker), html2canvas, pdf-lib, jsPDF, Mammoth, XLSX, JSZip, Tesseract
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);

  // DOM
  const convertBtnEl = $('#convertBtn');
  const sourceFileInput = $('#sourceFile');
  const spinner = $('#spinner');
  const result = $('#result');
  const fileNameEl = $('#fileName');
  const converterForm = $('#converterForm');
  const conversionTypeSelect = $('#conversionType');
  const fileLabelText = $('#fileLabelText');
  const fileHint = $('#fileHint');
  const conversionSummary = $('#conversionSummary');
  const advancedOptionsList = $('#advancedOptions');
  const advancedNote = $('#advancedNote');

  if (!convertBtnEl || !sourceFileInput || !spinner || !result || !converterForm || !conversionTypeSelect) return;

  // Lib check
  console.log('FOLNEB libs:', {
    mammoth: !!window.mammoth,
    pdfLib: !!window.PDFLib,
    jsPDF: !!(window.jspdf || window.jsPDF),
    sheetjs: !!window.XLSX,
    tesseract: !!window.Tesseract,
    jszip: !!window.JSZip,
    html2canvas: !!window.html2canvas,
    pdfjs: !!window.pdfjsLib
  });

  // Helpers
  const readFileAsArrayBuffer = (file) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('Could not read the file.'));
      r.readAsArrayBuffer(file);
    });

  const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.className = 'download-link';
    a.textContent = `⬇ Download ${filename}`;
    result.appendChild(a);
    a.focus();
  };

  const blobFromPdfLibDoc = async (pdfDoc) => {
    const bytes = await pdfDoc.save();
    return new Blob([bytes], { type: 'application/pdf' });
  };

  const escapeXml = (s) =>
    String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  const renderHtmlToPdf = async (htmlStringOrEl) => {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) throw new Error('jsPDF not loaded');
    if (!window.html2canvas) throw new Error('html2canvas not loaded');

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });

    // off-DOM host
    const host = document.createElement('div');
    host.style.position = 'fixed';
    host.style.left = '-9999px';
    host.style.top = '0';
    host.style.width = '794px'; // ~A4 @ 72dpi

    const style = document.createElement('style');
    style.textContent = `
      @font-face{font-family:Calibri;src:local("Calibri");}
      body{font-family:Calibri,Arial,Helvetica,sans-serif;color:#111;line-height:1.35;font-size:11pt;}
      h1{font-size:20pt;margin:0 0 10pt;font-weight:700}
      h2{font-size:16pt;margin:14pt 0 8pt;font-weight:700}
      h3{font-size:13pt;margin:12pt 0 6pt;font-weight:700}
      p{margin:8pt 0}
      ul,ol{margin:8pt 0 8pt 20pt}
      table{border-collapse:collapse;width:100%;table-layout:auto}
      td,th{border:1px solid #c7c9cc;padding:6pt 8pt;vertical-align:top}
      img{max-width:100%;height:auto;display:block}
      .mso-title{font-size:28pt;font-weight:700}
    `;

    const wrapper = document.createElement('div');
    if (typeof htmlStringOrEl === 'string') wrapper.innerHTML = htmlStringOrEl;
    else wrapper.appendChild(htmlStringOrEl);

    host.appendChild(style);
    host.appendChild(wrapper);
    document.body.appendChild(host);

    await new Promise((resolve) => {
      doc.html(wrapper, {
        callback: resolve,
        margin: [36, 36, 54, 36],
        autoPaging: 'text',
        x: 0,
        y: 0,
        width: 523, // A4 printable width
        html2canvas: { scale: 1.6, useCORS: true, windowWidth: 794, logging: false }
      });
    });

    document.body.removeChild(host);
    const ab = doc.output('arraybuffer');
    return new Blob([ab], { type: 'application/pdf' });
  };

  const createError = (msg) => {
    const p = document.createElement('p');
    p.className = 'error';
    p.textContent = msg;
    return p;
  };

  const showBusy = (on, idle, busy) => {
    spinner.hidden = !on;
    convertBtnEl.disabled = on;
    convertBtnEl.setAttribute('aria-busy', String(on));
    convertBtnEl.textContent = on ? busy : idle;
  };

  const setFileName = (files) => {
    if (!fileNameEl) return;
    if (!files || files.length === 0) fileNameEl.textContent = 'No file selected yet.';
    else if (files.length === 1) fileNameEl.textContent = `Selected: ${files[0].name}`;
    else fileNameEl.textContent = `Selected ${files.length} files.`;
  };

  const createDownloadName = (originalName, ext) => {
    const base = originalName && originalName.includes('.')
      ? originalName.replace(/\.[^/.]+$/, '')
      : (originalName || 'converted');
    return `${base}${ext}`;
  };

  const parseRanges = (input) => {
    const parts = String(input || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
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

  // Handlers
  const handlers = {};

  handlers['word-to-pdf'] = async (files) => {
    if (!window.mammoth) throw new Error('Mammoth not loaded');
    const file = files[0];
    if (!/\.docx$/i.test(file.name)) throw new Error('Use a .docx file');

    const ab = await readFileAsArrayBuffer(file);
    const styleMap = [
      "p[style-name='Title'] => p.mso-title:fresh",
      "p[style-name='Subtitle'] => p.mso-subtitle:fresh",
      "p[style-name='Heading 1'] => h1:fresh",
      "p[style-name='Heading 2'] => h2:fresh",
      "p[style-name='Heading 3'] => h3:fresh",
      "r[style-name='Strong'] => strong",
      "r[style-name='Emphasis'] => em",
      'table => table',
      'tr => tr',
      'tc => td'
    ].join('\n');

    const res = await window.mammoth.convertToHtml(
      { arrayBuffer: ab },
      {
        includeDefaultStyleMap: true,
        styleMap,
        convertImage: window.mammoth.images.inline((elem) =>
          elem.read('base64').then((data) => ({
            src: `data:${elem.contentType};base64,${data}`
          }))
        )
      }
    );

    const el = document.createElement('div');
    el.innerHTML = res.value;
    if (!el.textContent.trim() && el.querySelectorAll('img').length === 0) {
      throw new Error('No readable content found in DOCX.');
    }

    const blob = await renderHtmlToPdf(el);
    return { blob, suggestedName: createDownloadName(file.name, '.pdf') };
  };

  handlers['pdf-to-word'] = async (files) => {
    const file = files[0];
    const ab = await readFileAsArrayBuffer(file);
    const loadingTask = window.pdfjsLib.getDocument({ data: new Uint8Array(ab) });
    const pdf = await loadingTask.promise;
    const texts = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const strings = content.items.map((it) => it.str).join(' ');
      texts.push(strings);
    }
    const zip = new window.JSZip();
    zip.file(
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
    );
    zip.folder('_rels').file(
      '.rels',
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
    );
    const bodyXml = texts.map((t) => `<w:p><w:r><w:t>${escapeXml(t)}</w:t></w:r></w:p>`).join('');
    const docXml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}</w:body></w:document>`;
    zip.folder('word').file('document.xml', docXml);
    const blob = await zip.generateAsync({ type: 'blob' });
    return { blob, suggestedName: createDownloadName(file.name, '.docx') };
  };

  handlers['ppt-to-pdf'] = async (files) => {
    const file = files[0];
    const ab = await readFileAsArrayBuffer(file);
    const zip = await window.JSZip.loadAsync(ab);
    const media = [];
    const mediaFolder = zip.folder('ppt/media');
    if (mediaFolder) {
      mediaFolder.forEach((path, fileObj) => media.push({ path, fileObj }));
    }
    const pdfDoc = await window.PDFLib.PDFDocument.create();
    if (media.length === 0) {
      const page = pdfDoc.addPage([595, 842]);
      page.drawText('PPTX to PDF preview is limited in browser.', { x: 50, y: 800, size: 14 });
    } else {
      for (const m of media) {
        const bytes = await m.fileObj.async('uint8array');
        let img;
        try {
          img = await pdfDoc.embedJpg(bytes);
        } catch (e) {
          img = await pdfDoc.embedPng(bytes);
        }
        const { width, height } = img.scale(1);
        const page = pdfDoc.addPage([width, height]);
        page.drawImage(img, { x: 0, y: 0, width, height });
      }
    }
    const blob = await blobFromPdfLibDoc(pdfDoc);
    return { blob, suggestedName: createDownloadName(file.name, '.pdf') };
  };

  handlers['xls-to-pdf'] = async (files) => {
    const file = files[0];
    const ab = await readFileAsArrayBuffer(file);
    const wb = window.XLSX.read(new Uint8Array(ab), { type: 'array' });
    const sheetName = wb.SheetNames[0];
    const html = window.XLSX.utils.sheet_to_html(wb.Sheets[sheetName]);
    const blob = await renderHtmlToPdf(html);
    return { blob, suggestedName: createDownloadName(file.name, '.pdf') };
  };

  handlers['image-to-pdf'] = async (files) => {
    const pdfDoc = await window.PDFLib.PDFDocument.create();
    for (const f of files) {
      const buf = new Uint8Array(await readFileAsArrayBuffer(f));
      let img;
      try {
        img = await pdfDoc.embedJpg(buf);
      } catch (e) {
        img = await pdfDoc.embedPng(buf);
      }
      const { width, height } = img.scale(1);
      const page = pdfDoc.addPage([width, height]);
      page.drawImage(img, { x: 0, y: 0, width, height });
    }
    const blob = await blobFromPdfLibDoc(pdfDoc);
    const name = files[0] ? files[0].name.replace(/\.[^/.]+$/, '') + '.pdf' : 'images.pdf';
    return { blob, suggestedName: name };
  };

  handlers['pdf-merge'] = async (files) => {
    const out = await window.PDFLib.PDFDocument.create();
    for (const f of files) {
      const ab = await readFileAsArrayBuffer(f);
      const src = await window.PDFLib.PDFDocument.load(ab);
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((p) => out.addPage(p));
    }
    const blob = await blobFromPdfLibDoc(out);
    return { blob, suggestedName: 'merged.pdf' };
  };

  handlers['pdf-split'] = async (files) => {
    const file = files[0];
    const ab = await readFileAsArrayBuffer(file);
    const src = await window.PDFLib.PDFDocument.load(ab);
    const total = src.getPageCount();
    const rangeInput = document.getElementById('splitRanges');
    const ranges = parseRanges((rangeInput && rangeInput.value) || `1-${total}`);
    if (ranges.length === 0) throw new Error('Enter page ranges like 1-3,5');

    const zip = new window.JSZip();
    let idx = 1;
    for (const [s, e] of ranges) {
      const from = Math.max(1, s);
      const to = Math.min(e, total);
      const sub = await window.PDFLib.PDFDocument.create();
      const pages = await sub.copyPages(
        src,
        Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i)
      );
      pages.forEach((p) => sub.addPage(p));
      const bytes = await sub.save();
      zip.file(`split_${idx}.pdf`, bytes);
      idx += 1;
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    return { blob, suggestedName: createDownloadName(file.name, '_split.zip') };
  };

  handlers['pdf-compress'] = async (files) => {
    const file = files[0];
    const ab = await readFileAsArrayBuffer(file);
    const loadingTask = window.pdfjsLib.getDocument({ data: new Uint8Array(ab) });
    const pdf = await loadingTask.promise;
    const out = await window.PDFLib.PDFDocument.create();

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
      const jpgBytes = Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0));
      const img = await out.embedJpg(jpgBytes);
      const pageOut = out.addPage([img.width, img.height]);
      pageOut.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    }

    const blob = await blobFromPdfLibDoc(out);
    return { blob, suggestedName: createDownloadName(file.name, '_compressed.pdf') };
  };

  handlers['pdf-sign'] = async (files) => {
    const file = files[0];
    const ab = await readFileAsArrayBuffer(file);
    const doc = await window.PDFLib.PDFDocument.load(ab);
    const pages = doc.getPages();
    const font = await doc.embedFont(window.PDFLib.StandardFonts.Helvetica);

    const addBox = (page, x, y, w, h, label) => {
      page.drawRectangle({ x, y, width: w, height: h, borderColor: window.PDFLib.rgb(0.2, 0.4, 0.9), borderWidth: 1.5 });
      page.drawText(label, { x: x + 6, y: y + h - 14, size: 10, font, color: window.PDFLib.rgb(0.2, 0.4, 0.9) });
    };

    pages.forEach((page) => {
      const { width, height } = page.getSize();
      addBox(page, 50, 50, 180, 60, 'Sign Here');
      addBox(page, width - 230, 50, 180, 60, 'Initials');
      addBox(page, 50, height - 120, 200, 40, 'Date');
    });

    const blob = await blobFromPdfLibDoc(doc);
    return { blob, suggestedName: createDownloadName(file.name, '_esign.pdf') };
  };

  handlers['pdf-ocr'] = async (files) => {
    const file = files[0];
    const ab = await readFileAsArrayBuffer(file);
    const loadingTask = window.pdfjsLib.getDocument({ data: new Uint8Array(ab) });
    const pdf = await loadingTask.promise;
    const out = await window.PDFLib.PDFDocument.create();

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport }).promise;

      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      const imgBytes = Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0));
      const img = await out.embedJpg(imgBytes);
      const pageOut = out.addPage([img.width, img.height]);
      pageOut.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });

      if (window.Tesseract) {
        const { data } = await window.Tesseract.recognize(canvas, 'eng');
        const words = data.words || [];
        const font = await out.embedFont(window.PDFLib.StandardFonts.Helvetica);
        words.forEach((w) => {
          const x = w.bbox.x0;
          const h = w.bbox.y1 - w.bbox.y0;
          const yCanvas = w.bbox.y0;
          const y = img.height - yCanvas - h;
          const text = w.text || '';
          pageOut.drawText(text, { x, y, size: 10, font, color: window.PDFLib.rgb(0, 0, 0), opacity: 0 });
        });
      }
    }

    const blob = await blobFromPdfLibDoc(out);
    return { blob, suggestedName: createDownloadName(file.name, '_ocr.pdf') };
  };

  // Config
  const conversionOptions = {
    'word-to-pdf': {
      accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      outputExtension: '.pdf',
      handler: handlers['word-to-pdf'],
      buttonIdle: 'Convert to PDF',
      buttonBusy: 'Converting…',
      summary: 'Word → PDF — Preserve formatting (client-side, close match).',
      fileLabel: 'Select a Word document',
      fileHint: 'Supported: .docx',
      multiple: false
    },
    'pdf-to-word': {
      accept: '.pdf,application/pdf',
      outputExtension: '.docx',
      handler: handlers['pdf-to-word'],
      buttonIdle: 'Convert to Word',
      buttonBusy: 'Converting…',
      summary: 'PDF → Word — Text-only DOCX.',
      fileLabel: 'Select a PDF file',
      fileHint: 'Supported: .pdf',
      multiple: false
    },
    'ppt-to-pdf': {
      accept: '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation',
      outputExtension: '.pdf',
      handler: handlers['ppt-to-pdf'],
      buttonIdle: 'Convert to PDF',
      buttonBusy: 'Converting…',
      summary: 'PowerPoint → PDF — Image-based preview.',
      fileLabel: 'Select a PPTX file',
      fileHint: 'Supported: .pptx',
      multiple: false
    },
    'xls-to-pdf': {
      accept: '.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      outputExtension: '.pdf',
      handler: handlers['xls-to-pdf'],
      buttonIdle: 'Convert to PDF',
      buttonBusy: 'Converting…',
      summary: 'Excel → PDF — First sheet to table.',
      fileLabel: 'Select an Excel file',
      fileHint: 'Supported: .xls, .xlsx',
      multiple: false
    },
    'image-to-pdf': {
      accept: 'image/png,image/jpeg',
      outputExtension: '.pdf',
      handler: handlers['image-to-pdf'],
      buttonIdle: 'Convert to PDF',
      buttonBusy: 'Converting…',
      summary: 'Images → PDF — Multi-page.',
      fileLabel: 'Select image files',
      fileHint: 'Supported: .png, .jpg',
      multiple: true,
      minFiles: 1
    },
    'pdf-merge': {
      accept: '.pdf,application/pdf',
      outputExtension: '.pdf',
      handler: handlers['pdf-merge'],
      buttonIdle: 'Merge PDFs',
      buttonBusy: 'Merging…',
      summary: 'PDF Merge — Keep upload order.',
      fileLabel: 'Select PDF files',
      fileHint: 'Supported: .pdf (2+)',
      multiple: true,
      minFiles: 2
    },
    'pdf-split': {
      accept: '.pdf,application/pdf',
      outputExtension: '.zip',
      handler: handlers['pdf-split'],
      buttonIdle: 'Split PDF',
      buttonBusy: 'Splitting…',
      summary: 'PDF Split — Enter page ranges.',
      fileLabel: 'Select a PDF file',
      fileHint: 'Supported: .pdf',
      multiple: false
    },
    'pdf-compress': {
      accept: '.pdf,application/pdf',
      outputExtension: '.pdf',
      handler: handlers['pdf-compress'],
      buttonIdle: 'Compress PDF',
      buttonBusy: 'Compressing…',
      summary: 'PDF Compress — Re-encode pages.',
      fileLabel: 'Select a PDF file',
      fileHint: 'Supported: .pdf',
      multiple: false
    },
    'pdf-sign': {
      accept: '.pdf,application/pdf',
      outputExtension: '.pdf',
      handler: handlers['pdf-sign'],
      buttonIdle: 'Prepare for e-sign',
      buttonBusy: 'Tagging…',
      summary: 'E-Sign Prep — Signature/initials/date boxes.',
      fileLabel: 'Select a PDF file',
      fileHint: 'Supported: .pdf',
      multiple: false
    },
    'pdf-ocr': {
      accept: '.pdf,application/pdf',
      outputExtension: '.pdf',
      handler: handlers['pdf-ocr'],
      buttonIdle: 'OCR PDF',
      buttonBusy: 'Running OCR…',
      summary: 'OCR — Make scans searchable.',
      fileLabel: 'Select a scanned PDF',
      fileHint: 'Supported: .pdf',
      multiple: false
    }
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
      advancedNote.textContent = 'OCR uses Tesseract.js (English).';
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
    sourceFileInput.multiple = !!cfg.multiple;
    if (cfg.multiple) sourceFileInput.setAttribute('multiple', '');
    else sourceFileInput.removeAttribute('multiple');

    convertBtnEl.textContent = cfg.buttonIdle;

    result.innerHTML = '';
    setFileName(null);
    renderEnhancements(type);

    try {
      localStorage.setItem('folneb:type', type);
    } catch (e) {}
  };

  // Validate + submit
  const bytes100MB = 100 * 1024 * 1024;
  const matchesAccept = (file, accept) => {
    if (!accept) return true;
    const parts = accept.split(',').map((s) => s.trim()).filter(Boolean);
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    return parts.some((p) => {
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
      if (f.size > bytes100MB) {
        result.appendChild(createError('File exceeds 100MB limit.'));
        return;
      }
      if (!matchesAccept(f, cfg.accept)) {
        result.appendChild(createError(`This tool accepts: ${cfg.accept}`));
        return;
      }
    }

    showBusy(true, cfg.buttonIdle, cfg.buttonBusy);
    const startedAt = performance.now();

    try {
      const out = await cfg.handler(files, cfg);
      let { blob, suggestedName } = out;
      const name = suggestedName || createDownloadName(files[0] && files[0].name, cfg.outputExtension || '.pdf');

      const msg = document.createElement('p');
      msg.className = 'result-message';
      msg.textContent = 'Your file is ready.';
      result.appendChild(msg);

      downloadBlob(blob, name);

      try {
        if (window.saveJob) {
          await window.saveJob({
            type,
            status: 'success',
            inputName: (files[0] && files[0].name) || '',
            outputName: name,
            size: files.reduce((s, f) => s + f.size, 0),
            durationMs: Math.round(performance.now() - startedAt)
          });
          if (window.listRecentJobs) window.listRecentJobs();
        }
      } catch (e2) {
        // ignore telemetry failures
      }
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
      const names = Array.from(files || []).map((f) => f.name);
      const updated = [...names, ...recent].slice(0, 10);
      localStorage.setItem('folneb:recent', JSON.stringify(updated));
    } catch (e) {}
  });

  const initialType =
    (localStorage.getItem('folneb:type') ||
      new URLSearchParams(location.search).get('type') ||
      'word-to-pdf').toLowerCase();
  applyConversionConfig(conversionOptions[initialType] ? initialType : 'word-to-pdf');
})();
