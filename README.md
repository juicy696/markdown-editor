# ME.js

**Zero-dependency, single-file WYSIWYG Markdown editor.**

Edit visually like a word processor — everything is stored as clean **Markdown** underneath.
Works with vanilla JS, Vue 3 and React 18 — no build step, no bundler, no npm install required.

---

## ✨ Features

- **WYSIWYG editing** — rendered rich text you can edit directly; Markdown is the storage format, serialized live on every keystroke
- **Full formatting** — H1–H3, bold, italic, strikethrough, inline code, text color, blockquote, bullet/numbered/task lists, code blocks, tables, links, images, audio, video, horizontal rule
- **Dialog-based insertion** — images (title + URL), audio, video, tables (custom rows/columns)
- **Paste images from clipboard** — upload to your own endpoint or auto-fall back to base64
- **Image resize** — click any image for a size toolbar (Original / 100% / 75% / 50% / 25%), persisted as HTML on export
- **Markdown source view** — live view of the underlying Markdown, one-click copy to clipboard
- **Export API** — pure Markdown, rendered HTML, or mixed Markdown+HTML; download as file
- **Configurable** — toggle any toolbar button, character limit with red overflow warning, custom upload endpoint
- **Eraser tool** — strip all formatting from the selection with one click
- **~57 KB per file, zero dependencies** — the Vue/React variants need only their framework

---

## 📦 Install

### Option A — CDN (recommended, no install)

```html
<!-- Vanilla JS -->
<script src="https://cdn.jsdelivr.net/gh/juicy696/markdown-editor@main/src/me-editor.js"></script>

<!-- Vue 3 -->
<script src="https://unpkg.com/vue@3"></script>
<script src="https://cdn.jsdelivr.net/gh/juicy696/markdown-editor@main/src/me-vue.js"></script>

<!-- React 18 -->
<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://cdn.jsdelivr.net/gh/juicy696/markdown-editor@main/src/me-react.js"></script>
```

### Option B — download

Download `src/me-editor.js` (or the vue/react variant) and include it locally. That's it.

---

## 🚀 Usage

### Vanilla JS

```html
<!-- 1. mount element with Markdown/HTML content -->
<div id="app">
# Hello

This is **bold** text.
</div>

<!-- 2. load the framework -->
<script src="me-editor.js"></script>

<script>
  // 3. initialize
  ME.init({
    mount: '#app',
    title: 'ME.js Editor',
    uploadUrl: 'http://localhost:1688/upload',  // paste-image upload (optional)
    maxLength: 0                                // character cap (optional)
  });
</script>
```

### Vue 3

```html
<div id="app">
  <me-editor v-model="content" title="My Editor" />
</div>
<script src="https://unpkg.com/vue@3"></script>
<script src="me-vue.js"></script>
<script>
  Vue.createApp({
    data: () => ({ content: '# Hello\n\nThis is **bold**.' })
  }).use(MEVue).mount('#app');
</script>
```

### React 18

```html
<div id="root"></div>
<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="me-react.js"></script>
<script>
  const e = React.createElement;
  function App() {
    const [md, setMd] = React.useState('# Hello\n\nThis is **bold**.');
    return e(MEReact.MeEditor, { value: md, onChange: setMd });
  }
  ReactDOM.createRoot(document.getElementById('root')).render(e(App));
</script>
```

---

## ⚙️ Options

| Option | Type | Default | Description |
|---|---|---|---|
| `mount` | string | `'#app'` | Mount element selector (JS version) |
| `title` | string | `'ME.js Editor'` | Nav bar title |
| `placeholder` | string | `'Start writing...'` | Empty-state hint |
| `iconsMode` | string | `'remote'` | Material Icons from Google CDN, or `'local'` |
| `uploadUrl` | string | `null` | Paste-image upload endpoint |
| `pasteImage` | string | `'auto'` | `'auto'` / `'base64'` / `'upload'` |
| `showViewCode` | boolean | `true` | View-Markdown toolbar button |
| `showCopy` | boolean | `true` | Copy-Markdown toolbar button |
| `showAudio` | boolean | `true` | Audio insert button |
| `showVideo` | boolean | `true` | Video insert button |
| `showStatusBar` | boolean | `true` | Character-count bar |
| `maxLength` | number | `0` | Character cap; red warning when exceeded |

Full reference: [Docs](https://juicy696.github.io/markdown-editor/help.html)

---

## 🧩 Public API (JS version)

```js
const editor = ME.init({ mount: '#app' });

editor.getMarkdown();              // pure Markdown
editor.getHTML();                  // rendered HTML
editor.export();                   // { markdown, html, mixed }
editor.exportMixed();              // MD + HTML blocks for tables/code
editor.download('doc', 'md');      // 'md' | 'html' | 'mixed'
editor.setMarkdown('# ...');       // import Markdown string
editor.importFromElement('#src');  // import from any element
editor.clear();

// core modules (all three versions export these)
ME.MdParser.parse('# markdown');     // -> HTML
ME.MdSerializer.serialize(domNode);  // -> Markdown
```

---

## 🖼 Paste-Image Upload

Set `uploadUrl` and pasted images upload to your backend; the response
`{ "url": "..." }` becomes the inserted image source. Without it, images
fall back to base64 automatically.

A minimal receiver (`server.py`, Python stdlib only) ships in the repository:

```bash
python server.py        # POST /upload on port 1688, serves uploads/ statically
```

---

## 🌐 Live Demo

**[https://juicy696.github.io/markdown-editor/](https://juicy696.github.io/markdown-editor/)**

Each demo page is itself the running editor — the content is the documentation.

- [JavaScript version](https://juicy696.github.io/markdown-editor/index.html)
- [Vue 3 version](https://juicy696.github.io/markdown-editor/vue.html)
- [React 18 version](https://juicy696.github.io/markdown-editor/react.html)

---

## 📁 Repository Layout

```
├── src/
│   ├── me-editor.js    # vanilla JS (engine + editor)
│   ├── me-vue.js       # engine + Vue 3 adapter
│   └── me-react.js     # engine + React 18 adapter
├── docs/               # GitHub Pages site (live demos)
│   ├── index.html      # JS version demo
│   ├── vue.html        # Vue version demo
│   ├── react.html      # React version demo
│   ├── help.html       # full documentation
│   └── assets/
├── scripts/
│   └── sync_core.js    # sync engine core into vue/react variants
├── server.py           # optional paste-image upload receiver
└── package.json
```

---

## 📄 License

[Apache-2.0](LICENSE) · Copyright 2026 Jakey Zhu

Token services powered by [AceData](https://share.acedata.cloud/r/1uN88BrUTQ).
