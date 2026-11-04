import type { Diagnostics } from '@/services/apiClient';
import type { HealthResponse, OfficialAutoStatus } from '@/types/contract';
import { Badge } from '../../components/ui/Badge';
import { Panel } from '../../components/ui/Panel';

export function HelpV2Panel({
  health, diag, official,
}: {
  health?: HealthResponse;
  diag?: Diagnostics;
  official?: OfficialAutoStatus;
}) {
  return (
    <Panel
      code="05"
      title="说明与帮助"
      en="GUIDE & DATA POLICY"
      className="v2-sys-panel"
      actions={<Badge tone="default">只读说明</Badge>}
    >
      <div className="v2-sys-help">
        <div className="v2-sys-help-item">
          <b>数据来源</b>
          <span>模拟观测（SIMULATED · MQTT）、官方自动站快照（OFFICIAL_AUTO）、官方历史月报（OFFICIAL_HISTORY）、现场人工记录（MANUAL）分源标注，不混合展示。</span>
        </div>
        <div className="v2-sys-help-item">
          <b>口径与隔离</b>
          <span>官方快照不插值、不伪造连续曲线；月报按批次可追溯、可整批撤销；模拟数据与官方数据物理分表。</span>
        </div>
        <div className="v2-sys-help-item">
          <b>操作指引</b>
          <span>月报：选择文件 → 预览校验 → 确认写入 → 批次撤销；场景：选择 S1–S5 → 二次确认启动 → 观察事件链路 → 确认停止；官方实时：按缓存与节流手动拉取。</span>
        </div>
        <div className="v2-sys-help-item">
          <b>规则与状态</b>
          <span>{diag ? `${diag.ruleVersion} · ${diag.ruleLabel ?? '教学规则'}；事件/巡检由状态机人工合法操作驱动。` : '规则版本加载中；事件/巡检由状态机驱动。'}</span>
        </div>
        <div className="v2-sys-help-item">
          <b>未接入能力</b>
          <span>密钥、环境变量、规则在线编辑、模型/AI 配置不提供修改入口；本页只读展示与受控操作。</span>
        </div>
        <div className="v2-sys-help-item">
          <b>当前环境</b>
          <span>
            {health ? `后端 ${health.status} · 数据库 ${health.database} · ${health.version}` : '后端状态加载中'}
            {official ? ` · 官方采集${official.enabled ? '开启' : '关闭'}` : ''}
          </span>
        </div>
      </div>
      <p className="v2-sys-note">
        竞赛原型：监测结论不替代专业部门判断；时序先后不代表因果；场景启动会生成模拟数据，请在演示前确认。
      </p>
    </Panel>
  );
}
