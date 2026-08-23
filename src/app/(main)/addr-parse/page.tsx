import { Code } from "lucide-react";

import { StubPage } from "@/components/layout/stub-page";

export default function AddrParsePage() {
  return (
    <StubPage
      title="地址解析"
      description="非标地址 → 行政区划 + 路名 + 门牌号 + 坐标"
      icon={<Code className="size-5" />}
      hint="解析器待接入"
    />
  );
}