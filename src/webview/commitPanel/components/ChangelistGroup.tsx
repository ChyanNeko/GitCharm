import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangelistData, FileStatus, RepoStatus } from '../../shared/types';
import { CHANGELIST_DEFAULT_ID, CHANGELIST_UNVERSIONED_ID } from '../../shared/types';
import type { ViewMode } from '../store/commitStore';
import type { IconThemeData } from '../../../host/types/messages';
import { FileTree } from './FileTree';
import { Codicon } from '../../shared/Codicon';
import { OpenChangesBtn } from '../../shared/OpenChangesBtn';
import { InlineIconBtn } from '../../shared/InlineIconBtn';
import { BranchSelector } from './BranchSelector';
import * as l10n from '@vscode/l10n';

export interface RepoFileGroup {
  repoId: string;
  repoName: string;
  repoColor: string;
  repoStatus?: RepoStatus;
  files: FileStatus[];
  isSubmodule?: boolean;
  submodulePath?: string;
  isWorktree?: boolean;
  mainWorktreePath?: string;
}

interface Props {
  changelist: ChangelistData;
  repoGroups: RepoFileGroup[];
  isFixed: boolean;
  multiRepo: boolean;
  singleRepo?: boolean;
  /** Suppresses the group's bottom border when it's the last visible changelist group — avoids a dangling border with nothing below to visually merge into. */
  isLast?: boolean;
  selectedFile: { repoId: string; path: string } | null;
  viewMode: ViewMode;
  isFileSelected: (repoId: string, path: string) => boolean;
  isCollapsed: (key: string) => boolean;
  toggleCollapsed: (key: string) => void;
  hasExpandedDirs: (dirKeys: string[]) => boolean;
  setDirsCollapsed: (dirKeys: string[], collapsed: boolean) => void;
  onToggleFile: (repoId: string, path: string) => void;
  onSetFiles: (repoId: string, paths: string[], selected: boolean) => void;
  onSelectFile: (file: FileStatus) => void;
  onContextMenu: (e: React.MouseEvent, file: FileStatus) => void;
  onFolderContextMenu: (e: React.MouseEvent, repoId: string, folderPath: string, files: FileStatus[]) => void;
  onOpenFile: (file: FileStatus) => void;
  onRollback: (files: FileStatus[]) => void;
  onResolveMerge: (file: FileStatus) => void;
  onHeaderContextMenu: (e: React.MouseEvent, changelistId: string) => void;
  onRepoContextMenu: (e: React.MouseEvent, repoId: string, changelistId?: string) => void;
  onOpenChanges: (repoId: string) => void;
  onBranchClick: (repoId: string) => void;
  outgoingCounts: Record<string, number>;
  iconTheme?: IconThemeData | null;
  activeFolderPath?: string | null;
  ctxFile?: { repoId: string; path: string } | null;
  onMultiSelect?: (file: FileStatus) => void;
  multiSelectedFiles?: FileStatus[];
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}

