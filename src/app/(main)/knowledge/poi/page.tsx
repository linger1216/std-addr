import { MapPin } from "lucide-react";

import { StubPage } from "@/components/layout/stub-page";

export default function KnowledgePoiPage() {
  return (
    <StubPage
      title="知识库 · 兴趣点"
      description="维护 POI 名称、分类与坐标"
      icon={<MapPin className="size-5" />}
      hint="POI 数据待接入"
    />
  );
}