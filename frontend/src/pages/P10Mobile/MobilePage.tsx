import PagePlaceholder from '@/components/PagePlaceholder';

/**
 * P10 移动巡检端。
 * 移动端为独立的微信原生小程序工程（/miniprogram），本页仅说明双端关系与联调方式。
 */
export default function MobilePage() {
  return (
    <PagePlaceholder
      code="P10"
      title="移动巡检端"
      milestone="M3"
      description="现场任务由独立微信小程序（仓库 miniprogram/ 目录）承担：账号密码 JWT 登录、WebSocket 实时、任务回填与拍照上传，与 PC 共用同一后端与事件模型。"
    />
  );
}