export function ChangelistGroup({
  changelist, repoGroups, isFixed: _isFixed, multiRepo, singleRepo, isLast = false,
  selectedFile, viewMode,
  isFileSelected, isCollapsed, toggleCollapsed, hasExpandedDirs, setDirsCollapsed,
  onToggleFile, onSetFiles, onSelectFile, onContextMenu, onFolderContextMenu,
  onOpenFile, onRollback, onResolveMerge, onHeaderContextMenu, onRepoContextMenu, onOpenChanges, onBranchClick, outgoingCounts, iconTheme, activeFolderPath, ctxFile,
  onMultiSelect, multiSelectedFiles, scrollRef,
}: Props) {
  const collapseKey = `cl:${changelist.id}`;
  const collapsed = isCollapsed(collapseKey);
  const allFiles = repoGroups.flatMap(g => g.files);
  const totalFiles = allFiles.length;
  const selectedCount = allFiles.filter(f => isFileSelected(f.repoId, f.path)).length;
  const allSelected = totalFiles > 0 && selectedCount === totalFiles;
  const someSelected = selectedCount > 0 && !allSelected;

  const checkboxRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = someSelected;
  }, [someSelected]);

  const toggleAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    for (const g of repoGroups) {
      onSetFiles(g.repoId, g.files.map(f => f.path), !allSelected);
    }
  };

  const isUnversioned = changelist.id === CHANGELIST_UNVERSIONED_ID;
  const isDefault = changelist.id === CHANGELIST_DEFAULT_ID;
  const headerIcon = isUnversioned ? 'question' : isDefault ? 'circle-large-outline' : 'list-unordered';

  return (
    <div style={styles.container}>
      <div
        style={styles.header}
        onContextMenu={e => { e.preventDefault(); onHeaderContextMenu(e, changelist.id); }}
      >
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={allSelected}
          onChange={() => {}}
          onClick={totalFiles > 0 ? toggleAll : e => e.stopPropagation()}
          disabled={totalFiles === 0}
          style={{ ...styles.clCheckbox, ...(totalFiles === 0 ? { opacity: 0.3, cursor: 'default', pointerEvents: 'none' } : {}) }}
          title={totalFiles > 0 ? l10n.t('Select all files in this changelist') : undefined}
        />
        <div style={styles.headerMain} onClick={() => toggleCollapsed(collapseKey)}>
          <Codicon name={collapsed ? 'chevron-right' : 'chevron-down'} style={styles.chevron} />
          <Codicon name={headerIcon} style={{ ...styles.clIcon, opacity: isUnversioned ? 0.6 : 0.8 }} />
          <span style={styles.clName}>{changelist.name}</span>
          <div style={styles.rightGroup}>
            {totalFiles > 0 && (
              <span style={styles.countBadge(selectedCount > 0)}>
                {selectedCount}/{totalFiles}
              </span>
            )}
          </div>
        </div>
      </div>

      {!collapsed && (
        <div style={styles.body}>
          {repoGroups.length === 0 && (
            <div style={styles.empty}>{l10n.t('No files')}</div>
          )}
          {repoGroups.map((group, idx) => (
              <RepoSubGroup
                key={group.repoId}
                isFirst={idx === 0}
                isLast={isLast && idx === repoGroups.length - 1}
                defaultCollapsed={group.files.length === 0}
                repoId={group.repoId}
                repoName={group.repoName}
                repoColor={group.repoColor}
                repoStatus={group.repoStatus}
                files={group.files}
                multiRepo={multiRepo}
                singleRepo={singleRepo}
                isSubmodule={group.isSubmodule}
                submodulePath={group.submodulePath}
                isWorktree={group.isWorktree}
                mainWorktreePath={group.mainWorktreePath}
                selectedFile={selectedFile}
                viewMode={viewMode}
                isFileSelected={isFileSelected}
                isCollapsed={isCollapsed}
                toggleCollapsed={toggleCollapsed}
                hasExpandedDirs={hasExpandedDirs}
                setDirsCollapsed={setDirsCollapsed}
                onToggleFile={onToggleFile}
                onSetFiles={onSetFiles}
                onSelectFile={onSelectFile}
                onContextMenu={onContextMenu}
                onFolderContextMenu={onFolderContextMenu}
                onOpenFile={onOpenFile}
                onRollback={onRollback}
                onResolveMerge={onResolveMerge}
                onRepoContextMenu={onRepoContextMenu}
                onOpenChanges={onOpenChanges}
                onBranchClick={onBranchClick}
                outgoingCount={outgoingCounts[group.repoId] ?? 0}
                iconTheme={iconTheme}
                activeFolderPath={activeFolderPath}
                changelistId={changelist.id}
                ctxFile={ctxFile}
                onMultiSelect={onMultiSelect}
                multiSelectedFiles={multiSelectedFiles}
                scrollRef={scrollRef}
              />
            ))}
        </div>
      )}
    </div>
  );
}

// ── Repo sub-group inside a changelist ────────────────────────────────────────

