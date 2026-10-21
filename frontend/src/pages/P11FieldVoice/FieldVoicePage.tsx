import PagePlaceholder from '@/components/PagePlaceholder';

/** P11 语音与现场感知（M3：微信同声传译插件最小实现，不可用则明确标模拟）。 */
export default function FieldVoicePage() {
  return (
    <PagePlaceholder
      code="P11"
      title="语音与现场感知"
      milestone="M3"
      description="语音转写入口与确认编辑；无真实模型时标注模拟，识别结果必须人工确认，不直接驱动事件状态。"
    />
  );
}
