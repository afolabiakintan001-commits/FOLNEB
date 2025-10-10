import { useState } from "react";
import { PDFDocument } from "pdf-lib";

const API = (import.meta as any).env.VITE_API_URL || "http://localhost:8080";

export default function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [job, setJob] = useState<{id:string}|null>(null);
  const [status, setStatus] = useState<any>(null);

  async function startJob(op:string) {
    const fd = new FormData();
    files.forEach(f => fd.append("files", f, f.name));
    const r = await fetch(`${API}/job/${op}`, { method: "POST", body: fd });
    const j = await r.json();
    setJob({ id: j.id }); poll(j.id);
  }

  function poll(id:string) {
    const t = setInterval(async () => {
      const r = await fetch(`${API}/job/${id}`); const j = await r.json();
      setStatus(j);
      if (j.state === "completed" || j.state === "failed" || j.state === "not_found") clearInterval(t);
    }, 1000);
  }

  async function clientMerge() {
    if (files.length < 2) return;
    const merged = await PDFDocument.create();
    for (const f of files) {
      const b = await f.arrayBuffer();
      const pdf = await PDFDocument.load(b);
      const pages = await merged.copyPages(pdf, pdf.getPageIndices());
      pages.forEach(p => merged.addPage(p));
    }
    const out = await merged.save();
    downloadBlob(new Blob([out], { type: "application/pdf" }), "merged.pdf");
  }

  async function downloadResult() {
    const key = status?.result?.downloadKey;
    if (!key) return;
    const r = await fetch(`${API}/download/${key}`); const { url } = await r.json();
    window.location.href = url;
  }

  return (
    <div style={{padding:20}}>
      <h1>FOLNEB PDF Tools</h1>
      <div className="card">
        <input multiple type="file" onChange={e=> setFiles(Array.from(e.target.files || []))} />
      </div>
      <div className="grid" style={{marginTop:12}}>
        <button onClick={clientMerge}>Merge (client)</button>
        <button onClick={()=>startJob("compress")}>Compress</button>
        <button onClick={()=>startJob("docx2pdf")}>DOCX → PDF</button>
        <button onClick={()=>startJob("pdf2docx")}>PDF → DOCX</button>
        <button onClick={()=>startJob("ocr")}>OCR</button>
        <button onClick={()=>startJob("flatten")}>Flatten</button>
        <button onClick={()=>startJob("split")}>Split</button>
      </div>
      {job && <p>Job: {job.id}</p>}
      {status && <p>Status: {status.state} {status.progress?`(${status.progress}%)`:''}</p>}
      {status?.state === "completed" && <button onClick={downloadResult}>Download</button>}
    </div>
  );
}
function downloadBlob(blob:Blob, name:string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

