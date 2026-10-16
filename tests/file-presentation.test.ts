import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStatus } from '../electron/services/git';
import { gitDecorations, gitFileTone } from '../src/config/gitDecorations';
import { codeLanguage } from '../src/config/codeLanguages';

test('Git 文件色区分未跟踪、暂存、修改及冲突，部分暂存优先显示修改状态', () => {
  const files = parseStatus('?? new.txt\0A  added.txt\0 M changed.txt\0MM partial.txt\0UU conflict.txt\0');
  assert.deepEqual(files.map(gitFileTone), ['untracked', 'staged', 'modified', 'modified', 'conflict']);
  const decorations = gitDecorations(parseStatus('A  src/added.ts\0 M src/changed.ts\0?? docs/new.md\0'));
  assert.equal(decorations.get('src/added.ts'), 'staged'); assert.equal(decorations.get('src'), 'modified');
  assert.equal(decorations.get('docs'), 'untracked'); assert.equal(decorations.has('clean.txt'), false);
});

test('代码根据文件名选语言，未知类型回退纯文本', () => {
  assert.equal(codeLanguage('Main.JAVA').id, 'java'); assert.equal(codeLanguage('src/App.vue').label, 'Vue');
  assert.equal(codeLanguage('Dockerfile.dev').id, 'dockerfile'); assert.equal(codeLanguage('.env.local').id, 'ini');
  assert.equal(codeLanguage('file.constructor').id, 'plaintext'); assert.equal(codeLanguage('file.unknown').id, 'plaintext');
});
