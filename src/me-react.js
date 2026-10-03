/* ============================================================
 * ME React — Markdown WYSIWYG Editor for React 18
 * Version: 0.1.0
 *
 * Requires React + ReactDOM 18 (UMD builds, e.g. CDN) loaded first.
 * Same editing model as me_js.js / me_vue.js:
 *   - WYSIWYG rich editing, Markdown underneath
 *
 * Usage (see react.html):
 *   const { MeEditor } = MEReact;
 *   <MeEditor value={md} onChange={setMd} options={{...}} />
 * ============================================================ */
(function (global) {
  'use strict';

  const React = global.React;
  const ReactDOM = global.ReactDOM;
  if (!React || !ReactDOM) throw new Error('ME React: React 18 + ReactDOM must be loaded first.');

  const e = React.createElement;
  const { useState, useRef, useEffect, useCallback } = React;

  /* ============================================================
   * Shared core: MdParser + MdSerializer (identical to me_vue.js)
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

  /* ---------- Config ---------- */
  const DEFAULTS = {
    title: 'ME React Editor',
    placeholder: 'Start writing...',
    showViewCode: true,
    showCopy: true,
    showAudio: true,
    showVideo: true,
    showStatusBar: true,
    maxLength: 0,
    uploadUrl: null,
    pasteImage: 'auto'
  };

  const TOOL_LEFT = [
    { act: 'bold', title: 'Bold (Ctrl+B)', icon: 'format_bold' },
    { act: 'italic', title: 'Italic (Ctrl+I)', icon: 'format_italic' },
    { act: 'strike', title: 'Strikethrough', icon: 'strikethrough_s' },
    { act: 'codeInline', title: 'Inline Code', icon: 'data_object' },
    { act: 'color', title: 'Text Color', icon: 'palette' },
    { sep: true },
    { act: 'h1', title: 'Heading 1', text: 'H1' },
    { act: 'h2', title: 'Heading 2', text: 'H2' },
    { act: 'h3', title: 'Heading 3', text: 'H3' },
    { act: 'para', title: 'Normal Text', icon: 'notes' },
    { sep: true },
    { act: 'quote', title: 'Blockquote', icon: 'format_quote' },
    { act: 'ul', title: 'Bullet List', icon: 'format_list_bulleted' },
    { act: 'ol', title: 'Numbered List', icon: 'format_list_numbered' },
    { act: 'task', title: 'Task List', icon: 'checklist' },
    { sep: true },
    { act: 'link', title: 'Link', icon: 'link' },
    { act: 'image', title: 'Image', icon: 'image' },
    { act: 'audio', title: 'Audio', icon: 'library_music', opt: 'showAudio' },
    { act: 'video', title: 'Video', icon: 'movie', opt: 'showVideo' },
    { act: 'codeBlock', title: 'Code Block', icon: 'code' },
    { act: 'table', title: 'Table', icon: 'grid_on' },
    { act: 'hr', title: 'Horizontal Rule', icon: 'horizontal_rule' }
  ];

  /* ============================================================
   * MeEditor component
   * ============================================================ */
  function MeEditor(props) {
    const { value = '', onChange, options = {} } = props;
    const opts = Object.assign({}, DEFAULTS, options);

    const editorRef = useRef(null);
    const codeTextRef = useRef(null);
    const [markdown, setMarkdown] = useState(value);
    const [statusCount, setStatusCount] = useState(0);
    const [showCode, setShowCode] = useState(false);
    const [showAbout, setShowAbout] = useState(false);
    const [toast, setToast] = useState('');
    const [modal, setModal] = useState(null);
    const modalRef = useRef(null);
    const modalInputRef = useRef(null);
    // keep a ref mirror so exec() closures see current modal values
    useEffect(() => { modalRef.current = modal; }, [modal]);
    // focus first modal input when the form opens
    useEffect(() => {
      if (modal && modalInputRef.current) modalInputRef.current.focus();
    }, [modal]);
    const toastTimer = useRef(null);
    const mdRef = useRef(value);

    /* sync DOM -> markdown -> parent */
    const sync = useCallback(() => {
      if (!editorRef.current) return;
      const md = MdSerializer.serialize(editorRef.current);
      mdRef.current = md;
      setMarkdown(md);
      setStatusCount(md.replace(/\n$/, '').length);
      if (onChange) onChange(md);
    }, [onChange]);

    const debouncedSync = useRef();
    useEffect(() => {
      let t;
      debouncedSync.current = () => {
        clearTimeout(t);
        t = setTimeout(sync, 400);
      };
      // initial render from value
      if (editorRef.current && value) {
        editorRef.current.innerHTML = MdParser.parse(value);
      }
      sync();
      return () => clearTimeout(t);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* external value change -> re-render */
    useEffect(() => {
      if (editorRef.current && value !== mdRef.current) {
        editorRef.current.innerHTML = MdParser.parse(value || '');
        sync();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const showToast = useCallback((msg) => {
      setToast(msg);
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(''), 2000);
    }, []);

    const exec = useCallback((act) => {
      const ed = editorRef.current;
      if (!ed) return;
      ed.focus();
      switch (act) {
        case 'bold': document.execCommand('bold'); break;
        case 'italic': document.execCommand('italic'); break;
        case 'strike': document.execCommand('strikeThrough'); break;
        case 'h1': document.execCommand('formatBlock', false, 'h1'); break;
        case 'h2': document.execCommand('formatBlock', false, 'h2'); break;
        case 'h3': document.execCommand('formatBlock', false, 'h3'); break;
        case 'para': document.execCommand('formatBlock', false, 'p'); break;
        case 'quote': document.execCommand('formatBlock', false, 'blockquote'); break;
        case 'ul': document.execCommand('insertUnorderedList'); break;
        case 'ol': document.execCommand('insertOrderedList'); break;
        case 'undo': document.execCommand('undo'); break;
        case 'redo': document.execCommand('redo'); break;
        case 'codeInline': {
          const sel = window.getSelection();
          const text = sel && sel.rangeCount ? sel.toString() : 'code';
          document.execCommand('insertHTML', false, '<code class="me-code-inline">' + escHtml(text || 'code') + '</code>');
          break;
        }
        case 'color': {
          let input = document.getElementById('me-react-color');
          if (!input) {
            input = document.createElement('input');
            input.type = 'color';
            input.id = 'me-react-color';
            input.style.cssText = 'position:fixed;opacity:0;pointer-events:none;left:50vw;top:50vh;';
            document.body.appendChild(input);
            input.addEventListener('input', () => {
              document.execCommand('foreColor', false, input.value);
              sync();
            });
          }
          input.value = '#7c3aed';
          input.click();
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
          break;
        }
        case 'link': {
          const sel = window.getSelection();
          const text = sel && sel.rangeCount ? sel.toString() : 'link text';
          const url = window.prompt('Enter URL:', 'https://');
          if (url) {
            document.execCommand('insertHTML', false,
              '<a href="' + escHtml(url) + '" target="_blank" rel="noopener">' + escHtml(text) + '</a>');
          }
          break;
        }
        case 'image':
          setModal({ kind: 'image', title: '', url: '' });
          break;
        case 'image-confirm': {
          const m = modalRef.current;
          if (!m.url.trim()) { showToast('Image URL is required'); break; }
          setModal(null);
          document.execCommand('insertHTML', false,
            '<img src="' + escHtml(m.url.trim()) + '" alt="' + escHtml(m.title.trim() || 'image') + '"' +
            (m.title.trim() ? ' title="' + escHtml(m.title.trim()) + '"' : '') + '><p><br></p>');
          break;
        }
        case 'audio':
          setModal({ kind: 'audio', url: '' });
          break;
        case 'audio-confirm': {
          const m = modalRef.current;
          if (!m.url.trim()) { showToast('Audio URL is required'); break; }
          setModal(null);
          document.execCommand('insertHTML', false,
            '<audio src="' + escHtml(m.url.trim()) + '" controls></audio><p><br></p>');
          break;
        }
        case 'video':
          setModal({ kind: 'video', url: '' });
          break;
        case 'video-confirm': {
          const m = modalRef.current;
          if (!m.url.trim()) { showToast('Video URL is required'); break; }
          setModal(null);
          document.execCommand('insertHTML', false,
            '<video src="' + escHtml(m.url.trim()) + '" controls style="max-width:100%;border-radius:8px"></video><p><br></p>');
          break;
        }
        case 'codeBlock':
          document.execCommand('insertHTML', false,
            '<pre class="me-pre" data-me-block="code"><code>// code here\n</code></pre><p><br></p>');
          break;
        case 'table':
          setModal({ kind: 'table', rows: 3, cols: 4 });
          break;
        case 'table-confirm': {
          const m = modalRef.current;
          const rows = Math.min(Math.max(parseInt(m.rows, 10) || 3, 1), 50);
          const cols = Math.min(Math.max(parseInt(m.cols, 10) || 4, 1), 20);
          setModal(null);
          let t = '<table class="me-table"><thead><tr>';
          for (let c = 0; c < cols; c++) t += '<th>Header ' + (c + 1) + '</th>';
          t += '</tr></thead><tbody>';
          for (let r = 0; r < rows - 1; r++) {
            t += '<tr>';
            for (let c = 0; c < cols; c++) t += '<td></td>';
            t += '</tr>';
          }
          t += '</tbody></table><p><br></p>';
          document.execCommand('insertHTML', false, t);
          break;
        }
        case 'hr':
          document.execCommand('insertHTML', false, '<hr><p><br></p>');
          break;
        default: return;
      }
      sync();
    }, [sync]);

    /* paste: image upload/base64 */
    const onPaste = useCallback((ev) => {
      const items = ev.clipboardData && ev.clipboardData.items;
      if (!items) return;
      for (const item of items) {
        if (item.type && item.type.indexOf('image/') === 0) {
          ev.preventDefault();
          const file = item.getAsFile();
          if (!file) return;
          if (opts.uploadUrl) {
            showToast('Uploading image...');
            const fd = new FormData();
            fd.append('file', file, file.name || 'paste.png');
            fetch(opts.uploadUrl, { method: 'POST', body: fd })
              .then(res => res.json())
              .then(data => {
                if (!data.url) throw new Error('no url');
                const url = data.url.indexOf('http') === 0 ? data.url
                  : new URL(opts.uploadUrl).origin + data.url;
                document.execCommand('insertHTML', false,
                  '<img src="' + escHtml(url) + '" alt="pasted image"><p><br></p>');
                sync();
                showToast('Image uploaded');
              })
              .catch(() => {
                showToast('Upload failed, using base64');
                insertBase64(file);
              });
          } else {
            insertBase64(file);
          }
          return;
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opts.uploadUrl, sync, showToast]);

    const insertBase64 = (file) => {
      const reader = new FileReader();
      reader.onload = () => {
        document.execCommand('insertHTML', false,
          '<img src="' + reader.result + '" alt="pasted image"><p><br></p>');
        sync();
      };
      reader.readAsDataURL(file);
    };

    /* image size toolbar */
    const onEditorClick = useCallback((ev) => {
      const cb = ev.target.closest && ev.target.closest('input[type=checkbox][data-me-task]');
      if (cb) { sync(); return; }
      const img = ev.target.closest && ev.target.closest('img');
      if (img) {
        ev.preventDefault();
        showImgBar(img);
      } else {
        hideImgBar();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sync]);

    const imgBarCleanup = useRef(null);
    const showImgBar = (img) => {
      hideImgBar();
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
      const onClick = (ev) => {
        const btn = ev.target.closest('[data-w]');
        if (!btn) return;
        ev.stopPropagation();
        if (btn.dataset.w === 'original') {
          img.removeAttribute('width'); img.style.width = '';
        } else {
          img.style.width = btn.dataset.w;
          img.setAttribute('width', btn.dataset.w);
        }
        bar.querySelectorAll('.me-img-bar-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        sync();
      };
      bar.addEventListener('click', onClick);
      const docClick = (ev) => {
        if (!bar.contains(ev.target) && !ev.target.closest('img')) hideImgBar();
      };
      document.addEventListener('click', docClick);
      imgBarCleanup.current = () => {
        bar.remove();
        bar.removeEventListener('click', onClick);
        document.removeEventListener('click', docClick);
      };
    };
    const hideImgBar = () => {
      if (imgBarCleanup.current) { imgBarCleanup.current(); imgBarCleanup.current = null; }
    };
    useEffect(() => () => hideImgBar(), []);

    /* copy */
    const copyMarkdown = useCallback(async () => {
      try {
        await navigator.clipboard.writeText(mdRef.current);
        showToast('Markdown copied to clipboard');
      } catch (err) {
        showToast('Copy failed');
      }
    }, [showToast]);

    const openCodeView = () => {
      sync();
      if (codeTextRef.current) codeTextRef.current.textContent = mdRef.current;
      setShowCode(true);
    };

    const max = parseInt(opts.maxLength, 10) || 0;
    const overLimit = max > 0 && statusCount > max;
    const statusText = max > 0 ? statusCount + ' / ' + max + ' characters'
                               : statusCount + ' characters';

    const modalClose = (setter) => (ev) => {
      if (ev.target === ev.currentTarget || ev.target.closest('[data-close]')) setter(false);
    };

    /* ---- render ---- */
    return e('div', { className: 'me-app' },
      /* nav */
      e('nav', { className: 'me-nav' },
        e('div', { className: 'me-nav-left' },
          e('span', { className: 'material-icons me-logo' }, 'edit_note'),
          e('span', { className: 'me-title' }, opts.title)
        ),
        e('div', { className: 'me-nav-right' },
          e('button', { className: 'me-nav-btn', title: 'View Markdown Code', onClick: openCodeView },
            e('span', { className: 'material-icons' }, 'code')),
          e('button', { className: 'me-nav-btn', title: 'About', onClick: () => setShowAbout(true) },
            e('span', { className: 'material-icons' }, 'info'))
        )
      ),
      /* toolbar */
      e('div', { className: 'me-toolbar-wrap' },
        e('div', { className: 'me-toolbar' },
          e('div', { className: 'me-toolbar-left' },
            e('div', { className: 'me-toolbar-main' },
              TOOL_LEFT.map((b, i) => {
                if (b.sep) return e('span', { key: 'sep' + i, className: 'me-sep' });
                if (b.opt && opts[b.opt] === false) return null;
                return e('button', {
                  key: b.act, className: 'me-tool', title: b.title,
                  onClick: () => exec(b.act)
                },
                  b.text ? e('span', { className: 'me-tool-text' }, b.text)
                         : e('span', { className: 'material-icons' }, b.icon));
              })
            )
          ),
          e('div', { className: 'me-toolbar-right' },
            e('button', { className: 'me-tool me-eraser', title: 'Clear formatting', disabled: true },
              e('span', { className: 'material-icons' }, 'ink_eraser')),
            e('button', { className: 'me-tool', title: 'Undo', onClick: () => exec('undo') },
              e('span', { className: 'material-icons' }, 'undo')),
            e('button', { className: 'me-tool', title: 'Redo', onClick: () => exec('redo') },
              e('span', { className: 'material-icons' }, 'redo')),
            opts.showViewCode !== false && e('button', { className: 'me-tool', title: 'View Markdown', onClick: openCodeView },
              e('span', { className: 'material-icons' }, 'code')),
            opts.showCopy !== false && e('button', { className: 'me-tool', title: 'Copy Markdown', onClick: copyMarkdown },
              e('span', { className: 'material-icons' }, 'content_copy'))
          )
        )
      ),
      /* editor */
      e('div', { className: 'me-workspace' },
        e('div', { className: 'me-pane' },
          e('div', {
            ref: editorRef,
            className: 'me-editor',
            contentEditable: true,
            suppressContentEditableWarning: true,
            'data-placeholder': opts.placeholder,
            spellCheck: false,
            onInput: debouncedSync.current,
            onPaste,
            onClick: onEditorClick
          })
        )
      ),
      /* status bar */
      opts.showStatusBar !== false && e('div', { className: 'me-statusbar' },
        e('span', { className: 'me-status-count' + (overLimit ? ' me-status-over' : '') }, statusText)
      ),
      /* code modal */
      showCode && e('div', { className: 'me-modal', onClick: modalClose(setShowCode) },
        e('div', { className: 'me-modal-box' },
          e('div', { className: 'me-modal-head' },
            e('span', null, 'Markdown Source'),
            e('button', { className: 'me-nav-btn', 'data-close': true, onClick: () => setShowCode(false) },
              e('span', { className: 'material-icons' }, 'close'))
          ),
          e('pre', { ref: codeTextRef, className: 'me-code-view' })
        )
      ),
      /* about modal */
      showAbout && e('div', { className: 'me-modal', onClick: modalClose(setShowAbout) },
        e('div', { className: 'me-modal-box me-modal-about' },
          e('div', { className: 'me-modal-head' },
            e('span', null, 'About'),
            e('button', { className: 'me-nav-btn', 'data-close': true, onClick: () => setShowAbout(false) },
              e('span', { className: 'material-icons' }, 'close'))
          ),
          e('div', { className: 'me-about-body' },
            e('span', { className: 'material-icons me-about-logo' }, 'edit_note'),
            e('h2', null, 'ME React'),
            e('p', { className: 'me-ver' }, 'Version 0.1.0 — React 18'),
            e('p', null, 'Markdown WYSIWYG editor as a React component.')
          )
        )
      ),
      modal && e('div', { className: 'me-modal', onClick: (ev) => { if (ev.target === ev.currentTarget) setModal(null); } },
        e('div', { className: 'me-modal-box me-modal-form' },
          e('div', { className: 'me-modal-head' },
            e('span', null, { image: 'Insert Image', audio: 'Insert Audio', video: 'Insert Video', table: 'Insert Table' }[modal.kind]),
            e('button', { className: 'me-nav-btn', onClick: () => setModal(null) },
              e('span', { className: 'material-icons' }, 'close'))
          ),
          e('div', { className: 'me-form-body' },
            modal.kind === 'table' && [
              e('label', { className: 'me-field', key: 'cols' },
                e('span', null, 'Columns ', e('em', { className: 'me-dim2' }, '(1-20, default 4)')),
                e('input', {
                  type: 'number', value: modal.cols, min: 1, max: 20,
                  onChange: (ev) => setModal({ ...modal, cols: ev.target.value }),
                  ref: modalInputRef
                })
              ),
              e('label', { className: 'me-field', key: 'rows' },
                e('span', null, 'Rows ', e('em', { className: 'me-dim2' }, '(1-50, default 3, incl. header)')),
                e('input', {
                  type: 'number', value: modal.rows, min: 1, max: 50,
                  onChange: (ev) => setModal({ ...modal, rows: ev.target.value }),
                  onKeyDown: (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); exec('table-confirm'); } }
                })
              )
            ],
            modal.kind !== 'table' && modal.kind === 'image' && e('label', { className: 'me-field', key: 'title' },
              e('span', null, 'Title / Alt text'),
              e('input', {
                type: 'text', value: modal.title,
                onChange: (ev) => setModal({ ...modal, title: ev.target.value }),
                placeholder: 'Image title',
                ref: modalInputRef
              })
            ),
            modal.kind !== 'table' && e('label', { className: 'me-field', key: 'url' },
              e('span', null,
                (modal.kind === 'image' ? 'Image' : modal.kind === 'audio' ? 'Audio' : 'Video') + ' URL ',
                e('em', { className: 'me-dim2' }, '(required)')),
              e('input', {
                type: 'text', value: modal.url,
                onChange: (ev) => setModal({ ...modal, url: ev.target.value }),
                placeholder: 'https://example.com/' + (modal.kind === 'image' ? 'picture.png' : modal.kind === 'audio' ? 'sound.mp3' : 'clip.mp4'),
                ref: modal.kind !== 'image' ? modalInputRef : null,
                onKeyDown: (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); exec(modal.kind + '-confirm'); } }
              })
            ),
            e('div', { className: 'me-form-actions', key: 'actions' },
              e('button', { className: 'me-btn', onClick: () => setModal(null) }, 'Cancel'),
              e('button', { className: 'me-btn me-btn-primary', onClick: () => exec(modal.kind + '-confirm') }, 'Insert')
            )
          )
        )
      ),
      toast && e('div', { className: 'me-toast' }, toast)
    );
  }

  /* ---------- Styles (injected once) ---------- */
  function injectStyles() {
    if (document.getElementById('me-react-styles')) return;
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
.me-toolbar-left{display:flex;align-items:center;width:70%;min-width:280px;}
.me-toolbar-main{display:flex;align-items:center;gap:2px;overflow:hidden;flex:1;white-space:nowrap;}
.me-toolbar-right{display:flex;align-items:center;gap:2px;margin-left:auto;}
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
`;
    const style = document.createElement('style');
    style.id = 'me-react-styles';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  injectStyles();

  /* ---------- Export ---------- */
  global.MEReact = {
    version: '0.1.0',
    MdParser,
    MdSerializer,
    MeEditor
  };
})(window);
