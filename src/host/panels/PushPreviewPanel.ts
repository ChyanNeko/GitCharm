import * as vscode from 'vscode';
import type { WorkspaceGitManager } from '../git/WorkspaceGitManager';
import type { HostToPushPreviewMsg, PushPreviewToHostMsg, PushPreviewFile } from '../types/messages';
import { getWebviewHtml } from '../utils/webviewHtml';
import { webviewReadyGate } from '../utils/webviewReadyGate';
import { openSmartDiff } from './GitLogPanelProvider';
import { formatGitError, getRawErrorDetail } from '../utils/gitErrorUtils';
import { logError, logInfo } from '../utils/Logger';
import { openSquashEditor } from './SquashEditorPanel';

interface Snapshot {
  branchName: string;
  upstream?: string;
  remote: string;
  remoteBranchName: string;
  hashes: string[];
}

interface Entry {
  panel: vscode.WebviewPanel;
  post: (msg: HostToPushPreviewMsg) => void;
  snapshot?: Snapshot;
  pushing: boolean;
  squashing: boolean;
}

/** Wide editor-tab preview for a single repository. Only its Confirm message can push. */
export class PushPreviewPanel {
  private readonly panels = new Map<string, Entry>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly manager: WorkspaceGitManager,
    private readonly onPushed: () => Promise<void>,
  ) {}

  async open(repoId: string): Promise<void> {
    const existing = this.panels.get(repoId);
    if (existing) {
      existing.panel.reveal();
      if (!existing.pushing && !existing.squashing) await this.load(repoId, existing);
      return;
    }
    const repo = this.manager.getRepo(repoId);
    if (!repo) {
      void vscode.window.showErrorMessage(vscode.l10n.t('Repository not found'));
      return;
    }
    const meta = this.manager.getRepoMetas().find(m => m.id === repoId);
    const title = vscode.l10n.t('Push Preview — {0}', meta?.name ?? repoId);
    const localResourceRoots = [this.extensionUri];
    for (const ext of vscode.extensions.all) {
      if ((ext.packageJSON?.contributes?.iconThemes ?? []).length > 0) {
        localResourceRoots.push(vscode.Uri.file(ext.extensionPath));
      }
    }
    const panel = vscode.window.createWebviewPanel(
      'gitchyan.pushPreview', title, vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots },
    );
    panel.webview.html = getWebviewHtml(panel.webview, this.extensionUri, 'pushPreview', vscode.l10n.t('Push Preview'));
    const gate = webviewReadyGate<HostToPushPreviewMsg>(panel);
    const entry: Entry = { panel, post: msg => gate.post(msg), pushing: false, squashing: false };
    this.panels.set(repoId, entry);
    const messages = panel.webview.onDidReceiveMessage((msg: PushPreviewToHostMsg) => {
      void this.handleMessage(repoId, entry, msg);
    });
    panel.onDidDispose(() => {
      messages.dispose();
      this.panels.delete(repoId);
    });
    await this.load(repoId, entry);
  }

  private async load(repoId: string, entry: Entry): Promise<void> {
    const repo = this.manager.getRepo(repoId);
    if (!repo) return;
    const repoName = this.manager.getRepoMetas().find(m => m.id === repoId)?.name ?? repoId;
    try {
      const [status, commits, remotes] = await Promise.all([
        repo.getStatusFresh(), repo.getUnpushedCommits(), repo.getRemotes(),
      ]);
      const branchName = status.branch.name;
      const tracking = await repo.getBranchUpstream(branchName);
      const upstream = tracking ? `${tracking.remote}/${tracking.branchName}` : undefined;
      const remote = tracking?.remote ?? (remotes.includes('origin') ? 'origin' : remotes[0] ?? '');
      const remoteBranchName = tracking?.branchName ?? branchName;
      const error = status.isDetachedHead
        ? vscode.l10n.t('Checkout a branch before pushing')
        : !remote || !remotes.includes(remote) ? vscode.l10n.t('No remote configured') : undefined;
      let files: PushPreviewFile[] = [];
      let fileError: string | undefined;
      if (commits[0]) {
        try { files = await repo.getCommitFiles(commits[0].hash); }
        catch (e: unknown) { fileError = formatGitError(e); }
      }
      entry.snapshot = { branchName, upstream, remote, remoteBranchName, hashes: commits.map(c => c.hash) };
      entry.post({
        type: 'PUSH_PREVIEW_INIT', repoName, branchName,
        target: remote ? `${remote} : ${remoteBranchName}` : branchName,
        publish: !tracking,
        commits, files, error, fileError,
      });
    } catch (e: unknown) {
      logError('push-preview:load', formatGitError(e), getRawErrorDetail(e));
      entry.snapshot = undefined;
      entry.post({ type: 'PUSH_PREVIEW_INIT', repoName, branchName: '', target: '', publish: false, commits: [], files: [], error: formatGitError(e) });
    }
  }

  private async handleMessage(repoId: string, entry: Entry, msg: PushPreviewToHostMsg): Promise<void> {
    const repo = this.manager.getRepo(repoId);
    if (!repo || msg.type === 'WEBVIEW_READY') return;
    if (msg.type === 'PUSH_PREVIEW_CANCEL') {
      if (entry.pushing || entry.squashing) return;
      entry.panel.dispose();
      return;
    }
    if (msg.type === 'PUSH_PREVIEW_REQUEST_FILES') {
      if (!entry.snapshot?.hashes.includes(msg.hash)) return;
      try {
        const files = await repo.getCommitFiles(msg.hash);
        entry.post({ type: 'PUSH_PREVIEW_FILES', requestId: msg.requestId, hash: msg.hash, files });
      } catch (e: unknown) {
        entry.post({ type: 'PUSH_PREVIEW_FILES', requestId: msg.requestId, hash: msg.hash, files: [], error: formatGitError(e) });
      }
      return;
    }
    if (msg.type === 'PUSH_PREVIEW_OPEN_FILE') {
      if (!entry.snapshot?.hashes.includes(msg.hash)) return;
      try {
        const file = (await repo.getCommitFiles(msg.hash)).find(f => f.path === msg.path);
        if (file) await openSmartDiff(repo, { hash: msg.hash, filePath: file.path, fileStatus: file.status, oldPath: file.oldPath });
      } catch (e: unknown) {
        logError('push-preview:diff', formatGitError(e), getRawErrorDetail(e));
      }
      return;
    }
    if (msg.type === 'PUSH_PREVIEW_SQUASH') {
      if (entry.pushing || entry.squashing) return;
      entry.squashing = true;
      try {
        const snapshot = entry.snapshot;
        if (!snapshot || msg.hashes.some(hash => !snapshot.hashes.includes(hash))) {
          throw new Error(vscode.l10n.t('Push preview is out of date. Review the refreshed commits and try again.'));
        }
        const orderedHashes = await repo.validateSquashSelection(msg.hashes);
        const commits = await Promise.all(orderedHashes.map(async hash => ({
          hash, shortHash: hash.slice(0, 8), message: (await repo.getFullCommitMessage(hash)).trim(),
        })));
        const result = await openSquashEditor(this.extensionUri, commits.length, commits.map(c => c.message).join('\n\n'), commits);
        if (!result.confirmed) {
          entry.post({ type: 'PUSH_PREVIEW_SQUASH_RESULT', requestId: msg.requestId, ok: false, cancelled: true });
          return;
        }
        await repo.squashCommits(msg.hashes, result.message);
        logInfo('push-preview:squash', `Squashed ${msg.hashes.length} commits in ${repoId}`);
        await this.load(repoId, entry);
        try { await this.onPushed(); }
        catch (e: unknown) { logError('push-preview:refresh', formatGitError(e), getRawErrorDetail(e)); }
        entry.post({ type: 'PUSH_PREVIEW_SQUASH_RESULT', requestId: msg.requestId, ok: true });
      } catch (e: unknown) {
        logError('push-preview:squash', formatGitError(e), getRawErrorDetail(e));
        entry.post({ type: 'PUSH_PREVIEW_SQUASH_RESULT', requestId: msg.requestId, ok: false, error: formatGitError(e) });
      } finally {
        entry.squashing = false;
      }
      return;
    }
    if (msg.type !== 'PUSH_PREVIEW_CONFIRM' || entry.pushing || entry.squashing) return;
    const snapshot = entry.snapshot;
    if (!snapshot || !snapshot.remote || (snapshot.hashes.length === 0 && snapshot.upstream)) {
      entry.post({ type: 'PUSH_PREVIEW_RESULT', requestId: msg.requestId, ok: false, error: vscode.l10n.t('Nothing to push') });
      return;
    }
    entry.pushing = true;
    try {
      const [status, commits, remotes] = await Promise.all([
        repo.getStatusFresh(), repo.getUnpushedCommits(), repo.getRemotes(),
      ]);
      const tracking = await repo.getBranchUpstream(status.branch.name);
      const upstream = tracking ? `${tracking.remote}/${tracking.branchName}` : undefined;
      if (status.isDetachedHead || status.branch.name !== snapshot.branchName ||
          upstream !== snapshot.upstream || !remotes.includes(snapshot.remote) ||
          commits.map(c => c.hash).join(',') !== snapshot.hashes.join(',')) {
        await this.load(repoId, entry);
        entry.post({ type: 'PUSH_PREVIEW_RESULT', requestId: msg.requestId, ok: false, error: vscode.l10n.t('Push preview is out of date. Review the refreshed commits and try again.') });
        return;
      }
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('Pushing'), cancellable: false },
        () => repo.pushBranch(snapshot.branchName, snapshot.remote, snapshot.remoteBranchName, !snapshot.upstream),
      );
      logInfo('push-preview', `Pushed ${repoId}`);
      try { await this.onPushed(); }
      catch (e: unknown) { logError('push-preview:refresh', formatGitError(e), getRawErrorDetail(e)); }
      entry.post({ type: 'PUSH_PREVIEW_RESULT', requestId: msg.requestId, ok: true });
      entry.panel.dispose();
    } catch (e: unknown) {
      logError('push-preview:push', formatGitError(e), getRawErrorDetail(e));
      entry.post({ type: 'PUSH_PREVIEW_RESULT', requestId: msg.requestId, ok: false, error: formatGitError(e) });
    } finally {
      entry.pushing = false;
    }
  }
}
