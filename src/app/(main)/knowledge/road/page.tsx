import { Route } from "lucide-react";

import { StubPage } from "@/components/layout/stub-page";

export default function KnowledgeRoadPage() {
  return (
    <StubPage
      title="知识库 · 道路"
      description="维护道路名、起止点与走向"
      icon={<Route className="size-5" />}
      hint="道路数据待接入"
    />
  );
}