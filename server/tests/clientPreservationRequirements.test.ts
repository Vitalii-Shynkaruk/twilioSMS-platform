import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const rootDir = path.resolve(__dirname, '..', '..');

const readWorkspaceFile = (relativePath: string): string => {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
};

const readFirstExistingWorkspaceFile = (relativePaths: readonly string[]): string => {
  for (const relativePath of relativePaths) {
    const absolutePath = path.join(rootDir, relativePath);
    if (fs.existsSync(absolutePath)) {
      return fs.readFileSync(absolutePath, 'utf8');
    }
  }

  throw new Error(`Missing workspace file: ${relativePaths.join(', ')}`);
};

describe('Клиентские preservation requirements', () => {
  it('должны сохранять Inbox assignment controls и CONTACT assigned rep', () => {
    const inboxPage = readWorkspaceFile('client/src/pages/InboxPageV2.tsx');
    const inboxStyles = readWorkspaceFile('client/src/styles/sms-inbox.css');

    expect(inboxPage).toContain('Assign Rep');
    expect(inboxPage).toContain('Mark Unread');
    expect(inboxPage).toContain('markUnreadMutation.mutate');
    expect(inboxPage).toContain('Note');
    expect(inboxPage).toContain('setShowNotePopover');
    expect(inboxPage).toContain("key: 'Assigned Rep'");
    expect(inboxPage).toContain('inbox-conv-rep-badge');
    expect(inboxStyles).toContain('.inbox-conv-rep-badge');
    expect(inboxStyles).toContain('.inbox-contact-value.value-gold');
  });

  it('должны сохранять Admin View, My Convs и rep-only scope', () => {
    const inboxPage = readWorkspaceFile('client/src/pages/InboxPageV2.tsx');
    const inboxController = readWorkspaceFile('server/src/controllers/inboxController.ts');

    expect(inboxPage).toContain('ADMIN VIEW');
    expect(inboxPage).toContain('MY CONVS');
    expect(inboxPage).toContain("isAdminOrManager ? inboxScope : 'mine'");
    expect(inboxController).toContain("req.user?.role === 'REP'");
    expect(inboxController).toContain("String(scope || '') === 'mine'");
    expect(inboxController).toContain('inboxOwnershipCondition(req.user.id)');
  });

  it('должны фиксировать B.0 ownership contract в Pipeline AI документах', () => {
    const masterChecklist = readFirstExistingWorkspaceFile([
      'archive/legacy-docs/MASTER_M1_M2_DELIVERY_CHECKLIST.md',
      'MASTER_M1_M2_DELIVERY_CHECKLIST.md',
    ]);
    const extractorSpec = readWorkspaceFile('scl-pipeline-ai-handoff/extractor-spec.md');
    const extractorContract = readWorkspaceFile('scl-pipeline-ai-handoff/scl-pipeline-ai-extractor.md');

    for (const documentText of [masterChecklist, extractorSpec, extractorContract]) {
      expect(documentText).toContain('Deal.assignedRepId');
      expect(documentText).toContain('Deal.assistingRepIds');
      expect(documentText).toContain('Assign Rep');
      expect(documentText).toContain('Assigned Rep');
      expect(documentText).toContain('My Convs');
      expect(documentText).toContain('Auto-reassignment');
    }
  });
});
