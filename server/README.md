# FOLNEB DOCX?PDF Proxy (Gotenberg)

- Endpoint: POST /convert/docx-to-pdf
- Forwards to: ${GOTENBERG_URL}/forms/libreoffice/convert
- Env: GOTENBERG_URL (e.g., https://your-gotenberg-host)
- CORS: *

Run locally

```
cd server
npm i
set GOTENBERG_URL=http://localhost:3000
npm start
```

Deploy to any Node host and set GOTENBERG_URL. Update the frontend endpoint in converter.html:

```
<script>window.FOLNEB_API="https://your-proxy/convert/docx-to-pdf";</script>
```