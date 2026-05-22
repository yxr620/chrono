import { marked } from 'marked';
import DOMPurify from 'dompurify';

// 配置 marked：开启换行与 GFM（表格、删除线等）
marked.setOptions({
  breaks: true, // 换行符 → <br>
  gfm: true,
});

/** Markdown → 安全 HTML */
export function renderMarkdown(text: string): string {
  const raw = marked.parse(text, { async: false }) as string;
  return DOMPurify.sanitize(raw);
}
