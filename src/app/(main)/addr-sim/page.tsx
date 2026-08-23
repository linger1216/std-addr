import { Settings } from "lucide-react";

import { StubPage } from "@/components/layout/stub-page";

export default function AddrSimPage() {
  return (
    <StubPage
      title="地址模拟"
      description="模拟生成测试地址与异常用例"
      icon={<Settings className="size-5" />}
      hint="模拟器待接入"
    />
  );
}