# ilikepdf (FOLNEB PDF Tools)

End-to-end iLovePDF-style clone with client + server conversions.

## Repo layout

```
ilikepdf/
  docker-compose.yml
  .env
  api/
  worker/
  web/
```

## One-command bring-up

```
docker compose up --build
# web: http://localhost:5173
# api: http://localhost:8080
# minio console: http://localhost:9001 (admin / adminadmin)
```

## Acceptance tests

1. Client merge: select 2+ PDFs → Merge (client) → downloads merged.pdf locally.
2. DOCX→PDF: upload .docx → job completes → download URL works.
3. Compress: upload a big PDF → output size smaller.
4. OCR: upload scanned PDF (image-only) → output is searchable text.
5. Split: upload multi-page PDF → returns .zip of per-page PDFs.
6. Flatten: upload form PDF → output has flattened fields.

## Notes

- S3 client uses `forcePathStyle: true` for MinIO.
- File size limit: 200MB (multer).
- Worker image includes: ghostscript, libreoffice, imagemagick, tesseract-ocr, zip.
- Security hardening later: virus scan, rate limit, short TTL URLs, auto-purge.

```
# If you need to clean containers/images
# docker compose down -v
```

