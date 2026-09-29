import '../shared/l10n';
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as l10n from '@vscode/l10n';
import type { HostToPushPreviewMsg, PushPreviewToHostMsg, PushPreviewFile, UnpushedCommit } from '../../host/types/messages';
import { getVsCodeApi, notifyHostReady } from '../shared/vscodeApi';
import { Codicon } from '../shared/Codicon';
import { GenericFileTree } from '../shared/GenericFileTree';
import { locale } from '../shared/l10n';
import { isImeComposing } from '../shared/ime';

interface Preview {
  repoName: string;
  branchName: string;
  target: string;
  publish: boolean;
  commits: UnpushedCommit[];
  error?: string;
}

const statusColors: Record<string, string> = {
  A: 'var(--vscode-gitDecoration-addedResourceForeground)',
  M: 'var(--vscode-gitDecoration-modifiedResourceForeground)',
  D: 'var(--vscode-gitDecoration-deletedResourceForeground)',
  R: 'var(--vscode-gitDecoration-renamedResourceForeground)',
};

function App() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selectedHash, setSelectedHash] = useState('');
  const [selectedHashes, setSelectedHashes] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; hashes: string[] } | null>(null);
  const selectionAnchorRef = useRef('');
  const menuRef = useRef<HTMLDivElement>(null);
  const [filesByHash, setFilesByHash] = useState<Record<string, PushPreviewFile[]>>({});
  const [fileError, setFileError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [pushing, setPushing] = useState(false);
  const [squashing, setSquashing] = useState(false);
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());
  const pendingFilesRef = useRef('');

  useEffect(() => {
    const handler = (event: MessageEvent<HostToPushPreviewMsg>) => {
      const msg = event.data;
      if (!msg?.type) return;
      if (msg.type === 'PUSH_PREVIEW_INIT') {
        const firstHash = msg.commits[0]?.hash ?? '';
        setPreview({ repoName: msg.repoName, branchName: msg.branchName, target: msg.target, publish: msg.publish, commits: msg.commits, error: msg.error });
        setSelectedHash(firstHash);
        setSelectedHashes(firstHash ? new Set([firstHash]) : new Set());
        selectionAnchorRef.current = firstHash;
        setContextMenu(null);
        setFilesByHash(firstHash && !msg.fileError ? { [firstHash]: msg.files } : {});
        setFileError(msg.fileError ?? '');
        setSubmitError('');
        setCollapsedDirs(new Set());
        pendingFilesRef.current = '';
      } else if (msg.type === 'PUSH_PREVIEW_FILES') {
        if (msg.requestId !== pendingFilesRef.current) return;
        pendingFilesRef.current = '';
        if (!msg.error) setFilesByHash(prev => ({ ...prev, [msg.hash]: msg.files }));
        setFileError(msg.error ?? '');
      } else if (msg.type === 'PUSH_PREVIEW_RESULT') {
        setPushing(false);
        if (!msg.ok) setSubmitError(msg.error ?? l10n.t('Push failed'));
      } else if (msg.type === 'PUSH_PREVIEW_SQUASH_RESULT') {
        setSquashing(false);
        if (!msg.ok && !msg.cancelled) setSubmitError(msg.error ?? l10n.t('Squash failed'));
      }
    };
    window.addEventListener('message', handler);
    notifyHostReady();
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setContextMenu(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isImeComposing(e) && e.key === 'Escape') setContextMenu(null);
    };
    const onBlur = () => setContextMenu(null);
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', onBlur);
    };
  }, [contextMenu]);

  const selectCommit = (hash: string) => {
    setSelectedHash(hash);
    setFileError('');
    setCollapsedDirs(new Set());
    if (filesByHash[hash]) return;
    const requestId = `${Date.now()}-${Math.random()}`;
    pendingFilesRef.current = requestId;
    getVsCodeApi().postMessage({ type: 'PUSH_PREVIEW_REQUEST_FILES', requestId, hash } satisfies PushPreviewToHostMsg);
  };

  const handleCommitClick = (e: React.MouseEvent, hash: string) => {
    if (!preview) return;
    setContextMenu(null);
    if (e.shiftKey) {
      const anchorIndex = preview.commits.findIndex(c => c.hash === selectionAnchorRef.current);
      const clickedIndex = preview.commits.findIndex(c => c.hash === hash);
      if (anchorIndex >= 0 && clickedIndex >= 0) {
        const start = Math.min(anchorIndex, clickedIndex);
        const end = Math.max(anchorIndex, clickedIndex);
        setSelectedHashes(new Set(preview.commits.slice(start, end + 1).map(c => c.hash)));
      } else {
        setSelectedHashes(new Set([hash]));
        selectionAnchorRef.current = hash;
      }
    } else if (e.ctrlKey || e.metaKey) {
      setSelectedHashes(prev => {
        const next = new Set(prev);
        if (next.has(hash)) next.delete(hash); else next.add(hash);
        return next;
      });
      selectionAnchorRef.current = hash;
    } else {
      setSelectedHashes(new Set([hash]));
      selectionAnchorRef.current = hash;
    }
    selectCommit(hash);
  };

  const handleCommitContextMenu = (e: React.MouseEvent, hash: string) => {
    e.preventDefault();
    const hashes = selectedHashes.has(hash) && selectedHashes.size > 1
      ? preview?.commits.filter(c => selectedHashes.has(c.hash)).map(c => c.hash) ?? []
      : [hash];
    if (hashes.length === 1) {
      setSelectedHashes(new Set(hashes));
      selectionAnchorRef.current = hash;
    }
    selectCommit(hash);
    setContextMenu({ x: Math.min(e.clientX, window.innerWidth - 240), y: Math.min(e.clientY, window.innerHeight - 80), hashes });
  };

  const canSquash = !!contextMenu && contextMenu.hashes.length >= 2 &&
    contextMenu.hashes.every((hash, index) => preview?.commits[index]?.hash === hash);

  const squash = () => {
    if (!contextMenu || !canSquash || pushing || squashing) return;
    setSquashing(true);
    setSubmitError('');
    getVsCodeApi().postMessage({ type: 'PUSH_PREVIEW_SQUASH', requestId: `${Date.now()}-${Math.random()}`, hashes: contextMenu.hashes } satisfies PushPreviewToHostMsg);
    setContextMenu(null);
  };

  const canPush = !!preview && !preview.error && (preview.commits.length > 0 || preview.publish);

  const confirm = () => {
    if (pushing || squashing || !canPush) return;
    setPushing(true);
    setSubmitError('');
    getVsCodeApi().postMessage({ type: 'PUSH_PREVIEW_CONFIRM', requestId: `${Date.now()}-${Math.random()}` } satisfies PushPreviewToHostMsg);
  };

  const files = filesByHash[selectedHash] ?? [];
  const loadingFiles = !!selectedHash && !(selectedHash in filesByHash) && !fileError;

  return (
    <div style={styles.root}>
      <style>{`
        .push-preview-main { display: grid; grid-template-columns: minmax(280px, 43%) minmax(0, 1fr); flex: 1; min-height: 0; }
        .push-preview-menu-item:hover:not(:disabled) { background: var(--vscode-menu-selectionBackground) !important; color: var(--vscode-menu-selectionForeground) !important; }
        @media (max-width: 720px) {
          .push-preview-main { grid-template-columns: 1fr; grid-template-rows: minmax(160px, 40%) minmax(180px, 1fr); }
          .push-preview-files { border-left: 0 !important; border-top: 1px solid var(--vscode-panel-border); }
        }
      `}</style>
      <div style={styles.heading}>
        <Codicon name="repo-push" style={{ color: 'var(--vscode-gitDecoration-addedResourceForeground, #4caf50)' }} />
        <span>{preview ? l10n.t('Push Preview — {0}', preview.repoName) : l10n.t('Push Preview')}</span>
      </div>
      <div className="push-preview-main">
        <div style={styles.pane}>
          <div style={styles.branchRow}>
            <Codicon name="git-branch" />
            <span style={styles.branchName}>{preview?.branchName ?? ''}</span>
            <Codicon name="arrow-right" style={{ opacity: 0.7 }} />
            <span style={styles.target}>{preview?.target ?? ''}</span>
          </div>
          <div style={styles.scroll}>
            {!preview && <div style={styles.empty}>{l10n.t('Loading commits…')}</div>}
            {preview?.error && <div style={styles.error}>{preview.error}</div>}
            {preview && !preview.error && preview.commits.length === 0 && <div style={styles.empty}>{preview.publish ? l10n.t('No outgoing commits. Push to publish this branch.') : l10n.t('Nothing to push')}</div>}
            {preview?.commits.map(commit => (
              <button
                key={commit.hash}
                type="button"
                onClick={e => handleCommitClick(e, commit.hash)}
                onContextMenu={e => handleCommitContextMenu(e, commit.hash)}
                style={{ ...styles.commit, background: selectedHashes.has(commit.hash) ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent', color: selectedHashes.has(commit.hash) ? 'var(--vscode-list-activeSelectionForeground)' : 'var(--vscode-foreground)' }}
              >
                <span style={styles.commitSubject}>{commit.message.split('\n')[0]}</span>
                <span style={styles.commitMeta}>{commit.shortHash} · {commit.author} · {new Date(commit.date).toLocaleDateString(locale)}</span>
                {commit.message.includes('\n') && <span style={styles.commitBody}>{commit.message.split('\n').slice(1).join('\n').trim()}</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="push-preview-files" style={{ ...styles.pane, borderLeft: '1px solid var(--vscode-panel-border)' }}>
          <div style={styles.filesHeader}>
            <Codicon name="files" />
            <span>{l10n.t('Changed Files')}</span>
            <span style={{ opacity: 0.6 }}>{files.length}</span>
          </div>
          <div style={styles.scroll}>
            {loadingFiles && <div style={styles.empty}>{l10n.t('Loading files…')}</div>}
            {fileError && <div style={styles.error}>{fileError}</div>}
            {!loadingFiles && !fileError && selectedHash && files.length === 0 && <div style={styles.empty}>{l10n.t('No files found')}</div>}
            {files.length > 0 && (
              <GenericFileTree
                files={files}
                viewMode="tree"
                statusColor={status => statusColors[status[0]] ?? 'var(--vscode-foreground)'}
                statusLetter={status => status[0] ?? 'M'}
                isDirOpen={path => !collapsedDirs.has(path)}
                toggleDir={path => setCollapsedDirs(prev => { const next = new Set(prev); if (next.has(path)) next.delete(path); else next.add(path); return next; })}
                onOpenFile={file => getVsCodeApi().postMessage({ type: 'PUSH_PREVIEW_OPEN_FILE', hash: selectedHash, path: file.path } satisfies PushPreviewToHostMsg)}
              />
            )}
          </div>
        </div>
      </div>
      {contextMenu && (
        <div ref={menuRef} style={{ ...styles.contextMenu, left: Math.max(4, contextMenu.x), top: Math.max(4, contextMenu.y) }} onContextMenu={e => e.preventDefault()}>
          <button type="button" className="push-preview-menu-item" style={styles.contextMenuItem} disabled={!canSquash || pushing || squashing} title={canSquash ? undefined : l10n.t('Select consecutive commits starting at HEAD to squash.')} onClick={squash}>
            <Codicon name="fold" />
            {l10n.t('Squash {0} commits…', contextMenu.hashes.length)}
          </button>
        </div>
      )}
      <div style={styles.footer}>
        {submitError && <span style={styles.footerError}>{submitError}</span>}
        <button type="button" className="gc-btn-secondary" style={styles.cancel} disabled={pushing || squashing} onClick={() => getVsCodeApi().postMessage({ type: 'PUSH_PREVIEW_CANCEL' } satisfies PushPreviewToHostMsg)}>{l10n.t('Cancel')}</button>
        <button type="button" style={{ ...styles.push, opacity: pushing || squashing || !canPush ? 0.5 : 1 }} disabled={pushing || squashing || !canPush} onClick={confirm}>
          {pushing ? l10n.t('Pushing') : preview?.publish ? l10n.t('Publish Branch') : l10n.t('Push')}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--vscode-editor-background)', color: 'var(--vscode-foreground)', fontFamily: 'var(--vscode-font-family)', fontSize: '13px' },
  heading: { height: '42px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '9px', padding: '0 16px', borderBottom: '1px solid var(--vscode-panel-border)', fontSize: '14px', fontWeight: 600 },
  pane: { display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 },
  branchRow: { minHeight: '38px', display: 'flex', alignItems: 'center', gap: '8px', padding: '0 14px', borderBottom: '1px solid var(--vscode-panel-border)', overflow: 'hidden' },
  branchName: { fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  target: { color: 'var(--vscode-textLink-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  filesHeader: { minHeight: '38px', display: 'flex', alignItems: 'center', gap: '8px', padding: '0 14px', borderBottom: '1px solid var(--vscode-panel-border)', fontWeight: 600 },
  scroll: { flex: 1, overflowY: 'auto', minHeight: 0 },
  commit: { display: 'flex', flexDirection: 'column', gap: '4px', width: '100%', padding: '10px 16px', border: 0, borderBottom: '1px solid var(--vscode-panel-border)', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', userSelect: 'none' },
  commitSubject: { fontSize: '13px', lineHeight: 1.4, fontWeight: 500 },
  commitMeta: { fontSize: '11px', opacity: 0.7 },
  commitBody: { fontSize: '12px', opacity: 0.8, whiteSpace: 'pre-wrap', lineHeight: 1.4 },
  empty: { padding: '16px', opacity: 0.65 },
  error: { padding: '16px', color: 'var(--vscode-errorForeground)' },
  footer: { minHeight: '56px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px', padding: '8px 16px', borderTop: '1px solid var(--vscode-panel-border)' },
  footerError: { marginRight: 'auto', color: 'var(--vscode-errorForeground)', overflow: 'hidden', textOverflow: 'ellipsis' },
  contextMenu: { position: 'fixed', zIndex: 20, minWidth: '225px', maxWidth: 'calc(100vw - 8px)', padding: '4px', border: '1px solid var(--vscode-menu-border, var(--vscode-panel-border))', borderRadius: '5px', background: 'var(--vscode-menu-background)', boxShadow: '0 4px 14px rgba(0,0,0,.25)' },
  contextMenuItem: { display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '7px 10px', border: 0, borderRadius: '3px', background: 'transparent', color: 'var(--vscode-menu-foreground)', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer' },
  cancel: { padding: '6px 16px' },
  push: { padding: '7px 18px', color: 'var(--vscode-button-foreground)', background: 'var(--vscode-button-background)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 },
};

createRoot(document.getElementById('root')!).render(<App />);
