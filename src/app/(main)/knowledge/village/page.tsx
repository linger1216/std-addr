import { Building2 } from "lucide-react";

import { StubPage } from "@/components/layout/stub-page";

export default function KnowledgeVillagePage() {
  return (
    <StubPage
      title="知识库 · 村"
      description="维护自然村与行政村基础信息"
      icon={<Building2 className="size-5" />}
      hint="村数据待接入"
    />
  );
}