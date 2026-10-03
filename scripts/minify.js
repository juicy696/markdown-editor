// 激进 minify（正式构建脚本，放 repo/scripts 下长期保留）
const fs = require('fs');

function aggressive_minify(src) {
  let out = '';
  let i = 0;
  const n = src.length;

  function last_char() { return out.length ? out[out.length - 1] : ''; }
  function last_word() {
    const m = out.match(/[A-Za-z_$][A-Za-z0-9_$]*$/);
    return m ? m[0] : '';
  }

  while (i < n) {
    const ch = src[i];
    const next = src[i + 1];

    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      out += ch;
      while (j < n) {
        if (src[j] === '\\') { out += src[j] + src[j + 1]; j += 2; continue; }
        out += src[j];
        if (src[j] === ch) { j++; break; }
        j++;
      }
      i = j;
      continue;
    }

    if (ch === '/' && next === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      const before = last_char();
      const after = src[i] || '';
      if (/[A-Za-z0-9_$]/.test(before) && /[A-Za-z0-9_$]/.test(after)) out += ' ';
      continue;
    }

    if (ch === '/') {
      const prev = last_char();
      const prevWord = last_word();
      const regexAllowed =
        prev === '' || prev === '(' || prev === ',' || prev === '=' ||
        prev === ':' || prev === '[' || prev === '!' || prev === '&' ||
        prev === '|' || prev === '?' || prev === '{' || prev === ';' || prev === '\n' ||
        ['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'instanceof', 'do', 'else'].indexOf(prevWord) >= 0;
      if (regexAllowed) {
        let j = i + 1, inClass = false, body = '/', ok = false;
        while (j < n) {
          const c = src[j];
          if (c === '\\') { body += c + (src[j + 1] || ''); j += 2; continue; }
          if (c === '\n') break;
          if (c === '[') inClass = true;
          if (c === ']') inClass = false;
          body += c;
          if (c === '/' && !inClass) { ok = true; j++; break; }
          j++;
        }
        if (ok) {
          while (j < n && /[a-z]/i.test(src[j])) { body += src[j]; j++; }
          out += body;
          i = j;
          continue;
        }
      }
    }

    if (ch === '\n' || ch === '\r') {
      let j = i;
      while (j < n && (src[j] === '\n' || src[j] === '\r')) j++;
      const beforeWord = last_word();
      const asi = ['return', 'break', 'continue', 'throw'].indexOf(beforeWord) >= 0;
      const incDec = out.slice(-2) === '++' || out.slice(-2) === '--';
      const afterCh = src[j] || '';
      if (asi || incDec) out += '\n';
      else if (/[A-Za-z0-9_$]/.test(last_char()) && /[A-Za-z0-9_$]/.test(afterCh)) out += ' ';
      i = j;
      continue;
    }

    if (ch === ' ' || ch === '\t') {
      let j = i;
      while (j < n && (src[j] === ' ' || src[j] === '\t')) j++;
      const before = last_char();
      const after = src[j] || '';
      if (/[A-Za-z0-9_$]/.test(before) && /[A-Za-z0-9_$]/.test(after)) out += ' ';
      i = j;
      continue;
    }

    out += ch;
    i++;
  }
  return out;
}

const ROOT = 'D:/json_editor/repo';
const files = [
  [ROOT + '/src/json-editor.js', ROOT + '/dist/json-editor.min.js'],
  [ROOT + '/src/json-vue.js', ROOT + '/dist/json-vue.min.js'],
  [ROOT + '/src/json-react.js', ROOT + '/dist/json-react.min.js']
];
const banner = '/* JsonStudio JSON Editor v1.0.0 | (c) 2026 Jakey Zhu | Apache-2.0 | github.com/juicy696/jsoneditor */\n';
fs.mkdirSync(ROOT + '/dist', { recursive: true });
files.forEach(function (p) {
  const src = fs.readFileSync(p[0], 'utf8');
  const min = banner + aggressive_minify(src);
  fs.writeFileSync(p[1], min);
  console.log(p[0].split('/').pop() + ': ' + (src.length / 1024).toFixed(1) + 'KB -> ' + (min.length / 1024).toFixed(1) + 'KB');
});
