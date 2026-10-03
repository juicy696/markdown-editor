/* ============================================================
 * ME Vue — Markdown WYSIWYG Editor for Vue 3
 * Version: 0.1.0
 *
 * Requires Vue 3 (global build, e.g. CDN) loaded BEFORE this file.
 * Reuses the same editing model as me_js.js:
 *   - WYSIWYG rich editing, Markdown underneath
 *   - MdParser / MdSerializer shared with the vanilla version
 *
 * Usage (see vue.html):
 *   const app = Vue.createApp({...});
 *   app.component('MeEditor', MEVue.MeEditor);
 *   <me-editor v-model="content" :options="{...}"></me-editor>
 * ============================================================ */
(function (global) {
  'use strict';

  const Vue = global.Vue;
  if (!Vue) throw new Error('ME Vue: Vue 3 must be loaded first (global build).');

  /* ============================================================
   * Shared core: MdParser + MdSerializer (ported from me_js.js)
   * ============================================================ */
  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

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
      const out = { md: '' };
      this._walkChildren(node, out, 0);
      return out.md;
    },
    _walk(node, out, depth) {
      if (node.nodeType === 3) {
        out.md += node.textContent.replace(/[ \t]*\n[ \t]*/g, ' ');
        return;
      }
      if (node.nodeType !== 1) return;
      const tag = node.tagName.toLowerCase();

      switch (tag) {
        case 'h1': out.md += '\n# ' + this._inlineMd(node).trim() + '\n\n'; return;
        case 'h2': out.md += '\n## ' + this._inlineMd(node).trim() + '\n\n'; return;
        case 'h3': out.md += '\n### ' + this._inlineMd(node).trim() + '\n\n'; return;
        case 'h4': out.md += '\n#### ' + this._inlineMd(node).trim() + '\n\n'; return;
        case 'h5': out.md += '\n##### ' + this._inlineMd(node).trim() + '\n\n'; return;
        case 'h6': out.md += '\n###### ' + this._inlineMd(node).trim() + '\n\n'; return;
        case 'p': out.md += '\n' + this._inlineMd(node).trim() + '\n\n'; return;
        case 'br': out.md += '\n'; return;
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
          out.md += '`' + node.textContent + '`'; return;
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
            out.md += cb
              ? '- [' + (cb.checked ? 'x' : ' ') + '] ' + this._liText(li) + '\n'
              : '- ' + this._liText(li) + '\n';
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
        case 'li': return;
        case 'a': {
          out.md += '[' + this._inlineMd(node).trim() + '](' + (node.getAttribute('href') || '') + ')'; return;
        }
        case 'img': {
          const src = node.getAttribute('src') || '';
          const alt = node.getAttribute('alt') || '';
          const width = node.getAttribute('width') || '';
          const style = node.getAttribute('style') || '';
          if (!width && !style) {
            out.md += '![' + alt + '](' + src + ')';
          } else {
            out.md += '<img src="' + src + '" alt="' + alt + '"' +
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
          this._walkChildren(node, out, depth); return;
        default:
          this._walkChildren(node, out, depth); return;
      }
    },
    _liText(li) {
      const clone = li.cloneNode(true);
      clone.querySelectorAll('ul, ol, input').forEach(n => n.remove());
      return this._inlineMd(clone).trim();
    }
  };

  /* ---------- Icons ---------- */
  const I = {
    logo: 'edit_note', bold: 'format_bold', italic: 'format_italic',
    strike: 'strikethrough_s', codeInline: 'data_object', color: 'palette',
    para: 'notes', quote: 'format_quote', ul: 'format_list_bulleted',
    ol: 'format_list_numbered', task: 'checklist', link: 'link',
    image: 'image', audio: 'library_music', video: 'movie',
    code: 'code', table: 'grid_on', hr: 'horizontal_rule',
    eraser: 'ink_eraser', undo: 'undo', redo: 'redo',
    codeView: 'code', copy: 'content_copy', close: 'close'
  };

  const DEFAULTS = {
    title: 'ME Vue Editor',
    placeholder: 'Start writing...',
    iconsMode: 'remote',
    iconsLocalPath: './icons/material-icons.css',
    pasteImage: 'auto',
    uploadUrl: null,
    showViewCode: true,
    showCopy: true,
    showAudio: true,
    showVideo: true,
    showStatusBar: true,
    maxLength: 0
  };

  /* ============================================================
   * MeEditor component
   * ============================================================ */
  const MeEditor = {
    name: 'MeEditor',
    props: {
      modelValue: { type: String, default: '' },
      options: { type: Object, default: () => ({}) }
    },
    emits: ['update:modelValue', 'change'],
    data() {
      return {
        opts: Object.assign({}, DEFAULTS, this.options),
        toast: '',
        statusCount: 0,
        markdown: '',
        eraserDisabled: true,
        moreOpen: false,
        overflowCount: 0,
        modal: null
      };
    },
    mounted() {
      this._applyIcons();
      // initial content: v-model markdown -> rich DOM
      if (this.$refs.editor) {
        if (this.modelValue) {
          this.$refs.editor.innerHTML = MdParser.parse(this.modelValue);
        }
        this._sync();
      }
      // eraser activation on selection change
      this._selHandler = () => {
        const sel = window.getSelection();
        const has = sel && sel.rangeCount && !sel.isCollapsed &&
          this.$refs.editor && this.$refs.editor.contains(sel.anchorNode);
        this.eraserDisabled = !has;
      };
      document.addEventListener('selectionchange', this._selHandler);
      // toolbar overflow: move buttons that don't fit into a dropdown
      this.$nextTick(() => this._setupOverflow());
    },
    beforeUnmount() {
      this._hideImgBar();
      if (this._selHandler) document.removeEventListener('selectionchange', this._selHandler);
      if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
      if (this._docClick) document.removeEventListener('click', this._docClick);
    },
    computed: {
      leftButtons() {
        const o = this.opts;
        const B = (act, title, icon) => ({ act, title, icon });
        const T = (act, title, text) => ({ act, title, text });
        const S = () => ({ sep: true });
        return [
          B('bold', 'Bold (Ctrl+B)', I.bold),
          B('italic', 'Italic (Ctrl+I)', I.italic),
          B('strike', 'Strikethrough', I.strike),
          B('codeInline', 'Inline Code', I.codeInline),
          B('color', 'Text Color', I.color),
          S(),
          T('h1', 'Heading 1', 'H1'),
          T('h2', 'Heading 2', 'H2'),
          T('h3', 'Heading 3', 'H3'),
          B('para', 'Normal Text', I.para),
          S(),
          B('quote', 'Blockquote', I.quote),
          B('ul', 'Bullet List', I.ul),
          B('ol', 'Numbered List', I.ol),
          B('task', 'Task List', I.task),
          S(),
          B('link', 'Link', I.link),
          B('image', 'Image', I.image),
          ...(o.showAudio !== false ? [B('audio', 'Audio', I.audio)] : []),
          ...(o.showVideo !== false ? [B('video', 'Video', I.video)] : []),
          B('codeBlock', 'Code Block', I.code),
          B('table', 'Table', I.table),
          B('hr', 'Horizontal Rule', I.hr)
        ];
      },
      overLimit() {
        const max = parseInt(this.opts.maxLength, 10) || 0;
        return max > 0 && this.statusCount > max;
      },
      statusText() {
        const max = parseInt(this.opts.maxLength, 10) || 0;
        return max > 0 ? this.statusCount + ' / ' + max + ' characters'
                       : this.statusCount + ' characters';
      },
      overflowButtons() {
        return this.leftButtons.slice(this.leftButtons.length - this.overflowCount);
      },
      modalTitle() {
        if (!this.modal) return '';
        return { image: 'Insert Image', audio: 'Insert Audio', video: 'Insert Video', table: 'Insert Table' }[this.modal.kind] || '';
      },
      modalLabel() {
        if (!this.modal) return '';
        return { image: 'Image', audio: 'Audio', video: 'Video' }[this.modal.kind] || '';
      },
      modalPlaceholder() {
        if (!this.modal) return '';
        return { image: 'https://example.com/picture.png', audio: 'https://example.com/sound.mp3', video: 'https://example.com/clip.mp4' }[this.modal.kind] || '';
      }
    },
    watch: {
      // external v-model changes -> re-render (only when set programmatically,
      // never fired by internal edits since markdown matches)
      modelValue(nv) {
        if (nv !== this.markdown && this.$refs.editor) {
          this.$refs.editor.innerHTML = MdParser.parse(nv || '');
          this._sync();
        }
      }
    },
    methods: {
      /* ---- core sync ---- */
      _sync() {
        if (!this.$refs.editor) return;
        this.markdown = MdSerializer.serialize(this.$refs.editor);
        this.statusCount = this.markdown.replace(/\n$/, '').length;
        this.$emit('update:modelValue', this.markdown);
        this.$emit('change', this.markdown);
      },
      onInput() {
        if (!this._debouncedSync) {
          let t;
          this._debouncedSync = () => {
            clearTimeout(t);
            t = setTimeout(() => this._sync(), 400);
          };
        }
        this._debouncedSync();
      },
      /* ---- toolbar ---- */
      exec(act) {
        const ed = this.$refs.editor;
        ed.focus();
        const restore = () => this._sync();
        switch (act) {
          case 'bold': document.execCommand('bold'); return restore();
          case 'italic': document.execCommand('italic'); return restore();
          case 'strike': document.execCommand('strikeThrough'); return restore();
          case 'h1': document.execCommand('formatBlock', false, 'h1'); return restore();
          case 'h2': document.execCommand('formatBlock', false, 'h2'); return restore();
          case 'h3': document.execCommand('formatBlock', false, 'h3'); return restore();
          case 'para': document.execCommand('formatBlock', false, 'p'); return restore();
          case 'quote': document.execCommand('formatBlock', false, 'blockquote'); return restore();
          case 'ul': document.execCommand('insertUnorderedList'); return restore();
          case 'ol': document.execCommand('insertOrderedList'); return restore();
          case 'undo': document.execCommand('undo'); return restore();
          case 'redo': document.execCommand('redo'); return restore();

          case 'codeInline': {
            const sel = window.getSelection();
            const text = sel && sel.rangeCount ? sel.toString() : 'code';
            this.insertHtml('<code class="me-code-inline">' + escHtml(text || 'code') + '</code>');
            return restore();
          }
          case 'color': {
            if (!this._colorInput) {
              this._colorInput = document.createElement('input');
              this._colorInput.type = 'color';
              this._colorInput.style.cssText = 'position:fixed;opacity:0;pointer-events:none;left:50vw;top:50vh;';
              document.body.appendChild(this._colorInput);
              this._colorInput.addEventListener('input', () => {
                document.execCommand('foreColor', false, this._colorInput.value);
                restore();
              });
            }
            this._colorInput.value = '#7c3aed';
            this._colorInput.click();
            return;
          }
          case 'eraser': {
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount || sel.isCollapsed) return;
            const range = sel.getRangeAt(0);
            const frag = range.extractContents();
            const tmp = document.createElement('div');
            tmp.appendChild(frag);
            range.insertNode(document.createTextNode(tmp.textContent));
            sel.removeAllRanges();
            return restore();
          }
          case 'link': {
            const sel = window.getSelection();
            const text = sel && sel.rangeCount ? sel.toString() : 'link text';
            const url = window.prompt('Enter URL:', 'https://');
            if (url) {
              this.insertHtml('<a href="' + escHtml(url) + '" target="_blank" rel="noopener">' + escHtml(text) + '</a>');
              restore();
            }
            return;
          }
          case 'image':
            this.modal = { kind: 'image', title: '', url: '' };
            return;
          case 'image-confirm': {
            const m = this.modal;
            if (!m.url.trim()) { this.showToast('Image URL is required'); return; }
            this.modal = null;
            this.insertHtml('<img src="' + escHtml(m.url.trim()) + '" alt="' + escHtml(m.title.trim() || 'image') + '"' +
              (m.title.trim() ? ' title="' + escHtml(m.title.trim()) + '"' : '') + '><p><br></p>');
            return restore();
          }
          case 'audio':
            this.modal = { kind: 'audio', url: '' };
            return;
          case 'audio-confirm': {
            const m = this.modal;
            if (!m.url.trim()) { this.showToast('Audio URL is required'); return; }
            this.modal = null;
            this.insertHtml('<audio src="' + escHtml(m.url.trim()) + '" controls></audio><p><br></p>');
            return restore();
          }
          case 'video':
            this.modal = { kind: 'video', url: '' };
            return;
          case 'video-confirm': {
            const m = this.modal;
            if (!m.url.trim()) { this.showToast('Video URL is required'); return; }
            this.modal = null;
            this.insertHtml('<video src="' + escHtml(m.url.trim()) + '" controls style="max-width:100%;border-radius:8px"></video><p><br></p>');
            return restore();
          }
          case 'codeBlock':
            this.insertHtml('<pre class="me-pre" data-me-block="code"><code>// code here\n</code></pre><p><br></p>');
            return restore();
          case 'table':
            this.modal = { kind: 'table', rows: 3, cols: 4 };
            this.focusModalInput();
            return;
          case 'table-confirm': {
            const m = this.modal;
            const rows = Math.min(Math.max(parseInt(m.rows, 10) || 3, 1), 50);
            const cols = Math.min(Math.max(parseInt(m.cols, 10) || 4, 1), 20);
            this.modal = null;
            let t = '<table class="me-table"><thead><tr>';
            for (let c = 0; c < cols; c++) t += '<th>Header ' + (c + 1) + '</th>';
            t += '</tr></thead><tbody>';
            for (let r = 0; r < rows - 1; r++) {
              t += '<tr>';
              for (let c = 0; c < cols; c++) t += '<td></td>';
              t += '</tr>';
            }
            t += '</tbody></table><p><br></p>';
            this.insertHtml(t);
            return restore();
          }
          case 'hr':
            this.insertHtml('<hr><p><br></p>');
            return restore();
        }
      },
      insertHtml(html) {
        document.execCommand('insertHTML', false, html);
      },
      /* ---- view code / copy ---- */
      openCodeView() {
        this._sync();
        this.$refs.codeText.textContent = this.markdown;
        this.$refs.codeModal.classList.remove('hidden');
      },
      closeModal(e) {
        if (e.target === e.currentTarget || e.target.closest('[data-close]')) {
          e.currentTarget.classList.add('hidden');
        }
      },
      async copyMarkdown() {
        try {
          await navigator.clipboard.writeText(this.markdown);
          this.showToast('Markdown copied to clipboard');
        } catch (e) {
          this.showToast('Copy failed');
        }
      },
      showToast(msg) {
        this.toast = msg;
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => { this.toast = ''; }, 2000);
      },
      /* ---- paste ---- */
      onPaste(e) {
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (const item of items) {
          if (item.type && item.type.indexOf('image/') === 0) {
            e.preventDefault();
            const file = item.getAsFile();
            if (!file) return;
            const mode = this.opts.uploadUrl ? 'upload' : 'base64';
            if (mode === 'upload') {
              this.showToast('Uploading image...');
              this.uploadImage(file).then(url => {
                this.insertHtml('<img src="' + escHtml(url) + '" alt="pasted image"><p><br></p>');
                this._sync();
                this.showToast('Image uploaded');
              }).catch(() => {
                this.showToast('Upload failed, using base64');
                this.insertBase64(file);
              });
            } else {
              this.insertBase64(file);
            }
            return;
          }
        }
      },
      insertBase64(file) {
        const reader = new FileReader();
        reader.onload = () => {
          this.insertHtml('<img src="' + reader.result + '" alt="pasted image"><p><br></p>');
          this._sync();
        };
        reader.readAsDataURL(file);
      },
      uploadImage(file) {
        const fd = new FormData();
        fd.append('file', file, file.name || 'paste.png');
        return fetch(this.opts.uploadUrl, { method: 'POST', body: fd })
          .then(res => res.json())
          .then(data => {
            if (!data.url) throw new Error('no url');
            if (data.url.indexOf('http') !== 0) {
              return new URL(this.opts.uploadUrl).origin + data.url;
            }
            return data.url;
          });
      },
      /* ---- image size toolbar ---- */
      onEditorClick(e) {
        const cb = e.target.closest('input[type=checkbox][data-me-task]');
        if (cb) { this._sync(); return; }
        const img = e.target.closest('img');
        if (img) { e.preventDefault(); this.showImgBar(img); }
        else { this._hideImgBar(); }
      },
      showImgBar(img) {
        this._hideImgBar();
        this._selectedImg = img;
        const bar = document.createElement('div');
        bar.className = 'me-img-bar';
        const current = img.getAttribute('width') || '';
        const opts = [['original', 'Original'], ['100%', '100%'], ['75%', '75%'], ['50%', '50%'], ['25%', '25%']];
        bar.innerHTML = '<span class="me-img-bar-label">Size</span>' + opts.map(o =>
          '<button class="me-img-bar-btn' + ((current === o[0]) || (o[0] === 'original' && !current) ? ' active' : '') +
          '" data-w="' + o[0] + '">' + o[1] + '</button>').join('');
        const r = img.getBoundingClientRect();
        bar.style.left = Math.max(8, r.left + window.scrollX) + 'px';
        bar.style.top = (r.top + window.scrollY - 40) + 'px';
        document.body.appendChild(bar);
        this._imgBar = bar;
        bar.addEventListener('click', (ev) => {
          const btn = ev.target.closest('[data-w]');
          if (!btn) return;
          ev.stopPropagation();
          const im = this._selectedImg;
          if (btn.dataset.w === 'original') {
            im.removeAttribute('width'); im.style.width = '';
          } else {
            im.style.width = btn.dataset.w;
            im.setAttribute('width', btn.dataset.w);
          }
          bar.querySelectorAll('.me-img-bar-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this._sync();
        });
        this._docClick = (ev) => {
          if (this._imgBar && !this._imgBar.contains(ev.target) && !ev.target.closest('img')) this._hideImgBar();
        };
        document.addEventListener('click', this._docClick);
      },
      _hideImgBar() {
        if (this._imgBar) { this._imgBar.remove(); this._imgBar = null; }
        if (this._docClick) { document.removeEventListener('click', this._docClick); this._docClick = null; }
        this._selectedImg = null;
      },
      _applyIcons() {
        const id = 'me-icons-css';
        let link = document.getElementById(id);
        const href = this.opts.iconsMode === 'local' ? this.opts.iconsLocalPath
          : 'https://fonts.googleapis.com/icon?family=Material+Icons';
        if (!link) {
          link = document.createElement('link');
          link.id = id; link.rel = 'stylesheet';
          document.head.appendChild(link);
        }
        link.href = href;
      },
      /* ---- toolbar overflow: count buttons that don't fit ---- */
      _setupOverflow() {
        const main = this.$refs.toolbarMain;
        const left = this.$refs.toolbarLeft;
        if (!main || !left) return;
        const redraw = () => {
          const tools = main.querySelectorAll('.me-tool:not(.me-more-btn)');
          const avail = left.clientWidth - 44; // reserve room for more-btn
          let used = 0; let overflow = 0;
          tools.forEach(t => {
            used += t.offsetWidth || 0;
            if (used > avail) { overflow++; }
          });
          this.overflowCount = overflow;
        };
        this._resizeHandler = () => redraw();
        window.addEventListener('resize', this._resizeHandler);
        setTimeout(redraw, 80);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);
        // close dropdown on outside click
        this._docClick = (ev) => {
          if (this.moreOpen && !ev.target.closest('.me-toolbar-left')) this.moreOpen = false;
        };
        document.addEventListener('click', this._docClick);
        // focus first modal input when the form opens
        this.$watch('modal', (m) => {
          if (m) this.$nextTick(() => {
            const el = this.$refs.modalFirstInput || this.$refs.modalSecondInput;
            if (el) el.focus();
          });
        });
      }
    },
    created() {
      // debounce timer for input sync (lazily built on first input)
    },
    template: `
<div class="me-app">
  <nav class="me-nav">
    <div class="me-nav-left">
      <span class="material-icons me-logo">edit_note</span>
      <span class="me-title">{{ opts.title }}</span>
    </div>
    <div class="me-nav-right">
      <button class="me-nav-btn" title="View Markdown Code" @click="openCodeView">
        <span class="material-icons">code</span>
      </button>
      <button class="me-nav-btn" title="About" @click="$refs.aboutModal.classList.remove('hidden')">
        <span class="material-icons">info</span>
      </button>
    </div>
  </nav>

  <div class="me-toolbar-wrap">
    <div class="me-toolbar">
      <div class="me-toolbar-left" ref="toolbarLeft">
        <div class="me-toolbar-main" ref="toolbarMain">
          <template v-for="(b, idx) in leftButtons" :key="idx + '-' + (b.act || 'sep')">
            <span v-if="b.sep" class="me-sep"></span>
            <button v-else class="me-tool" :title="b.title" @click="exec(b.act)">
              <span v-if="b.text" class="me-tool-text">{{ b.text }}</span>
              <span v-else class="material-icons">{{ b.icon }}</span>
            </button>
          </template>
          <button v-if="overflowCount > 0" class="me-tool me-more-btn" title="More tools" @click.stop="moreOpen = !moreOpen">
            <span class="material-icons">more_horiz</span>
          </button>
        </div>
        <div v-if="overflowCount > 0 && moreOpen" class="me-toolbar-more">
          <button v-for="(b, idx) in overflowButtons" :key="'m' + idx" class="me-tool" :title="b.title" @click="exec(b.act)">
            <span v-if="b.text" class="me-tool-text">{{ b.text }}</span>
            <span v-else class="material-icons">{{ b.icon }}</span>
          </button>
        </div>
      </div>
      <div class="me-toolbar-right">
        <button class="me-tool me-eraser" title="Clear formatting" :disabled="eraserDisabled" @click="exec('eraser')">
          <span class="material-icons">ink_eraser</span>
        </button>
        <button class="me-tool" title="Undo" @click="exec('undo')"><span class="material-icons">undo</span></button>
        <button class="me-tool" title="Redo" @click="exec('redo')"><span class="material-icons">redo</span></button>
        <button v-if="opts.showViewCode" class="me-tool" title="View Markdown" @click="openCodeView">
          <span class="material-icons">code</span>
        </button>
        <button v-if="opts.showCopy" class="me-tool" title="Copy Markdown" @click="copyMarkdown">
          <span class="material-icons">content_copy</span>
        </button>
      </div>
    </div>
  </div>

  <div class="me-workspace">
    <div class="me-pane">
      <div ref="editor" class="me-editor" contenteditable="true" spellcheck="false"
           :data-placeholder="opts.placeholder"
           @input="onInput"
           @paste="onPaste"
           @click="onEditorClick"></div>
    </div>
  </div>

  <div v-if="opts.showStatusBar" class="me-statusbar">
    <span class="me-status-count" :class="{'me-status-over': overLimit}">{{ statusText }}</span>
  </div>

  <div ref="codeModal" class="me-modal hidden" @click="closeModal">
    <div class="me-modal-box">
      <div class="me-modal-head"><span>Markdown Source</span>
        <button class="me-nav-btn" data-close @click="$refs.codeModal.classList.add('hidden')">
          <span class="material-icons">close</span></button>
      </div>
      <pre ref="codeText" class="me-code-view"></pre>
    </div>
  </div>

  <div ref="aboutModal" class="me-modal hidden" @click="closeModal">
    <div class="me-modal-box me-modal-about">
      <div class="me-modal-head"><span>About</span>
        <button class="me-nav-btn" data-close @click="$refs.aboutModal.classList.add('hidden')">
          <span class="material-icons">close</span></button>
      </div>
      <div class="me-about-body">
        <span class="material-icons me-about-logo">edit_note</span>
        <h2>ME Vue</h2>
        <p class="me-ver">Version 0.1.0 — Vue 3</p>
        <p>Markdown WYSIWYG editor as a Vue 3 component.<br>Same core as ME.js vanilla version.</p>
      </div>
    </div>
  </div>

  <!-- image / audio / video form modal -->
  <div v-if="modal" class="me-modal" @click.self="modal = null">
    <div class="me-modal-box me-modal-form">
      <div class="me-modal-head"><span>{{ modalTitle }}</span>
        <button class="me-nav-btn" @click="modal = null">
          <span class="material-icons">close</span></button>
      </div>
      <div class="me-form-body" @keydown.enter.prevent="exec(modal.kind + '-confirm')">
        <template v-if="modal.kind === 'table'">
          <label class="me-field"><span>Columns <em class="me-dim2">(1-20, default 4)</em></span>
            <input type="number" v-model="modal.cols" min="1" max="20" ref="modalFirstInput"></label>
          <label class="me-field"><span>Rows <em class="me-dim2">(1-50, default 3, incl. header)</em></span>
            <input type="number" v-model="modal.rows" min="1" max="50"></label>
        </template>
        <template v-else>
          <label v-if="modal.kind === 'image'" class="me-field"><span>Title / Alt text</span>
            <input type="text" v-model="modal.title" placeholder="Image title" ref="modalFirstInput"></label>
          <label class="me-field"><span>{{ modalLabel }} URL <em class="me-dim2">(required)</em></span>
            <input type="text" v-model="modal.url" :placeholder="modalPlaceholder" ref="modalSecondInput"></label>
        </template>
        <div class="me-form-actions">
          <button class="me-btn" @click="modal = null">Cancel</button>
          <button class="me-btn me-btn-primary" @click="exec(modal.kind + '-confirm')">Insert</button>
        </div>
      </div>
    </div>
  </div>

  <div v-if="toast" class="me-toast">{{ toast }}</div>
</div>
`,
  };

  /* ---------- Styles (injected once) ---------- */
  function injectStyles() {
    if (document.getElementById('me-vue-styles')) return;
    const CSS = `
.me-app{display:flex;flex-direction:column;height:100%;background:#fff;font-family:"Segoe UI",Roboto,sans-serif;}
.me-nav{display:flex;align-items:center;justify-content:space-between;height:52px;padding:0 16px;background:#1e1e2e;color:#fff;flex-shrink:0;}
.me-nav-left{display:flex;align-items:center;gap:10px;}
.me-logo{font-size:28px;color:#7c6cff;}
.me-title{font-size:16px;font-weight:600;}
.me-nav-btn{background:none;border:none;color:#cdd0e0;cursor:pointer;padding:6px;border-radius:6px;display:flex;}
.me-nav-btn:hover{background:rgba(255,255,255,.12);color:#fff;}
.me-toolbar-wrap{padding:3px 12px;background:#f0f1f5;border-bottom:1px solid #dfe1e8;}
.me-toolbar{display:flex;align-items:center;gap:8px;width:100%;}
.me-toolbar-left{display:flex;align-items:center;width:70%;min-width:280px;position:relative;}
.me-toolbar-main{display:flex;align-items:center;gap:2px;overflow:hidden;flex:1;white-space:nowrap;}
.me-toolbar-right{display:flex;align-items:center;gap:2px;margin-left:auto;}
.me-toolbar-more{position:absolute;top:calc(100% + 4px);right:0;background:#fff;border:1px solid #dfe1e8;
  border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.15);padding:6px;display:flex;flex-direction:column;gap:2px;z-index:50;min-width:180px;}
.me-toolbar-more .me-tool{justify-content:flex-start;}
.me-more-btn{flex-shrink:0;}
.me-tool{background:none;border:none;cursor:pointer;padding:4px 8px;border-radius:5px;color:#444;display:flex;align-items:center;min-width:30px;justify-content:center;font-weight:700;}
.me-tool:hover{background:#e0e2ea;}
.me-tool .material-icons{font-size:17px;}
.me-tool-text{font-size:13px;}
.me-tool.me-eraser{color:#b6b9c6;cursor:not-allowed;}
.me-sep{width:1px;height:20px;background:#cfd2dd;margin:0 6px;flex-shrink:0;}
.me-workspace{flex:1;display:flex;overflow:hidden;}
.me-pane{flex:1;overflow-y:auto;}
.me-editor{min-height:100%;padding:32px 48px;outline:none;font-size:15.5px;line-height:1.75;color:#2a2a35;}
.me-editor[data-placeholder]:empty::before{content:attr(data-placeholder);color:#b6b9c6;}
.me-editor h1{font-size:1.9em;border-bottom:2px solid #eceef4;padding-bottom:.3em;}
.me-editor h2{font-size:1.5em;border-bottom:1px solid #eceef4;}
.me-editor blockquote{margin:1em 0;padding:8px 16px;border-left:4px solid #7c6cff;background:#f4f2ff;border-radius:0 6px 6px 0;color:#555;}
.me-code-inline{background:#ece9fb;padding:2px 7px;border-radius:5px;font-family:Consolas,monospace;font-size:.88em;color:#7c3aed;}
.me-pre{background:#1e1e2e;color:#e6e6f0;padding:14px 16px;border-radius:8px;overflow-x:auto;}
.me-pre code{font-family:Consolas,monospace;background:none;color:inherit;}
.me-editor table{border-collapse:collapse;margin:1em 0;width:100%;}
.me-editor td,.me-editor th{border:1px solid #dfe1e8;padding:8px 12px;}
.me-editor th{background:#f0f1f5;}
.me-editor img{max-width:100%;border-radius:6px;cursor:pointer;}
.me-editor img:hover{outline:2px solid #7c6cff;outline-offset:2px;}
.me-editor ul.me-task{list-style:none;padding-left:8px;}
.me-statusbar{display:flex;align-items:center;justify-content:flex-start;padding:2px 16px;background:#f0f1f5;border-top:1px solid #dfe1e8;font-size:11px;color:#8b8ea0;}
.me-status-count.me-status-over{color:#e05260;font-weight:700;}
.me-modal{position:fixed;inset:0;background:rgba(20,20,35,.45);display:flex;align-items:center;justify-content:center;z-index:100;}
.me-modal-box{background:#fff;border-radius:12px;width:min(760px,92vw);max-height:84vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3);}
.me-modal-head{display:flex;align-items:center;justify-content:space-between;padding:12px 18px;border-bottom:1px solid #eceef4;font-weight:600;}
.me-code-view{margin:0;padding:18px;font-family:Consolas,monospace;font-size:13.5px;background:#1e1e2e;color:#c9f0ff;overflow:auto;flex:1;white-space:pre-wrap;}
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
.me-ver{color:#8b8ea0;font-size:13px;}
.me-toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:#1e1e2e;color:#fff;padding:10px 22px;border-radius:8px;font-size:13.5px;z-index:200;}
.me-img-bar{position:absolute;z-index:150;background:#1e1e2e;border-radius:8px;padding:6px 10px;display:flex;align-items:center;gap:6px;box-shadow:0 8px 24px rgba(0,0,0,.3);}
.me-img-bar-label{color:#9a9db0;font-size:12px;}
.me-img-bar-btn{background:none;border:1px solid #3a3a52;color:#cdd0e0;border-radius:5px;padding:3px 10px;font-size:12px;cursor:pointer;}
.me-img-bar-btn.active{background:#7c6cff;border-color:#7c6cff;color:#fff;}
.hidden{display:none !important;}
`;
    const style = document.createElement('style');
    style.id = 'me-vue-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  injectStyles();

  /* ---------- Export ---------- */
  global.MEVue = {
    version: '0.1.0',
    MdParser,
    MdSerializer,
    MeEditor,
    install(app) {
      app.component('MeEditor', MeEditor);
    }
  };
})(window);
