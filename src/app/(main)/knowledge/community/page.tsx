import { Home } from "lucide-react";

import { StubPage } from "@/components/layout/stub-page";

export default function KnowledgeCommunityPage() {
  return (
    <StubPage
      title="知识库 · 小区"
      description="维护住宅小区与楼宇基础信息"
      icon={<Home className="size-5" />}
      hint="小区数据待接入"
    />
  );
}