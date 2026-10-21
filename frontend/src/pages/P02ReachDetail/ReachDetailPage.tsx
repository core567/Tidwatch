import { useParams } from 'react-router-dom';
import PagePlaceholder from '@/components/PagePlaceholder';

/** P02 断面详情（M1：最新指标、质量标记、历史曲线、变化点、离线盲区）。 */
export default function ReachDetailPage() {
  const { reachId } = useParams();
  return (
    <PagePlaceholder
      code="P02"
      title={`断面详情 · ${reachId ?? ''}`}
      milestone="M1"
      description="最新指标与单位、观测时间/接收时间、数据质量、历史曲线与变化点标记、离线最后有效时间。"
    />
  );
}
