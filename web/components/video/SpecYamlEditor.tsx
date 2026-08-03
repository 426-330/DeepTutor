"use client";

/**
 * YAML 模式编辑器：等宽 textarea（项目未引入 monaco/codemirror，保持轻量）。
 * 解析失败时在下方显示结构化错误；保存 400 的错误列表由 SpecEditor 头部渲染。
 */
import { useTranslation } from "react-i18next";

import type { SpecParseIssue } from "@/lib/video-spec";

export default function SpecYamlEditor({
  value,
  onChange,
  parseIssues,
}: {
  value: string;
  onChange: (text: string) => void;
  parseIssues: SpecParseIssue[];
}) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col">
      <textarea
        className="min-h-full w-full flex-1 resize-none bg-[var(--background)] p-4 font-mono text-xs leading-5 outline-none"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {parseIssues.length > 0 && (
        <div className="border-t border-[var(--destructive)]/40 bg-[var(--destructive)]/5 p-3">
          <p className="mb-1 text-xs font-medium text-[var(--destructive)]">
            {t("YAML parse error")}
          </p>
          {parseIssues.map((issue, i) => (
            <p key={i} className="text-xs text-[var(--destructive)]">
              {issue.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