interface RepoSubGroupProps {
  repoId: string;
  repoName: string;
  repoColor: string;
  repoStatus?: RepoStatus;
  files: FileStatus[];
  multiRepo: boolean;
  singleRepo?: boolean;
  isSubmodule?: boolean;
  submodulePath?: string;
  isWorktree?: boolean;
  mainWorktreePath?: string;
  selectedFile: { repoId: string; path: string } | null;
  viewMode: ViewMode;
  isFileSelected: (repoId: string, path: string) => boolean;
  isCollapsed: (key: string) => boolean;
  toggleCollapsed: (key: string) => void;
  hasExpandedDirs: (dirKeys: string[]) => boolean;
  setDirsCollapsed: (dirKeys: string[], collapsed: boolean) => void;
  onToggleFile: (repoId: string, path: string) => void;
  onSetFiles: (repoId: string, paths: string[], selected: boolean) => void;
  onSelectFile: (file: FileStatus) => void;
  onContextMenu: (e: React.MouseEvent, file: FileStatus) => void;
  onFolderContextMenu: (e: React.MouseEvent, repoId: string, folderPath: string, files: FileStatus[]) => void;
  onOpenFile: (file: FileStatus) => void;
  onRollback: (files: FileStatus[]) => void;
  onResolveMerge: (file: FileStatus) => void;
  onRepoContextMenu: (e: React.MouseEvent, repoId: string, changelistId?: string) => void;
  onOpenChanges: (repoId: string) => void;
  onBranchClick: (repoId: string) => void;
  outgoingCount: number;
  iconTheme?: IconThemeData | null;
  activeFolderPath?: string | null;
  changelistId?: string;
  ctxFile?: { repoId: string; path: string } | null;
  isFirst?: boolean;
  /** Suppresses the sub-group's bottom border when it's the last repo sub-group in the last visible changelist — avoids a dangling border with nothing below to visually merge into. */
  isLast?: boolean;
  defaultCollapsed?: boolean;
  onMultiSelect?: (file: FileStatus) => void;
  multiSelectedFiles?: FileStatus[];
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}

