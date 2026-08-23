import { User } from "lucide-react";

import { StubPage } from "@/components/layout/stub-page";

export default function SettingsPage() {
  return (
    <StubPage
      title="个人中心"
      description="修改昵称、密码与偏好设置"
      icon={<User className="size-5" />}
      hint="个人中心待接入"
    />
  );
}