// FOLNEB Converter v2 — client-side conversions, preview, and stubs
// Requires vendor libs (loaded in converter.html): pdfjs-dist, html2canvas, pdf-lib, jsPDF, Mammoth, SheetJS, Tesseract, JSZip

(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);

  const convertBtn = $('#convertBtn');
  const sourceFile = $('#sourceFile');
  const spinner = $('#spinner');
  const result = $('#result');
  const fileName = $('#fileName');
  const form = $('#converterForm');
  const typeSelect = $('#conversionType');
  const labelText = $('#fileLabelText');
  const hint = $('#fileHint');
  const summary = $('#conversionSummary');
  const advList = $('#advancedOptions');
  const advNote = $('#advancedNote');
  if (!convertBtn || !sourceFile || !spinner || !result || !form || !typeSelect) return;

  // Helpers
  const readFileAsArrayBuffer = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('We couldn’t read this file.')); r.readAsArrayBuffer(file); });
  const downloadBlob = (blob, name) => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.className = 'download-link'; a.textContent = `Download ${name}`; result.appendChild(a); a.focus(); setTimeout(() => URL.revokeObjectURL(url), 30_000); };
  const blobFromPdfLibDoc = async (doc) => new Blob([await doc.save()], { type: 'application/pdf' });

  const renderHtmlToPdf = async (htmlOrEl) => {
    const { jsPDF } = window.jspdf || {}; if (!jsPDF) throw new Error('jsPDF not loaded'); if (!window.html2canvas) throw new Error('html2canvas not loaded');
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const host = document.createElement('div'); host.style.position = 'fixed'; host.style.left = '-9999px'; host.style.top = '0'; host.style.width = '794px';
    const style = document.createElement('style'); style.textContent = 'body{font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.4}h1,h2,h3{font-weight:700;margin:0 0 .5rem} p{margin:.25rem 0}img{max-width:100%;height:auto;display:block}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px 8px}';
    const wrap = document.createElement('div'); if (typeof htmlOrEl === 'string') wrap.innerHTML = htmlOrEl; else wrap.appendChild(htmlOrEl);
    host.appendChild(style); host.appendChild(wrap); document.body.appendChild(host);
    await new Promise((resolve) => { doc.html(wrap, { callback: resolve, margin: [36,36,36,36], autoPaging: 'text', x: 0, y: 0, width: 523, html2canvas: { scale: 0.98, useCORS: true, windowWidth: 794, logging: false } }); });
    document.body.removeChild(host); const ab = doc.output('arraybuffer'); return new Blob([ab], { type: 'application/pdf' });
  };

  const setBusy = (on, idle, busy) => { spinner.hidden = !on; convertBtn.disabled = on; convertBtn.setAttribute('aria-busy', String(on)); convertBtn.textContent = on ? busy : idle; };
  const setFile = (files) => { if (!fileName) return; if (!files || !files.length) fileName.textContent = 'No file selected yet.'; else if (files.length === 1) fileName.textContent = `Selected: ${files[0].name}`; else fileName.textContent = `Selected ${files.length} files.`; };
  const createName = (orig, ext) => { const base = orig && orig.includes('.') ? orig.replace(/\.[^/.]+$/, '') : (orig || 'converted'); return `${base}${ext}`; };
  const parseRanges = (s) => { const parts = String(s||'').split(',').map(t=>t.trim()).filter(Boolean); const out=[]; for(const p of parts){const m=p.match(/^(\d+)(?:-(\d+))?$/); if(m){const a=+m[1],b=m[2]?+m[2]:a; if(a<=b) out.push([a,b]);}} return out; };
  const esc = (t) => String(t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');

  // Handlers
  const handlers = {};
  handlers["word-to-pdf"] = async (files) => {
  const f = files[0];
  if (!/\.docx$/i.test(f.name)) throw new Error('Use a .docx file');

  const api = (typeof window !== 'undefined' && window.FOLNEB_API) ? String(window.FOLNEB_API) : '';
  const serverStart = performance.now();
  if (api) {
    try {
      console.log('[FOLNEB] word->pdf server attempt', { api });
      const resp = await fetch(api, {
        method: 'POST',
        headers: { 'X-Filename': f.name },
        body: f,
      });
      if (!resp.ok) throw new Error(`Server convert failed (${resp.status})`);
      const ct = resp.headers.get('content-type') || '';
      if (!ct.includes('pdf')) throw new Error('Server did not return a PDF');
      const blob = await resp.blob();
      console.log('[FOLNEB] word->pdf server OK', { ms: Math.round(performance.now() - serverStart), size: blob.size });
      return { blob, suggestedName: f.name.replace(/\.[^/.]+$/, '') + '.pdf' };
    } catch (e) {
      console.warn('[FOLNEB] server path failed; falling back', e);
    }
  } else {
    console.log('[FOLNEB] no server endpoint configured � using client fallback');
  }

  // Client fallback (Mammoth -> html2canvas + jsPDF)
  if (!window.mammoth) throw new Error('Mammoth not loaded');
  const ab = await readFileAsArrayBuffer(f);
  const res = await window.mammoth.convertToHtml(
    { arrayBuffer: ab },
    { includeDefaultStyleMap: true, convertImage: mammoth.images.inline((elem)=> elem.read('base64').then((data)=>({ src: `data:${elem.contentType};base64,${data}` }))) }
  );
  const el = document.createElement('div'); el.innerHTML = res.value;
  if (!el.textContent.trim() && el.querySelectorAll('img').length === 0) throw new Error('No readable content found in DOCX.');
  const fbStart = performance.now();
  const blob = await renderHtmlToPdf(el);
  console.log('[FOLNEB] word->pdf fallback OK', { ms: Math.round(performance.now() - fbStart), size: blob.size });
  return { blob, suggestedName: f.name.replace(/\.[^/.]+$/, '') + '.pdf' };
};};
  handlers['pdf-to-word'] = async (files) => {
    if (!window.pdfjsLib) throw new Error('PDF.js not loaded'); if (!window.JSZip) throw new Error('JSZip not loaded'); const f=files[0]; const ab = await readFileAsArrayBuffer(f);
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(ab) }).promise; const texts=[]; for(let p=1;p<=pdf.numPages;p++){ const page=await pdf.getPage(p); const c=await page.getTextContent(); texts.push(c.items.map(i=>i.str).join(' ')); }
    const zip=new window.JSZip(); zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'); zip.folder('_rels').file('.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'); const body=texts.map(t=>`<w:p><w:r><w:t>${esc(t)}</w:t></w:r></w:p>`).join(''); const docXml=`<?xml version=\"1.0\" encoding=\"UTF-8\"?><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body>${body}</w:body></w:document>`; zip.folder('word').file('document.xml',docXml);
    const blob=await zip.generateAsync({type:'blob'}); return { blob, suggestedName: createName(f.name,'.docx') };
  };
  handlers['ppt-to-pdf'] = async (files) => {
    if (!window.PDFLib) throw new Error('pdf-lib not loaded'); if (!window.JSZip) throw new Error('JSZip not loaded'); const f=files[0]; const ab=await readFileAsArrayBuffer(f); const zip=await window.JSZip.loadAsync(ab); const media=[]; zip.folder('ppt/media')?.forEach((p,obj)=>media.push({p,obj})); const out=await PDFLib.PDFDocument.create(); if (media.length===0){ const page=out.addPage([595,842]); page.drawText('PPTX to PDF preview is limited in browser.',{x:50,y:800,size:14}); } else { for(const m of media){ const bytes=await m.obj.async('uint8array'); let img; try{ img=await out.embedJpg(bytes);}catch{ img=await out.embedPng(bytes);} const {width,height}=img.scale(1); const page=out.addPage([width,height]); page.drawImage(img,{x:0,y:0,width,height}); } } const blob=await blobFromPdfLibDoc(out); return { blob, suggestedName: createName(f.name,'.pdf') };
  };
  handlers['xls-to-pdf'] = async (files) => { if(!window.XLSX) throw new Error('SheetJS not loaded'); const f=files[0]; const ab=await readFileAsArrayBuffer(f); const wb=window.XLSX.read(new Uint8Array(ab),{type:'array'}); const sheet=wb.Sheets[wb.SheetNames[0]]; const html=window.XLSX.utils.sheet_to_html(sheet); const blob=await renderHtmlToPdf(html); return { blob, suggestedName: createName(f.name,'.pdf') }; };
  handlers['image-to-pdf'] = async (files) => { if(!window.PDFLib) throw new Error('pdf-lib not loaded'); const out=await PDFLib.PDFDocument.create(); for(const f of files){ const ab=new Uint8Array(await readFileAsArrayBuffer(f)); let img; try{ img=await out.embedJpg(ab);}catch{ img=await out.embedPng(ab);} const {width,height}=img.scale(1); const page=out.addPage([width,height]); page.drawImage(img,{x:0,y:0,width:img.width,height:img.height}); } const blob=await blobFromPdfLibDoc(out); const name=files[0]? files[0].name.replace(/\.[^/.]+$/, '')+'.pdf':'images.pdf'; return { blob, suggestedName:name }; };
  handlers['pdf-merge'] = async (files) => { if(!window.PDFLib) throw new Error('pdf-lib not loaded'); const out=await PDFLib.PDFDocument.create(); for(const f of files){ const ab=await readFileAsArrayBuffer(f); const src=await PDFLib.PDFDocument.load(ab); const pages=await out.copyPages(src,src.getPageIndices()); pages.forEach(p=>out.addPage(p)); } const blob=await blobFromPdfLibDoc(out); return { blob, suggestedName:'merged.pdf' }; };
  handlers['pdf-split'] = async (files) => { if(!window.PDFLib) throw new Error('pdf-lib not loaded'); if(!window.JSZip) throw new Error('JSZip not loaded'); const f=files[0]; const ab=await readFileAsArrayBuffer(f); const src=await PDFLib.PDFDocument.load(ab); const total=src.getPageCount(); const ranges=parseRanges((document.getElementById('splitRanges')||{}).value||`1-${total}`); if(!ranges.length) throw new Error('Please enter page ranges like 1-3,5'); const zip=new window.JSZip(); let i=1; for(const [s,e] of ranges){ const from=Math.max(1,s), to=Math.min(e,total); const sub=await PDFLib.PDFDocument.create(); const pages=await sub.copyPages(src, Array.from({length:(to-from+1)},(_,k)=>(from-1)+k)); pages.forEach(p=>sub.addPage(p)); const bytes=await sub.save(); zip.file(`split_${i}.pdf`, bytes); i++; } const blob=await zip.generateAsync({type:'blob'}); return { blob, suggestedName: createName(f.name,'_split.zip') }; };
  handlers['pdf-compress'] = async (files) => { if(!window.PDFLib) throw new Error('pdf-lib not loaded'); if(!window.pdfjsLib) throw new Error('PDF.js not loaded'); const f=files[0]; const ab=await readFileAsArrayBuffer(f); const pdf=await window.pdfjsLib.getDocument({data:new Uint8Array(ab)}).promise; const out=await PDFLib.PDFDocument.create(); for(let p=1;p<=pdf.numPages;p++){ const page=await pdf.getPage(p); const vp=page.getViewport({scale:1.0}); const scale=Math.min(1000/vp.width,1000/vp.height,1); const canvas=document.createElement('canvas'); canvas.width=Math.floor(vp.width*scale); canvas.height=Math.floor(vp.height*scale); const ctx=canvas.getContext('2d'); await page.render({canvasContext:ctx, viewport: page.getViewport({scale})}).promise; const dataUrl=canvas.toDataURL('image/jpeg',0.6); const bytes=Uint8Array.from(atob(dataUrl.split(',')[1]),c=>c.charCodeAt(0)); const img=await out.embedJpg(bytes); const pg=out.addPage([img.width,img.height]); pg.drawImage(img,{x:0,y:0,width:img.width,height:img.height}); } const blob=await blobFromPdfLibDoc(out); return { blob, suggestedName: createName(f.name,'_compressed.pdf') }; };
  handlers['pdf-sign'] = async (files) => { if(!window.PDFLib) throw new Error('pdf-lib not loaded'); const f=files[0]; const ab=await readFileAsArrayBuffer(f); const doc=await PDFLib.PDFDocument.load(ab); const font=await doc.embedFont(PDFLib.StandardFonts.Helvetica); doc.getPages().forEach((page)=>{ const {width,height}=page.getSize(); page.drawRectangle({x:50,y:50,width:180,height:60,borderColor:PDFLib.rgb(0.2,0.4,0.9),borderWidth:1.5}); page.drawText('Sign Here',{x:56,y:96,size:10,font,color:PDFLib.rgb(0.2,0.4,0.9)}); page.drawRectangle({x:width-230,y:50,width:180,height:60,borderColor:PDFLib.rgb(0.2,0.4,0.9),borderWidth:1.5}); page.drawText('Initials',{x:width-224,y:96,size:10,font,color:PDFLib.rgb(0.2,0.4,0.9)}); page.drawRectangle({x:50,y:height-120,width:200,height:40,borderColor:PDFLib.rgb(0.2,0.4,0.9),borderWidth:1.5}); page.drawText('Date',{x:56,y:height-96,size:10,font,color:PDFLib.rgb(0.2,0.4,0.9)}); }); const blob=await blobFromPdfLibDoc(doc); return { blob, suggestedName: createName(f.name,'_esign.pdf') }; };
  handlers['pdf-ocr'] = async (files) => { if(!window.PDFLib) throw new Error('pdf-lib not loaded'); if(!window.pdfjsLib) throw new Error('PDF.js not loaded'); if(!window.Tesseract) throw new Error('Tesseract not loaded'); const f=files[0]; const ab=await readFileAsArrayBuffer(f); const pdf=await window.pdfjsLib.getDocument({data:new Uint8Array(ab)}).promise; const out=await PDFLib.PDFDocument.create(); const MAX=Math.min(pdf.numPages,12); for(let p=1;p<=MAX;p++){ const page=await pdf.getPage(p); const vp=page.getViewport({scale:2.0}); const canvas=document.createElement('canvas'); canvas.width=vp.width; canvas.height=vp.height; await page.render({canvasContext:canvas.getContext('2d'), viewport:vp}).promise; const url=canvas.toDataURL('image/jpeg',0.9); const bytes=Uint8Array.from(atob(url.split(',')[1]),c=>c.charCodeAt(0)); const img=await out.embedJpg(bytes); const pg=out.addPage([img.width,img.height]); pg.drawImage(img,{x:0,y:0,width:img.width,height:img.height}); const { data } = await Tesseract.recognize(canvas,'eng'); const words=data.words||[]; const font=await out.embedFont(PDFLib.StandardFonts.Helvetica); words.forEach(w=>{ const x=w.bbox.x0; const h=w.bbox.y1-w.bbox.y0; const y=img.height - w.bbox.y0 - h; const t=w.text||''; if(t){ pg.drawText(t,{x,y,size:10,font,color:PDFLib.rgb(0,0,0),opacity:0}); } }); } const blob=await blobFromPdfLibDoc(out); return { blob, suggestedName: createName(f.name,'_ocr.pdf') }; };

  // Config
  const options = {
    'word-to-pdf': { accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', outputExtension: '.pdf', handler: handlers['word-to-pdf'], buttonIdle: 'Convert to PDF', buttonBusy: 'Converting…', summary: 'Word → PDF — Preserve your document formatting and fonts.', fileLabel: 'Select a Word document', fileHint: 'Supported formats: .docx' },
    'pdf-to-word': { accept: '.pdf,application/pdf', outputExtension: '.docx', handler: handlers['pdf-to-word'], buttonIdle: 'Convert to Word', buttonBusy: 'Converting…', summary: 'PDF → Word — Text-only DOCX (layout simplified).', fileLabel: 'Select a PDF file', fileHint: 'Supported formats: .pdf' },
    'ppt-to-pdf': { accept: '.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation', outputExtension: '.pdf', handler: handlers['ppt-to-pdf'], buttonIdle: 'Convert to PDF', buttonBusy: 'Converting…', summary: 'PowerPoint → PDF — Best-effort image-based rendering in browser.', fileLabel: 'Select a PPTX file', fileHint: 'Supported formats: .pptx' },
    'xls-to-pdf': { accept: '.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', outputExtension: '.pdf', handler: handlers['xls-to-pdf'], buttonIdle: 'Convert to PDF', buttonBusy: 'Converting…', summary: 'Excel → PDF — Renders first sheet as a table.', fileLabel: 'Select an Excel file', fileHint: 'Supported formats: .xls, .xlsx' },
    'image-to-pdf': { accept: 'image/png,image/jpeg', outputExtension: '.pdf', handler: handlers['image-to-pdf'], buttonIdle: 'Convert to PDF', buttonBusy: 'Converting…', summary: 'Images → PDF — Combines multiple images into a single PDF.', fileLabel: 'Select image files', fileHint: 'Supported formats: .png, .jpg', multiple: true, minFiles: 1 },
    'pdf-merge': { accept: '.pdf,application/pdf', outputExtension: '.pdf', handler: handlers['pdf-merge'], buttonIdle: 'Merge PDFs', buttonBusy: 'Merging…', summary: 'PDF Merge — Upload files in the order to merge.', fileLabel: 'Select PDF files', fileHint: 'Supported formats: .pdf (2 or more)', multiple: true, minFiles: 2 },
    'pdf-split': { accept: '.pdf,application/pdf', outputExtension: '.zip', handler: handlers['pdf-split'], buttonIdle: 'Split PDF', buttonBusy: 'Splitting…', summary: 'PDF Split — Enter page ranges (e.g., 1-3,5).', fileLabel: 'Select a PDF file', fileHint: 'Supported formats: .pdf' },
    'pdf-compress': { accept: '.pdf,application/pdf', outputExtension: '.pdf', handler: handlers['pdf-compress'], buttonIdle: 'Compress PDF', buttonBusy: 'Compressing…', summary: 'PDF Compress — Re-encodes pages as images at lower quality.', fileLabel: 'Select a PDF file', fileHint: 'Supported formats: .pdf' },
    'pdf-sign': { accept: '.pdf,application/pdf', outputExtension: '.pdf', handler: handlers['pdf-sign'], buttonIdle: 'Prepare for e-sign', buttonBusy: 'Tagging…', summary: 'E-Sign Prep — Adds signature/date/initials boxes.', fileLabel: 'Select a PDF file', fileHint: 'Supported formats: .pdf' },
    'pdf-ocr': { accept: '.pdf,application/pdf', outputExtension: '.pdf', handler: handlers['pdf-ocr'], buttonIdle: 'OCR PDF', buttonBusy: 'Running OCR…', summary: 'OCR — Makes scanned PDFs searchable (may be slow).', fileLabel: 'Select a scanned PDF', fileHint: 'Supported formats: .pdf' },
  };

  function renderEnhancements(type){ if(advList) advList.innerHTML=''; if(advNote) advNote.textContent=''; if (type==='pdf-split'){ const li=document.createElement('li'); const lab=document.createElement('label'); lab.setAttribute('for','splitRanges'); lab.textContent='Page ranges (e.g., 1-3,5)'; const input=document.createElement('input'); input.id='splitRanges'; input.type='text'; input.placeholder='1-3,5'; li.appendChild(lab); li.appendChild(input); advList.appendChild(li); advNote.textContent='Ranges outside bounds are clamped.'; } else if (type==='pdf-compress'){ advNote.textContent='Large PDFs may be slow — try splitting first.'; } else if (type==='pdf-ocr'){ advNote.textContent='OCR uses Tesseract.js (English). Long documents may take time.'; } }
  function applyConfig(type){ const cfg=options[type]||options['word-to-pdf']; if (typeSelect.value!==type && options[type]) typeSelect.value=type; labelText.textContent=cfg.fileLabel; hint.textContent=cfg.fileHint; summary.textContent=cfg.summary; sourceFile.accept=cfg.accept; sourceFile.value=''; sourceFile.multiple=!!cfg.multiple; if(cfg.multiple) sourceFile.setAttribute('multiple',''); else sourceFile.removeAttribute('multiple'); convertBtn.textContent=cfg.buttonIdle; result.innerHTML=''; setFile(null); renderEnhancements(type); try{ localStorage.setItem('folneb:type', type);}catch{} }

  const MAX = 100*1024*1024; const matches = (f, accept)=>{ if(!accept) return true; const parts=accept.split(',').map(s=>s.trim()).filter(Boolean); const ext=(f.name.split('.').pop()||'').toLowerCase(); return parts.some(p=> p.startsWith('.') ? p.slice(1).toLowerCase()===ext : f.type===p ); };

  form.addEventListener('submit', async (e)=>{
    e.preventDefault(); const type=typeSelect.value; const cfg=options[type]||options['word-to-pdf']; const files=Array.from(sourceFile.files||[]); result.innerHTML='';
    if(!files.length || (cfg.minFiles && files.length<cfg.minFiles)) return void result.appendChild((()=>{const p=document.createElement('p');p.className='error';p.textContent='Please select the required file(s).';return p;})());
    if(cfg.maxFiles && files.length>cfg.maxFiles) return void result.appendChild((()=>{const p=document.createElement('p');p.className='error';p.textContent=`You can upload up to ${cfg.maxFiles} files for this tool.`;return p;})());
    for(const f of files){ if(f.size>MAX) return void result.appendChild((()=>{const p=document.createElement('p');p.className='error';p.textContent='File exceeds 100MB limit.';return p;})()); if(!matches(f,cfg.accept)) return void result.appendChild((()=>{const p=document.createElement('p');p.className='error';p.textContent=`This tool accepts: ${cfg.accept}`;return p;})()); }
    setBusy(true,cfg.buttonIdle,cfg.buttonBusy); const started=performance.now(); console.log('[FOLNEB] Job start',{type,files:files.map(f=>({name:f.name,size:f.size}))});
    try{
      const out=await cfg.handler(files,cfg); const blob=out.blob; const name=out.suggestedName||createName(files[0]?.name, cfg.outputExtension||'.pdf');
      const msg=document.createElement('p'); msg.className='result-message'; msg.textContent='Your file is ready.'; result.appendChild(msg);
      downloadBlob(blob,name);
      if (window.pdfjsLib){ const btn=document.createElement('button'); btn.type='button'; btn.className='btn btn-outline'; btn.textContent='Preview'; btn.addEventListener('click',()=>openPreview(blob)); result.appendChild(btn); }
      console.log('[FOLNEB] Job finish',{type,durationMs:Math.round(performance.now()-started),bytes:blob&&blob.size||null});
      try{ if(window.saveJob){ await window.saveJob({type,status:'success',inputName:files[0]?.name||'',outputName:name,size:files.reduce((s,f)=>s+f.size,0),durationMs:Math.round(performance.now()-started)}); if(window.listRecentJobs) window.listRecentJobs(); } }catch{}
    }catch(err){ const m=(err&&err.message)?err.message:'Something went wrong.'; const p=document.createElement('p'); p.className='error'; p.textContent=m; result.appendChild(p); }
    finally{ setBusy(false,cfg.buttonIdle,cfg.buttonBusy); }
  });

  typeSelect.addEventListener('change', (e)=> applyConfig(e.target.value));
  sourceFile.addEventListener('change', ()=>{ const files=sourceFile.files; setFile(files); try{ const recent=JSON.parse(localStorage.getItem('folneb:recent')||'[]'); const names=Array.from(files||[]).map(f=>f.name); localStorage.setItem('folneb:recent', JSON.stringify([...names,...recent].slice(0,10))); }catch{} });
  const initType=(localStorage.getItem('folneb:type')|| new URLSearchParams(location.search).get('type') || 'word-to-pdf').toLowerCase();
  console.log('FOLNEB libs:', { mammoth: !!window.mammoth, pdfLib: !!window.PDFLib, jsPDF: !!(window.jspdf||window.jsPDF), sheetjs: !!window.XLSX, tesseract: !!window.Tesseract, jszip: !!window.JSZip, html2canvas: !!window.html2canvas, pdfjs: !!window.pdfjsLib });
  applyConfig(options[initType]? initType : 'word-to-pdf');

  // Preview modal
  const modal=$('#previewModal'); const backdrop=$('#previewBackdrop'); const closeBtn=$('#previewClose'); const prevBtn=$('#previewPrev'); const nextBtn=$('#previewNext'); const pageInfo=$('#previewPageInfo'); const canvas=$('#previewCanvas'); let pv={pdf:null,page:1,total:1};
  async function renderPage(){ if(!pv.pdf) return; const page=await pv.pdf.getPage(pv.page); const scale=1.2; const vp=page.getViewport({scale}); const ctx=canvas.getContext('2d'); canvas.width=vp.width; canvas.height=vp.height; await page.render({canvasContext:ctx, viewport:vp}).promise; if(pageInfo) pageInfo.textContent=`Page ${pv.page} of ${pv.total}`; }
  async function openPreview(blob){ if(!window.pdfjsLib||!modal) return; try{ const ab=await blob.arrayBuffer(); pv.pdf=await window.pdfjsLib.getDocument({data:new Uint8Array(ab)}).promise; pv.page=1; pv.total=pv.pdf.numPages; modal.hidden=false; await renderPage(); }catch(e){ console.warn('Preview failed',e);} }
  function closePreview(){ if(modal) modal.hidden=true; pv={pdf:null,page:1,total:1}; }
  if(closeBtn) closeBtn.addEventListener('click', closePreview); if(backdrop) backdrop.addEventListener('click', closePreview); if(prevBtn) prevBtn.addEventListener('click', async ()=>{ if(pv.page>1){ pv.page--; await renderPage(); } }); if(nextBtn) nextBtn.addEventListener('click', async ()=>{ if(pv.page<pv.total){ pv.page++; await renderPage(); } });

  // Cloud import/export stubs
  const btnDrive=$('#importDriveBtn'); const btnOneDrive=$('#importOneDriveBtn'); if(btnDrive) btnDrive.addEventListener('click',()=>alert('TODO: Wire Google Drive Picker → populate #sourceFile.')); if(btnOneDrive) btnOneDrive.addEventListener('click',()=>alert('TODO: Wire OneDrive Picker → populate #sourceFile.'));

  // Auth UI
  const btnIn=$('#signInBtn'); const btnOut=$('#signOutBtn'); const acct=$('#accountStatus'); const setStatus=(t)=>{ if(acct) acct.textContent=t||''; };
  if(btnIn) btnIn.addEventListener('click', async ()=>{ try{ if(window.authSignInGoogle){ const u=await window.authSignInGoogle(); setStatus(u?`Signed in as ${u.email||u.displayName||'user'}`:'Signed in'); } else setStatus('Firebase not configured. Add SDK to enable sign-in.'); } catch{ setStatus('Sign-in failed'); } });
  if(btnOut) btnOut.addEventListener('click', async ()=>{ try{ if(window.authSignOut){ await window.authSignOut(); setStatus('Signed out'); } else setStatus('Firebase not configured.'); } catch{ setStatus('Sign-out failed'); } });
})();

