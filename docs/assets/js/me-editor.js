/* ============================================================
 * ME.js — WYSIWYG Markdown Editor Framework (vanilla JS)
 * Version: 0.2.0
 *
 * Editing model:
 *   - WYSIWYG rich editing (preview mode): you edit rendered text,
 *     toolbar icons apply live formatting to the selection
 *   - The rich DOM is serialized to Markdown underneath (the storage format)
 *   - "View Code" shows the underlying Markdown source
 *   - On load, Markdown is parsed back to rich HTML
 * ============================================================ */
(function (global) {
  'use strict';

  const DEFAULTS = {
    mount: '#app',
    title: 'ME.js Editor',
    placeholder: 'Start writing...',
    storageKey: 'me_js_doc_v2',
    iconsMode: 'remote',                          // 'remote' | 'local'
    iconsRemoteUrl: 'https://fonts.googleapis.com/icon?family=Material+Icons',
    iconsLocalPath: './icons/material-icons.css',
    initialMarkdown: null,  // when null and importFromContent, uses mount element content
    importFromContent: true, // take mount element's inner content as initial document
    pasteImage: 'auto',      // 'auto' | 'base64' | 'upload'
    uploadUrl: null,         // e.g. 'http://localhost:8888/upload' — enables paste-upload
    showViewCode: true,      // toolbar View-Markdown button
    showCopy: true,          // toolbar Copy-Markdown button
    showAudio: true,         // toolbar Audio button
    showVideo: true,         // toolbar Video button
    showStatusBar: true,     // bottom status bar (char count)
    maxLength: 0             // >0 = hard cap; count turns red when exceeded
  };

  const I = {
    logo: 'edit_note',
    bold: 'format_bold',
    italic: 'format_italic',
    strike: 'strikethrough_s',
    h1: 'looks_one',
    h2: 'looks_two',
    h3: 'looks_3',
    para: 'notes',
    quote: 'format_quote',
    ul: 'format_list_bulleted',
    ol: 'format_list_numbered',
    task: 'checklist',
    code: 'code',
    codeInline: 'data_object',
    link: 'link',
    image: 'image',
    audio: 'library_music',
    video: 'movie',
    color: 'palette',
    eraser: 'ink_eraser',
    copy: 'content_copy',
    hr: 'horizontal_rule',
    table: 'grid_on',
    preview: 'visibility',
    codeView: 'code',
    about: 'info',
    save: 'save',
    undo: 'undo',
    redo: 'redo',
    close: 'close'
  };

  /* ---------- Utils ---------- */
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function icon(name, title, outlined) {
    return '<span class="material-icons' + (outlined ? '-outlined' : '') + '" title="' + title + '">' + name + '</span>';
  }
  function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function escMd(s) { return s; }
  function debounce(fn, ms) {
    let t;
    return function () { clearTimeout(t); const a = arguments, c = this;
      t = setTimeout(() => fn.apply(c, a), ms); };
  }

  /* ============================================================
   * Markdown -> HTML (used on load & preview)
   * ============================================================ */
  const MdParser = {
    parse(md) {
      let src = (md || '').replace(/\r\n/g, '\n');
      const blocks = [];
      src = src.replace(/```([\w-]*)\n([\s\S]*?)```/g, (m, lang, code) => {
        blocks.push('<pre class="me-pre" data-me-block="code"><code>' + escHtml(code.replace(/\n$/, '')) + '</code></pre>');
        return '\u0000B' + (blocks.length - 1) + '\u0000';
      });

      const lines = src.split('\n');
      let html = '', i = 0;
      let inUl = false, inOl = false, inQuote = false, inTask = false;

      const closeLists = () => {
        if (inTask) { html += '</ul>'; inTask = false; }
        if (inUl) { html += '</ul>'; inUl = false; }
        if (inOl) { html += '</ol>'; inOl = false; }
        if (inQuote) { html += '</blockquote>'; inQuote = false; }
      };
      const openList = (tag) => {
        if (inTask) { html += '</ul>'; inTask = false; }
        if (tag === 'ul' && !inUl) { closeLists(); html += '<ul>'; inUl = true; }
        if (tag === 'ol' && !inOl) { closeLists(); html += '<ol>'; inOl = true; }
      };

      const inline = (t) => {
        t = escHtml(t);
        t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
          (m, alt, url, title) => '<img src="' + url + '" alt="' + alt + '"' + (title ? ' title="' + title + '"' : '') + '>');
        t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
        t = t.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
        t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        t = t.replace(/~~([^~]+)~~/g, '<del>$1</del>');
        t = t.replace(/`([^`]+)`/g, '<code class="me-code-inline">$1</code>');
        return t;
      };

      for (; i < lines.length; i++) {
        const line = lines[i];
        let m = line.match(/^\u0000B(\d+)\u0000$/);
        if (m) { closeLists(); html += blocks[+m[1]]; continue; }

        m = line.match(/^(#{1,6})\s+(.*)$/);
        if (m) { closeLists(); const lv = m[1].length; html += '<h' + lv + '>' + inline(m[2]) + '</h' + lv + '>'; continue; }

        if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) { closeLists(); html += '<hr>'; continue; }

        m = line.match(/^>\s?(.*)$/);
        if (m) {
          if (inUl || inOl) closeLists();
          if (!inQuote) { html += '<blockquote>'; inQuote = true; }
          html += '<p>' + inline(m[1]) + '</p>'; continue;
        } else if (inQuote) { html += '</blockquote>'; inQuote = false; }

        m = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
        if (m) {
          if (inUl) { html += '</ul>'; inUl = false; }
          if (inOl) { html += '</ol>'; inOl = false; }
          if (!inTask) { html += '<ul class="me-task">'; inTask = true; }
          html += '<li><input type="checkbox" data-me-task' + (m[1].toLowerCase() === 'x' ? ' checked' : '') + '> ' + inline(m[2]) + '</li>';
          continue;
        } else if (inTask) { html += '</ul>'; inTask = false; }

        m = line.match(/^\s*[-*]\s+(.*)$/);
        if (m) { openList('ul'); html += '<li>' + inline(m[1]) + '</li>'; continue; }

        m = line.match(/^\s*\d+\.\s+(.*)$/);
        if (m) { openList('ol'); html += '<li>' + inline(m[1]) + '</li>'; continue; }

        if (/\|/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
          closeLists();
          const parseRow = (r) => r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
          const head = parseRow(line);
          i += 2;
          let tbl = '<table class="me-table"><thead><tr>';
          head.forEach(h => tbl += '<th>' + inline(h) + '</th>');
          tbl += '</tr></thead><tbody>';
          while (i < lines.length && /\|/.test(lines[i])) {
            const cells = parseRow(lines[i]);
            tbl += '<tr>' + cells.map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>';
            i++;
          }
          i--;
          tbl += '</tbody></table>';
          html += tbl; continue;
        }

        if (/^\s*$/.test(line)) { closeLists(); continue; }

        closeLists();
        const para = [line];
        while (i + 1 < lines.length && !/^\s*$/.test(lines[i + 1]) &&
               !/^(#{1,6})\s|^>|^\s*[-*]\s|^\s*\d+\.\s|^\u0000B/.test(lines[i + 1])) {
          para.push(lines[++i]);
        }
        html += '<p>' + para.map(inline).join('<br>') + '</p>';
      }
      closeLists();
      return html;
    }
  };

  /* ============================================================
   * HTML -> Markdown serializer (rich DOM to markdown)
   * ============================================================ */
  const MdSerializer = {
    serialize(root) {
      const out = { md: '' };
      this._walkChildren(root, out, 0);
      return out.md.replace(/\n{3,}/g, '\n\n').trim() + '\n';
    },

    _walkChildren(node, out, depth) {
      node.childNodes.forEach(child => this._walk(child, out, depth));
    },

    _inlineMd(node) {
      // serialize inline content of a node to markdown text
      const out = { md: '' };
      this._walkChildren(node, out, 0);
      return out.md;
    },

    _walk(node, out, depth) {
      if (node.nodeType === Node.TEXT_NODE) {
        // collapse whitespace (rich editors may add pretty text nodes)
        out.md += node.textContent.replace(/[ \t]*\n[ \t]*/g, ' ');
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const tag = node.tagName.toLowerCase();

      switch (tag) {
        case 'h1': out.md += '\n# ' + this._inlineMd(node).trim() + '\n\n'; return;
        case 'h2': out.md += '\n## ' + this._inlineMd(node).trim() + '\n\n'; return;
        case 'h3': out.md += '\n### ' + this._inlineMd(node).trim() + '\n\n'; return;
        case 'h4': out.md += '\n#### ' + this._inlineMd(node).trim() + '\n\n'; return;
        case 'h5': out.md += '\n##### ' + this._inlineMd(node).trim() + '\n\n'; return;
        case 'h6': out.md += '\n###### ' + this._inlineMd(node).trim() + '\n\n'; return;

        case 'p':
          out.md += '\n' + this._inlineMd(node).trim() + '\n\n'; return;

        case 'br':
          out.md += '\n'; return;

        case 'strong': case 'b': {
          const t = this._inlineMd(node).trim();
          out.md += t ? '**' + t + '**' : ''; return;
        }
        case 'em': case 'i': {
          const t = this._inlineMd(node).trim();
          out.md += t ? '*' + t + '*' : ''; return;
        }
        case 'del': case 's': case 'strike': {
          const t = this._inlineMd(node).trim();
          out.md += t ? '~~' + t + '~~' : ''; return;
        }
        case 'code': {
          if (node.closest('pre')) { out.md += node.textContent; return; }
          const t = node.textContent;
          out.md += '`' + t + '`'; return;
        }
        case 'pre': {
          const code = node.querySelector('code');
          const text = (code || node).textContent.replace(/\n$/, '');
          out.md += '\n```\n' + text + '\n```\n\n'; return;
        }
        case 'blockquote':
          out.md += '\n' + this._inlineMd(node).trim().split('\n').map(l => '> ' + l).join('\n') + '\n\n'; return;

        case 'ul': {
          out.md += '\n';
          node.querySelectorAll(':scope > li').forEach(li => {
            const cb = li.querySelector('input[type=checkbox][data-me-task]');
            if (cb) {
              out.md += '- [' + (cb.checked ? 'x' : ' ') + '] ' + this._liText(li) + '\n';
            } else {
              out.md += '- ' + this._liText(li) + '\n';
            }
          });
          out.md += '\n'; return;
        }
        case 'ol': {
          out.md += '\n';
          let n = 1;
          node.querySelectorAll(':scope > li').forEach(li => {
            out.md += (n++) + '. ' + this._liText(li) + '\n';
          });
          out.md += '\n'; return;
        }
        case 'li': return; // handled by parent list

        case 'a': {
          const href = node.getAttribute('href') || '';
          out.md += '[' + this._inlineMd(node).trim() + '](' + href + ')'; return;
        }
        case 'img': {
          const src = node.getAttribute('src') || '';
          const alt = node.getAttribute('alt') || '';
          const title = node.getAttribute('title');
          const style = node.getAttribute('style') || '';
          const width = node.getAttribute('width') || '';
          // plain image -> markdown syntax; resized image -> raw HTML to keep width
          if (!width && !style) {
            out.md += '![' + alt + '](' + src + ')';
          } else {
            out.md += '<img src="' + src + '" alt="' + alt + '"' +
              (title ? ' title="' + title + '"' : '') +
              (width ? ' width="' + width + '"' : '') +
              (style ? ' style="' + style + '"' : '') + '>';
          }
          return;
        }
        case 'hr': out.md += '\n---\n\n'; return;

        case 'table': {
          const rows = node.querySelectorAll('tr');
          if (!rows.length) return;
          const cellsOf = (tr) => Array.from(tr.children).map(td => this._inlineMd(td).trim());
          const head = cellsOf(rows[0]);
          out.md += '\n| ' + head.join(' | ') + ' |\n';
          out.md += '| ' + head.map(() => '---').join(' | ') + ' |\n';
          for (let r = 1; r < rows.length; r++) {
            out.md += '| ' + cellsOf(rows[r]).join(' | ') + ' |\n';
          }
          out.md += '\n'; return;
        }

        case 'span': case 'font': {
          const color = (node.style && node.style.color) || node.getAttribute('color') || '';
          const inner = this._inlineMd(node);
          if (color) {
            out.md += '<span style="color:' + color + '">' + inner + '</span>';
          } else {
            this._walkChildren(node, out, depth);
          }
          return;
        }

        case 'audio':
          out.md += '<audio src="' + (node.getAttribute('src') || '') + '" controls></audio>'; return;
        case 'video':
          out.md += '<video src="' + (node.getAttribute('src') || '') + '" controls></video>'; return;

        case 'div': case 'section':

        default:
          // unknown inline element: recurse
          this._walkChildren(node, out, depth); return;
      }
    },

    _liText(li) {
      // serialize li content excluding nested lists & task checkbox
      const clone = li.cloneNode(true);
      clone.querySelectorAll('ul, ol, input').forEach(n => n.remove());
      return this._inlineMd(clone).trim();
    }
  };

  /* ============================================================
   * Editor core — WYSIWYG
   * ============================================================ */
  class Editor {
    constructor(opts) {
      this.opts = Object.assign({}, DEFAULTS, opts);
      this.mount = document.querySelector(this.opts.mount);
      if (!this.mount) throw new Error('ME.js: mount target not found: ' + this.opts.mount);
      this.undoStack = [];
      this.redoStack = [];
      // Capture mount element's original content BEFORE building the editor DOM,
      // then remove it so it doesn't linger as plain text on the page.
      this._mountContent = null;
      if (this.opts.importFromContent !== false && this.mount.innerHTML.trim()) {
        this._mountContent = this.mount.innerHTML;
        this.mount.innerHTML = '';
      }
      this._build();
      this._bind();
      this._load();
    }

    _build() {
      this._applyIcons();

      const app = el('div', 'me-app');
      app.innerHTML =
        /* Nav */
        '<nav class="me-nav">' +
          '<div class="me-nav-left">' +
            '<span class="material-icons me-logo">' + I.logo + '</span>' +
            '<span class="me-title">' + escHtml(this.opts.title) + '</span>' +
          '</div>' +
          '<div class="me-nav-right">' +
            '<button class="me-nav-btn" data-act="codeview" title="View Markdown Code">' + icon(I.codeView, 'View Code', true) + '</button>' +
            '<button class="me-nav-btn" data-act="about" title="About">' + icon(I.about, 'About', true) + '</button>' +
          '</div>' +
        '</nav>' +

        /* Toolbar — left 70% (overflow → dropdown) + right fixed action group */
        '<div class="me-toolbar-wrap">' +
        '<div class="me-toolbar">' +
          '<div class="me-toolbar-left">' +
            '<div class="me-toolbar-main"></div>' +
            '<button class="me-tool me-more-btn hidden" data-act="_more" title="More tools">' + icon('more_horiz', '') + '</button>' +
            '<div class="me-toolbar-more hidden"></div>' +
          '</div>' +
          '<div class="me-toolbar-right"></div>' +
        '</div>' +
        '</div>' +

        /* Workspace: WYSIWYG editor (preview mode) */
        '<div class="me-workspace">' +
          '<div class="me-pane">' +
            '<div class="me-editor" contenteditable="true" spellcheck="false" data-placeholder="' + escHtml(this.opts.placeholder) + '"></div>' +
          '</div>' +
        '</div>' +

        /* Status bar */
        (this.opts.showStatusBar !== false ?
          '<div class="me-statusbar"><span class="me-status-count"></span></div>' : '') +

        /* Markdown source modal */
        '<div class="me-modal hidden" data-modal="codeview">' +
          '<div class="me-modal-box">' +
            '<div class="me-modal-head"><span>Markdown Source (underlying format)</span>' +
              '<button class="me-nav-btn" data-close>' + icon(I.close, 'Close') + '</button></div>' +
            '<pre class="me-code-view"></pre>' +
          '</div>' +
        '</div>' +

        /* About modal */
        '<div class="me-modal hidden" data-modal="about">' +
          '<div class="me-modal-box me-modal-about">' +
            '<div class="me-modal-head"><span>About</span>' +
              '<button class="me-nav-btn" data-close>' + icon(I.close, 'Close') + '</button></div>' +
            '<div class="me-about-body">' +
              '<span class="material-icons me-about-logo">' + I.logo + '</span>' +
              '<h2>ME.js</h2>' +
              '<p class="me-ver">Version 0.2.0 — WYSIWYG</p>' +
              '<p>A rich text Markdown editor framework written in pure JavaScript.<br>Edit visually; store as Markdown. Vue &amp; React versions planned.</p>' +
              '<p class="me-dim">Icons: Google Material Icons (remote / local switchable)</p>' +
            '</div>' +
          '</div>' +
        '</div>' +

        /* Color / image / audio / video / about modals */
        '<div class="me-modal hidden" data-modal="image">' +
          '<div class="me-modal-box me-modal-form">' +
            '<div class="me-modal-head"><span>Insert Image</span>' +
              '<button class="me-nav-btn" data-close>' + icon(I.close, 'Close') + '</button></div>' +
            '<div class="me-form-body">' +
              '<label class="me-field"><span>Title / Alt text</span>' +
                '<input type="text" id="me-img-title" placeholder="Image title"></label>' +
              '<label class="me-field"><span>Image URL <em class="me-dim2">(required)</em></span>' +
                '<input type="text" id="me-img-url" placeholder="https://example.com/picture.png"></label>' +
              '<div class="me-form-actions">' +
                '<button class="me-btn" data-close>Cancel</button>' +
                '<button class="me-btn me-btn-primary" data-act="image-confirm">Insert</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="me-modal hidden" data-modal="audio">' +
          '<div class="me-modal-box me-modal-form">' +
            '<div class="me-modal-head"><span>Insert Audio</span>' +
              '<button class="me-nav-btn" data-close>' + icon(I.close, 'Close') + '</button></div>' +
            '<div class="me-form-body">' +
              '<label class="me-field"><span>Audio URL <em class="me-dim2">(required)</em></span>' +
                '<input type="text" id="me-audio-url" placeholder="https://example.com/sound.mp3"></label>' +
              '<div class="me-form-actions">' +
                '<button class="me-btn" data-close>Cancel</button>' +
                '<button class="me-btn me-btn-primary" data-act="audio-confirm">Insert</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="me-modal hidden" data-modal="video">' +
          '<div class="me-modal-box me-modal-form">' +
            '<div class="me-modal-head"><span>Insert Video</span>' +
              '<button class="me-nav-btn" data-close>' + icon(I.close, 'Close') + '</button></div>' +
            '<div class="me-form-body">' +
              '<label class="me-field"><span>Video URL <em class="me-dim2">(required)</em></span>' +
                '<input type="text" id="me-video-url" placeholder="https://example.com/clip.mp4"></label>' +
              '<div class="me-form-actions">' +
                '<button class="me-btn" data-close>Cancel</button>' +
                '<button class="me-btn me-btn-primary" data-act="video-confirm">Insert</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="me-modal hidden" data-modal="table">' +
          '<div class="me-modal-box me-modal-form">' +
            '<div class="me-modal-head"><span>Insert Table</span>' +
              '<button class="me-nav-btn" data-close>' + icon(I.close, 'Close') + '</button></div>' +
            '<div class="me-form-body">' +
              '<label class="me-field"><span>Columns <em class="me-dim2">(1-20, default 4)</em></span>' +
                '<input type="number" id="me-table-cols" value="4" min="1" max="20"></label>' +
              '<label class="me-field"><span>Rows <em class="me-dim2">(1-50, default 3, incl. header)</em></span>' +
                '<input type="number" id="me-table-rows" value="3" min="1" max="50"></label>' +
              '<div class="me-form-actions">' +
                '<button class="me-btn" data-close>Cancel</button>' +
                '<button class="me-btn me-btn-primary" data-act="table-confirm">Insert</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="me-toast hidden"></div>';

      this.mount.appendChild(app);
      this.app = app;
      this.$editor = app.querySelector('.me-editor');
      this.$codeView = app.querySelector('.me-code-view');
      this.$toast = app.querySelector('.me-toast');
      this.$toolbarMain = app.querySelector('.me-toolbar-main');
      this.$toolbarMore = app.querySelector('.me-toolbar-more');
      this.$moreBtn = app.querySelector('.me-more-btn');
      this.$toolbarRight = app.querySelector('.me-toolbar-right');
      this.$statusCount = app.querySelector('.me-status-count');
      this.$eraserBtn = null; // resolved after toolbar build
      this._buildToolbar();
      this._setupToolbarOverflow();
    }

    _toolBtn(act, title, inner) {
      return '<button class="me-tool" data-act="' + act + '" title="' + title + '" unselectable="on">' + inner + '</button>';
    }

    _toolSep() {
      return '<span class="me-sep"></span>';
    }

    /* ---------- Toolbar build: ordered items, overflow into dropdown ---------- */
    _buildToolbar() {
      // Left group: regular formatting tools (overflow goes to dropdown)
      const o = this.opts;
      const left = [
        this._toolBtn('bold', 'Bold (Ctrl+B)', icon(I.bold, '')),
        this._toolBtn('italic', 'Italic (Ctrl+I)', icon(I.italic, '')),
        this._toolBtn('strike', 'Strikethrough', icon(I.strike, '')),
        this._toolBtn('codeInline', 'Inline Code', icon(I.codeInline, '')),
        this._toolBtn('color', 'Text Color', icon(I.color, '')),
        this._toolSep(),
        this._toolBtn('h1', 'Heading 1', 'H1'),
        this._toolBtn('h2', 'Heading 2', 'H2'),
        this._toolBtn('h3', 'Heading 3', 'H3'),
        this._toolBtn('para', 'Normal Text', icon(I.para, '')),
        this._toolSep(),
        this._toolBtn('quote', 'Blockquote', icon(I.quote, '')),
        this._toolBtn('ul', 'Bullet List', icon(I.ul, '')),
        this._toolBtn('ol', 'Numbered List', icon(I.ol, '')),
        this._toolBtn('task', 'Task List', icon(I.task, '')),
        this._toolSep(),
        this._toolBtn('link', 'Link', icon(I.link, '')),
        this._toolBtn('image', 'Image', icon(I.image, '')),
        o.showAudio !== false ? this._toolBtn('audio', 'Audio', icon(I.audio, '')) : '',
        o.showVideo !== false ? this._toolBtn('video', 'Video', icon(I.video, '')) : '',
        this._toolBtn('codeBlock', 'Code Block', icon(I.code, '')),
        this._toolBtn('table', 'Table', icon(I.table, '')),
        this._toolBtn('hr', 'Horizontal Rule', icon(I.hr, ''))
      ];
      this.$toolbarMain.innerHTML = left.join('');

      // Right group: fixed actions — eraser, undo, redo, [code view], [copy]
      let right =
        '<button class="me-tool me-eraser" data-act="eraser" title="Clear formatting of selection" disabled>' + icon(I.eraser, '') + '</button>' +
        this._toolBtn('undo', 'Undo', icon(I.undo, '')) +
        this._toolBtn('redo', 'Redo', icon(I.redo, ''));
      if (this.opts.showViewCode !== false) {
        right += this._toolBtn('viewmd', 'View Markdown', icon(I.codeView, ''));
      }
      if (this.opts.showCopy !== false) {
        right += this._toolBtn('copy', 'Copy Markdown to clipboard', icon(I.copy, ''));
      }
      this.$toolbarRight.innerHTML = right;

      this.$eraserBtn = this.$toolbarRight.querySelector('.me-eraser');
    }

    /* ---------- Overflow: move tools that don't fit into dropdown ---------- */
    _setupToolbarOverflow() {
      const wrap = this.app.querySelector('.me-toolbar-wrap');
      const main = this.$toolbarMain;
      const more = this.$toolbarMore;
      this.$toolbarLeft = this.app.querySelector('.me-toolbar-left');

      const redraw = () => {
        // move everything back to main, preserving original order
        const frag = document.createDocumentFragment();
        Array.from(more.children).forEach(n => frag.appendChild(n));
        main.appendChild(frag);
        more.classList.add('hidden');
        this.$moreBtn.classList.add('hidden');

        // available width: the left zone is 70% of the toolbar; reserve room for the more-btn
        const avail = this.$toolbarLeft.clientWidth - (this.$moreBtn.offsetWidth || 40) - 8;
        let used = 0;
        const moved = [];
        for (const node of Array.from(main.children)) {
          used += node.offsetWidth || 0;
          if (used > avail) moved.push(node);
        }
        if (moved.length) {
          moved.forEach(n => more.appendChild(n));
          more.classList.remove('hidden');
          this.$moreBtn.classList.remove('hidden');
        }
      };

      this._redrawToolbar = redraw;
      window.addEventListener('resize', debounce(redraw, 150));
      // initial layout after fonts/icons load
      setTimeout(redraw, 50);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);

      // dropdown toggle
      this.$moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        more.classList.toggle('hidden');
      });
      document.addEventListener('click', (e) => {
        if (!more.classList.contains('hidden') && !more.contains(e.target)) more.classList.add('hidden');
      });

      // hide image size toolbar on outside clicks
      document.addEventListener('click', (e) => {
        if (this._imgBar && !this._imgBar.contains(e.target) && !e.target.closest('img')) {
          this._hideImageToolbar();
        }
      });
    }

    _applyIcons() {
      const id = 'me-icons-css';
      let link = document.getElementById(id);
      const href = this.opts.iconsMode === 'local' ? this.opts.iconsLocalPath : this.opts.iconsRemoteUrl;
      if (!link) {
        link = document.createElement('link');
        link.id = id; link.rel = 'stylesheet';
        document.head.appendChild(link);
      }
      link.href = href;
    }

    /* ---------- Events ---------- */
    _bind() {
      const self = this;

      // Prevent toolbar click from stealing selection
      this.app.querySelector('.me-toolbar').addEventListener('mousedown', (e) => e.preventDefault());

      this.app.querySelector('.me-toolbar').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn || btn.classList.contains('me-more-btn')) return;
        const act = btn.dataset.act;
        if (act === 'viewmd') { self._openCodeView(); return; }
        if (act === 'copy') { self._copyMarkdown(); return; }
        self.$editor.focus();
        self._exec(act);
      });

      // eraser activation on selection change
      document.addEventListener('selectionchange', () => {
        const sel = window.getSelection();
        const hasText = sel && sel.rangeCount && !sel.isCollapsed &&
          self.$editor.contains(sel.anchorNode);
        if (self.$eraserBtn) self.$eraserBtn.disabled = !hasText;
      });

      this.app.querySelector('.me-nav').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        const act = btn.dataset.act;
        if (act === 'codeview') self._openCodeView();
        if (act === 'about') self._openModal('about');
      });

      this.app.querySelectorAll('.me-modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
          if (e.target === modal || e.target.closest('[data-close]')) modal.classList.add('hidden');
          // form confirm buttons (image/audio/video) live inside modals
          const actBtn = e.target.closest('[data-act]');
          if (actBtn) {
            e.preventDefault();
            self._exec(actBtn.dataset.act);
          }
        });
      });

      // modal inputs: Enter key confirms
      ['image', 'audio', 'video', 'table'].forEach(kind => {
        const modal = this.app.querySelector('[data-modal="' + kind + '"]');
        if (!modal) return;
        modal.querySelectorAll('input').forEach(inp => {
          inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              self._exec(kind + '-confirm');
            }
          });
        });
      });

      // task checkbox toggling
      this.$editor.addEventListener('click', (e) => {
        const cb = e.target.closest('input[type=checkbox][data-me-task]');
        if (cb) { this._sync(); return; }
        // image click -> size toolbar
        const img = e.target.closest('img');
        if (img) { e.preventDefault(); this._showImageToolbar(img); }
        else { this._hideImageToolbar(); }
      });

      // sync markdown on input
      this.$editor.addEventListener('input', debounce(() => {
        self._pushUndo();
        self._sync();
      }, 400));

      // paste handling: images as base64 or upload via uploadUrl
      this.$editor.addEventListener('paste', (e) => self._onPaste(e));

      // keyboard shortcuts
      this.$editor.addEventListener('keydown', (e) => {
        const mod = e.ctrlKey || e.metaKey;
        if (!mod) return;
        const k = e.key.toLowerCase();
        const map = { b: 'bold', i: 'italic', u: null, s: 'save' };
        if (map[k] !== undefined && map[k] !== null) { e.preventDefault(); self._exec(map[k]); }
      });
    }

    /* ---------- WYSIWYG formatting ---------- */
    _exec(act) {
      const ed = this.$editor;
      ed.focus();

      const restore = () => { this._pushUndo(); this._sync(); };

      switch (act) {
        case 'bold':       document.execCommand('bold'); return restore();
        case 'italic':     document.execCommand('italic'); return restore();
        case 'strike':     document.execCommand('strikeThrough'); return restore();

        case 'h1': document.execCommand('formatBlock', false, 'h1'); return restore();
        case 'h2': document.execCommand('formatBlock', false, 'h2'); return restore();
        case 'h3': document.execCommand('formatBlock', false, 'h3'); return restore();
        case 'para': document.execCommand('formatBlock', false, 'p'); return restore();

        case 'quote':
          document.execCommand('formatBlock', false, 'blockquote');
          return restore();
        case 'ul':   document.execCommand('insertUnorderedList'); return restore();
        case 'ol':   document.execCommand('insertOrderedList'); return restore();
        case 'undo': this._undo(); return;
        case 'redo': this._redo(); return;
        case 'save': this._save(true); return;

        case 'task': {
          const sel = window.getSelection();
          const text = sel && sel.rangeCount ? sel.toString() : 'task';
          this._insertHtml(
            '<ul class="me-task"><li><input type="checkbox" data-me-task> ' + escHtml(text || 'task') + '</li></ul><p><br></p>');
          return restore();
        }

        case 'codeInline': {
          const sel = window.getSelection();
          const text = sel && sel.rangeCount ? sel.toString() : 'code';
          this._insertHtml('<code class="me-code-inline">' + escHtml(text || 'code') + '</code>');
          return restore();
        }

        case 'color': {
          // Native color picker, anchored near the toolbar (centered on screen)
          if (!this._colorInput) {
            this._colorInput = document.createElement('input');
            this._colorInput.type = 'color';
            this._colorInput.style.position = 'fixed';
            this._colorInput.style.opacity = '0';
            this._colorInput.style.pointerEvents = 'none';
            document.body.appendChild(this._colorInput);
            this._colorInput.addEventListener('input', () => {
              document.execCommand('foreColor', false, this._colorInput.value);
              this._pushUndo(); this._sync();
            });
          }
          this._colorInput.value = '#7c3aed';
          // center the (visually hidden) picker trigger on screen so the
          // popup opens mid-window instead of top-left
          const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
          this._colorInput.style.left = cx + 'px';
          this._colorInput.style.top = cy + 'px';
          this._colorInput.click();
          return;
        }

        case 'eraser': {
          const sel = window.getSelection();
          if (!sel || !sel.rangeCount || sel.isCollapsed) return;
          const range = sel.getRangeAt(0);
          // Extract selected fragment and strip all tags, keep plain text
          const frag = range.extractContents();
          const tmp = document.createElement('div');
          tmp.appendChild(frag);
          const plain = tmp.textContent;
          range.insertNode(document.createTextNode(plain));
          sel.removeAllRanges();
          return restore();
        }

        case 'image':
          this._openModal('image');
          setTimeout(() => { const inp = this._q('#me-img-url'); if (inp) inp.focus(); }, 50);
          return;
        case 'image-confirm': {
          const url = (this._q('#me-img-url').value || '').trim();
          const title = (this._q('#me-img-title').value || '').trim();
          if (!url) { this._toast('Image URL is required'); return; }
          this._closeModal('image');
          this._insertHtml('<img src="' + escHtml(url) + '" alt="' + escHtml(title || 'image') + '"' + (title ? ' title="' + escHtml(title) + '"' : '') + '><p><br></p>');
          return restore();
        }

        case 'audio':
          this._openModal('audio');
          setTimeout(() => { const inp = this._q('#me-audio-url'); if (inp) inp.focus(); }, 50);
          return;
        case 'audio-confirm': {
          const url = (this._q('#me-audio-url').value || '').trim();
          if (!url) { this._toast('Audio URL is required'); return; }
          this._closeModal('audio');
          this._insertHtml('<audio src="' + escHtml(url) + '" controls></audio><p><br></p>');
          return restore();
        }

        case 'video':
          this._openModal('video');
          setTimeout(() => { const inp = this._q('#me-video-url'); if (inp) inp.focus(); }, 50);
          return;
        case 'video-confirm': {
          const url = (this._q('#me-video-url').value || '').trim();
          if (!url) { this._toast('Video URL is required'); return; }
          this._closeModal('video');
          this._insertHtml('<video src="' + escHtml(url) + '" controls style="max-width:100%;border-radius:8px"></video><p><br></p>');
          return restore();
        }

        case 'codeBlock':
          this._insertHtml(
            '<pre class="me-pre" data-me-block="code"><code>// code here\n</code></pre><p><br></p>');
          return restore();

        case 'link': {
          const sel = window.getSelection();
          const text = sel && sel.rangeCount ? sel.toString() : 'link text';
          const url = window.prompt('Enter URL:', 'https://');
          if (url) {
            this._insertHtml('<a href="' + escHtml(url) + '" target="_blank" rel="noopener">' + escHtml(text) + '</a>');
            restore();
          }
          return;
        }

        case 'hr':
          this._insertHtml('<hr><p><br></p>');
          return restore();

        case 'table':
          this._openModal('table');
          setTimeout(() => { const inp = this._q('#me-table-cols'); if (inp) { inp.focus(); inp.select(); } }, 50);
          return;
        case 'table-confirm': {
          this._tableCols = parseInt(this._q('#me-table-cols').value, 10) || 4;
          this._tableRows = parseInt(this._q('#me-table-rows').value, 10) || 3;
          this._tableCols = Math.min(Math.max(this._tableCols, 1), 20);
          this._tableRows = Math.min(Math.max(this._tableRows, 1), 50);
          this._closeModal('table');
          return this._exec('table-insert');
        }
        case 'table-insert': {
          const rows = this._tableRows || 3;
          const cols = this._tableCols || 4;
          let t = '<table class="me-table"><thead><tr>';
          for (let c = 0; c < cols; c++) t += '<th>Header ' + (c + 1) + '</th>';
          t += '</tr></thead><tbody>';
          for (let r = 0; r < rows - 1; r++) {
            t += '<tr>';
            for (let c = 0; c < cols; c++) t += '<td></td>';
            t += '</tr>';
          }
          t += '</tbody></table><p><br></p>';
          this._insertHtml(t);
          return restore();
        }
      }
    }

    _insertHtml(html) {
      document.execCommand('insertHTML', false, html);
    }

    /* ---------- Paste: image handling (base64 or upload) ---------- */
    _onPaste(e) {
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (const item of items) {
        if (item.type && item.type.indexOf('image/') === 0) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) return;
          const mode = this._pasteMode();
          if (mode === 'upload' && this.opts.uploadUrl) {
            this._toast('Uploading image...');
            this._uploadImage(file)
              .then(url => {
                this._insertHtml('<img src="' + escHtml(url) + '" alt="pasted image"><p><br></p>');
                this._pushUndo(); this._sync();
                this._toast('Image uploaded');
              })
              .catch(err => {
                this._toast('Upload failed, falling back to base64');
                this._insertBase64Image(file);
              });
          } else {
            this._insertBase64Image(file);
          }
          return;
        }
      }
      // non-image paste: let default behavior run
    }

    _pasteMode() {
      if (this.opts.pasteImage === 'upload' && this.opts.uploadUrl) return 'upload';
      if (this.opts.pasteImage === 'base64') return 'base64';
      // 'auto': upload if a server is configured
      return this.opts.uploadUrl ? 'upload' : 'base64';
    }

    _insertBase64Image(file) {
      const reader = new FileReader();
      reader.onload = () => {
        this._insertHtml('<img src="' + reader.result + '" alt="pasted image"><p><br></p>');
        this._pushUndo(); this._sync();
      };
      reader.readAsDataURL(file);
    }

    _uploadImage(file) {
      const fd = new FormData();
      fd.append('file', file, file.name || 'paste.png');
      return fetch(this.opts.uploadUrl, { method: 'POST', body: fd })
        .then(res => {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(data => {
          if (!data.url) throw new Error('No url in response');
          // relative URL from the upload server: resolve against uploadUrl origin
          if (data.url.indexOf('http') !== 0 && this.opts.uploadUrl.indexOf('http') === 0) {
            const origin = new URL(this.opts.uploadUrl).origin;
            return origin + data.url;
          }
          return data.url;
        });
    }

    /* ---------- Sync ---------- */
    _sync() {
      // rich DOM -> underlying markdown (in memory only)
      this._markdown = MdSerializer.serialize(this.$editor);
      this._updateStatus();
    }

    /* ---------- Status bar ---------- */
    _updateStatus() {
      if (!this.$statusCount) return;
      const count = this._markdown.replace(/\n$/, '').length;
      const max = parseInt(this.opts.maxLength, 10) || 0;
      let html;
      if (max > 0) {
        html = count + ' / ' + max + ' characters';
        this.$statusCount.classList.toggle('me-status-over', count > max);
      } else {
        html = count + ' characters';
        this.$statusCount.classList.remove('me-status-over');
      }
      this.$statusCount.textContent = html;
    }

    /* ---------- Image size toolbar (click an image) ---------- */
    _showImageToolbar(img) {
      this._hideImageToolbar();
      this._selectedImg = img;
      const bar = document.createElement('div');
      bar.className = 'me-img-bar';
      const current = img.getAttribute('width') || (img.style && img.style.width) || '';
      const opts = [
        ['original', 'Original'], ['100%', '100%'], ['75%', '75%'], ['50%', '50%'], ['25%', '25%']
      ];
      bar.innerHTML = '<span class="me-img-bar-label">Size</span>' + opts.map(o =>
        '<button class="me-img-bar-btn' + (current === o[0] || (o[0] === 'original' && !current) ? ' active' : '') +
        '" data-w="' + o[0] + '">' + o[1] + '</button>').join('');
      // position above the image
      const r = img.getBoundingClientRect();
      bar.style.left = Math.max(8, r.left + window.scrollX) + 'px';
      bar.style.top = (r.top + window.scrollY - 40) + 'px';
      document.body.appendChild(bar);
      this._imgBar = bar;
      bar.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-w]');
        if (!btn) return;
        e.stopPropagation();
        this._applyImageSize(this._selectedImg, btn.dataset.w);
        bar.querySelectorAll('.me-img-bar-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    }

    _hideImageToolbar() {
      if (this._imgBar) { this._imgBar.remove(); this._imgBar = null; }
      this._selectedImg = null;
    }

    _applyImageSize(img, w) {
      if (!img) return;
      if (w === 'original') {
        img.removeAttribute('width');
        img.style.width = '';
        img.style.maxWidth = '100%';
      } else {
        img.style.width = w;
        img.style.maxWidth = '100%';
        img.setAttribute('width', w);  // keep round-trip marker
      }
      this._pushUndo();
      this._sync();
    }

    _pushUndo() {
      const t = this.$editor.innerHTML;
      if (this.undoStack.length && this.undoStack[this.undoStack.length - 1] === t) return;
      this.undoStack.push(t);
      if (this.undoStack.length > 100) this.undoStack.shift();
      this.redoStack = [];
    }
    _undo() {
      if (!this.undoStack.length) return;
      this.redoStack.push(this.$editor.innerHTML);
      this.$editor.innerHTML = this.undoStack.pop();
      this._sync();
    }
    _redo() {
      if (!this.redoStack.length) return;
      this.undoStack.push(this.$editor.innerHTML);
      this.$editor.innerHTML = this.redoStack.pop();
      this._sync();
    }

    /* ---------- Modals ---------- */
    _openCodeView() {
      this._sync();
      this.$codeView.textContent = this._markdown;
      this._openModal('codeview');
    }
    _openModal(name) {
      const el = this._findModal(name);
      if (el) el.classList.remove('hidden');
      else console.warn('[ME.js] modal not found:', name);
    }
    _closeModal(name) {
      const el = this._findModal(name);
      if (el) el.classList.add('hidden');
    }
    /* Find a modal: prefer app scope, fall back to document (survives
       DOM mutations by browser extensions). */
    _findModal(name) {
      return this.app.querySelector('[data-modal="' + name + '"]') ||
        document.querySelector('[data-modal="' + name + '"]');
    }
    _q(sel) {
      return this.app.querySelector(sel) || document.querySelector(sel);
    }

    _copyMarkdown() {
      const md = this.getMarkdown();
      const done = () => this._toast('Markdown copied to clipboard');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(md).then(done).catch(() => this._fallbackCopy(md, done));
      } else {
        this._fallbackCopy(md, done);
      }
    }
    _fallbackCopy(text, done) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { this._toast('Copy failed'); }
      document.body.removeChild(ta);
    }

    /* ---------- Load ---------- */
    _load() {
      // localStorage disabled: content comes only from the host page.
      if (this._mountContent != null) {
        // If it looks like HTML, load as rich DOM directly; otherwise as Markdown.
        if (this._looksLikeHtml(this._mountContent)) {
          this.$editor.innerHTML = this._mountContent;
          this._markdown = MdSerializer.serialize(this.$editor);
          this._pushUndo();
          this._sync();
        } else {
          this._setFromMarkdown(this._mountContent);
          this._pushUndo();
        }
        return;
      }
      this._setFromMarkdown(this.opts.initialMarkdown || '');
      this._pushUndo();
      this._sync();
    }

    _looksLikeHtml(s) {
      return /<\s*(h[1-6]|p|div|ul|ol|li|table|pre|blockquote|strong|em|a|img|code|hr|br|audio|video|span)\b/i.test(s);
    }
    _setFromMarkdown(md) {
      this.$editor.innerHTML = MdParser.parse(md);
      this._markdown = md;
      this._sync();
    }
    /* ---------- Save (no-op: localStorage disabled) ---------- */
    _save(notify) {
      if (notify) this._toast('Content kept in memory only (no autosave)');
    }

    _toast(msg) {
      const t = this.$toast;
      t.textContent = msg;
      t.classList.remove('hidden');
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => t.classList.add('hidden'), 2000);
    }

    /* ---------- Public API ---------- */
    /** Import a Markdown string (or HTML string); replaces document content. */
    setMarkdown(md) { this._setFromMarkdown(md || ''); this._pushUndo(); return this; }

    /** Import from any element (by selector or element). Markdown or HTML inside. */
    importFromElement(target) {
      const elSrc = typeof target === 'string' ? document.querySelector(target) : target;
      if (!elSrc) return this;
      const raw = elSrc.innerHTML;
      if (this._looksLikeHtml(raw)) {
        this.$editor.innerHTML = raw;
        this._markdown = MdSerializer.serialize(this.$editor);
        this._pushUndo(); this._sync();
      } else {
        this.setMarkdown(raw);
      }
      return this;
    }

    /** Export underlying Markdown. */
    getMarkdown() { this._sync(); return this._markdown; }

    /** Export rendered (sanitized-free) HTML. */
    getHTML() { this._sync(); return MdParser.parse(this._markdown); }

    /** Export editor's current rich DOM HTML as-is. */
    getRawHTML() { return this.$editor.innerHTML; }

    /** Export Markdown + HTML mixed: both formats in one result. */
    export() {
      this._sync();
      const html = MdParser.parse(this._markdown);
      return { markdown: this._markdown, html, mixed: this.exportMixed() };
    }

    /** Export a single string: Markdown with HTML blocks embedded
     *  (block-level structures emitted as raw HTML for maximum fidelity). */
    exportMixed() {
      this._sync();
      const parts = [];
      const root = this.$editor;
      root.childNodes.forEach(node => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const tag = node.tagName.toLowerCase();
        // Blocks that Markdown handles poorly are emitted as raw HTML;
        // simple ones as native Markdown.
        if (tag === 'table' || tag === 'pre' || tag === 'audio' || tag === 'video') {
          parts.push(node.outerHTML);
        } else {
          const one = { md: '' };
          MdSerializer._walk(node, one, 0);
          parts.push(one.md.trim());
        }
      });
      return parts.filter(Boolean).join('\n\n') + '\n';
    }

    /** Download current document as a file. fmt: 'md' | 'html' | 'mixed' */
    download(filename, fmt) {
      const name = filename || 'document';
      let content, mime;
      if (fmt === 'html') { content = this.getHTML(); mime = 'text/html'; }
      else if (fmt === 'mixed') { content = this.exportMixed(); mime = 'text/markdown'; }
      else { content = this.getMarkdown(); mime = 'text/markdown'; }
      const blob = new Blob([content], { type: mime + ';charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name + (fmt === 'html' ? '.html' : '.md');
      a.click();
      URL.revokeObjectURL(a.href);
    }

    clear() { this.$editor.innerHTML = '<p><br></p>'; this._sync(); return this; }
  }

  /* ============================================================
   * Styles
   * ============================================================ */
  const CSS = `
.me-app{display:flex;flex-direction:column;height:100%;background:#fff;}
.me-nav{display:flex;align-items:center;justify-content:space-between;height:52px;padding:0 16px;
  background:#1e1e2e;color:#fff;flex-shrink:0;}
.me-nav-left{display:flex;align-items:center;gap:10px;}
.me-logo{font-size:28px;color:#7c6cff;}
.me-title{font-size:16px;font-weight:600;letter-spacing:.5px;}
.me-nav-right{display:flex;align-items:center;gap:4px;}
.me-nav-btn{background:none;border:none;color:#cdd0e0;cursor:pointer;padding:6px;border-radius:6px;display:flex;}
.me-nav-btn:hover{background:rgba(255,255,255,.12);color:#fff;}
.me-nav-btn .material-icons,.me-nav-btn .material-icons-outlined{font-size:22px;}

.me-toolbar-wrap{padding:3px 12px;background:#f0f1f5;border-bottom:1px solid #dfe1e8;flex-shrink:0;}
.me-statusbar{display:flex;align-items:center;justify-content:flex-start;gap:10px;padding:2px 16px;
  background:#f0f1f5;border-top:1px solid #dfe1e8;flex-shrink:0;font-size:11px;color:#8b8ea0;}
.me-status-count.me-status-over{color:#e05260;font-weight:700;}
.me-toolbar{display:flex;align-items:center;gap:8px;width:100%;user-select:none;}
.me-toolbar-left{display:flex;align-items:center;gap:2px;width:70%;min-width:280px;position:relative;}
.me-toolbar-main{display:flex;align-items:center;gap:2px;overflow:hidden;flex:1;white-space:nowrap;}
.me-toolbar-right{display:flex;align-items:center;gap:2px;margin-left:auto;flex-shrink:0;}
.me-toolbar-more{position:absolute;top:calc(100% + 4px);right:0;background:#fff;border:1px solid #dfe1e8;
  border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.15);padding:6px;display:flex;flex-direction:column;gap:2px;z-index:50;min-width:180px;}
.me-toolbar-more .me-tool{justify-content:flex-start;gap:8px;}
.me-toolbar-more .me-sep{display:none;}
.me-more-btn{flex-shrink:0;}
.me-tool{background:none;border:none;cursor:pointer;padding:4px 8px;border-radius:5px;
  color:#444;display:flex;align-items:center;min-width:30px;justify-content:center;flex-shrink:0;}
.me-tool:hover{background:#e0e2ea;color:#1e1e2e;}
.me-tool .material-icons{font-size:17px;}
.me-tool{font-weight:700;}
.me-eraser{color:#b6b9c6;cursor:not-allowed;}
.me-eraser:disabled{background:none;}
.me-eraser:not(:disabled){color:#e05260;cursor:pointer;}
.me-eraser:not(:disabled):hover{background:#fdecef;}
.me-sep{width:1px;height:20px;background:#cfd2dd;margin:0 6px;flex-shrink:0;}

.me-workspace{flex:1;display:flex;overflow:hidden;}
.me-pane{flex:1;overflow-y:auto;min-width:0;}
.hidden{display:none !important;}

.me-editor{min-height:100%;padding:32px 48px;outline:none;font-size:15.5px;line-height:1.75;
  font-family:"Segoe UI",Roboto,sans-serif;color:#2a2a35;}
.me-editor:empty::before,.me-editor > p:only-child > br:only-child::before{content:"";}
.me-editor[data-placeholder]:empty::before{content:attr(data-placeholder);color:#b6b9c6;}

.me-editor h1{font-size:1.9em;border-bottom:2px solid #eceef4;padding-bottom:.3em;margin:.6em 0 .4em;}
.me-editor h2{font-size:1.5em;border-bottom:1px solid #eceef4;padding-bottom:.25em;margin:.7em 0 .4em;}
.me-editor h3{font-size:1.25em;margin:.8em 0 .4em;}
.me-editor blockquote{margin:1em 0;padding:8px 16px;border-left:4px solid #7c6cff;background:#f4f2ff;border-radius:0 6px 6px 0;color:#555;}
.me-code-inline{background:#ece9fb;padding:2px 7px;border-radius:5px;border:1px solid #d5cff5;font-family:Consolas,'Courier New',monospace;font-size:.88em;color:#7c3aed;}
.me-editor code.me-code-inline,.me-editor .me-code-inline{display:inline;white-space:pre-wrap;}
.me-pre{background:#1e1e2e;color:#e6e6f0;padding:14px 16px;border-radius:8px;overflow-x:auto;margin:1em 0;}
.me-pre code{font-family:Consolas,monospace;font-size:13.5px;background:none;color:inherit;}
.me-editor table,.me-md table{border-collapse:collapse;margin:1em 0;width:100%;}
.me-editor td,.me-editor th,.me-md td,.me-md th{border:1px solid #dfe1e8;padding:8px 12px;text-align:left;}
.me-editor th,.me-md th{background:#f0f1f5;}
.me-editor ul.me-task,.me-md ul.me-task{list-style:none;padding-left:8px;}
.me-editor ul.me-task li{display:flex;align-items:center;gap:8px;}
.me-editor img{max-width:100%;border-radius:6px;cursor:pointer;}
.me-editor img:hover{outline:2px solid #7c6cff;outline-offset:2px;}
.me-img-bar{position:absolute;z-index:150;background:#1e1e2e;border-radius:8px;padding:6px 10px;
  display:flex;align-items:center;gap:6px;box-shadow:0 8px 24px rgba(0,0,0,.3);}
.me-img-bar-label{color:#9a9db0;font-size:12px;margin-right:2px;}
.me-img-bar-btn{background:none;border:1px solid #3a3a52;color:#cdd0e0;border-radius:5px;
  padding:3px 10px;font-size:12px;cursor:pointer;}
.me-img-bar-btn:hover{border-color:#7c6cff;color:#fff;}
.me-img-bar-btn.active{background:#7c6cff;border-color:#7c6cff;color:#fff;}
.me-editor a{color:#5b53d6;}
.me-editor hr{border:none;border-top:2px solid #eceef4;margin:1.5em 0;}
.me-editor ul,.me-editor ol{padding-left:1.8em;}

.me-modal{position:fixed;inset:0;background:rgba(20,20,35,.45);display:flex;align-items:center;justify-content:center;z-index:100;}
.me-modal-box{background:#fff;border-radius:12px;width:min(760px,92vw);max-height:84vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3);}
.me-modal-head{display:flex;align-items:center;justify-content:space-between;padding:12px 18px;border-bottom:1px solid #eceef4;font-weight:600;color:#2a2a35;}
.me-code-view{margin:0;padding:18px;font-family:Consolas,monospace;font-size:13.5px;line-height:1.6;
  background:#1e1e2e;color:#c9f0ff;overflow:auto;flex:1;white-space:pre-wrap;}
.me-modal-about{width:min(420px,90vw);}
.me-modal-form{width:min(440px,92vw);}
.me-form-body{padding:20px 22px;display:flex;flex-direction:column;gap:14px;}
.me-field{display:flex;flex-direction:column;gap:6px;font-size:13.5px;color:#444;}
.me-field input{border:1px solid #dfe1e8;border-radius:8px;padding:9px 12px;font-size:14px;outline:none;}
.me-field input:focus{border-color:#7c6cff;box-shadow:0 0 0 3px rgba(124,108,255,.15);}
.me-dim2{color:#9a9db0;font-style:normal;font-weight:400;}
.me-form-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:4px;}
.me-btn{border:1px solid #dfe1e8;background:#fff;border-radius:8px;padding:8px 18px;font-size:13.5px;cursor:pointer;color:#444;}
.me-btn:hover{background:#f0f1f5;}
.me-btn-primary{background:#7c6cff;border-color:#7c6cff;color:#fff;}
.me-btn-primary:hover{background:#6a59f2;}
.me-about-body{padding:28px;text-align:center;}
.me-about-logo{font-size:56px;color:#7c6cff;}
.me-about-body h2{margin:8px 0 2px;}
.me-ver{color:#8b8ea0;font-size:13px;margin:0 0 12px;}
.me-dim{color:#8b8ea0;font-size:12.5px;margin-top:16px;}

.me-toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);
  background:#1e1e2e;color:#fff;padding:10px 22px;border-radius:8px;font-size:13.5px;
  box-shadow:0 8px 24px rgba(0,0,0,.25);z-index:200;transition:opacity .3s;}
`;
  const styleTag = document.createElement('style');
  styleTag.textContent = CSS;
  document.head.appendChild(styleTag);

  /* ---------- Export ---------- */
  const ME = {
    version: '0.2.0',
    Editor,
    MdParser,
    MdSerializer,
    init(opts) {
      ME.instance = new Editor(opts);
      return ME.instance;
    }
  };
  global.ME = ME;
})(window);
