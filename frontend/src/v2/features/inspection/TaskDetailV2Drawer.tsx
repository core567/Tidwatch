import TaskDetailDrawer from '@/components/TaskDetailDrawer';
import '@/v2/styles/task-detail-dark.css';

/**
 * F6 任务详情（v2 深色主题）：复用原 TaskDetailDrawer 全部业务能力
 * （测量/观察/照片/版本化提交/复核通过退回/历史追溯），仅切换深色视觉。
 */
export default function TaskDetailV2Drawer({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  return <TaskDetailDrawer taskId={taskId} onClose={onClose} dark />;
}
