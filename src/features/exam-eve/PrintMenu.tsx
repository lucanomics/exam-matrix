/**
 * Export / 인쇄.
 *
 * The renderer is the one the repository has always had; this is only the
 * button that reaches it. Three editions, and the recall edition is the
 * interesting one — the same table with the discriminating cells withheld,
 * generated rather than maintained.
 */

import { useState } from 'react';
import { Icon } from '../../components/Icon.tsx';
import { Modal } from '../../components/Modal.tsx';
import { useToast } from '../../components/Toast.tsx';
import { buildExamFile, type BuildExamFileInput } from '../../data/export/examFile.ts';
import { EDITION_HINT, EDITION_LABEL, printHtml, renderExamHtml, type Edition } from '../../pdf/print.ts';
import { downloadText, serialiseExamYaml } from '../../data/export/backup.ts';

const EDITIONS: Edition[] = ['full', 'recall', 'key'];

export function PrintMenu({ build, label = '내보내기' }: { build: BuildExamFileInput; label?: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Edition | null>(null);
  const toast = useToast();

  const run = async (edition: Edition) => {
    setBusy(edition);
    try {
      const html = renderExamHtml(buildExamFile(build), edition);
      await printHtml(html);
      toast.show('인쇄 창에서 "PDF로 저장"을 고르면 파일로 남습니다.');
    } catch (err) {
      toast.show(`인쇄를 준비하지 못했습니다: ${(err as Error).message}`, { tone: 'warn' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        <Icon name="print" size={16} /> {label}
      </button>
      {open ? (
        <Modal title="인쇄 · 내보내기" onClose={() => setOpen(false)}>
          <div className="stack">
            <p className="small muted">
              브라우저 인쇄 창에서 <strong>PDF로 저장</strong>을 고르면 A4 문서가 됩니다.
              한글 인쇄를 위해 만들어진 조판이라 화면과 다르게 보입니다.
            </p>
            {EDITIONS.map((e) => (
              <button
                key={e}
                type="button"
                className="export-row"
                disabled={busy !== null}
                onClick={() => void run(e)}
              >
                <Icon name="print" size={18} />
                <span>
                  <strong>{EDITION_LABEL[e]}</strong>
                  <span className="small muted"> — {EDITION_HINT[e]}</span>
                </span>
                {busy === e ? <span className="small muted">준비 중…</span> : null}
              </button>
            ))}
            <hr className="rule" />
            <button
              type="button"
              className="export-row"
              onClick={() => {
                downloadText(
                  serialiseExamYaml(build),
                  `${build.exam.title.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40) || 'exam'}.yaml`,
                  'text/yaml',
                );
                toast.show('YAML 파일을 내려받았습니다.');
              }}
            >
              <Icon name="download" size={18} />
              <span>
                <strong>YAML 파일</strong>
                <span className="small muted"> — 예전 형식. 터미널 빌드와 호환됩니다</span>
              </span>
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
