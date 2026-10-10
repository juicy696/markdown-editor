# ME.js Changelog

## 1.1.0 (2026-10-10)

### Code Mode (all flavors)

- Toolbar buttons now work in code mode: bold/italic/strikethrough/inline code
  wrap the selection, headings/quote/lists/task prepend line prefixes, code
  block & horizontal rule insert at the cursor
- Dialog insertions (link/image/audio/video/message) insert Markdown/HTML
  text into the source textarea; tables insert Markdown pipe syntax
- Text color in code mode wraps the selection with `<span style="color:...">`
- Switching back to preview always re-parses the latest textarea content
  (dialog insertions now show up in preview reliably)

### Color Picker (all flavors)

- New color dialog: recent-color swatches (max 20, deduped, newest first,
  persisted in localStorage) + a custom pick tile that opens the native
  color chooser (click applies immediately, no intermediate picks)
- Grey `+` pick tile when no history yet; history shared across all flavors
- Vanilla: toolbar palette icon unchanged

### React flavor

- Ported full code-mode support, color dialog and color history
- Fixed: modal focus stealing on every keystroke (message/link/table inputs
  lost typing); focus is now taken once when the dialog opens
- Fixed: table dialog lost the caret — inserted tables landed at the top;
  selection is saved/restored around the dialog
- Fixed: page scrolled to top after insertions (`focus({ preventScroll })`)
- Fixed: color swatch styles were missing entirely
- Toolbar: removed undo/redo buttons, replaced copy button with an info
  button opening the About dialog, removed the always-disabled ink-eraser
  leftover, toggle icon now syncs between toolbar and navbar

### Vanilla flavor

- Toolbar view-code button now toggles its icon/title together with the
  navbar button

### Site

- Brand "ME" in the nav is now red italic; "Editor" unchanged
- Demo pages load `nav.js` with a cache-busting timestamp
- Link dialog labels/placeholders use English in all flavors

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
