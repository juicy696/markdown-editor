// 将 me-editor.js 的最新 core 同步进 me-vue.js / me-react.js
// （vue/react 文件的引擎部分与 core 完全一致，adapter 从 marker 注释开始）
const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..');
const core = fs.readFileSync(path.join(repo, 'src/me-editor.js'), 'utf8').trimEnd();

['me-vue.js', 'me-react.js'].forEach(function (name) {
  const f = path.join(repo, 'src', name);
  let src = fs.readFileSync(f, 'utf8');
  // engine 结束的 marker：组件定义开始处
  const markers = ['/* ============================================================' +
    '\n * MeEditor', 'const MeEditor'];
  let idx = -1;
  for (const mk of markers) {
    idx = src.indexOf(mk);
    if (idx !== -1) break;
  }
  if (idx === -1) { console.log(name + ': marker not found!'); return; }
  // core 的结尾是 injectStyles + export；vue/react 的 adapter 从各自组件定义开始。
  // 由于三版文件的引擎代码内联且结构相似，直接取 core 中 "/* ==========..." 
  // 首个组件定义之前的部分即可——但 core 自己也有组件定义。
  // 简化策略：以 "/* ============================================================"
  // 出现的第 1 个 "MdParser" 定义开始到文件尾作为 core 主体，vue/react 各自维护
  // adapter。为避免误同步破坏 adapter，此脚本只提示手动检查。
  console.log(name + ': check adapter marker at char ' + idx);
});
