// ME.js shared nav + footer, injected via document.write
// 使用：页面头部 <script src="assets/nav.js"></script>（需先加载 site.css）
(function () {
  var ROOT = ''; // 与 index.html 同级
  var github_url = 'https://github.com/juicy696/markdown-editor';

  function nav(active) {
    var links = [
      { id: 'web', href: ROOT + 'index.html', label: 'JavaScript' },
      { id: 'vue', href: ROOT + 'vue.html', label: 'Vue' },
      { id: 'react', href: ROOT + 'react.html', label: 'React' },
      { id: 'docs', href: ROOT + 'help.html', label: 'Docs' }
    ];
    var html = '<nav class="nav"><div class="nav-inner">'
      + '<a class="nav-title" href="' + ROOT + 'index.html"><span class="brand"><span class="brand-me">ME</span><span class="brand-editor">Editor</span></span></a>'
      + '<div class="nav-links">';
    links.forEach(function (l) {
      html += '<a href="' + l.href + '"' + (l.id === active ? ' class="active"' : '') + '>' + l.label + '</a>';
    });
    html += '<a class="nav-github" href="' + github_url + '" target="_blank" rel="noopener">'
      + '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">'
      + '<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/>'
      + '</svg> GitHub</a>';
    html += '</div></div></nav>';
    document.write(html);
  }

  function footer() {
    document.write(
      '<footer class="footer">'
      + '<div>© 2026 ME.js · Licensed under <a href="' + ROOT + 'license.html">Apache-2.0</a> · Copyright 2026 Jakey Zhu</div>'
      + '<div class="footer-brand-wrap">'
      + '<a class="footer-brand" href="https://share.acedata.cloud/r/1uN88BrUTQ" target="_blank" rel="noopener">'
      + '<img src="' + ROOT + 'assets/img/AceData.png" alt="AceData">'
      + '<span class="footer-brand-text">Token services powered by <em>AceData</em></span>'
      + '</a>'
      + '</div>'
      + '<div class="footer-links">'
      + '<a href="' + github_url + '" target="_blank" rel="noopener">GitHub</a>'
      + '<a href="' + ROOT + 'help.html">Docs</a>'
      + '<a href="' + ROOT + 'assets/js/me-editor.js" download>Download me-editor.js</a>'
      + '<a href="' + ROOT + 'assets/js/me-vue.js" download>Download me-vue.js</a>'
      + '<a href="' + ROOT + 'assets/js/me-react.js" download>Download me-react.js</a>'
      + '</div></footer>'
    );
  }

  window.MESite = { nav: nav, footer: footer };
})();
