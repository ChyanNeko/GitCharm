import React, { useState } from 'react';
import * as l10n from '@vscode/l10n';
import type { RepoStatus } from '../../shared/types';
import { Codicon } from '../../shared/Codicon';

interface Props {
  repoStatus: RepoStatus;
  isWorktree?: boolean;
  outgoingCount: number;
  onClick: (repoId: string) => void;
}

/** Branch picker shared by all Changes view modes. */
export function BranchSelector({ repoStatus, isWorktree, outgoingCount, onClick }: Props) {
  const [hovered, setHovered] = useState(false);
  const branch = repoStatus.branch;
  const name = branch.detachedTag ?? branch.detachedHash ?? branch.name;
  const canPush = !repoStatus.isDetachedHead && outgoingCount > 0;
  const title = branch.detachedTag
    ? l10n.t('Tag: {0} (detached HEAD)', branch.detachedTag)
    : branch.detachedHash
      ? l10n.t('Detached HEAD at {0}', branch.detachedHash)
      : canPush
        ? outgoingCount === 1
          ? l10n.t('{0}: 1 commit to push', name)
          : l10n.t('{0}: {1} commits to push', name, outgoingCount)
        : name;

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={e => { e.stopPropagation(); onClick(repoStatus.repoId); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        flexShrink: 1, minWidth: 0, maxWidth: '180px', marginLeft: '4px',
        padding: '2px 5px', border: 0, borderRadius: '4px',
        background: hovered ? 'var(--vscode-toolbar-hoverBackground)' : 'transparent',
        color: 'var(--vscode-foreground)', cursor: 'pointer',
        fontFamily: 'var(--vscode-font-family)', fontSize: '12px', fontWeight: 500,
        textTransform: 'none', letterSpacing: 0,
      }}
    >
      <Codicon name={isWorktree ? 'worktree' : branch.detachedTag ? 'tag' : branch.detachedHash ? 'git-commit' : 'git-branch'} style={{ fontSize: '13px', flexShrink: 0, opacity: 0.8 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{name}</span>
      {canPush && <Codicon name="arrow-up" style={{ color: 'var(--vscode-gitDecoration-addedResourceForeground, #4caf50)', transform: 'rotate(45deg)', fontSize: '13px', flexShrink: 0 }} />}
      <Codicon name="chevron-down" style={{ fontSize: '12px', opacity: 0.7, flexShrink: 0 }} />
    </button>
  );
}
