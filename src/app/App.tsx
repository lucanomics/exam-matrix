import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { store } from '../data/store.ts';
import { useApp } from './hooks.ts';
import { Shell } from './Shell.tsx';
import { CaptureProvider, useCapture } from './CaptureContext.tsx';
import { CaptureSheet } from '../features/capture/CaptureSheet.tsx';
import { CommandPalette } from './CommandPalette.tsx';
import { ToastProvider } from '../components/Toast.tsx';
import { TodayScreen } from '../features/today/TodayScreen.tsx';
import { DrillScreen } from '../features/drill/DrillScreen.tsx';
import { MatrixListScreen } from '../features/matrix/MatrixListScreen.tsx';
import { MatrixScreen } from '../features/matrix/MatrixScreen.tsx';
import { WeaknessScreen } from '../features/weakness/WeaknessScreen.tsx';
import { SourcesScreen } from '../features/sources/SourcesScreen.tsx';
import { ExamEveScreen } from '../features/exam-eve/ExamEveScreen.tsx';
import { SettingsScreen } from '../features/settings/SettingsScreen.tsx';
import { ItemScreen } from '../features/capture/ItemScreen.tsx';
import { Onboarding } from '../features/onboarding/Onboarding.tsx';

export function App() {
  return (
    <ToastProvider>
      <CaptureProvider>
        <Root />
      </CaptureProvider>
    </ToastProvider>
  );
}

function Root() {
  const { ready, settings, exams, error } = useApp();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const capture = useCapture();
  const location = useLocation();

  useEffect(() => { void store.boot(); }, []);

  /* Theme is applied to the root element so the print CSS is unaffected. */
  useEffect(() => {
    const el = document.documentElement;
    if (settings.theme === 'system') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  /* Global shortcuts. Never the only way to do anything (§33). */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (!typing && e.key === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        capture.open();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [capture]);

  /* Move focus to the page heading on navigation, so the keyboard and a screen
     reader both land in the new content rather than back at the top of the nav. */
  useEffect(() => {
    document.getElementById('main')?.focus?.();
  }, [location.pathname]);

  if (!ready) {
    return <div className="boot" role="status" aria-live="polite">불러오는 중…</div>;
  }
  if (error) {
    return (
      <div className="page page--narrow">
        <div className="empty">
          <p className="empty__title">저장소를 열지 못했습니다.</p>
          <p className="empty__body muted">
            브라우저의 시크릿 모드이거나 저장 공간이 차단되어 있을 수 있습니다. ({error})
          </p>
        </div>
      </div>
    );
  }

  const needsOnboarding = exams.length === 0 && !settings.onboarded;
  if (needsOnboarding && location.pathname !== '/welcome') {
    return <Navigate to="/welcome" replace />;
  }

  if (location.pathname === '/welcome') return <Onboarding />;

  return (
    <>
      <Shell onSearch={() => setPaletteOpen(true)}>
        <Routes>
          <Route path="/" element={<TodayScreen />} />
          <Route path="/drill" element={<DrillScreen />} />
          <Route path="/matrix" element={<MatrixListScreen />} />
          <Route path="/matrix/:matrixId" element={<MatrixScreen />} />
          <Route path="/weakness" element={<WeaknessScreen />} />
          <Route path="/sources" element={<SourcesScreen />} />
          <Route path="/eve" element={<ExamEveScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="/item/:itemId" element={<ItemScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
      <CaptureSheet />
      {paletteOpen ? <CommandPalette onClose={() => setPaletteOpen(false)} /> : null}
    </>
  );
}
