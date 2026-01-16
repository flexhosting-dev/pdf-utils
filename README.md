# PDF Utils

A modern, client-side PDF utilities web app. All processing happens in your browser - no server uploads required, keeping your files private.

## Features

- **Merge PDFs** - Combine multiple PDF files into a single document with drag-and-drop reordering
- **Split PDF** - Extract specific pages, page ranges, or split into individual files with thumbnail previews
- **Compress PDF** - Reduce file size with three quality levels (Maximum, Balanced, Minimum)
- **Convert Images to PDF** - Convert JPG, PNG, and WebP images to PDF
- **Convert PDF to Images** - Export PDF pages as PNG or JPG with configurable scale (1x-4x)

## Tech Stack

- **HTML5/CSS3/Vanilla JS** - No build tools needed
- **[pdf-lib](https://pdf-lib.js.org/)** - PDF manipulation (merge, split, compress)
- **[PDF.js](https://mozilla.github.io/pdf.js/)** - PDF rendering and previews
- **Modern CSS** - CSS Grid, Flexbox, CSS Variables for theming
- **Drag & Drop API** - For file uploads and reordering

## Usage

Simply open `index.html` in any modern web browser. No server or installation required.

For local development, you can serve the files with any static server:

```bash
# Using Node.js
npx serve

# Using Python
python -m http.server 8080
```

## Privacy

All PDF processing happens entirely in your browser using JavaScript. Your files are never uploaded to any server, ensuring complete privacy and security.

## Browser Support

Works in all modern browsers:
- Chrome/Edge (recommended)
- Firefox
- Safari

## License

MIT License
