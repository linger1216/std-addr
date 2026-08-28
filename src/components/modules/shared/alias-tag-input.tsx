"use client";

/**
 * 别名标签输入框 —— 单一输入 + 已添加的 Badge 列表。
 *
 * 用法(回车提交 = 常见 TagInput 交互):
 *   <AliasTagInput value={fields} onChange={setFields} max={20} />
 *
 * 交互:
 *   - 在输入框输入文本后按 Enter → 添加到已添加列表(去空 / 去重),清空输入框
 *   - 已添加的 Badge 上有 × 按钮,点击删除
 *   - 失焦也尝试提交(避免用户忘了按回车)
 *   - 输入框自身始终保持空白(条目存到列表)
 *   - 超过 max 时禁用添加(Enter 静默忽略)
 *
 * 无 React-hook-form 依赖:把 value 当 props 传入,父组件用 useState/useFieldArray 管。
 * 这里选最朴素的受控写法,让 village 和 community 两处都能复用,不用绑 RHF API。
 */

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dedupAliases, type AliasEntry } from "@/lib/alias-entries";

export function AliasTagInput({
  value,
  onChange,
  max = 20,
  placeholder = "输入后回车添加",
  disabled,
}: {
  value: AliasEntry[];
  onChange: (next: AliasEntry[]) => void;
  max?: number;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 父组件外部重置(例如 dialog 重新打开)时,清空草稿
  useEffect(() => {
    setDraft("");
  }, [value]);

  const remaining = Math.max(0, max - value.length);
  const isDisabled = disabled === true || remaining === 0;

  function commitDraft() {
    const v = draft.trim();
    if (!v) return;
    if (value.length >= max) {
      setDraft("");
      return;
    }
    const next = dedupAliases([...value, { value: v }]);
    // 已存在(去重后长度没变)→ 静默忽略
    if (next.length === value.length) {
      setDraft("");
      return;
    }
    onChange(next);
    setDraft("");
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitDraft();
            }
          }}
          onBlur={commitDraft}
          placeholder={placeholder}
          disabled={isDisabled}
          aria-label="输入别名后回车添加"
        />
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={commitDraft}
          disabled={isDisabled || draft.trim() === ""}
          aria-label="添加别名"
          title="添加别名"
        >
          <Plus className="size-4" />
        </Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((entry, i) => (
            <Badge
              key={`${entry.value}-${i}`}
              className="p-2.5 gap-1"
              variant="outline"
            >
              <span>{entry.value}</span>
              <button
                type="button"
                onClick={() => onChange(value.filter((_, idx) => idx !== i))}
                aria-label={`删除别名 ${entry.value}`}
                title="删除"
                className="text-muted-foreground hover:text-danger"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        已添加 {value.length} / {max}
      </p>
    </div>
  );
}
