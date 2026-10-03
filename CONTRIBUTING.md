# Contributing

Thanks for your interest in contributing!

## Dev setup

No build step required. The library is plain JavaScript.

```bash
git clone https://github.com/juicy696/jsoneditor.git
cd jsoneditor
# open docs/index.html in a browser — that's the whole dev environment
```

## Code style

- Variable naming: **snake_case** everywhere (no camelCase for new code)
- Single-file constraint: each adapter (vue/react) must stay self-contained with the core
- Keep user-facing strings in English; bilingual comments are fine

## Workflow

1. Fork → branch (`feat/xxx` or `fix/xxx`)
2. Test manually in the demo pages (vanilla / Vue / React)
3. Commit with a clear message (conventional commits preferred: `feat:`, `fix:`, `docs:`)
4. Open a Pull Request

## Build scripts

After modifying `src/json-editor.js` (the core), sync it into the adapter bundles and rebuild the minified files:

```bash
node scripts/sync_core.js   # sync core into json-vue.js / json-react.js
node scripts/minify.js      # regenerate dist/*.min.js
```

## Reporting bugs

Open an issue with:
- Browser + version
- Minimal reproduction (HTML snippet)
- Expected vs actual behavior
