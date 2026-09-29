import React from 'react';
import * as l10n from '@vscode/l10n';
import { InlineIconBtn } from '../../shared/InlineIconBtn';

interface Props {
  repoId: string;
  visible: boolean;
  onPull: (repoId: string) => void;
  onPush: (repoId: string) => void;
}

export function RepoSyncActions({ repoId, visible, onPull, onPush }: Props) {
  return (
    <>
      <InlineIconBtn icon="repo-pull" iconSize={14} title={l10n.t('Pull')} visible={visible} onClick={e => { e.stopPropagation(); onPull(repoId); }} />
      <InlineIconBtn icon="repo-push" iconSize={14} title={l10n.t('Preview Push')} visible={visible} onClick={e => { e.stopPropagation(); onPush(repoId); }} />
    </>
  );
}