function RepoSubGroup({
  repoId, repoName, repoColor, repoStatus, files, multiRepo, singleRepo, isSubmodule, submodulePath, isWorktree, mainWorktreePath,
  selectedFile, viewMode,
  isFileSelected, isCollapsed, toggleCollapsed, hasExpandedDirs, setDirsCollapsed,
  onToggleFile, onSetFiles, onSelectFile, onContextMenu, onFolderContextMenu,
  onOpenFile, onRollback, onResolveMerge, onRepoContextMenu, onOpenChanges, onBranchClick, outgoingCount, iconTheme, activeFolderPath, changelistId, ctxFile, isFirst = false, isLast = false, defaultCollapsed = false,
  onMultiSelect, multiSelectedFiles, scrollRef,
}: RepoSubGroupProps) {
  const collapseKey = `cl-repo:${changelistId ?? ''}:${repoId}`;
  // When defaultCollapsed, the key's presence means "user explicitly opened it"
  const collapsed = defaultCollapsed ? !isCollapsed(collapseKey) : isCollapsed(collapseKey);
  const dirKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const f of files) {
      const parts = f.path.split('/');
      for (let i = 1; i < parts.length; i++) keys.add(`${repoId}:${parts.slice(0, i).join('/')}`);
    }
    return Array.from(keys);
  }, [files, repoId]);
  const expanded = viewMode === 'tree' && hasExpandedDirs(dirKeys);
  const totalFiles = files.length;
  const selectedCount = files.filter(f => isFileSelected(repoId, f.path)).length;
  const allSelected = totalFiles > 0 && selectedCount === totalFiles;
  const someSelected = selectedCount > 0 && !allSelected;

  const [hovered, setHovered] = useState(false);

  const checkboxRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = someSelected;
  }, [someSelected]);

  const toggleAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSetFiles(repoId, files.map(f => f.path), !allSelected);
  };

  return (
    <div style={styles.repoSubGroup(isFirst)}>
      {multiRepo && !singleRepo && (
        <div
          style={styles.repoHeader(repoColor)}
          onContextMenu={e => { e.preventDefault(); onRepoContextMenu(e, repoId, changelistId); }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <input
            ref={checkboxRef}
            type="checkbox"
            checked={allSelected}
            onChange={() => {}}
            onClick={totalFiles > 0 ? toggleAll : e => e.stopPropagation()}
            style={{ ...styles.repoCheckbox, ...(totalFiles === 0 ? { opacity: 0.3, cursor: 'default', pointerEvents: 'none' } : {}) }}
            title={totalFiles > 0 ? l10n.t('Select all files in {0}', repoName) : undefined}
            disabled={totalFiles === 0}
          />
          <div style={styles.repoHeaderMain} onClick={() => toggleCollapsed(collapseKey)}>
            <Codicon name={collapsed ? 'chevron-right' : 'chevron-down'} style={styles.repoChevron} />
            <span style={styles.repoDot(repoColor)} />
            <span style={styles.repoName}>
              {isWorktree && mainWorktreePath ? mainWorktreePath.split('/').pop() ?? repoName : repoName}
            </span>
            {isSubmodule && (
              <span style={styles.submoduleBadge} title={submodulePath ? l10n.t('Submodule: {0}', submodulePath) : l10n.t('Submodule')}>{l10n.t({ message: 'SUB', comment: ['Short badge for a git submodule'] })}</span>
            )}
            {repoStatus && (
              <BranchSelector repoStatus={repoStatus} isWorktree={isWorktree} outgoingCount={outgoingCount} onClick={onBranchClick} />
            )}
            <div style={styles.repoRightGroup}>
              {viewMode === 'tree' && totalFiles > 0 && !collapsed && dirKeys.length > 0 && (
                <InlineIconBtn
                  icon={expanded ? 'collapse-all' : 'expand-all'}
                  title={expanded ? l10n.t('Collapse') : l10n.t('Expand')}
                  visible={hovered}
                  onClick={e => { e.stopPropagation(); setDirsCollapsed(dirKeys, expanded); }}
                />
              )}
              <OpenChangesBtn visible={hovered && totalFiles > 0} onClick={e => { e.stopPropagation(); onOpenChanges(repoId); }} />
              {totalFiles > 0 && (
                <span style={styles.repoCountBadge(selectedCount > 0)}>
                  {selectedCount}/{totalFiles}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
      {(!multiRepo || singleRepo || !collapsed) && (
        <div style={!isLast ? { borderBottom: '1px solid var(--vscode-panel-border)' } : undefined}>
          {files.length === 0 ? (
            <div style={{ padding: '12px 8px', fontSize: '12px', color: 'var(--vscode-foreground)', opacity: 0.4, textAlign: 'center' }}>{l10n.t('No changes')}</div>
          ) : (
            <FileTree
              repoId={repoId}
              files={files}
              iconTheme={iconTheme}
              selectedFile={selectedFile}
              onSelect={onSelectFile}
              onToggleFile={onToggleFile}
              onSetFiles={onSetFiles}
              isFileSelected={isFileSelected}
              isCollapsed={isCollapsed}
              toggleCollapsed={toggleCollapsed}
              onContextMenu={onContextMenu}
              onFolderContextMenu={onFolderContextMenu}
              onOpenFile={onOpenFile}
              onRollback={onRollback}
              onResolveMerge={onResolveMerge}
              viewMode={viewMode}
              // Tree view steps 18px past the header's own checkbox (6px, or 18px under a repo header) to show nesting;
              // flat rows step 14px, the same as the Simplified view (repo checkbox at 6px, files at FileTree's default 20px).
              basePad={viewMode === 'flat' ? (multiRepo && !singleRepo ? 32 : 20) : (multiRepo && !singleRepo ? 36 : 24)}
              activeFolderPath={activeFolderPath}
              ctxFile={ctxFile}
              onMultiSelect={onMultiSelect}
              multiSelectedFiles={multiSelectedFiles}
              scrollRef={scrollRef}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  container: {
  } as React.CSSProperties,

  // Changelist header — accent left border + solid background for clear hierarchy
  header: {
    display: 'flex',
    alignItems: 'center',
    background: 'var(--vscode-sideBarSectionHeader-background, rgba(128,128,128,0.15))',
    borderLeft: '3px solid var(--vscode-focusBorder, var(--vscode-button-background, #007acc))',
    borderBottom: '1px solid var(--vscode-panel-border)',
    cursor: 'default',
    height: '26px',
    boxSizing: 'border-box',
  } as React.CSSProperties,

  // Changelist-level checkbox (leftmost) — margin compensates for 3px accent border
  clCheckbox: {
    margin: '0 0 0 3px',
    flexShrink: 0,
    accentColor: 'var(--vscode-button-background)',
  } as React.CSSProperties,

  headerMain: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '3px 8px 3px 4px',
    cursor: 'pointer',
    flex: 1,
    fontSize: '11px',
    fontWeight: 'bold' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'var(--vscode-foreground)',
    userSelect: 'none' as const,
    minWidth: 0,
    overflow: 'hidden',
  },
  chevron: {
    fontSize: '12px',
    opacity: 0.7,
    flexShrink: 0,
  },
  clIcon: {
    fontSize: '13px',
    flexShrink: 0,
  },
  clName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    flexShrink: 1,
    minWidth: '20px',
  } as React.CSSProperties,
  rightGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    marginLeft: 'auto',
    flexShrink: 0,
  } as React.CSSProperties,
  countBadge: (hasSelected: boolean): React.CSSProperties => ({
    background: hasSelected ? 'var(--vscode-badge-background)' : 'transparent',
    color: hasSelected ? 'var(--vscode-badge-foreground)' : 'var(--vscode-foreground)',
    borderRadius: '8px',
    padding: hasSelected ? '1px 5px' : '0',
    fontSize: '10px',
    fontWeight: 'bold',
    flexShrink: 0,
    opacity: hasSelected ? 1 : 0.4,
  }),
  body: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  empty: {
    padding: '12px 8px',
    fontSize: '12px',
    color: 'var(--vscode-foreground)',
    opacity: 0.4,
    textAlign: 'center' as const,
    borderBottom: '1px solid var(--vscode-panel-border)',
  },

  repoSubGroup: (_isFirst: boolean): React.CSSProperties => ({
  }),
  repoHeader: (color: string): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    background: `color-mix(in srgb, ${color} 8%, var(--vscode-sideBar-background))`,
    height: '26px',
    boxSizing: 'border-box',
    borderBottom: '1px solid var(--vscode-panel-border)',
    position: 'sticky', top: 0, zIndex: 1,
  }),

  // Repo checkbox indented one level from changelist checkbox
  repoCheckbox: {
    margin: '0 0 0 18px',
    flexShrink: 0,
    accentColor: 'var(--vscode-button-background)',
  } as React.CSSProperties,

  repoHeaderMain: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 8px 3px 4px',
    cursor: 'pointer',
    flex: 1,
    fontSize: '11px',
    fontWeight: 'bold' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'var(--vscode-foreground)',
    userSelect: 'none' as const,
    minWidth: 0,
    overflow: 'hidden',
  },
  repoChevron: {
    fontSize: '12px',
    opacity: 0.7,
    flexShrink: 0,
  },
  repoDot: (color: string): React.CSSProperties => ({
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: color,
    flexShrink: 0,
  }),
  repoName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    flexShrink: 10,
    minWidth: '20px',
  } as React.CSSProperties,
  repoRightGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '1px',
    marginLeft: 'auto',
    flexShrink: 0,
  } as React.CSSProperties,
  repoCountBadge: (hasSelected: boolean): React.CSSProperties => ({
    background: 'transparent',
    color: 'var(--vscode-foreground)',
    borderRadius: '8px',
    padding: '0',
    fontSize: '10px',
    fontWeight: 'bold',
    flexShrink: 0,
    opacity: hasSelected ? 0.8 : 0.35,
  }),
  submoduleBadge: {
    fontSize: '9px',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--vscode-badge-foreground)',
    background: 'var(--vscode-badge-background)',
    borderRadius: '3px',
    padding: '1px 4px',
    flexShrink: 0,
    opacity: 0.75,
  } as React.CSSProperties,
};
