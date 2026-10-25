import { Card, PageHeader, Tag } from '@/components/ui';

const BOUNDARIES = [
  ['运行位置', '语音采集与转写仅在小程序端（微信同声传译插件）；PC Web 不提供录音入口。'],
  ['可用条件', '需在微信公众平台申请插件并在小程序 app.json 声明；未配置时自动降级为手动输入。'],
  ['结果处理', '转写文本只作为现场记录草稿，提交前必须人工确认与编辑。'],
  ['不驱动状态', '语音内容不直接触发事件状态变更、不自动生成证据；需人工操作后由后端校验。'],
  ['隐私与留存', '录音仅用于当次转写，不落库；转写文本作为任务回填的一部分保存。'],
];

export default function FieldVoicePage() {
  return (
    <div className="tw-stack">
      <PageHeader
        code="P11"
        title="语音与现场感知"
        badges={
          <>
            <Tag tone="ok">小程序端已实现</Tag>
            <Tag tone="muted">PC 端无录音能力</Tag>
          </>
        }
        description="语音转写用于现场记录效率，不代替现场判断。本页说明能力边界、降级策略与真机配置，避免出现无法工作的假按钮。"
      />

      <Card title="能力边界" subtitle="语音是辅助录入，不是研判结论" padded={false}>
        <div>
          {BOUNDARIES.map(([name, desc]) => (
            <div
              key={name}
              style={{
                display: 'flex',
                gap: 16,
                padding: '12px 20px',
                borderBottom: '1px solid #eef2f7',
              }}
            >
              <div style={{ width: 96, flexShrink: 0, fontWeight: 600, color: 'var(--tw-primary-800)' }}>
                {name}
              </div>
              <div className="tw-small tw-muted">{desc}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="tw-grid tw-grid-2">
        <Card title="真机配置步骤">
          <ol className="tw-small" style={{ margin: 0, paddingLeft: 20, lineHeight: 2 }}>
            <li>登录微信公众平台小程序后台，申请「微信同声传译」插件。</li>
            <li>
              在小程序 <code>app.json</code> 的 <code>plugins</code> 中声明插件（版本号以后台为准）。
            </li>
            <li>使用微信开发者工具真机调试；模拟器可能无法调起语音能力。</li>
            <li>授权麦克风权限；失败时页面提示降级，不影响任务提交。</li>
          </ol>
        </Card>

        <Card title="降级策略">
          <ul className="tw-small" style={{ margin: 0, paddingLeft: 20, lineHeight: 2 }}>
            <li>插件未配置或初始化失败 → 隐藏语音入口，保留手动输入。</li>
            <li>识别失败 → 提示「转写失败，请手动输入」，不写入半成品文本。</li>
            <li>识别成功 → 文本进入可编辑输入框，人工确认后才随任务回填提交。</li>
            <li>离线/无网络 → 仅本地草稿，提交需恢复连接。</li>
          </ul>
        </Card>
      </div>

      <Card>
        <div className="tw-small tw-muted">
          PC 端未接入任何 ASR/TTS 服务，因此本页不提供录音按钮；演示时请在微信开发者工具中使用移动端功能。
        </div>
      </Card>
    </div>
  );
}
