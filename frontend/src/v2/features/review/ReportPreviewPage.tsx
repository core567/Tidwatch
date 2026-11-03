import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BlobProvider } from '@react-pdf/renderer';
import { ReportDocument } from './ReportDocument';
import { useReportData } from './useReportData';
import { Icon } from '../../components/ui/Icon';
import { PanelState } from '../../components/ui/PanelState';
import '../../styles/tokens.css';
import '../../styles/base.css';
import '../../styles/layout.css';
import '../../styles/ui.css';
import '../../styles/review.css';
import '../../styles/review-layout.css';

const A4_W = 794;
const A4_H = 1123;
const PAGE_GAP = 12;
const MAX_FIT = 2.2;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** 从 PDF 原始字节统计页数；react-pdf 输出为未压缩对象，计数可靠。 */
function PdfPreviewCanvas({ url, zoom }: { url: string; zoom: number }) {
  const [pages, setPages] = useState(1);

  useEffect(() => {
    let alive = true;
    fetch(url)
      .then((res) => res.text())
      .then((text) => {
        if (!alive) return;
        const matches = text.match(/\/Type\s*\/Page\b(?!s)/g);
        setPages(Math.max(1, matches?.length ?? 1));
      })
      .catch(() => {
        if (alive) setPages(1);
      });
    return () => { alive = false; };
  }, [url]);

  const width = Math.round(A4_W * zoom);
  const height = Math.round((A4_H + PAGE_GAP) * zoom * pages + 8);

  return (
    <div className="v2-report-canvas" style={{ width, height }}>
      <iframe
        title="事件复盘报告 PDF 预览"
        src={`${url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
        className="v2-report-frame"
      />
    </div>
  );
}

/**
 * F7.1.4 完整报告预览：默认适应宽度、A4 全文档高度、工具栏固定、预览区独立滚动。
 */
export default function ReportPreviewPage() {
  const { eventId = '' } = useParams();
  const navigate = useNavigate();
  const { data, loading, error } = useReportData(eventId);
  const stageRef = useRef<HTMLDivElement>(null);
  const [fitZoom, setFitZoom] = useState(1);
  const [manualZoom, setManualZoom] = useState<number | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const node = stageRef.current;
      if (!node || !node.isConnected) return;
      const available = node.clientWidth - 24;
      if (available <= 0) return;
      setFitZoom(clamp(available / A4_W, 0.5, MAX_FIT));
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (stageRef.current) observer.observe(stageRef.current);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const zoom = manualZoom ?? fitZoom;
  const isFit = manualZoom === null;

  function renderContent(pdf: { url?: string | null; gen: boolean; genError?: Error | null }) {
    return (
      <>
        <div className="v2-report-toolbar">
          <button type="button" className="v2-btn v2-btn--ghost" onClick={() => navigate(`/review/${eventId}`)}>
            <Icon name="arrow-right" size={12} style={{ transform: 'rotate(180deg)' }} />返回复盘
          </button>

          <div className="v2-report-toolbar__center">
            <span className="v2-report-toolbar__title">完整事件复盘报告</span>
            <span className="v2-report-toolbar__divider" />
            <button
              type="button"
              className="v2-btn v2-btn--ghost v2-btn--sm"
              onClick={() => setManualZoom((z) => clamp((z ?? zoom) - 0.1, 0.5, 2.5))}
              title="缩小"
            >缩小</button>
            <span className="v2-mono v2-report-zoom">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              className="v2-btn v2-btn--ghost v2-btn--sm"
              onClick={() => setManualZoom((z) => clamp((z ?? zoom) + 0.1, 0.5, 2.5))}
              title="放大"
            >放大</button>
            <button
              type="button"
              className={`v2-btn v2-btn--ghost v2-btn--sm ${isFit ? 'v2-report-zoom-active' : ''}`.trim()}
              onClick={() => setManualZoom(null)}
              title="适应宽度"
            >适应宽度</button>
            <button
              type="button"
              className={`v2-btn v2-btn--ghost v2-btn--sm ${manualZoom === 1 ? 'v2-report-zoom-active' : ''}`.trim()}
              onClick={() => setManualZoom(1)}
              title="100% 缩放"
            >100%</button>
          </div>

          {pdf.genError ? (
            <span className="v2-report-toolbar__error">PDF 生成失败</span>
          ) : (
            <a
              className={`v2-btn v2-btn--primary ${pdf.gen || !pdf.url ? 'v2-btn--disabled' : ''}`}
              href={pdf.url ?? undefined}
              download={`事件复盘报告-${eventId}.pdf`}
            >
              <Icon name="download" size={12} />{pdf.gen ? '生成中…' : '下载 PDF'}
            </a>
          )}
        </div>

        <div className="v2-report-stage" ref={stageRef}>
          {loading && <div className="v2-panel v2-state-page"><PanelState variant="loading" title="报告数据加载中…" /></div>}
          {error && (
            <div className="v2-panel v2-state-page">
              <div className="v2-state__title">报告生成失败</div>
              <p className="v2-muted">{(error as Error).message}</p>
            </div>
          )}
          {pdf.gen && (
            <div className="v2-report-loading">
              <PanelState variant="loading" title="PDF 渲染中…" />
            </div>
          )}
          {pdf.genError && (
            <div className="v2-panel v2-state-page">
              <div className="v2-state__title">PDF 生成失败</div>
              <p className="v2-muted">{pdf.genError.message}</p>
            </div>
          )}
          {pdf.url && !pdf.genError && <PdfPreviewCanvas url={pdf.url} zoom={zoom} />}
        </div>
      </>
    );
  }

  return (
    <div className="v2-scope v2-report-preview-scope">
      <div className="v2-page v2-report-preview">
        {data ? (
          <BlobProvider document={<ReportDocument data={data} origin={window.location.origin} />}>
            {({ url, loading: gen, error: genError }) => renderContent({ url, gen, genError })}
          </BlobProvider>
        ) : (
          renderContent({ gen: false })
        )}
      </div>
    </div>
  );
}
