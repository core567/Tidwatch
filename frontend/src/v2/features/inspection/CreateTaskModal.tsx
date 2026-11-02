import { useEffect, useState } from 'react';
import type { Inspector, TaskPriority } from './inspectionTypes';
import type { Station, StationId } from '../../types';
import { Icon } from '../../components/ui/Icon';
import { Modal } from '../../components/ui/Modal';

export interface NewTaskDraft {
  title: string;
  stationId: StationId;
  assignee: string;
  priority: TaskPriority;
  dueAt: string;
  description: string;
}

interface CreateTaskModalProps {
  open: boolean;
  stations: Station[];
  members: Inspector[];
  onClose: () => void;
  onCreate: (draft: NewTaskDraft) => void;
}

export function CreateTaskModal({
  open,
  stations,
  members,
  onClose,
  onCreate,
}: CreateTaskModalProps) {
  const [title, setTitle] = useState('');
  const [stationId, setStationId] = useState<StationId>('B');
  const [assignee, setAssignee] = useState('未指派');
  const [priority, setPriority] = useState<TaskPriority>('中');
  const [dueAt, setDueAt] = useState('16:30');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setStationId('B');
    setAssignee('未指派');
    setPriority('中');
    setDueAt('16:30');
    setDescription('');
  }, [open]);

  const submit = () => {
    if (!title.trim()) return;
    onCreate({
      title: title.trim(),
      stationId,
      assignee,
      priority,
      dueAt,
      description:
        description.trim() || '现场核查监测断面异常情况，完成测量并回传现场反馈。',
    });
  };

  return (
    <Modal
      open={open}
      title="新建巡检任务"
      subtitle="创建后将进入待派发队列，可指派巡检人员"
      onClose={onClose}
      footer={
        <div className="v2-modal-actions">
          <button type="button" className="v2-btn v2-btn--ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="v2-btn v2-btn--primary"
            onClick={submit}
            disabled={!title.trim()}
          >
            创建任务
            <Icon name="plus" size={13} />
          </button>
        </div>
      }
    >
      <form
        className="v2-task-form v2-task-form--modal"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="v2-field">
          <span className="v2-field__label">任务标题</span>
          <input
            className="v2-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：中游 B 浊度加密采样"
            autoFocus
          />
        </label>

        <div className="v2-form-grid">
          <label className="v2-field">
            <span className="v2-field__label">监测断面</span>
            <select
              className="v2-select"
              value={stationId}
              onChange={(event) => setStationId(event.target.value as StationId)}
            >
              {stations.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name.replace(' 断面', '')}
                </option>
              ))}
            </select>
          </label>
          <label className="v2-field">
            <span className="v2-field__label">指派人员</span>
            <select
              className="v2-select"
              value={assignee}
              onChange={(event) => setAssignee(event.target.value)}
            >
              <option value="未指派">未指派</option>
              {members.map((member) => (
                <option key={member.id} value={member.name}>
                  {member.name} · {member.role}
                </option>
              ))}
            </select>
          </label>
          <label className="v2-field">
            <span className="v2-field__label">优先级</span>
            <select
              className="v2-select"
              value={priority}
              onChange={(event) => setPriority(event.target.value as TaskPriority)}
            >
              {(['高', '中', '低'] as TaskPriority[]).map((item) => (
                <option key={item} value={item}>
                  {item}优先
                </option>
              ))}
            </select>
          </label>
          <label className="v2-field">
            <span className="v2-field__label">截止时间</span>
            <input
              className="v2-input v2-mono"
              type="time"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
            />
          </label>
        </div>

        <label className="v2-field">
          <span className="v2-field__label">任务说明</span>
          <textarea
            className="v2-textarea"
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="填写任务目标、采样点位与注意事项…"
          />
        </label>

        <p className="v2-task-form__note">
          演示表单：任务仅保存在当前页面，刷新后恢复为初始 Mock 数据。
        </p>
      </form>
    </Modal>
  );
}
