import { Card, PageHeader, Table, Td, Th, Tag } from '@/components/ui';

const FEATURES = [
  ['任务列表', '按状态查看本人/全部巡检任务，实时接收 task.created / task.updated 推送'],
  ['任务详情与流转', '接收 → 开始 → 回填；状态由后端校验并写 Run Trace'],
  ['现场回填', '观测笔记、现场结论、照片上传；结论由人工确认，不冒充模型输出'],
  ['实时通道', 'WebSocket 自动重连（25s 心跳），断线重连后补偿状态'],
  ['语音记录', '同声传译插件可用时转写，不可用自动降级为手动输入'],
  ['数据口径', '模拟数据带标签；无数据/离线不等同于现场正常'],
];

export default function MobilePage() {
  return (
    <div className="tw-stack">
      <PageHeader
        code="P10"
        title="移动巡检端"
        badges={
          <>
            <Tag tone="ok">已实现</Tag>
            <Tag tone="outline">微信原生小程序 + TypeScript</Tag>
          </>
        }
        description="移动端为独立微信原生小程序工程（仓库 miniprogram/），与 PC 共用同一后端、事件模型与任务数据；本页说明双端分工与真机联调方式。"
      />

      <div className="tw-grid tw-grid-2">
        <Card title="双端协同" subtitle="同一后端、同一任务，不做两套数据">
          <Table>
            <thead>
              <tr>
                <Th>端</Th>
                <Th>职责</Th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <Td>PC Web</Td>
                <Td>总览、事件研判、证据/假设、3D 空间、任务派发与照片回看、报告</Td>
              </tr>
              <tr>
                <Td>微信小程序</Td>
                <Td>现场巡检执行、任务流转、拍照上传、语音转写、实时推送</Td>
              </tr>
            </tbody>
          </Table>
          <div className="tw-small tw-muted" style={{ marginTop: 10 }}>
            两端均处于本地演示模式：免登录、无 token；公网部署时需重新启用鉴权并限制上传类型与体量。
          </div>
        </Card>

        <Card title="小程序功能" subtitle="当前工程已实现的能力">
          <Table>
            <thead>
              <tr>
                <Th>能力</Th>
                <Th>说明</Th>
              </tr>
            </thead>
            <tbody>
              {FEATURES.map(([name, desc]) => (
                <tr key={name}>
                  <Td>
                    <b style={{ color: 'var(--tw-primary-800)' }}>{name}</b>
                  </Td>
                  <Td>{desc}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      <Card title="真机/开发者工具联调" subtitle="微信开发者工具导入 miniprogram/ 目录">
        <ol className="tw-small" style={{ margin: 0, paddingLeft: 20, lineHeight: 2 }}>
          <li>
            在 <code>miniprogram/project.config.json</code> 填入自己的测试号 AppID（仓库不内置真实 AppID）。
          </li>
          <li>
            在 <code>miniprogram/config/env.ts</code> 将 API / WS 地址改为本机局域网地址（真机不能访问 127.0.0.1）。
          </li>
          <li>开发者工具勾选「不校验合法域名」，启动后端后打开小程序，首页直达任务列表。</li>
          <li>语音能力需在微信公众平台单独申请同声传译插件；未申请时自动降级为手动输入。</li>
        </ol>
      </Card>

      <Card>
        <div className="tw-small tw-muted">
          小程序是独立工程，不在本 PC 构建产物中；本页不提供模拟界面，避免把占位当已完成。
        </div>
      </Card>
    </div>
  );
}
