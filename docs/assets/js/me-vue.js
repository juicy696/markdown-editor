/* ============================================================
 * ME Vue — WYSIWYG Markdown Editor for Vue 3
 * Version: 1.1.0 (aligned with upstream me-editor.js 2026-10-09)
 *
 * Requires Vue 3 (global build, e.g. CDN) loaded BEFORE this file.
 * Feature parity with me-editor.js 0.2.0+:
 *   - WYSIWYG editing, Markdown underneath
 *   - Message component (msg/warn/err cards)
 *   - Link dialog, editable code view (toggleview), media selection,
 *     info dialog, inline-HTML preservation, table rows/columns dialog
 * ============================================================ */
(function (global) {
  'use strict';

  const Vue = global.Vue;
  if (!Vue) throw new Error('ME Vue: Vue 3 must be loaded first (global build).');

  const VERSION = '1.1.0';

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ============================================================
   * MdParser: Markdown -> HTML (aligned with upstream)
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
   * MdSerializer: rich DOM -> Markdown
   * ============================================================ */
  const MdSerializer = {
    serialize(root) {
      const out = { md: '' };
      this._walkChildren(root, out, 0);
      // 收敛过量换行（DOM 往返叠加产生），保留用户输入的连续空行（最多 2 空行）
      return out.md.replace(/\n{4,}/g, '\n\n\n').trimEnd() + '\n';
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
          // contenteditable 中按 Enter 浏览器会插入 <br>；textContent 取值时 <br> 不产生文本，
          // 导致换行丢失。先把 <br> 转为换行符再取文本。
          const srcNode = code || node;
          const tmp = srcNode.cloneNode(true);
          tmp.querySelectorAll('br').forEach(br => br.replaceWith(document.createTextNode('\n')));
          const text = tmp.textContent.replace(/\n$/, '');
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
        // Message 卡片：序列化为原生 HTML（Markdown 无对应语法）
        case 'div': {
          if (node.classList && node.classList.contains('me-msg')) {
            out.md += '\n' + node.outerHTML + '\n\n'; return;
          }
          this._walkChildren(node, out, depth); return;
        }
        case 'section':
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
    codeView: 'code', copy: 'content_copy', close: 'close',
    preview: 'visibility', save: 'save', about: 'info'
  };

  const SVG = {
    // 清除格式：官方 Material Symbols「Ink Eraser」内联 SVG（字体图标缺失时仍可显示）
    inkEraser: '<svg viewBox="0 -960 960 960" style="width:17px;height:17px;fill:currentColor" aria-hidden="true"><path d="M678-220h173q13 0 21.5 8.5T881-190q0 13-8.5 21.5T851-160H618l60-60Zm-486 60q-6 0-11.5-2t-10.5-7l-72-75q-18-17-17.5-41.5T97-327l458-498q16-17 40.5-17t41.5 17l205 215q17 17 18 42t-16 42L512-170q-5 5-10.5 7.5T490-160H192Z"/></svg>',
    // Message 组件按钮（官方 chat SVG）
    chat: '<svg viewBox="0 -960 960 960" style="width:17px;height:17px;fill:currentColor" aria-hidden="true"><path d="m240-240-92 92q-19 19-43.5 8.5T80-177v-623q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H240Zm40-160h240q17 0 28.5-11.5T560-440q0-17-11.5-28.5T520-480H280q-17 0-28.5 11.5T240-440q0 17 11.5 28.5T280-400Zm0-120h400q17 0 28.5-11.5T720-560q0-17-11.5-28.5T680-600H280q-17 0-28.5 11.5T240-560q0 17 11.5 28.5T280-520Zm0-120h400q17 0 28.5-11.5T720-680q0-17-11.5-28.5T680-720H280q-17 0-28.5 11.5T240-680q0 17 11.5 28.5T280-640Z"/></svg>',
    msg: 'm424-408-86-86q-11-11-28-11t-28 11q-11 11-11 28t11 28l114 114q12 12 28 12t28-12l226-226q11-11 11-28t-11-28q-11-11-28-11t-28 11L424-408Zm56 328q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z',
    warn: 'M109-120q-11 0-20-5.5T75-140q-5-9-5.5-19.5T75-180l370-640q6-10 15.5-15t19.5-5q10 0 19.5 5t15.5 15l370 640q6 10 5.5 20.5T885-140q-5 9-14 14.5t-20 5.5H109Zm399.5-131.5Q520-263 520-280t-11.5-28.5Q497-320 480-320t-28.5 11.5Q440-297 440-280t11.5 28.5Q463-240 480-240t28.5-11.5Zm0-120Q520-383 520-400v-120q0-17-11.5-28.5T480-560q-17 0-28.5 11.5T440-520v120q0 17 11.5 28.5T480-360q17 0 28.5-11.5Z',
    err: 'M508.5-291.5Q520-303 520-320t-11.5-28.5Q497-360 480-360t-28.5 11.5Q440-337 440-320t11.5 28.5Q463-280 480-280t28.5-11.5Zm0-160Q520-463 520-480v-160q0-17-11.5-28.5T480-680q-17 0-28.5 11.5T440-640v160q0 17 11.5 28.5T480-440q17 0 28.5-11.5ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Z'
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
        modal: null,
        viewMode: 'wysiwyg',
        codeText: ''
      };
    },
    mounted() {
      this._applyIcons();
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
      // Delete/Backspace deletes selected media (capture on document: focus
      // may be outside the editor after clicking media controls)
      this._keyHandler = (e) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && this._selectedMedia &&
            this.$refs.editor && this.$refs.editor.contains(this._selectedMedia)) {
          e.preventDefault();
          this._deleteMediaElement(this._selectedMedia);
        }
      };
      document.addEventListener('keydown', this._keyHandler, true);
      this.$nextTick(() => this._setupOverflow());
    },
    beforeUnmount() {
      this._hideImgBar();
      if (this._selHandler) document.removeEventListener('selectionchange', this._selHandler);
      if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler, true);
      if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
      if (this._docClick) document.removeEventListener('click', this._docClick);
    },
    computed: {
      leftButtons() {
        const o = this.opts;
        const B = (act, title, icon) => ({ act, title, icon });
        const H = (act, title, html) => ({ act, title, html });
        const T = (act, title, text) => ({ act, title, text });
        const S = () => ({ sep: true });
        return [
          // 清除格式（原 para）：内联 Ink Eraser SVG
          H('para', 'Clear Format', SVG.inkEraser),
          B('bold', 'Bold (Ctrl+B)', I.bold),
          B('italic', 'Italic (Ctrl+I)', I.italic),
          B('strike', 'Strikethrough', I.strike),
          B('codeInline', 'Inline Code', I.codeInline),
          B('color', 'Text Color', I.color),
          S(),
          T('h1', 'Heading 1', 'H1'),
          T('h2', 'Heading 2', 'H2'),
          T('h3', 'Heading 3', 'H3'),
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
          // Message 组件按钮（官方 chat SVG）
          H('message', 'Insert Message', SVG.chat),
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
      svgPaths() { return SVG; },
      modalTitle() {
        if (!this.modal) return '';
        return {
          image: 'Insert Image', audio: 'Insert Audio', video: 'Insert Video',
          table: 'Insert Table', link: 'Insert Link', message: 'Insert Message'
        }[this.modal.kind] || '';
      },
      modalLabel() {
        if (!this.modal) return '';
        return { image: 'Image', audio: 'Audio', video: 'Video' }[this.modal.kind] || '';
      },
      modalPlaceholder() {
        if (!this.modal) return '';
        return {
          image: 'https://example.com/picture.png',
          audio: 'https://example.com/sound.mp3',
          video: 'https://example.com/clip.mp4'
        }[this.modal.kind] || '';
      }
    },
    watch: {
      modelValue(nv) {
        if (nv !== this.markdown && this.$refs.editor) {
          this.$refs.editor.innerHTML = MdParser.parse(nv || '');
          this._sync();
        }
      },
      modal(m) {
        if (m) this.$nextTick(() => {
          const el = this.$refs.modalFirstInput;
          if (el) el.focus();
        });
      }
    },
    methods: {
      /* ---- core sync ---- */
      _sync() {
        if (!this.$refs.editor) return;
        // 代码模式下以 textarea 为准
        if (this.viewMode === 'code' && this.$refs.codeEdit) {
          this.markdown = this.$refs.codeEdit.value;
          this.statusCount = this.markdown.replace(/\n$/, '').length;
          this.$emit('update:modelValue', this.markdown);
          this.$emit('change', this.markdown);
          return;
        }
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
      /* ---- view mode: wysiwyg <-> code ---- */
      setView(mode) {
        if (mode === 'code') {
          this._sync();
          this.codeText = this.markdown;
          this.viewMode = 'code';
        } else {
          // 回到编辑模式：textarea 内容重新解析渲染
          if (this.codeText !== this.markdown) {
            this.setMarkdown(this.codeText);
          }
          this.viewMode = 'wysiwyg';
        }
      },
      toggleView() {
        this.setView(this.viewMode === 'code' ? 'wysiwyg' : 'code');
      },
      onCodeInput() {
        this.markdown = this.codeText;
        this.statusCount = this.codeText.replace(/\n$/, '').length;
        this.$emit('update:modelValue', this.codeText);
        this.$emit('change', this.codeText);
      },
      applyCode() {
        if (this.viewMode === 'code') {
          this.setView('wysiwyg');
          this.showToast('Markdown applied');
        }
      },
      /* ---- media selection (capture phase) ---- */
      onEditorClickCapture(e) {
        const media = e.target.closest('audio, video');
        if (media && this.$refs.editor && this.$refs.editor.contains(media)) {
          // 仅选中（删除用 Delete/Backspace），不阻止播放控件交互
          if (this._selectedMedia !== media) this._selectMedia(media);
          return;
        }
        if (!e.target.closest('img')) this._deselectMedia();
      },
      onEditorClick(e) {
        const cb = e.target.closest('input[type=checkbox][data-me-task]');
        if (cb) { this._sync(); return; }
        const img = e.target.closest('img');
        if (img && this.$refs.editor && this.$refs.editor.contains(img)) {
          e.preventDefault();
          // 图片：单击仅选中，删除统一用 Delete/Backspace（避免误删）
          if (this._selectedMedia !== img) this._selectMedia(img);
          return;
        }
      },
      onEditorMousedownCapture(e) {
        // 音频控件区点击时 click 可能被浏览器吞掉，补捕获 mousedown
        const media = e.target.closest('audio, video');
        if (media && this.$refs.editor && this.$refs.editor.contains(media)) {
          if (this._selectedMedia !== media) this._selectMedia(media);
        }
      },
      _selectMedia(el) {
        this._deselectMedia();
        this._selectedMedia = el;
        el.classList.add('me-media-selected');
        // 光标放到媒体元素之后，选中后可直接输入文字
        const range = document.createRange();
        range.setStartAfter(el);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      },
      _deselectMedia() {
        if (this._selectedMedia) {
          this._selectedMedia.classList.remove('me-media-selected');
          this._selectedMedia = null;
        }
      },
      _deleteMediaElement(el) {
        if (!el) return;
        const parent = el.parentElement;
        el.remove();
        // 清理所在空段落，避免残留空行
        if (parent && parent !== this.$refs.editor && parent.tagName === 'P' &&
            !parent.textContent.trim() && !parent.querySelector('img,audio,video')) {
          parent.remove();
        }
        this._selectedMedia = null;
        this._sync();
        this.showToast(el.tagName.toLowerCase() + ' deleted');
      },
      /* ---- message component ---- */
      _msgHtml(type, text) {
        const t = (type === 'err' || type === 'msg') ? type : 'warn';
        return '<div class="me-msg me-msg-' + t + '">' +
          '<svg viewBox="0 -960 960 960" style="width:16px;height:16px;flex-shrink:0;fill:currentColor" aria-hidden="true"><path d="' + SVG[t] + '"/></svg>' +
          '<span>' + escHtml(text) + '</span></div>';
      },
      pickMsgType(t) {
        if (this.modal) this.modal.msgType = t;
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
          case 'link':
            // 打开链接弹窗，保存光标供确认后恢复
            this._saveSelection();
            this.modal = { kind: 'link', url: '', text: '' };
            return;
          case 'link-confirm': {
            const m = this.modal;
            const url = (m.url || '').trim();
            const text = (m.text || '').trim() || url;
            if (!url) { this.showToast('Link URL is required'); return; }
            this.modal = null;
            this._restoreSelection();
            this.insertHtml('<a href="' + escHtml(url) + '" target="_blank" rel="noopener">' + escHtml(text) + '</a>');
            return restore();
          }
          case 'message':
            this._saveSelection();
            this.modal = { kind: 'message', text: '', msgType: 'msg' };
            return;
          case 'message-confirm': {
            const m = this.modal;
            const text = (m.text || '').trim();
            if (!text) { this.showToast('Message text is required'); return; }
            this.modal = null;
            this._restoreSelection();
            this.insertHtml(this._msgHtml(m.msgType, text) + '<p><br></p>');
            return restore();
          }
          case 'image':
            this._saveSelection();
            this.modal = { kind: 'image', title: '', url: '' };
            return;
          case 'image-confirm': {
            const m = this.modal;
            if (!m.url.trim()) { this.showToast('Image URL is required'); return; }
            this.modal = null;
            this._restoreSelection();
            this.insertHtml('<img src="' + escHtml(m.url.trim()) + '" alt="' + escHtml(m.title.trim() || 'image') + '"' +
              (m.title.trim() ? ' title="' + escHtml(m.title.trim()) + '"' : '') + '><p><br></p>');
            return restore();
          }
          case 'audio':
            this._saveSelection();
            this.modal = { kind: 'audio', url: '' };
            return;
          case 'audio-confirm': {
            const m = this.modal;
            if (!m.url.trim()) { this.showToast('Audio URL is required'); return; }
            this.modal = null;
            this._restoreSelection();
            this.insertHtml('<audio src="' + escHtml(m.url.trim()) + '" controls></audio><p><br></p>');
            return restore();
          }
          case 'video':
            this._saveSelection();
            this.modal = { kind: 'video', url: '' };
            return;
          case 'video-confirm': {
            const m = this.modal;
            if (!m.url.trim()) { this.showToast('Video URL is required'); return; }
            this.modal = null;
            this._restoreSelection();
            this.insertHtml('<video src="' + escHtml(m.url.trim()) + '" controls style="max-width:100%;border-radius:8px"></video><p><br></p>');
            return restore();
          }
          case 'codeBlock':
            this.insertHtml('<pre class="me-pre" data-me-block="code"><code>// code here\n</code></pre><p><br></p>');
            return restore();
          case 'table':
            this._saveSelection();
            this.modal = { kind: 'table', rows: 3, cols: 4 };
            return;
          case 'table-confirm': {
            const m = this.modal;
            const rows = Math.min(Math.max(parseInt(m.rows, 10) || 3, 1), 50);
            const cols = Math.min(Math.max(parseInt(m.cols, 10) || 4, 1), 20);
            this.modal = null;
            this._restoreSelection();
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
      _saveSelection() {
        const sel = window.getSelection();
        if (sel && sel.rangeCount && this.$refs.editor && this.$refs.editor.contains(sel.anchorNode)) {
          this._savedRange = sel.getRangeAt(0).cloneRange();
        }
      },
      _restoreSelection() {
        this.$refs.editor.focus();
        const sel = window.getSelection();
        if (this._savedRange) {
          sel.removeAllRanges();
          sel.addRange(this._savedRange);
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
        } catch (err) {
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
      onEditorClick(e) { /* replaced by onEditorClick above */ },
      showImgBar(img) {
        this._hideImgBar();
        this._selectedImg = img;
        const bar = document.createElement('div');
        bar.className = 'me-img-bar';
        const current = img.getAttribute('width') || '';
        const sizeOpts = [['original', 'Original'], ['100%', '100%'], ['75%', '75%'], ['50%', '50%'], ['25%', '25%']];
        bar.innerHTML = '<span class="me-img-bar-label">Size</span>' + sizeOpts.map(o =>
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
        this._imgBarDocClick = (ev) => {
          if (this._imgBar && !this._imgBar.contains(ev.target) && !ev.target.closest('img')) this._hideImgBar();
        };
        document.addEventListener('click', this._imgBarDocClick);
      },
      _hideImgBar() {
        if (this._imgBar) { this._imgBar.remove(); this._imgBar = null; }
        if (this._imgBarDocClick) { document.removeEventListener('click', this._imgBarDocClick); this._imgBarDocClick = null; }
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
      /* ---- toolbar overflow ---- */
      _setupOverflow() {
        const main = this.$refs.toolbarMain;
        const left = this.$refs.toolbarLeft;
        if (!main || !left) return;
        const redraw = () => {
          const tools = main.querySelectorAll('.me-tool:not(.me-more-btn)');
          const avail = left.clientWidth - 44;
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
        this._docClick = (ev) => {
          if (this.moreOpen && !ev.target.closest('.me-toolbar-left')) this.moreOpen = false;
        };
        document.addEventListener('click', this._docClick);
        // focus first modal input when the form opens
        this.$watch('modal', (m) => {
          if (m) this.$nextTick(() => {
            const el = this.$refs.modalFirstInput;
            if (el) el.focus();
          });
        });
      }
    },
    template: `
<div class="me-app">
  <nav class="me-nav">
    <div class="me-nav-left">
      <span class="material-icons me-logo">edit_note</span>
      <span class="me-title">{{ opts.title }}</span>
    </div>
    <div class="me-nav-right">
      <button class="me-nav-btn" title="View Markdown Code" @click="toggleView">
        <span class="material-icons">{{ viewMode === 'code' ? 'visibility' : 'code' }}</span>
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
              <span v-else-if="b.html" v-html="b.html"></span>
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
            <span v-else-if="b.html" v-html="b.html"></span>
            <span v-else class="material-icons">{{ b.icon }}</span>
          </button>
        </div>
      </div>
      <div class="me-toolbar-right">
        <button class="me-tool me-eraser" title="Clear formatting" :disabled="eraserDisabled" @click="exec('eraser')">
          <span class="material-icons">ink_eraser</span>
        </button>
        <button v-if="opts.showViewCode" class="me-tool" title="View Markdown" @click="toggleView">
          <span class="material-icons">{{ viewMode === 'code' ? 'visibility' : 'code' }}</span>
        </button>
        <button class="me-tool" title="Info" @click="$refs.aboutModal.classList.remove('hidden')">
          <span class="material-icons">info</span>
        </button>
      </div>
    </div>
  </div>

  <div class="me-workspace">
    <div class="me-pane">
      <div ref="editor" class="me-editor" :class="{hidden: viewMode === 'code'}" contenteditable="true" spellcheck="false"
           :data-placeholder="opts.placeholder"
           @input="onInput"
           @paste="onPaste"
           @click.capture="onEditorClickCapture"
           @mousedown.capture="onEditorMousedownCapture"
           @click="onEditorClick"></div>
      <textarea ref="codeEdit" class="me-code-edit" :class="{hidden: viewMode !== 'code'}" spellcheck="false"
                placeholder="Markdown source..." v-model="codeText" @input="onCodeInput"></textarea>
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
        <p class="me-ver">Version {{ '1.1.0' }} — Vue 3</p>
        <p>Markdown WYSIWYG editor as a Vue 3 component.<br>Feature parity with the vanilla ME.js engine.</p>
      </div>
    </div>
  </div>

  <!-- image / audio / video / table / link / message form modal -->
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
        <template v-else-if="modal.kind === 'link'">
          <label class="me-field"><span>标题 / 显示文本</span>
            <input type="text" v-model="modal.text" placeholder="链接标题（留空则显示 URL）" ref="modalFirstInput"></label>
          <label class="me-field"><span>链接 URL <em class="me-dim2">(required)</em></span>
            <input type="text" v-model="modal.url" placeholder="https://example.com"></label>
        </template>
        <template v-else-if="modal.kind === 'message'">
          <div class="me-msg-row" :class="'me-msg-row-' + modal.msgType" ref="modalFirstInput" tabindex="-1">
            <div class="me-msg-pickers">
              <button type="button" class="me-msg-pick" :class="[{'active': modal.msgType === 'msg'}, 'me-msg-ico-msg']" @click="pickMsgType('msg')" title="Message">
                <svg viewBox="0 -960 960 960" style="width:16px;height:16px;fill:currentColor" aria-hidden="true"><path :d="svgPaths.msg"/></svg>
              </button>
              <button type="button" class="me-msg-pick" :class="[{'active': modal.msgType === 'warn'}, 'me-msg-ico-warn']" @click="pickMsgType('warn')" title="Warning">
                <svg viewBox="0 -960 960 960" style="width:16px;height:16px;fill:currentColor" aria-hidden="true"><path :d="svgPaths.warn"/></svg>
              </button>
              <button type="button" class="me-msg-pick" :class="[{'active': modal.msgType === 'err'}, 'me-msg-ico-err']" @click="pickMsgType('err')" title="Error">
                <svg viewBox="0 -960 960 960" style="width:16px;height:16px;fill:currentColor" aria-hidden="true"><path :d="svgPaths.err"/></svg>
              </button>
            </div>
            <textarea v-model="modal.text" rows="3" placeholder="Message text..."></textarea>
          </div>
        </template>
        <template v-else>
          <label v-if="modal.kind === 'image'" class="me-field"><span>Title / Alt text</span>
            <input type="text" v-model="modal.title" placeholder="Image title" ref="modalFirstInput"></label>
          <label class="me-field"><span>{{ modalLabel }} URL <em class="me-dim2">(required)</em></span>
            <input type="text" v-model="modal.url" :placeholder="modalPlaceholder"></label>
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
.me-tool{background:none;border:none;cursor:pointer;padding:4px 8px;border-radius:5px;color:#444;display:flex;align-items:center;justify-content:center;min-width:30px;height:30px;overflow:hidden;font-weight:700;}
.me-tool:hover{background:#e0e2ea;}
.me-tool .material-icons{font-size:17px;}
.me-tool svg{width:17px;height:17px;display:block;}
.me-tool-text{font-size:13px;}
.me-tool.me-eraser{color:#b6b9c6;}
.me-tool.me-eraser:disabled{cursor:not-allowed;}
.me-tool.me-eraser:not(:disabled){color:#e05260;}
.me-sep{width:1px;height:20px;background:#cfd2dd;margin:0 6px;flex-shrink:0;}
.me-workspace{flex:1;display:flex;overflow:hidden;}
.me-pane{flex:1;overflow-y:auto;min-width:0;position:relative;}
.me-editor{min-height:100%;padding:32px 48px;outline:none;font-size:15.5px;line-height:1.75;color:#2a2a35;}
.me-editor[data-placeholder]:empty::before{content:attr(data-placeholder);color:#b6b9c6;}
.me-code-edit{width:100%;height:100%;border:0;outline:none;resize:none;overflow-y:auto;padding:18px;font-family:Consolas,'Courier New',monospace;font-size:13.5px;line-height:1.6;color:#2b2f38;background:#fff;display:block;}
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
.me-media-selected{outline:3px solid #7c6cff;outline-offset:2px;border-radius:6px;cursor:pointer;}
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
.me-field textarea{resize:vertical;min-height:64px;}
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
/* Message modal: type picker + input in one row */
.me-msg-row{display:flex;align-items:stretch;border-radius:10px;overflow:hidden;border:1px solid #eceef4;transition:background .15s;}
.me-msg-row:focus-within{border-color:#7c6cff;box-shadow:0 0 0 3px rgba(124,108,255,.15);}
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
    version: VERSION,
    MdParser,
    MdSerializer,
    MeEditor,
    install(app) {
      app.component('MeEditor', MeEditor);
    }
  };
})(window);
