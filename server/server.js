import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fetch from 'node-fetch';
import FormData from 'form-data';

const app = express();
app.use(cors({ origin: '*'}));
app.use(express.raw({ type: ['application/octet-stream','application/vnd.openxmlformats-officedocument.wordprocessingml.document'], limit: '100mb' }));
const upload = multer({ limits: { fileSize: 100 * 1024 * 1024 } });

const GOTENBERG_URL = process.env.GOTENBERG_URL || 'http://localhost:3000';

app.post('/convert/docx-to-pdf', upload.single('file'), async (req, res) => {
  try {
    let filename = req.headers['x-filename'] || 'document.docx';
    let buf;
    if (req.file && req.file.buffer) {
      buf = req.file.buffer;
      filename = req.file.originalname || filename;
    } else if (req.body && req.body.length) {
      buf = req.body; // raw body
    } else {
      return res.status(400).json({ error: 'No file received' });
    }

    const form = new FormData();
    form.append('files', buf, { filename, contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

    const got = await fetch(${GOTENBERG_URL}/forms/libreoffice/convert, { method: 'POST', body: form, headers: form.getHeaders() });
    if (!got.ok) {
      const txt = await got.text().catch(() => '');
      return res.status(got.status).type('text/plain').send(txt || 'Gotenberg convert failed');
    }
    res.set('Content-Type', 'application/pdf');
    got.body.pipe(res);
  } catch (e) {
    console.error('Proxy error', e);
    res.status(500).json({ error: 'proxy_failed' });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log([FOLNEB] proxy listening on :, target=));
