import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";

/**
 * Snippet templates ported from the original `snippets.js`.
 * `${n:text}` markers are flattened and the cursor lands on the first slot.
 */
export const SNIPPETS: Record<string, string> = {
  h1: "# ${1:Heading 1}",
  h2: "## ${1:Heading 2}",
  h3: "### ${1:Heading 3}",
  h4: "#### ${1:Heading 4}",
  h5: "##### ${1:Heading 5}",
  h6: "###### ${1:Heading 6}",

  code: "```${1:language}\n${2:code}\n```",
  js: "```javascript\n${1}\n```",
  py: "```python\n${1}\n```",
  ts: "```typescript\n${1}\n```",
  sh: "```bash\n${1}\n```",
  json: "```json\n${1}\n```",
  css: "```css\n${1}\n```",
  html: "```html\n${1}\n```",
  sql: "```sql\n${1}\n```",
  java: "```java\n${1}\n```",

  table: "| ${1:Column 1} | ${2:Column 2} | ${3:Column 3} |\n|---|---|---|\n| ${4} | ${5} | ${6} |",
  table2x2: "| ${1:Col 1} | ${2:Col 2} |\n|---|---|\n| ${3} | ${4} |",
  table3x3:
    "| ${1:Col 1} | ${2:Col 2} | ${3:Col 3} |\n|---|---|---|\n| ${4} | ${5} | ${6} |\n| ${7} | ${8} | ${9} |",

  link: "[${1:text}](${2:url})",
  image: "![${1:alt}](${2:url})",
  bold: "**${1:text}**",
  italic: "*${1:text}*",
  strike: "~~${1:text}~~",

  quote: "> ${1:quote}",
  hr: "\n---\n",

  details: "<details>\n<summary>${1:Summary}</summary>\n\n${2:Content}\n\n</details>",
  badge: "![${1:badge}](https://img.shields.io/badge/${2:label}-${3:message}-${4:blue})",

  checkbox: "- [ ] ${1:Task}",
  checked: "- [x] ${1:Task}",
  todo: "- [ ] ${1:Task}",

  date: "${1:" + new Date().toISOString().slice(0, 10) + "}",
  toc: "## Table of Contents\n\n${1:- [Section](#section)}",
};

export function buildSnippet(template: string): { text: string; cursor: number } {
  let out = "";
  let cursor = -1;
  let last = 0;
  const pattern = /\$\{(\d+)(?::([^}]*))?\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(template))) {
    out += template.slice(last, match.index);
    const content = match[2] ?? "";
    if (cursor < 0) cursor = out.length;
    out += content;
    last = match.index + match[0].length;
  }
  out += template.slice(last);
  return { text: out, cursor: cursor < 0 ? out.length : cursor };
}

function makeCompletion(key: string): Completion {
  const { text, cursor } = buildSnippet(SNIPPETS[key]);
  return {
    label: key,
    detail: "snippet",
    type: "keyword",
    info: SNIPPETS[key].replace(/\$\{\d+(?::([^}]*))?\}/g, "$1"),
    apply: (view, _completion, from, to) => {
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + cursor },
        scrollIntoView: true,
      });
    },
  };
}

const CACHE = new Map<string, Completion>();
function completionFor(key: string): Completion {
  let item = CACHE.get(key);
  if (!item) {
    item = makeCompletion(key);
    CACHE.set(key, item);
  }
  return item;
}

export function snippetSource(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/[a-zA-Z][\w-]*/);
  if (!word) return null;
  const lower = word.text.toLowerCase();
  const keys = Object.keys(SNIPPETS).filter((key) => key.startsWith(lower));
  if (keys.length === 0) return null;
  // Do not hijack ordinary words; only exact snippet names or short prefixes.
  if (word.text.length > 1 && keys.length === 0) return null;
  return {
    from: word.from,
    options: keys.map(completionFor),
    validFor: /^[a-zA-Z][\w-]*$/,
  };
}
