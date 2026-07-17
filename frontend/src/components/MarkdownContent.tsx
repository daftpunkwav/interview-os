"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-base font-bold mt-3 mb-1.5 first:mt-0 tracking-tight">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-base font-bold mt-3 mb-1.5 first:mt-0 tracking-tight">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold mt-2.5 mb-1 first:mt-0">{children}</h3>
  ),
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-[var(--foreground)]">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ className, children }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return (
        <code className="block bg-slate-800 text-slate-100 text-xs rounded-lg p-3 my-2 overflow-x-auto whitespace-pre-wrap font-mono">
          {children}
        </code>
      );
    }
    return (
      <code className="bg-[var(--popover)] text-[var(--foreground)] px-1 py-0.5 rounded text-[0.85em] font-mono border border-[var(--border)]">
        {children}
      </code>
    );
  },
  pre: ({ children }) => <pre className="my-2 overflow-x-auto">{children}</pre>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-[var(--brand)]/40 pl-3 my-2 text-[var(--text-secondary)] italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-[var(--border)]" />,
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-[var(--brand)] underline underline-offset-2"
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  ),
  // GFM 表格
  table: ({ children }) => (
    <div className="my-3 w-full max-w-full overflow-x-auto rounded-[var(--radius)] border border-[var(--border)]">
      <table className="w-full min-w-[320px] border-collapse text-left text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-[var(--popover)] text-[var(--text-secondary)]">{children}</thead>
  ),
  tbody: ({ children }) => <tbody className="divide-y divide-[var(--border)]">{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-b border-[var(--border)] last:border-0 hover:bg-[#fafbfc]">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="px-3 py-2 font-semibold text-xs whitespace-nowrap border-b border-[var(--border)] align-top">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 text-[var(--text-secondary)] align-top leading-relaxed">{children}</td>
  ),
};

/**
 * 将「空格/制表符分列」的伪表格转为 GFM pipe 表格。
 *
 * 模型常输出：
 *   优先级    动作    目的
 *   P0    补充…    让…
 * 而不是 | 优先级 | 动作 | 目的 |
 */
export function normalizeLooseTables(src: string): string {
  if (!src || src.includes("|")) {
    // 已有 pipe 表格时，只做轻量修复：补充分隔行（若缺失）
    return ensureGfmTableSeparators(src);
  }

  const lines = src.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    // 至少 2 列：用 2+ 空格或 tab 分列
    const cols = splitLooseColumns(line);
    if (cols.length < 2) {
      out.push(line);
      i += 1;
      continue;
    }

    // 收集连续多列行
    const block: string[][] = [cols];
    let j = i + 1;
    while (j < lines.length) {
      const next = lines[j] ?? "";
      if (!next.trim()) break;
      const nextCols = splitLooseColumns(next);
      // 列数允许 ±1 浮动，但至少 2 列
      if (nextCols.length < 2) break;
      if (Math.abs(nextCols.length - cols.length) > 1) break;
      block.push(nextCols);
      j += 1;
    }

    // 至少 2 行才当表格（表头 + 数据）
    if (block.length >= 2) {
      const width = Math.max(...block.map((r) => r.length));
      const pad = (row: string[]) => {
        const r = [...row];
        while (r.length < width) r.push("");
        return r;
      };
      const header = pad(block[0]!);
      out.push(`| ${header.join(" | ")} |`);
      out.push(`| ${header.map(() => "---").join(" | ")} |`);
      for (let k = 1; k < block.length; k += 1) {
        out.push(`| ${pad(block[k]!).join(" | ")} |`);
      }
      i = j;
      continue;
    }

    out.push(line);
    i += 1;
  }

  return out.join("\n");
}

function splitLooseColumns(line: string): string[] {
  const t = line.trim();
  if (!t) return [];
  // 制表符优先
  if (t.includes("\t")) {
    return t.split(/\t+/).map((c) => c.trim()).filter(Boolean);
  }
  // 2 个及以上空格
  if (/\s{2,}/.test(t)) {
    return t.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
  }
  return [];
}

/** 若存在 | 行但缺分隔行，自动插入 --- */
function ensureGfmTableSeparators(src: string): string {
  const lines = src.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    out.push(line);
    const next = lines[i + 1] ?? "";
    if (
      isPipeRow(line) &&
      !isSeparatorRow(line) &&
      isPipeRow(next) &&
      !isSeparatorRow(next)
    ) {
      // 当前是表头，下一行是数据且无分隔行
      const cols = line.split("|").filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      const n = Math.max(cols.length, 1);
      out.push(`| ${Array.from({ length: n }, () => "---").join(" | ")} |`);
    }
  }
  return out.join("\n");
}

function isPipeRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && t.includes("|", 1);
}

function isSeparatorRow(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}/.test(line.trim());
}

export function MarkdownContent({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  const normalized = useMemo(() => normalizeLooseTables(content), [content]);

  return (
    <div className={`markdown-body text-sm min-w-0 max-w-full overflow-x-auto ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
