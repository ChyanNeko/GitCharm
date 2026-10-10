import React, { useMemo } from 'react';
import type { ChangelistData, FileStatus, RepoMeta, RepoStatus } from '../../shared/types';
import { CHANGELIST_DEFAULT_ID, CHANGELIST_UNVERSIONED_ID } from '../../shared/types';
import type { ViewMode } from '../store/commitStore';
import type { IconThemeData } from '../../../host/types/messages';
import { ChangelistGroup } from './ChangelistGroup';
import { SingleRepoHeader } from './ProjectGroup';

interface Props {
  changelists: ChangelistData[];
  repos: RepoStatus[];
  repoMetas: RepoMeta[];
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

export function ChangelistView({
  changelists, repos, repoMetas,
  selectedFile, viewMode,
  isFileSelected, isCollapsed, toggleCollapsed, hasExpandedDirs, setDirsCollapsed,
  onToggleFile, onSetFiles, onSelectFile, onContextMenu, onFolderContextMenu,
  onOpenFile, onRollback, onResolveMerge, onHeaderContextMenu, onRepoContextMenu, onOpenChanges, onBranchClick, outgoingCounts, iconTheme, activeFolderPath, ctxFile,
  onMultiSelect, multiSelectedFiles, scrollRef,
}: Props) {
  const metaMap = new Map(repoMetas.map(m => [m.id, m]));
  const singleRepo = repos.length === 1;
  const multiRepo = repos.length >= 1;

  // File membership changes with status/assignments, not with row selection or commit text.
  const changelistFiles = useMemo(() => {
    const fileToChangelist = new Map<string, string>();
    for (const cl of changelists) {
      for (const [repoId, paths] of Object.entries(cl.fileAssignments)) {
        for (const p of paths) fileToChangelist.set(`${repoId}::${p}`, cl.id);
      }
    }
    const groups = new Map<string, Map<string, FileStatus[]>>();
    for (const cl of changelists) groups.set(cl.id, new Map());
    for (const r of repos) {
      const unvMap = groups.get(CHANGELIST_UNVERSIONED_ID);
      if (unvMap) {
        const untracked = r.unstagedFiles.filter(f => f.status === 'untracked');
        if (untracked.length > 0) unvMap.set(r.repoId, untracked);
      }
      const fileMap = new Map<string, FileStatus>();
      for (const f of r.stagedFiles) fileMap.set(f.path, f);
      for (const f of r.unstagedFiles) {
        if (f.status !== 'untracked') fileMap.set(f.path, f);
      }
      for (const file of fileMap.values()) {
        const key = `${r.repoId}::${file.path}`;
        const clId = fileToChangelist.get(key) ?? CHANGELIST_DEFAULT_ID;
        const clMap = groups.get(clId);
        if (!clMap) continue;
        if (!clMap.has(r.repoId)) clMap.set(r.repoId, []);
        clMap.get(r.repoId)!.push(file);
      }
    }
    return groups;
  }, [changelists, repos]);

  const handleEmptyContextMenu = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    onHeaderContextMenu(e, 'empty');
  };

  const singleRepoStatus = singleRepo ? repos[0] : null;
  const singleMeta = singleRepoStatus ? metaMap.get(singleRepoStatus.repoId) : null;

