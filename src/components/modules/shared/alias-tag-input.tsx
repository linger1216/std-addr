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
import { Copy, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  dedupAliases,
  parseDraftAliases,
  type AliasEntry,
} from "@/lib/alias-entries";

export function AliasTagInput({
  value,
  onChange,
  max = 20,
  placeholder = "输入后回车添加",
  disabled,
  enableCopy,
  copySeparator = ",",
  skipRate,
  onSkipRateChange,
}: {
  value: AliasEntry[];
  onChange: (next: AliasEntry[]) => void;
  max?: number;
  placeholder?: string;
  disabled?: boolean;
  /** 启用"复制"按钮:把当前所有值以指定分隔符(默认逗号)拼成字符串复制到剪贴板 */
  enableCopy?: boolean;
  /** 复制拼接的分隔符,默认英文逗号(若需中文逗号可传 "，") */
  copySeparator?: string;
  /** 可选:值列表下方显示"跳过率"滑块(前后缀场景用);受控值 */
  skipRate?: number;
  /** 跳过率变化回调;不传则不显示滑块 */
  onSkipRateChange?: (v: number) => void;
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
    // 草稿展开:逗号分隔或 JSON 数组字符串会一次性展开为多条;单值按原逻辑处理
    const items = parseDraftAliases(draft);
    if (items.length === 0) {
      setDraft("");
      return;
    }
    // 去重 + 不超过 max(超出部分截断)
    const next = dedupAliases([...value, ...items.map((v) => ({ value: v }))]);
    const capped =
      next.length > max
        ? // dedupAliases 已保持首次出现顺序,直接截断
          next.slice(0, max)
        : next;
    onChange(capped);
    setDraft("");
  }

  /** 复制全部值(以分隔符拼接)到剪贴板 */
  async function handleCopy() {
    if (value.length === 0) return;
    const text = value.map((e) => e.value).join(copySeparator);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // 旧浏览器 fallback:临时 textarea + execCommand
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      toast.success(`已复制 ${value.length} 个值到剪贴板`);
    } catch (err) {
      toast.error("复制失败,请手动选择文本复制");
      void err;
    }
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
        {enableCopy && (
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={handleCopy}
            disabled={value.length === 0}
            aria-label={`复制 ${value.length} 个值到剪贴板(以${copySeparator}分隔)`}
            title={
              value.length === 0
                ? "暂无可复制的值"
                : `复制 ${value.length} 个值(以${copySeparator}分隔)`
            }
          >
            <Copy className="size-4" />
          </Button>
        )}
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
      {onSkipRateChange && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">跳过率</span>
          <div className="w-28">
            <Slider
              value={skipRate ?? 0}
              min={0}
              max={100}
              step={5}
              onValueChange={(v) =>
                onSkipRateChange(Array.isArray(v) ? Number(v[0] ?? 0) : (Number(v) || 0))
              }
            />
          </div>
          <span className="w-8 shrink-0 text-right text-[11.5px] tabular-nums text-muted-foreground">
            {skipRate ?? 0}%
          </span>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        已添加 {value.length} / {Number.isFinite(max) ? max : "∞"}
      </p>
    </div>
  );
}
