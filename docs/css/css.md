正确做法：

1. 浮层外层必须有显式高度上限（max-height 数值）
2. 外层必须有 flex flex-col overflow-hidden —— 关键！overflow-hidden 强制浮层在 max-height处截断
3. 内层选项区 flex-1 min-h-0 overflow-y-auto —— min-h-0 是 flex 收缩的关键（flex 默认 min-content = auto，会拒绝收缩到 0，导致 overflow 不触发）
