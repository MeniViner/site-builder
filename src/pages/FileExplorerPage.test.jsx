import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  MockDirectoryHandle,
  MockFileHandle,
  MockFileSystemAdapter,
} from '../services/fileExplorer/MockFileSystemAdapter';
import { parseFileExplorerTarget } from '../utils/fileExplorerTargets';
import { FileExplorerView } from './FileExplorerPage';

function shareTree(permission = 'granted') {
  return new MockDirectoryHandle('Team Share', [
    new MockDirectoryHandle('Alpha', [
      new MockDirectoryHandle('Beta', [
        new MockDirectoryHandle('Reports', [
          new MockDirectoryHandle('Empty'),
          new MockFileHandle('דוח שנתי.pdf', {
            lastModified: Date.parse('2026-07-27T08:00:00.000Z'),
            size: 1_024,
            type: 'application/pdf',
          }),
        ]),
      ]),
    ]),
  ], permission);
}

const target = parseFileExplorerTarget('\\\\Server\\Team Share\\Alpha\\Beta\\Reports');

function connection(directoryHandle, permission = 'granted') {
  directoryHandle.permission = permission;
  return {
    canonicalPrefix: target.shareKey,
    connectionMode: 'share-root',
    createdAt: '2026-07-27T08:00:00.000Z',
    directoryHandle,
    displayPrefix: '\\\\Server\\Team Share',
    id: 'saved-connection',
    label: 'Team Share',
    lastUsedAt: '2026-07-27T08:00:00.000Z',
    prefixSegments: [],
    server: target.server,
    share: target.share,
    shareKey: target.shareKey,
  };
}

describe('FileExplorerView', () => {
  it('shows one direct connection action and opens the requested directory after selection', async () => {
    const root = shareTree();
    const adapter = new MockFileSystemAdapter({ pickerHandles: [root] });
    const picker = vi.spyOn(adapter.window, 'showDirectoryPicker');
    render(<FileExplorerView adapter={adapter} target={target} />);

    expect(await screen.findByRole('heading', { name: 'נדרש חיבור חד־פעמי' })).toBeInTheDocument();
    expect(screen.getByText(target.displayPath)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'בחירת תיקיית הרשת' }));

    expect(picker).toHaveBeenCalledWith({ mode: 'read' });
    expect(await screen.findByText('דוח שנתי.pdf')).toBeInTheDocument();
    expect(screen.getByText('קריאה בלבד')).toBeInTheDocument();
    expect(screen.getByText('החיבור נשמר ונפתח בהצלחה.')).toBeInTheDocument();
  });

  it('restores a saved handle, lists folders first, navigates, searches, and changes view', async () => {
    const root = shareTree();
    const adapter = new MockFileSystemAdapter({ connections: [connection(root)] });
    render(<FileExplorerView adapter={adapter} target={target} />);

    const emptyFolder = await screen.findByText('Empty');
    const report = screen.getByText('דוח שנתי.pdf');
    expect(
      emptyFolder.closest('button').compareDocumentPosition(report.closest('button'))
      & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('חיפוש בתיקייה הנוכחית'), { target: { value: 'דוח' } });
    expect(screen.queryByText('Empty')).not.toBeInTheDocument();
    expect(screen.getByText('דוח שנתי.pdf')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'ניקוי החיפוש' }));
    fireEvent.click(screen.getByRole('button', { name: 'תצוגת אריחים' }));
    expect(screen.getByRole('button', { name: 'תצוגת אריחים' })).toHaveClass('is-active');

    fireEvent.click(screen.getByText('Empty').closest('button'));
    expect(await screen.findByText('התיקייה ריקה')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'תיקיית אב' })).toBeEnabled();
  });

  it('surfaces permission recovery and browser support states in Hebrew', async () => {
    const deniedRoot = shareTree('denied');
    const deniedAdapter = new MockFileSystemAdapter({
      connections: [connection(deniedRoot, 'denied')],
    });
    const { unmount } = render(<FileExplorerView adapter={deniedAdapter} target={target} />);
    expect(await screen.findByRole('heading', { name: 'הגישה לתיקייה נחסמה' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'חיבור מחדש' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'הסרת החיבור השמור' }));
    expect(await screen.findByText('החיבור השמור הוסר.')).toBeInTheDocument();
    unmount();

    render(<FileExplorerView adapter={{ isSupported: () => false }} target={target} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'הדפדפן אינו תומך בפתיחת תיקיות' })).toBeInTheDocument());
  });

  it('asks for a concise mapping choice when segment names are ambiguous', async () => {
    const repeatedTarget = parseFileExplorerTarget('\\\\Server\\Share\\Alpha\\Alpha\\Final');
    const selected = new MockDirectoryHandle('Alpha');
    const adapter = new MockFileSystemAdapter({ pickerHandles: [selected] });
    render(<FileExplorerView adapter={adapter} target={repeatedTarget} />);

    fireEvent.click(await screen.findByRole('button', { name: 'בחירת תיקיית הרשת' }));
    expect(await screen.findByRole('heading', { name: 'איזו תיקייה נבחרה?' })).toBeInTheDocument();
    expect(screen.getAllByRole('button').filter((button) => button.textContent.includes('\\\\Server\\Share\\Alpha'))).toHaveLength(2);
    expect(screen.queryByText(/handle/i)).not.toBeInTheDocument();
  });

  it('asks for confirmation when the selected name has no reliable path match', async () => {
    const selected = new MockDirectoryHandle('שם מקומי');
    const adapter = new MockFileSystemAdapter({ pickerHandles: [selected] });
    render(<FileExplorerView adapter={adapter} target={target} />);

    fireEvent.click(await screen.findByRole('button', { name: 'בחירת תיקיית הרשת' }));
    expect(await screen.findByRole('heading', { name: 'האם זו התיקייה המבוקשת?' })).toBeInTheDocument();
    expect(screen.getAllByText(target.displayPath)).toHaveLength(2);
  });

  it('opens files only through the adapter and renders breadcrumbs for the requested target', async () => {
    const root = shareTree();
    const adapter = new MockFileSystemAdapter({ connections: [connection(root)] });
    const openFile = vi.spyOn(adapter, 'openFile').mockResolvedValue({ action: 'opened' });
    render(<FileExplorerView adapter={adapter} target={target} />);

    fireEvent.click((await screen.findByText('דוח שנתי.pdf')).closest('button'));
    expect(openFile).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Beta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reports' })).toBeInTheDocument();
  });

  it('presents the prompt permission state without exposing the raw status', async () => {
    const promptRoot = shareTree('prompt');
    const adapter = new MockFileSystemAdapter({
      connections: [connection(promptRoot, 'prompt')],
    });
    render(<FileExplorerView adapter={adapter} target={target} />);

    expect(await screen.findByRole('heading', { name: 'נדרשת הרשאת קריאה' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'מתן הרשאת קריאה' })).toBeInTheDocument();
    expect(screen.queryByText('prompt')).not.toBeInTheDocument();
  });
});
