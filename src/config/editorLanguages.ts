import { StreamLanguage } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { codeLanguage } from './codeLanguages';

export async function loadEditorLanguage(path: string): Promise<Extension> {
  const language = codeLanguage(path);
  switch (language.id) {
    case 'javascript': return (await import('@codemirror/lang-javascript')).javascript({ jsx: /\.jsx$/i.test(path) });
    case 'typescript': return (await import('@codemirror/lang-javascript')).javascript({ typescript: true, jsx: /\.tsx$/i.test(path) });
    case 'java': return (await import('@codemirror/lang-java')).java();
    case 'python': return (await import('@codemirror/lang-python')).python();
    case 'json': return (await import('@codemirror/lang-json')).json();
    case 'xml':
      if (language.label === 'Vue') return (await import('@codemirror/lang-vue')).vue();
      if (language.label === 'HTML') return (await import('@codemirror/lang-html')).html();
      return (await import('@codemirror/lang-xml')).xml();
    case 'css': return (await import('@codemirror/lang-css')).css();
    case 'scss': return StreamLanguage.define((await import('@codemirror/legacy-modes/mode/css')).sCSS);
    case 'yaml': return (await import('@codemirror/lang-yaml')).yaml();
    case 'sql': return (await import('@codemirror/lang-sql')).sql();
    case 'markdown': return (await import('@codemirror/lang-markdown')).markdown();
    case 'bash': return StreamLanguage.define((await import('@codemirror/legacy-modes/mode/shell')).shell);
    case 'ini': return /\.toml$/i.test(path) ? StreamLanguage.define((await import('@codemirror/legacy-modes/mode/toml')).toml) : StreamLanguage.define((await import('@codemirror/legacy-modes/mode/properties')).properties);
    case 'properties': return StreamLanguage.define((await import('@codemirror/legacy-modes/mode/properties')).properties);
    case 'dockerfile': return StreamLanguage.define((await import('@codemirror/legacy-modes/mode/dockerfile')).dockerFile);
    case 'diff': return StreamLanguage.define((await import('@codemirror/legacy-modes/mode/diff')).diff);
    default: return [];
  }
}
