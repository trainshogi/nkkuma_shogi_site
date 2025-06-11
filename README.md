# Shogiban to Kif Frontend

This project contains the frontend for the shogi board recognition service.  The legacy static files under `public/` were refactored to use **Next.js** so that the site can be generated statically and maintained more easily.

## Development

1. Install **Node.js 18** or later.
2. Install dependencies:

   ```bash
   npm install
   ```
3. Start the development server:

   ```bash
   npm run dev
   ```
   The site will be available at `http://localhost:3000`.

## Building a Static Site

To build the production files and output a fully static site use:

```bash
npm run build
```

The generated files will be placed in the `out/` directory and can be uploaded to S3 or any other static hosting provider.

## Notes

- External libraries such as jQuery, Bootstrap and Exif.js are loaded from public CDNs and no longer stored in this repository.
- Original HTML/CSS/JS assets are kept under `public/` and referenced from the Next.js pages.
- Firebase specific code has been removed.