  // Mirrors the "hide Unversioned Files when empty" rule below, so the last group actually
  // rendered (not just the last item in `changelists`) can suppress its own bottom border.
  const visibleChangelistIds = changelists
    .filter(cl => {
      if (cl.id !== CHANGELIST_UNVERSIONED_ID) return true;
      const clMap = changelistFiles.get(cl.id) ?? new Map<string, FileStatus[]>();
      return Array.from(clMap.values()).some(files => files.length > 0);
    })
    .map(cl => cl.id);
  const lastVisibleChangelistId = visibleChangelistIds[visibleChangelistIds.length - 1];

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}
      onContextMenu={handleEmptyContextMenu}
    >
      {singleRepoStatus && (
        <SingleRepoHeader
          repoStatus={singleRepoStatus}
          repoName={singleMeta?.name ?? singleRepoStatus.repoId.split('/').pop() ?? singleRepoStatus.repoId}
          repoColor={singleMeta?.color ?? '#4ec9b0'}
          isSubmodule={singleMeta?.isSubmodule}
          submodulePath={singleMeta?.submodulePath}
          isWorktree={singleMeta?.isWorktree}
          mainWorktreePath={singleMeta?.mainWorktreePath}
          onBranchClick={onBranchClick}
          onRepoContextMenu={(e, rid) => onRepoContextMenu(e, rid)}
          onOpenAllChanges={() => {}}
          outgoingCount={outgoingCounts[singleRepoStatus.repoId] ?? 0}
          hideOpenChanges
        />
      )}
      {changelists.map(cl => {
        const clMap = changelistFiles.get(cl.id) ?? new Map<string, FileStatus[]>();

        const buildGroup = (repoId: string, files: FileStatus[]) => {
          const meta = metaMap.get(repoId);
          const repoStatus = repos.find(r => r.repoId === repoId);
          return {
            repoId,
            repoName: meta?.name ?? repoId.split('/').pop() ?? repoId,
            repoColor: meta?.color ?? '#4ec9b0',
            repoStatus,
            files,
            isSubmodule: meta?.isSubmodule,
            submodulePath: meta?.submodulePath,
            isWorktree: meta?.isWorktree,
            mainWorktreePath: meta?.mainWorktreePath,
          };
        };

        const repoGroups = Array.from(clMap.entries())
          .filter(([, files]) => files.length > 0)
          .map(([repoId, files]) => buildGroup(repoId, files));

        // Hide "Unversioned Files" when empty
        if (cl.id === CHANGELIST_UNVERSIONED_ID && repoGroups.length === 0) return null;

        // Keep a repo in "Changes" when it only has unversioned files, so its
        // header remains visible above the separate "Unversioned Files" group.
        // Repos with files in a custom changelist still follow the existing rule.
        const reposInOtherChangelists = new Set<string>();
        if (cl.id === CHANGELIST_DEFAULT_ID) {
          for (const other of changelists) {
            if (other.id === CHANGELIST_DEFAULT_ID || other.id === CHANGELIST_UNVERSIONED_ID) continue;
            const otherMap = changelistFiles.get(other.id);
            if (!otherMap) continue;
            for (const [rid, files] of otherMap.entries()) {
              if (files.length > 0) reposInOtherChangelists.add(rid);
            }
          }
        }

        const allRepoGroups = !singleRepo && cl.id === CHANGELIST_DEFAULT_ID
          ? repos
              .filter(r => !reposInOtherChangelists.has(r.repoId) || (clMap.get(r.repoId)?.length ?? 0) > 0)
              .map(r => buildGroup(r.repoId, clMap.get(r.repoId) ?? []))
          : repoGroups;

        const isFixed = cl.id === CHANGELIST_DEFAULT_ID || cl.id === CHANGELIST_UNVERSIONED_ID;

        return (
          <ChangelistGroup
            key={cl.id}
            changelist={cl}
            repoGroups={allRepoGroups}
            isFixed={isFixed}
            isLast={cl.id === lastVisibleChangelistId}
            multiRepo={multiRepo}
            singleRepo={singleRepo}
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
            onHeaderContextMenu={onHeaderContextMenu}
            onRepoContextMenu={onRepoContextMenu}
            onOpenChanges={onOpenChanges}
            onBranchClick={onBranchClick}
            outgoingCounts={outgoingCounts}
            iconTheme={iconTheme}
            activeFolderPath={activeFolderPath}
            ctxFile={ctxFile}
            onMultiSelect={onMultiSelect}
            multiSelectedFiles={multiSelectedFiles}
            scrollRef={scrollRef}
          />
        );
      })}
      {/* Spacer to ensure the empty area below also captures right-click */}
      <div style={{ flex: 1, minHeight: '40px' }} onContextMenu={e => { e.preventDefault(); onHeaderContextMenu(e, 'empty'); }} />
    </div>
  );
}
