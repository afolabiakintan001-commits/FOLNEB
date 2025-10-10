import { Worker } from "bullmq";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY!, secretAccessKey: process.env.S3_SECRET_KEY! },
  forcePathStyle: true
});
const BUCKET = process.env.S3_BUCKET!;

new Worker("jobs", async job => {
  const { id, op, inputs } = job.data as { id:string, op:string, inputs:{key:string,name:string}[] };

  const localFiles:string[] = [];
  for (const f of inputs) {
    const out = join(tmpdir(), `${rand()}-${basename(f.name)}`);
    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: f.key }));
    await pipeline(obj.Body as any, createWriteStream(out));
    localFiles.push(out);
  }

  let outPath = join(tmpdir(), `${id}-out.pdf`);
  switch (op) {
    case "merge":
      await run("gs", ["-dBATCH","-dNOPAUSE","-q","-sDEVICE=pdfwrite", `-sOutputFile=${outPath}`, ...localFiles]);
      break;
    case "compress":
      await run("gs", ["-dBATCH","-dNOPAUSE","-q","-sDEVICE=pdfwrite","-dPDFSETTINGS=/ebook", `-sOutputFile=${outPath}`, localFiles[0]]);
      break;
    case "split":
      const base = join(tmpdir(), `${id}-%03d.pdf`);
      await run("gs", ["-dBATCH","-dNOPAUSE","-sDEVICE=pdfwrite", `-sPageList=1-99999`, `-sOutputFile=${base}`, localFiles[0]]);
      outPath = join(tmpdir(), `${id}-parts.zip`);
      await run("zip", ["-j", outPath, ...await listLike(join(tmpdir(), `${id}-`), ".pdf")]);
      break;
    case "docx2pdf":
      await run("soffice", ["--headless","--convert-to","pdf","--outdir", tmpdir(), localFiles[0]]);
      outPath = localFiles[0].replace(/\.docx$/i, ".pdf").replace(/.*[\\/]/, tmpdir() + "/");
      break;
    case "pdf2docx":
      await run("soffice", ["--headless","--convert-to","docx","--outdir", tmpdir(), localFiles[0]]);
      outPath = join(tmpdir(), `${id}.docx`);
      break;
    case "ocr":
      const img = join(tmpdir(), `${id}-%04d.png`);
      await run("magick", [localFiles[0], "-density","300", img]);
      await run("tesseract", [join(tmpdir(), `${id}-0001`), join(tmpdir(), `${id}-ocr`), "pdf"]);
      outPath = join(tmpdir(), `${id}-ocr.pdf`);
      break;
    case "flatten":
      await run("gs", ["-o", outPath, "-sDEVICE=pdfwrite", "-dPDFSETTINGS=/prepress", "-dDetectDuplicateImages=true", localFiles[0]]);
      break;
    default:
      throw new Error(`Unknown op ${op}`);
  }

  const key = `out/${id}/${Date.now()}-${op}${outPath.endsWith(".zip") ? ".zip" : outPath.endsWith(".docx") ? ".docx" : ".pdf"}`;
  const buf = await fs.readFile(outPath);
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buf }));
  return { downloadKey: key };
}, { connection: { url: process.env.REDIS_URL! } });

function run(cmd:string, args:string[]) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit" });
    p.on("exit", code => code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} -> ${code}`)));
  });
}
function rand(){ return randomBytes(6).toString("hex"); }
async function listLike(prefix:string, ext:string){
  const dir = tmpdir();
  const files = await fs.readdir(dir);
  return files.filter(f => f.startsWith(prefix.split("/").pop()!) && f.endsWith(ext)).map(f => join(dir,f));
}

