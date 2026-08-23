import { Map } from "lucide-react";

import { StubPage } from "@/components/layout/stub-page";

export default function StdAddrPage() {
  return (
    <StubPage
      title="标准地址库"
      description="管理行政区划、路名门牌与坐标"
      icon={<Map className="size-5" />}
      hint="地址库模块待接入"
    />
  );
}