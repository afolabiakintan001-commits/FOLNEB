# FOLNEB

To change the server endpoint for pixel-perfect Word?PDF, update this line in converter.html before app scripts:

```
<script>window.FOLNEB_API="/convert/docx-to-pdf";</script>
```

Replace the value with your deployed proxy URL (see server/README.md) or remove it to force client-side fallback.