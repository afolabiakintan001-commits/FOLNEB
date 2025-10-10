import express from "express";
import multer from "multer";
import cors from "cors";
import crypto from "crypto";
import { Queue, Job } from "bullmq";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const app = express();
app.use(cors());
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

const queue = new Queue("jobs", { connection: { url: process.env.REDIS_URL! } });

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY!, secretAccessKey: process.env.S3_SECRET_KEY! },
  forcePathStyle: true
});
const BUCKET = process.env.S3_BUCKET!;

async function s3Put(Key:string, Body:Buffer, ContentType:string) {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key, Body, ContentType }));
}
async function s3Presign(Key:string, expiresIn:number) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key }), { expiresIn });
}

/** Create job */
app.post("/job/:op", upload.array("files"), async (req, res) => {
  try {
    const { op } = req.params; // merge|split|compress|docx2pdf|pdf2docx|ocr|flatten
    const id = crypto.randomUUID();
    const files = (req.files as Express.Multer.File[]) || [];
    if (!files.length) return res.status(400).json({ error: "no_files" });

    const inputs = await Promise.all(files.map(async f => {
      const key = `in/${id}/${crypto.randomUUID()}-${f.originalname}`;
      await s3Put(key, f.buffer, f.mimetype);
      return { key, name: f.originalname, mimetype: f.mimetype };
    }));

    await queue.add(op, { id, op, inputs }, { jobId: id, removeOnComplete: true, removeOnFail: false, attempts: 1 });
    res.json({ id });
  } catch (e:any) {
    res.status(500).json({ error: e?.message || 'server_error' });
  }
});

/** Poll job */
app.get("/job/:id", async (req, res) => {
  try {
    const job = await Job.fromId(queue, req.params.id).catch(() => null);
    if (!job) return res.status(404).json({ state: "not_found" });
    const state = await job.getState();
    res.json({ state, progress: job.progress || 0, result: job.returnvalue || null });
  } catch (e:any) {
    res.status(500).json({ state: 'failed', error: e?.message || 'server_error' });
  }
});

/** Get presigned download URL */
app.get("/download/:key", async (req, res) => {
  try {
    const url = await s3Presign(req.params.key, Number(process.env.PUBLIC_DOWNLOAD_TTL || 3600));
    res.json({ url });
  } catch (e:any) {
    res.status(500).json({ error: e?.message || 'server_error' });
  }
});

app.listen(8080, () => console.log("API listening on :8080"));

