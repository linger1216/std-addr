import { Badge } from "@/components/ui/badge";
import {
  STATUS,
  STATUS_BADGE_CLASS,
  STATUS_LABEL,
  type StatusValue,
} from "@/lib/constants";

/**
 * 通用状态 badge —— 复用 STATUS_LABEL / STATUS_BADGE_CLASS。
 * 接受任意 number,非 1 视为 0(兼容数据库/接口历史脏数据)。
 */
export function StatusBadge({ status }: { status: number }) {
  const v: StatusValue = status === STATUS.ENABLED ? STATUS.ENABLED : STATUS.DISABLED;
  return (
    <Badge className={`border-transparent ${STATUS_BADGE_CLASS[v]}`}>
      {STATUS_LABEL[v]}
    </Badge>
  );
}
