import PagePlaceholder from '@/components/PagePlaceholder';

/** P05 巡检与观察任务中心（M3：PC 端派发，与微信小程序共用任务模型）。 */
export default function TasksPage() {
  return (
    <PagePlaceholder
      code="P05"
      title="巡检与观察任务中心"
      milestone="M3"
      description="观察重点与巡检任务派发（引用 eventId/focusId）、优先级与截止时间、执行人、结果回填触发再评估。"
    />
  );
}
