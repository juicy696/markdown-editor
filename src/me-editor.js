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
    eraser: 'format_clear',
    copy: 'content_copy',
    hr: 'horizontal_rule',
    table: 'grid_on',
    preview: 'visibility',
    edit: 'edit',
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
        // 行内 HTML 标签保护：先抽出占位，避免被 escHtml 转义后显示为字面文本
        const htmlSpans = [];
        t = t.replace(/<(\/?(?:b|i|u|strong|em|s|del|a|img|span|font|code|br|sub|sup|audio|video|source|iframe)\b[^>]*)>/gi, (m, tag) => {
          htmlSpans.push('<' + tag + '>');
          return '\u0000H' + (htmlSpans.length - 1) + '\u0000';
        });
        t = escHtml(t);
        t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
          (m, alt, url, title) => '<img src="' + url + '" alt="' + alt + '"' + (title ? ' title="' + title + '"' : '') + '>');
        t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
        t = t.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
        t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        t = t.replace(/~~([^~]+)~~/g, '<del>$1</del>');
        t = t.replace(/`([^`]+)`/g, '<code class="me-code-inline">$1</code>');
        // 还原行内 HTML 标签占位符
        t = t.replace(/\u0000H(\d+)\u0000/g, (m, idx) => htmlSpans[+idx]);
        return t;
      };

      for (; i < lines.length; i++) {
        const line = lines[i];
        let m = line.match(/^\u0000B(\d+)\u0000$/);
        if (m) { closeLists(); html += blocks[+m[1]]; continue; }

        // 原生 HTML 块：直接透传（Markdown + HTML 混排支持）
        // 匹配块级 HTML 开标签行（div/p/audio/video/table/iframe/hr/section/h1-6 等）
        if (/^\s*<(div|p|audio|video|source|iframe|table|thead|tbody|section|article|figure|hr|br|h[1-6]|ul|ol|li|blockquote|pre|img|b|i|u|strong|em|span|font|a)\b[^>]*>/i.test(line)) {
          closeLists();
          html += line; continue;
        }

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
      // 收敛过量换行（DOM 往返叠加产生），但保留用户输入的连续空行（最多 2 个空行 = 3 个换行）
      return out.md.replace(/\n{4,}/g, '\n\n\n').trimEnd() + '\n';
    },

    _walkChildren(node, out, depth, seen) {
      node.childNodes.forEach(child => this._walk(child, out, depth, seen));
    },

    _inlineMd(node, seen) {
      // serialize inline content of a node to markdown text
      const out = { md: '' };
      this._walkChildren(node, out, 0, seen);
      return out.md;
    },

    _walk(node, out, depth, seen) {
      // 防御 DOM 环：若当前节点已在祖先链中出现，直接跳过（避免无限递归）
      if (!seen) seen = new Set();
      if (seen.has(node)) return;
      seen.add(node);
      // 防御超深递归：任何未知环结构下都不会栈溢出
      if (depth > 500) return;
      if (node.nodeType === Node.TEXT_NODE) {
        // collapse whitespace (rich editors may add pretty text nodes)
        out.md += node.textContent.replace(/[ \t]*\n[ \t]*/g, ' ');
        seen.delete(node);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const tag = node.tagName.toLowerCase();

      switch (tag) {
        case 'h1': out.md += '\n# ' + this._inlineMd(node, seen).trim() + '\n\n'; return;
        case 'h2': out.md += '\n## ' + this._inlineMd(node, seen).trim() + '\n\n'; return;
        case 'h3': out.md += '\n### ' + this._inlineMd(node, seen).trim() + '\n\n'; return;
        case 'h4': out.md += '\n#### ' + this._inlineMd(node, seen).trim() + '\n\n'; return;
        case 'h5': out.md += '\n##### ' + this._inlineMd(node, seen).trim() + '\n\n'; return;
        case 'h6': out.md += '\n###### ' + this._inlineMd(node, seen).trim() + '\n\n'; return;

        case 'p': {
          const inner = this._inlineMd(node, seen).trim();
          // 空段落（连续回车产生）→ 单个换行，保留空行但不产生过量换行
          if (!inner) { out.md += '\n'; return; }
          out.md += '\n' + inner + '\n\n'; return;
        }

        case 'br':
          out.md += '\n'; return;

        case 'strong': case 'b': {
          const t = this._inlineMd(node, seen).trim();
          out.md += t ? '**' + t + '**' : ''; return;
        }
        case 'em': case 'i': {
          const t = this._inlineMd(node, seen).trim();
          out.md += t ? '*' + t + '*' : ''; return;
        }
        case 'del': case 's': case 'strike': {
          const t = this._inlineMd(node, seen).trim();
          out.md += t ? '~~' + t + '~~' : ''; return;
        }
        case 'code': {
          if (node.closest('pre')) { out.md += node.textContent; return; }
          const t = node.textContent;
          out.md += '`' + t + '`'; return;
        }
        case 'pre': {
          const code = node.querySelector('code');
          // contenteditable 中按 Enter 浏览器会插入 <br>；textContent 取值时 <br> 不产生文本，
          // 导致换行丢失。先把 <br> 转为换行符再取文本。
          const srcNode = code || node;
          const tmp = srcNode.cloneNode(true);
          tmp.querySelectorAll('br').forEach(br => br.replaceWith(document.createTextNode('\n')));
          const text = tmp.textContent.replace(/\n$/, '');
          out.md += '\n```\n' + text + '\n```\n\n'; return;
        }
        case 'blockquote':
          out.md += '\n' + this._inlineMd(node, seen).trim().split('\n').map(l => '> ' + l).join('\n') + '\n\n'; return;

        case 'ul': {
          out.md += '\n';
          node.querySelectorAll(':scope > li').forEach(li => {
            const indent = '  '.repeat(depth);
            const cb = li.querySelector('input[type=checkbox][data-me-task]');
            if (cb) {
              out.md += indent + '- [' + (cb.checked ? 'x' : ' ') + '] ' + this._liText(li, seen) + '\n';
            } else {
              out.md += indent + '- ' + this._liText(li, seen) + '\n';
            }
            // 递归序列化嵌套列表，保持层级
            li.querySelectorAll(':scope > ul, :scope > ol').forEach(sub => this._walk(sub, out, depth + 1, seen));
          });
          out.md += '\n'; return;
        }
        case 'ol': {
          out.md += '\n';
          let n = 1;
          node.querySelectorAll(':scope > li').forEach(li => {
            const indent = '  '.repeat(depth);
            out.md += indent + (n++) + '. ' + this._liText(li, seen) + '\n';
            li.querySelectorAll(':scope > ul, :scope > ol').forEach(sub => this._walk(sub, out, depth + 1, seen));
          });
          out.md += '\n'; return;
        }
        case 'li': return; // handled by parent list

        case 'a': {
          const href = node.getAttribute('href') || '';
          out.md += '[' + this._inlineMd(node, seen).trim() + '](' + href + ')'; return;
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
          const inner = this._inlineMd(node, seen);
          if (color) {
            out.md += '<span style="color:' + color + '">' + inner + '</span>';
          } else {
            this._walkChildren(node, out, depth, seen);
          }
          return;
        }

        case 'audio':
          out.md += '<audio src="' + (node.getAttribute('src') || '') + '" controls></audio>'; return;
        case 'video':
          out.md += '<video src="' + (node.getAttribute('src') || '') + '" controls></video>'; return;

        case 'div': case 'section': {
          // Message 组件（warn/msg/err）：原样保留，避免序列化只剩文本
          if (node.classList && node.classList.contains('me-msg')) {
            out.md += node.outerHTML + '\n'; return;
          }
          // Chrome 等浏览器按回车时用 <div> 分隔行；不输出换行会导致多行合并
          const inner = this._inlineMd(node, seen).trim();
          if (inner) out.md += inner + '\n';
          return;
        }

        default:
          // unknown inline element: recurse
          this._walkChildren(node, out, depth, seen); return;
      }
    },

    _liText(li, seen) {
      // serialize li content excluding nested lists & task checkbox
      const clone = li.cloneNode(true);
      clone.querySelectorAll('ul, ol, input').forEach(n => n.remove());
      return this._inlineMd(clone, seen).trim();
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
      this._bindCodeViewLive();
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
            '<button class="me-nav-btn" data-act="toggleview" title="View Markdown Code">' + icon(I.codeView, 'View Code', true) + '</button>' +
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
            '<textarea class="me-code-edit hidden" spellcheck="false" placeholder="Markdown 源码…"></textarea>' +
            '<div class="me-preview-pane hidden"></div>' +
          '</div>' +
        '</div>' +

        /* Status bar */
        (this.opts.showStatusBar !== false ?
          '<div class="me-statusbar"><span class="me-status-count"></span></div>' : '') +

        /* Markdown source modal */
        '<div class="me-modal hidden" data-modal="codeview">' +
          '<div class="me-modal-box">' +
            '<div class="me-modal-head"><span>Markdown Source (underlying format)</span>' +
              '<button class="me-nav-btn" data-act="applycode" title="应用修改并关闭">' + icon(I.save, 'Apply') + '</button>' +
              '<button class="me-nav-btn" data-close>' + icon(I.close, 'Close') + '</button></div>' +
            '<textarea class="me-code-view me-code-view-edit" spellcheck="false" placeholder="Markdown 源码…"></textarea>' +
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

        '<div class="me-modal hidden" data-modal="link">' +
          '<div class="me-modal-box me-modal-form">' +
            '<div class="me-modal-head"><span>Insert Link</span>' +
              '<button class="me-nav-btn" data-close>' + icon(I.close, 'Close') + '</button></div>' +
            '<div class="me-form-body">' +
              '<label class="me-field"><span>标题 / 显示文本</span>' +
                '<input type="text" id="me-link-text" placeholder="链接标题（留空则显示 URL）"></label>' +
              '<label class="me-field"><span>链接 URL <em class="me-dim2">(required)</em></span>' +
                '<input type="text" id="me-link-url" placeholder="https://example.com"></label>' +
              '<div class="me-form-actions">' +
                '<button class="me-btn" data-close>Cancel</button>' +
                '<button class="me-btn me-btn-primary" data-act="link-confirm">Insert</button>' +
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

        '<div class="me-modal hidden" data-modal="message">' +
          '<div class="me-modal-box me-modal-form">' +
            '<div class="me-modal-head"><span>Insert Message</span>' +
              '<button class="me-nav-btn" data-close>' + icon(I.close, 'Close') + '</button></div>' +
            '<div class="me-form-body">' +
              '<div class="me-msg-row me-msg-row-msg" id="me-msg-row">' +
                '<div class="me-msg-pickers">' +
                  '<button type="button" class="me-msg-pick me-msg-ico-msg active" data-type="msg" title="Message">' +
                    '<svg viewBox="0 -960 960 960" style="width:16px;height:16px;fill:currentColor" aria-hidden="true"><path d="m424-408-86-86q-11-11-28-11t-28 11q-11 11-11 28t11 28l114 114q12 12 28 12t28-12l226-226q11-11 11-28t-11-28q-11-11-28-11t-28 11L424-408Zm56 328q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z"/></svg>' +
                  '</button>' +
                  '<button type="button" class="me-msg-pick me-msg-ico-warn" data-type="warn" title="Warning">' +
                    '<svg viewBox="0 -960 960 960" style="width:16px;height:16px;fill:currentColor" aria-hidden="true"><path d="M109-120q-11 0-20-5.5T75-140q-5-9-5.5-19.5T75-180l370-640q6-10 15.5-15t19.5-5q10 0 19.5 5t15.5 15l370 640q6 10 5.5 20.5T885-140q-5 9-14 14.5t-20 5.5H109Zm399.5-131.5Q520-263 520-280t-11.5-28.5Q497-320 480-320t-28.5 11.5Q440-297 440-280t11.5 28.5Q463-240 480-240t28.5-11.5Zm0-120Q520-383 520-400v-120q0-17-11.5-28.5T480-560q-17 0-28.5 11.5T440-520v120q0 17 11.5 28.5T480-360q17 0 28.5-11.5Z"/></svg>' +
                  '</button>' +
                  '<button type="button" class="me-msg-pick me-msg-ico-err" data-type="err" title="Error">' +
                    '<svg viewBox="0 -960 960 960" style="width:16px;height:16px;fill:currentColor" aria-hidden="true"><path d="M508.5-291.5Q520-303 520-320t-11.5-28.5Q497-360 480-360t-28.5 11.5Q440-337 440-320t11.5 28.5Q463-280 480-280t28.5-11.5Zm0-160Q520-463 520-480v-160q0-17-11.5-28.5T480-680q-17 0-28.5 11.5T440-640v160q0 17 11.5 28.5T480-440q17 0 28.5-11.5ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z"/></svg>' +
                  '</button>' +
                '</div>' +
                '<textarea id="me-msg-text" rows="3" placeholder="Message text..."></textarea>' +
              '</div>' +
              '<div class="me-form-actions">' +
                '<button class="me-btn" data-close>Cancel</button>' +
                '<button class="me-btn me-btn-primary" data-act="message-confirm">Insert</button>' +
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
        // 清除格式（原 para）：官方 Material Symbols「Ink Eraser」内联 SVG（字体图标缺失时仍可显示）
        this._toolBtn('para', 'Clear Format', '<svg viewBox="0 -960 960 960" style="width:17px;height:17px;fill:currentColor" aria-hidden="true"><path d="M678-220h173q13 0 21.5 8.5T881-190q0 13-8.5 21.5T851-160H618l60-60Zm-486 60q-6 0-11.5-2t-10.5-7l-72-75q-18-17-17.5-41.5T97-327l458-498q16-17 40.5-17t41.5 17l205 215q17 17 18 42t-16 42L512-170q-5 5-10.5 7.5T490-160H192Z"/></svg>'),
        this._toolBtn('bold', 'Bold (Ctrl+B)', icon(I.bold, '')),
        this._toolBtn('italic', 'Italic (Ctrl+I)', icon(I.italic, '')),
        this._toolBtn('strike', 'Strikethrough', icon(I.strike, '')),
        this._toolBtn('codeInline', 'Inline Code', icon(I.codeInline, '')),
        this._toolBtn('color', 'Text Color', icon(I.color, '')),
        this._toolSep(),
        this._toolBtn('h1', 'Heading 1', 'H1'),
        this._toolBtn('h2', 'Heading 2', 'H2'),
        this._toolBtn('h3', 'Heading 3', 'H3'),
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
        // Message 组件按钮（官方 chat SVG）
        this._toolBtn('message', 'Insert Message', '<svg viewBox="0 -960 960 960" style="width:17px;height:17px;fill:currentColor" aria-hidden="true"><path d="m240-240-92 92q-19 19-43.5 8.5T80-177v-623q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H240Zm40-160h240q17 0 28.5-11.5T560-440q0-17-11.5-28.5T520-480H280q-17 0-28.5 11.5T240-440q0 17 11.5 28.5T280-400Zm0-120h400q17 0 28.5-11.5T720-560q0-17-11.5-28.5T680-600H280q-17 0-28.5 11.5T240-560q0 17 11.5 28.5T280-520Zm0-120h400q17 0 28.5-11.5T720-680q0-17-11.5-28.5T680-720H280q-17 0-28.5 11.5T240-680q0 17 11.5 28.5T280-640Z"/></svg>'),
        this._toolBtn('hr', 'Horizontal Rule', icon(I.hr, ''))
      ];
      this.$toolbarMain.innerHTML = left.join('');

      // Right group: [code view], [info]
      let right = '';
      if (this.opts.showViewCode !== false) {
        right += this._toolBtn('viewmd', 'View Markdown', icon(I.codeView, ''));
      }
      // 信息按钮：点击弹窗显示信息
      right += this._toolBtn('info', '信息', icon(I.about, ''));
      this.$toolbarRight.innerHTML = right;
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

      // 点击编辑器外部时取消媒体选中态
      document.addEventListener('click', (e) => {
        if (this._selectedMedia && !this.$editor.contains(e.target)) {
          this._deselectMedia();
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
        if (act === 'viewmd') { self._toggleCodeMode(); return; }
        if (act === 'copy') { self._copyMarkdown(); return; }
        if (act === 'info') { self._showInfo(); return; }
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
        if (act === 'toggleview') self._toggleCodeMode();
        if (act === 'about') self._openModal('about');
      });

      this.app.querySelectorAll('.me-modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
          if (e.target === modal || e.target.closest('[data-close]')) modal.classList.add('hidden');
          // form confirm buttons (image/audio/video) live inside modals
          const actBtn = e.target.closest('[data-act]');
          if (actBtn) {
            e.preventDefault();
            if (actBtn.dataset.act === 'applycode') { self._applyCodeView(); return; }
            self._exec(actBtn.dataset.act);
          }
        });
      });

      // modal inputs: Enter key confirms
      ['image', 'audio', 'video', 'table', 'link', 'message'].forEach(kind => {
        const modal = this.app.querySelector('[data-modal="' + kind + '"]');
        if (!modal) return;
        modal.querySelectorAll('input, textarea').forEach(inp => {
          inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              self._exec(kind + '-confirm');
            }
          });
        });
      });

      // message modal: picker icons highlight + tint the whole input row
      const msgRow = this.app.querySelector('#me-msg-row');
      if (msgRow) {
        this._msgType = 'msg';
        msgRow.querySelectorAll('.me-msg-pick').forEach(btn => {
          btn.addEventListener('click', () => {
            msgRow.querySelectorAll('.me-msg-pick').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            this._msgType = btn.dataset.type;
            msgRow.className = 'me-msg-row me-msg-row-' + this._msgType;
          });
        });
      }
      const msgText = this.app.querySelector('#me-msg-text');
      if (msgText) {
        msgText.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            self._exec('message-confirm');
          }
        });
      }

      // task checkbox toggling
      // 点击媒体（audio/video）：控件区被浏览器 shadow DOM 处理，冒泡阶段收不到事件，
      // 必须用捕获阶段拦截。图片无此问题，但统一在捕获阶段处理保持一致。
      this.$editor.addEventListener('click', (e) => {
        const media = e.target.closest('audio, video');
        if (media && this.$editor.contains(media)) {
          // 仅选中（删除用 Delete/Backspace 键），不阻止播放控件的后续交互
          if (this._selectedMedia !== media) {
            this._selectMediaElement(media);
          }
          return;
        }
        if (!e.target.closest('img')) this._deselectMedia();
      }, true); // ← capture：先于 audio/video 控件的内部处理

      this.$editor.addEventListener('click', (e) => {
        const cb = e.target.closest('input[type=checkbox][data-me-task]');
        if (cb) { this._sync(); return; }
        // 图片：单击仅选中，删除统一用 Delete/Backspace 键（避免误删）
        const img = e.target.closest('img');
        if (img && this.$editor.contains(img)) {
          e.preventDefault();
          if (this._selectedMedia !== img) this._selectMediaElement(img);
          return;
        }
      });

      // Delete/Backspace 键删除选中的媒体元素（document 捕获：点击媒体后焦点可能不在编辑器内，
      // 绑在编辑器上的冒泡监听收不到键盘事件）
      document.addEventListener('keydown', (e) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && this._selectedMedia &&
            this.$editor.contains(this._selectedMedia)) {
          e.preventDefault();
          this._deleteMediaElement(this._selectedMedia);
        }
      }, true);

      // 音频控件区点击时 click/mousedown 可能被浏览器 media 处理器吞掉，
      // 补充捕获阶段 mousedown 拦截，保证第一次点击就能选中音频
      this.$editor.addEventListener('mousedown', (e) => {
        const media = e.target.closest('audio, video');
        if (media && this.$editor.contains(media)) {
          // 不 preventDefault：保留焦点转移到编辑器的行为，选中后可直接输入
          if (this._selectedMedia !== media) {
            this._selectMediaElement(media);
          }
        }
      }, true);

      // sync markdown on input
      this.$editor.addEventListener('input', debounce(() => {
        self._normalizeHtmlText();
        self._pushUndo();
        self._sync();
      }, 400));

      // paste handling: images as base64 or upload via uploadUrl
      this.$editor.addEventListener('paste', (e) => self._onPaste(e));

      // keyboard shortcuts
      // pre 内 Enter：document 捕获阶段拦截（确保任何焦点/嵌套状态都能生效）
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.shiftKey) return;
        const pre = e.target && e.target.closest && e.target.closest('pre');
        if (!pre || !this.$editor.contains(pre)) return;
        e.preventDefault();
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          range.insertNode(document.createTextNode('\n'));
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        this._pushUndo();
        this._sync();
      }, true); // capture

      this.$editor.addEventListener('keydown', (e) => {
        const mod = e.ctrlKey || e.metaKey;
        // pre 内 Enter 已由 document 捕获监听统一处理
        if (!mod) return;
        const k = e.key.toLowerCase();
        const map = { b: 'bold', i: 'italic', u: null, s: 'save' };
        if (map[k] !== undefined && map[k] !== null) { e.preventDefault(); self._exec(map[k]); }
      });
    }

    /* ---------- WYSIWYG formatting ---------- */
    /* ---------- 选区保存/恢复：弹窗打开导致编辑器失焦后，插入仍回到原光标位置 ---------- */
    _saveSelection() {
      const sel = window.getSelection();
      if (sel && sel.rangeCount && this.$editor.contains(sel.anchorNode)) {
        this._savedRange = sel.getRangeAt(0).cloneRange();
      }
    }
    _restoreSelection() {
      this.$editor.focus();
      const sel = window.getSelection();
      if (this._savedRange) {
        sel.removeAllRanges();
        sel.addRange(this._savedRange);
      }
    }

    _exec(act) {
      const ed = this.$editor;
      // 打开插入类弹窗前先保存当前光标位置（弹窗会导致编辑器失焦）
      if (act === 'image' || act === 'audio' || act === 'video' || act === 'table' || act === 'link' || act === 'message') {
        this._saveSelection();
      }
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
          this._restoreSelection();
          this._insertHtml('<p><img src="' + escHtml(url) + '" alt="' + escHtml(title || 'image') + '"' + (title ? ' title="' + escHtml(title) + '"' : '') + '"></p><p><br></p>');
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
          this._restoreSelection();
          this._insertHtml('<p><audio src="' + escHtml(url) + '" controls></audio></p><p><br></p>');
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
          this._restoreSelection();
          this._insertHtml('<p><video src="' + escHtml(url) + '" controls style="max-width:100%;border-radius:8px"></video></p><p><br></p>');
          return restore();
        }

        case 'codeBlock':
          this._insertHtml(
            '<pre class="me-pre" data-me-block="code"><code>// code here\n</code></pre><p><br></p>');
          return restore();

        case 'link': {
          // 打开链接弹窗（标题+URL 表单），保存光标供确认后恢复
          this._saveSelection();
          this._openModal('link');
          setTimeout(() => { const inp = this._q('#me-link-text'); if (inp) inp.focus(); }, 50);
          return;
        }
        case 'link-confirm': {
          const url = (this._q('#me-link-url').value || '').trim();
          const text = (this._q('#me-link-text').value || '').trim() || url;
          if (!url) { this._toast('Link URL is required'); return; }
          this._closeModal('link');
          this._restoreSelection();
          this._insertHtml('<a href="' + escHtml(url) + '" target="_blank" rel="noopener">' + escHtml(text) + '</a>');
          return restore();
        }

        case 'message':
          this._openModal('message');
          setTimeout(() => { const t = this._q('#me-msg-text'); if (t) t.focus(); }, 50);
          return;
        case 'message-confirm': {
          const mtext = (this._q('#me-msg-text').value || '').trim();
          if (!mtext) { this._toast('Message text is required'); return; }
          const mtype = this._msgType || 'msg';
          const txtInput = this._q('#me-msg-text');
          if (txtInput) txtInput.value = '';
          this._closeModal('message');
          this._restoreSelection();
          this._insertHtml(this._msgHtml(mtype, mtext) + '<p><br></p>');
          return restore();
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
          this._restoreSelection();
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
                this._insertHtml('<p><img src="' + escHtml(url) + '" alt="pasted image"><p><br></p>');
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
      // 文本粘贴：优先取 text/plain，按 Markdown 解析后插入，
      // 避免浏览器默认行为把富文本 HTML（span/div 等）直接灌进 DOM 导致序列化变形
      const textData = (e.clipboardData || window.clipboardData);
      if (!textData) return;
      const plain = textData.getData('text/plain') || '';
      const htmlData = textData.getData('text/html') || '';
      e.preventDefault();
      // 粘贴内容看起来是 HTML 代码（如 <img ...>、<b>、<a href）：
      // 直接作为 HTML 插入渲染，而不是显示为字面文本
      if (/^\s*<[a-z!][\s\S]*>/i.test(plain)) {
        this._insertHtml(plain);
        this._pushUndo(); this._sync();
        return;
      }
      // 剪贴板只有富文本 HTML（无纯文本）时，提取纯文本转 Markdown 处理
      if (!plain && htmlData) {
        const tmp = document.createElement('div');
        tmp.innerHTML = htmlData;
        const text = tmp.textContent || '';
        if (text.trim()) {
          this._insertHtml(MdParser.parse(text));
          this._pushUndo(); this._sync();
        }
        return;
      }
      if (!plain) { this._insertHtml('<p><br></p>'); this._pushUndo(); this._sync(); return; }
      // 将粘贴的文本按 Markdown 渲染为富文本节点后插入光标处
      const html = MdParser.parse(plain);
      this._insertHtml(html);
      this._pushUndo(); this._sync();
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
      // 代码模式下：textarea 是当前真源，先把它写入 _markdown（旧 WYSIWYG DOM 已过期）
      if (this._viewMode === 'code') {
        const codeEdit = this.app.querySelector('.me-code-edit');
        if (codeEdit) { this._markdown = codeEdit.value; this._updateStatus(); return; }
      }
      // rich DOM -> underlying markdown (in memory only)
      this._markdown = MdSerializer.serialize(this.$editor);
      this._updateStatus();
    }

    /* ---------- Markdown Source 弹窗（textarea 可编辑，实时同步预览） ---------- */
    _openCodeView() {
      this._sync();
      this.$codeView.value = this._markdown;
      this._openModal('codeview');
      this.$codeView.focus();
    }
    _applyCodeView() {
      if (!this.$codeView) return;
      this.setMarkdown(this.$codeView.value);
      this._closeModal('codeview');
      this._toast('Markdown applied');
    }
    /* 弹窗内输入时实时更新到编辑器/预览 */
    _bindCodeViewLive() {
      if (!this.$codeView) return;
      let t = null;
      this.$codeView.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => {
          // 保留光标：setMarkdown 会重建 DOM，仅在预览模式下实时同步渲染
          if (this._viewMode === 'preview') {
            const pane = this.app.querySelector('.me-preview-pane');
            if (pane) pane.innerHTML = MdParser.parse(this.$codeView.value || '');
          } else {
            const pos = this.$codeView.selectionStart;
            this.setMarkdown(this.$codeView.value);
            // 恢复 textarea 焦点与光标位置
            this.$codeView.focus();
            try { this.$codeView.setSelectionRange(pos, pos); } catch (e) {}
          }
        }, 300);
      });
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

    /* ---------- 媒体选择与删除：点击选中（蓝色外框），再次点击或 Delete 键删除 ---------- */
    _selectMediaElement(el) {
      this._deselectMedia();
      this._selectedMedia = el;
      el.classList.add("me-media-selected");
      // 把光标放到媒体元素之后，选中后可直接输入文字
      const range = document.createRange();
      range.setStartAfter(el);
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }

    _deselectMedia() {
      if (this._selectedMedia) {
        this._selectedMedia.classList.remove("me-media-selected");
        this._selectedMedia = null;
      }
    }

    _deleteMediaElement(el) {
      if (!el) return;
      const parent = el.parentElement;
      el.remove();
      // 清理所在空段落，避免残留空行
      if (parent && parent !== this.$editor && parent.tagName === "P" &&
          !parent.textContent.trim() && !parent.querySelector("img,audio,video")) {
        parent.remove();
      }
      this._selectedMedia = null;
      this._pushUndo();
      this._sync();
      this._toast(el.tagName.toLowerCase() + " deleted");
    }
    /* ---------- 输入规范化：WYSIWYG 中打出的文本形式 HTML 标签 → 真实元素 ----------
       用户直接输入 <audio src=...></audio>、<img ...>、<b>...</b> 等时，
       这些字符是纯文本节点；防抖后将其转换为真实 DOM 元素，立即显示为播放器/图片/样式 */
    _normalizeHtmlText() {
      const walker = document.createTreeWalker(this.$editor, NodeFilter.SHOW_TEXT, {
        // 排除代码块/代码行内的文本：那里是字面代码，不能被转换为元素
        acceptNode(node) {
          const p = node.parentNode;
          if (p && (p.closest('pre, code'))) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      const targets = [];
      let node;
      while ((node = walker.nextNode())) {
        // 只处理含完整标签的文本节点
        if (/<\s*(audio|video|img|br|hr|iframe)\b[^<>]*>\s*(?:<\/\s*(audio|video|iframe)\s*>)?/i.test(node.nodeValue)) {
          targets.push(node);
        }
      }
      if (!targets.length) return;
      // 快照光标位置，规范化后恢复（避免打字时光标跳到开头/结尾）
      const sel = window.getSelection();
      let cursorOffset = -1, cursorNode = null;
      if (sel && sel.rangeCount && this.$editor.contains(sel.anchorNode)) {
        cursorNode = sel.anchorNode;
        cursorOffset = sel.anchorOffset;
      }
      targets.forEach(textNode => {
        const raw = textNode.nodeValue;
        // 逐个标签拆分：标签前的文本保留，标签本身转为元素
        const frag = document.createDocumentFragment();
        const re = /<\s*(audio|video|img|br|hr|iframe)\b([^<>]*)>(?:<\/\s*\1\s*>)?/gi;
        let last = 0, m;
        while ((m = re.exec(raw)) !== null) {
          if (m.index > last) frag.appendChild(document.createTextNode(raw.slice(last, m.index)));
          const tag = m[1].toLowerCase();
          const el = document.createElement(tag);
          // 解析属性（src/controls/style/width 等）
          const attrRe = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
          let am;
          while ((am = attrRe.exec(m[2])) !== null) {
            const val = am[3] !== undefined ? am[3] : (am[4] !== undefined ? am[4] : am[5]);
            try { el.setAttribute(am[1], val); } catch (e) {}
          }
          if (tag === 'audio' || tag === 'video') el.setAttribute('controls', '');
          if (tag === 'video' || tag === 'iframe') el.setAttribute('style', 'max-width:100%;border-radius:8px');
          frag.appendChild(el);
          last = re.lastIndex;
        }
        if (last < raw.length) frag.appendChild(document.createTextNode(raw.slice(last)));
        textNode.parentNode.replaceChild(frag, textNode);
      });
      // 规范化后重算 markdown（不再重复 pushUndo，外层已处理）
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

    /* ---------- 视图模式：编辑 ⇄ 代码 二态切换 ---------- */
    _setView(mode) {
      const codeEdit = this.app.querySelector('.me-code-edit');
      const previewPane = this.app.querySelector('.me-preview-pane');
      if (!codeEdit) return;
      const btn = this.app.querySelector('[data-act="toggleview"]');
      const setBtn = (iconName, title) => {
        if (!btn) return;
        // 图标可能是 material-icons 或 material-icons-outlined，两种都要匹配
        const iconEl = btn.querySelector('.material-icons, .material-icons-outlined');
        if (iconEl) iconEl.textContent = iconName;
        btn.title = title;
      };

      if (mode === 'code') {
        // 进入代码模式：WYSIWYG 隐藏，textarea 显示当前 Markdown，可直接编辑
        this._sync();
        codeEdit.value = this._markdown;
        this.$editor.classList.add('hidden');
        if (previewPane) previewPane.classList.add('hidden');
        codeEdit.classList.remove('hidden');
        setBtn(I.preview, '预览模式');
      } else {
        // 回到编辑模式：textarea 内容重新解析渲染
        this.setMarkdown(codeEdit.value);
        codeEdit.classList.add('hidden');
        if (previewPane) previewPane.classList.add('hidden');
        this.$editor.classList.remove('hidden');
        setBtn(I.codeView, 'View Markdown Code');
      }
      this._viewMode = mode;
    }

    _toggleCodeMode() {
      this._setView(this._viewMode === 'code' ? 'wysiwyg' : 'code');
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
    /* Message component (warn/msg/err) */
    _msgHtml(type, text) {
      const icons = {
        warn: 'M109-120q-11 0-20-5.5T75-140q-5-9-5.5-19.5T75-180l370-640q6-10 15.5-15t19.5-5q10 0 19.5 5t15.5 15l370 640q6 10 5.5 20.5T885-140q-5 9-14 14.5t-20 5.5H109Zm399.5-131.5Q520-263 520-280t-11.5-28.5Q497-320 480-320t-28.5 11.5Q440-297 440-280t11.5 28.5Q463-240 480-240t28.5-11.5Zm0-120Q520-383 520-400v-120q0-17-11.5-28.5T480-560q-17 0-28.5 11.5T440-520v120q0 17 11.5 28.5T480-360q17 0 28.5-11.5Z',
        msg: 'm424-408-86-86q-11-11-28-11t-28 11q-11 11-11 28t11 28l114 114q12 12 28 12t28-12l226-226q11-11 11-28t-11-28q-11-11-28-11t-28 11L424-408Zm56 328q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z',
        err: 'M508.5-291.5Q520-303 520-320t-11.5-28.5Q497-360 480-360t-28.5 11.5Q440-337 440-320t11.5 28.5Q463-280 480-280t28.5-11.5Zm0-160Q520-463 520-480v-160q0-17-11.5-28.5T480-680q-17 0-28.5 11.5T440-640v160q0 17 11.5 28.5T480-440q17 0 28.5-11.5ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z'
      };
      const t = (type === 'err' || type === 'msg') ? type : 'warn';
      return '<div class="me-msg me-msg-' + t + '">' +
        '<svg viewBox="0 -960 960 960" style="width:16px;height:16px;flex-shrink:0;fill:currentColor" aria-hidden="true"><path d="' + icons[t] + '"/></svg>' +
        '<span>' + escHtml(text) + '</span></div>';
    }

    /* Info modal: editor, author & contact (gradient card) */
    _showInfo() {
      const info = document.createElement('div');
      info.className = 'me-modal me-info-modal';
      info.style.cssText = 'position:fixed;inset:0;background:rgba(20,20,35,.45);display:flex;align-items:center;justify-content:center;z-index:200;';
      info.innerHTML =
        '<div class="me-modal-box me-info-box">' +
          '<div class="me-info-hero">' +
            '<button class="me-nav-btn me-info-close" data-close>' + icon(I.close, 'Close') + '</button>' +
            '<span class="material-icons me-info-logo">' + I.logo + '</span>' +
            '<h2>ME.js Editor</h2>' +
            '<span class="me-info-ver">Version ' + ((typeof __ME_VERSION__ !== 'undefined') ? __ME_VERSION__ : '0.2.0') + '</span>' +
          '</div>' +
          '<div class="me-info-body">' +
            '<div class="me-info-row"><span class="me-info-label">Author</span><span class="me-info-value">juicy696</span></div>' +
            '<div class="me-info-row"><span class="me-info-label">Contact</span><a class="me-info-value me-info-link" href="https://github.com/juicy696/me-editor" target="_blank" rel="noopener">github.com/juicy696</a></div>' +
          '</div>' +
        '</div>';
      document.body.appendChild(info);
      info.addEventListener('click', (e) => {
        if (e.target === info || e.target.closest('[data-close]')) info.remove();
      });
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
.me-toolbar-left{display:flex;align-items:center;gap:2px;min-width:0;flex:1;position:relative;}
.me-toolbar-main{display:flex;align-items:center;gap:2px;overflow:hidden;flex:1;white-space:nowrap;}
.me-toolbar-right{display:flex;align-items:center;gap:2px;flex-shrink:0;margin-left:0;}
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
.me-pane{flex:1;overflow-y:auto;min-width:0;position:relative;}
.me-code-edit{width:100%;height:100%;border:0;outline:none;resize:none;overflow-y:auto;padding:18px;font-family:Consolas,'Courier New',monospace;font-size:13.5px;line-height:1.6;color:#2b2f38;background:#fff;display:block;}
.me-preview-pane{width:100%;height:100%;overflow-y:auto;padding:18px 22px;font-size:15px;line-height:1.9;color:#3a4150;word-break:break-word;}
.me-preview-pane h1,.me-preview-pane h2,.me-preview-pane h3{margin:18px 0 10px;line-height:1.4;}
.me-preview-pane h1{font-size:21px;}
.me-preview-pane h2{font-size:18px;border-bottom:1px solid #eef1f8;padding-bottom:6px;}
.me-preview-pane p{margin:9px 0;}
.me-preview-pane ul,.me-preview-pane ol{padding-left:24px;margin:8px 0;}
.me-preview-pane li{margin:4px 0;}
.me-preview-pane img{max-width:100%;border-radius:8px;}
.me-preview-pane audio,.me-preview-pane video{width:100%;max-width:480px;margin:10px 0;border-radius:8px;display:block;}
.me-editor audio,.me-editor video{max-width:100%;margin:10px 0;border-radius:8px;}
.me-preview-pane code{background:#f0f3fa;border-radius:4px;padding:1px 6px;font-size:13px;font-family:ui-monospace,Consolas,monospace;}
.me-preview-pane pre{background:#f6f8fc;border:1px solid #eef1f8;border-radius:10px;padding:12px 14px;overflow-x:auto;margin:10px 0;}
.me-preview-pane pre code{background:none;padding:0;}
.me-preview-pane blockquote{border-left:3px solid #4f6ef7;background:#f6f8ff;padding:8px 14px;margin:10px 0;color:#4a5570;border-radius:0 8px 8px 0;}
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
.me-media-selected{outline:3px solid #4f6ef7;outline-offset:2px;border-radius:6px;cursor:pointer;}
.me-editor a{color:#5b53d6;}
.me-editor hr{border:none;border-top:2px solid #eceef4;margin:1.5em 0;}
.me-editor ul,.me-editor ol{padding-left:1.8em;}

.me-modal{position:fixed;inset:0;background:rgba(20,20,35,.45);display:flex;align-items:center;justify-content:center;z-index:100;}
.me-modal-box{background:#fff;border-radius:12px;width:min(760px,92vw);max-height:84vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3);}
.me-modal-head{display:flex;align-items:center;justify-content:space-between;padding:12px 18px;border-bottom:1px solid #eceef4;font-weight:600;color:#2a2a35;}
.me-code-view{margin:0;padding:18px;font-family:Consolas,monospace;font-size:13.5px;line-height:1.6;
  background:#1e1e2e;color:#c9f0ff;overflow:auto;flex:1;white-space:pre-wrap;
  width:100%;height:100%;border:0;outline:none;resize:none;display:block;}
.me-code-view:focus{outline:none;}
.me-modal-about{width:min(420px,90vw);}
.me-info-box{width:min(360px,90vw);overflow:hidden;border-radius:16px;border:0;box-shadow:0 18px 48px rgba(60,50,140,.35);}
.me-info-hero{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;padding:30px 22px 24px;
  background:linear-gradient(135deg,#7c6cff 0%,#5a8bff 55%,#4fc3f7 100%);color:#fff;}
.me-info-close{position:absolute;top:10px;right:10px;color:#fff;}
.me-info-close .material-icons{color:#fff;}
.me-info-logo{font-size:44px;color:rgba(255,255,255,.95);margin-bottom:4px;}
.me-info-hero h2{margin:0;color:#fff;font-size:19px;letter-spacing:.01em;}
.me-info-ver{font-size:12.5px;color:rgba(255,255,255,.8);}
.me-info-body{padding:18px 24px 22px;display:flex;flex-direction:column;}
.me-info-row{display:flex;align-items:center;justify-content:space-between;padding:9px 0;font-size:14px;}
.me-info-row + .me-info-row{border-top:1px solid #f0f1f6;}
.me-info-label{color:#8b8ea0;font-size:12.5px;text-transform:uppercase;letter-spacing:.05em;}
.me-info-value{color:#2a2a35;font-weight:600;}
.me-info-link{text-decoration:none;color:#7c6cff;}
.me-info-link:hover{text-decoration:underline;}
.me-modal-form{width:min(440px,92vw);}
.me-form-body{padding:20px 22px;display:flex;flex-direction:column;gap:14px;}
.me-field{display:flex;flex-direction:column;gap:6px;font-size:13.5px;color:#444;}
.me-field input{border:1px solid #dfe1e8;border-radius:8px;padding:9px 12px;font-size:14px;outline:none;}
.me-field select,.me-field textarea{border:1px solid #dfe1e8;border-radius:8px;padding:9px 12px;font-size:14px;outline:none;font-family:inherit;background:#fff;}
.me-field select:focus,.me-field textarea:focus,.me-field input:focus{border-color:#7c6cff;box-shadow:0 0 0 3px rgba(124,108,255,.15);}
.me-field textarea{resize:vertical;min-height:64px;}
/* Message modal: type picker + input in one row */
.me-msg-row{display:flex;align-items:stretch;gap:0;border:1px solid #dfe1e8;border-radius:8px;overflow:hidden;}
.me-msg-row:focus-within{border-color:#7c6cff;box-shadow:0 0 0 3px rgba(124,108,255,.15);}
.me-msg-row{display:flex;align-items:stretch;border-radius:10px;overflow:hidden;border:1px solid #eceef4;transition:background .15s;}
.me-msg-row-msg{background:rgba(76,175,80,.1);}
.me-msg-row-warn{background:rgba(255,193,7,.1);}
.me-msg-row-err{background:rgba(244,67,54,.1);}
.me-msg-pickers{display:flex;flex-direction:column;gap:2px;padding:6px;justify-content:center;flex-shrink:0;}
.me-msg-pick{display:flex;align-items:center;justify-content:center;width:26px;height:26px;border:0;border-radius:6px;background:none;cursor:pointer;color:#9a9db0;opacity:.55;transition:all .12s;}
.me-msg-pick:hover{opacity:.85;background:rgba(255,255,255,.55);}
.me-msg-pick.active{opacity:1;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.12);}
.me-msg-pick.active.me-msg-ico-msg{color:#2e7d32;}
.me-msg-pick.active.me-msg-ico-warn{color:#b28704;}
.me-msg-pick.active.me-msg-ico-err{color:#c62828;}
.me-msg-row textarea{border:0;padding:10px 12px;font-size:14px;outline:none;flex:1;min-width:0;resize:vertical;font-family:inherit;line-height:1.5;background:transparent;}
/* Message component: light bg (alpha .1), left icon, 11px text, rounded */
.me-msg{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:10px;margin:6px 0;font-size:11px;line-height:1.5;}
.me-msg-warn{background:rgba(255,193,7,.1);color:#b28704;}
.me-msg-msg{background:rgba(76,175,80,.1);color:#2e7d32;}
.me-msg-err{background:rgba(244,67,54,.1);color:#c62828;}
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
