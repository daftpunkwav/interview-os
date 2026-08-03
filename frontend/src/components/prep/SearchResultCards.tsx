"use client";

import { ExternalLink, Search } from "lucide-react";
import type { PrepSearchGroup } from "@/types";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** 仅允许 http(s) 链接，防止 javascript:/data: 等危险协议。 */
function safeHttpUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") {
      return u.toString();
    }
  } catch {
    /* invalid */
  }
  return null;
}

/** 面试准备：可点击打开原文的搜索结果卡片。 */
export function SearchResultCards({ groups }: { groups: PrepSearchGroup[] }) {
  const visible = groups.filter((g) => g.results?.length > 0);
  if (visible.length === 0) return null;

  return (
    <div className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)] flex items-center gap-1.5">
        <Search size={12} />
        检索来源
      </p>
      {visible.map((group) => (
        <div key={group.query || group.results[0]?.url} className="space-y-1.5">
          {group.query ? (
            <p className="text-[11px] text-[var(--muted)] truncate" title={group.query}>
              查询：{group.query}
            </p>
          ) : null}
          <ul className="space-y-1.5">
            {group.results.map((hit) => {
              const href = safeHttpUrl(hit.url);
              const inner = (
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--brand-deep)] leading-snug line-clamp-2">
                      {hit.title}
                    </p>
                    <p className="text-[11px] text-[var(--muted)] mt-0.5 truncate">
                      {hostOf(hit.url)}
                    </p>
                    {hit.snippet ? (
                      <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed line-clamp-2">
                        {hit.snippet}
                      </p>
                    ) : null}
                  </div>
                  {href ? (
                    <ExternalLink
                      size={14}
                      className="shrink-0 mt-0.5 text-[var(--muted)]"
                      aria-hidden
                    />
                  ) : null}
                </div>
              );
              return (
                <li key={hit.url}>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="block rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] px-3 py-2 hover:border-[var(--brand)]/40 hover:bg-[var(--brand-softer)] transition-colors"
                    >
                      {inner}
                    </a>
                  ) : (
                    <div className="block rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] px-3 py-2">
                      {inner}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
