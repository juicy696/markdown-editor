# ME.js Changelog

## 1.0.0 (2026-10-03)

Initial public release.

- WYSIWYG rich text editing with live Markdown serialization
- Full toolbar: headings, bold, italic, strikethrough, inline code, text color,
  blockquote, bullet/numbered/task lists, code blocks, tables, links, images,
  audio, video, horizontal rule
- Dialog-based insertion for images (title+URL), audio, video and tables (rows/columns)
- Paste images from clipboard: upload endpoint or base64 fallback
- Image click-to-resize (Original/100%/75%/50%/25%) with HTML round-trip
- Markdown source view, clipboard copy, export API (md/html/mixed)
- Eraser tool, undo/redo (100 steps), character counter with overflow warning
- Three flavors: vanilla JS, Vue 3 component, React 18 component
- Optional paste-image upload receiver (server.py, Python stdlib only)
