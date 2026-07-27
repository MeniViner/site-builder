import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
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

function connectionFor(connectionTarget, directoryHandle, {
  id = 'saved-connection',
  prefixSegments = [],
} = {}) {
  return {
    canonicalPrefix: [
      connectionTarget.shareKey,
      ...prefixSegments.map((segment) => segment.toLocaleLowerCase('en-US')),
    ].join('/'),
    connectionMode: prefixSegments.length ? 'folder-prefix' : 'share-root',
    createdAt: '2026-07-27T08:00:00.000Z',
    directoryHandle,
    displayPrefix: `\\\\${connectionTarget.server}\\${[
      connectionTarget.share,
      ...prefixSegments,
    ].join('\\')}`,
    id,
    label: prefixSegments.at(-1) || connectionTarget.share,
    lastUsedAt: '2026-07-27T08:00:00.000Z',
    prefixSegments,
    server: connectionTarget.server,
    share: connectionTarget.share,
    shareKey: connectionTarget.shareKey,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

async function adapterDirectory(root, segments) {
  let current = root;
  for (const segment of segments) current = await current.getDirectoryHandle(segment);
  return current;
}

describe('FileExplorerView', () => {
  it('shows one direct connection action and opens the requested directory after selection', async () => {
    const root = shareTree();
    const adapter = new MockFileSystemAdapter({ pickerHandles: [root] });
    const picker = vi.spyOn(adapter.window, 'showDirectoryPicker');
    render(<FileExplorerView adapter={adapter} target={target} />);

    expect(await screen.findByRole('heading', { name: 'נדרש חיבור חד־פעמי' })).toBeInTheDocument();
    expect(screen.getByText(target.displayPath)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'בחר תיקיית רשת' }));

    expect(picker).toHaveBeenCalledWith({ mode: 'read' });
    expect(await screen.findByText('דוח שנתי.pdf')).toBeInTheDocument();
    expect(screen.getByText('קריאה בלבד')).toBeInTheDocument();
    expect(screen.getByText('החיבור נשמר ונפתח בהצלחה.')).toBeInTheDocument();
  });

  it('explains the share-root flow and copies the exact Windows UNC root', async () => {
    const adapter = new MockFileSystemAdapter();
    const copyText = vi.spyOn(adapter, 'copyText').mockResolvedValue('\\\\Server\\Team Share');
    render(<FileExplorerView adapter={adapter} target={target} />);

    expect(await screen.findByText('שורש השיתוף המומלץ')).toBeInTheDocument();
    expect(screen.getByText('\\\\Server\\Team Share')).toBeInTheDocument();
    expect(screen.getByText('המיקום שייפתח לאחר החיבור')).toBeInTheDocument();
    expect(screen.getByText(/הדבק אותו בשורת הכתובת העליונה/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'העתקה' }));
    await waitFor(() => expect(copyText).toHaveBeenCalledWith('\\\\Server\\Team Share'));
    expect(await screen.findByRole('button', { name: 'הנתיב הועתק' })).toBeInTheDocument();
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
    const { unmount } = render(
      <FileExplorerView adapter={deniedAdapter} canManageConnections target={target} />,
    );
    expect(await screen.findByRole('heading', { name: 'הגישה לתיקייה נדחתה' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'חיבור מחדש' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'הסרת החיבור השמור' }));
    expect(await screen.findByText('החיבור השמור הוסר.')).toBeInTheDocument();
    unmount();

    render(<FileExplorerView adapter={{ isSupported: () => false }} target={target} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'הדפדפן אינו תומך בפתיחת תיקיות' })).toBeInTheDocument());
  });

  it('lets a regular user reconnect denied access without exposing removal controls', async () => {
    const deniedRoot = shareTree('denied');
    const adapter = new MockFileSystemAdapter({
      connections: [connection(deniedRoot, 'denied')],
    });
    render(<FileExplorerView adapter={adapter} canManageConnections={false} target={target} />);
    expect(await screen.findByRole('button', { name: 'חיבור מחדש' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'הסרת החיבור השמור' })).not.toBeInTheDocument();
    expect(screen.getByText('אפשר לבחור שוב את תיקיית הרשת כדי לחדש את הרשאת הקריאה.')).toBeInTheDocument();
  });

  it('asks for a concise mapping choice when segment names are ambiguous', async () => {
    const repeatedTarget = parseFileExplorerTarget('\\\\Server\\Share\\Alpha\\Alpha\\Final');
    const selected = new MockDirectoryHandle('Alpha');
    const adapter = new MockFileSystemAdapter({ pickerHandles: [selected] });
    render(<FileExplorerView adapter={adapter} target={repeatedTarget} />);

    fireEvent.click(await screen.findByRole('button', { name: 'בחר תיקיית רשת' }));
    expect(await screen.findByRole('heading', { name: 'איזו תיקייה נבחרה?' })).toBeInTheDocument();
    expect(screen.getAllByRole('button').filter((button) => button.textContent.includes('\\\\Server\\Share\\Alpha'))).toHaveLength(2);
    expect(screen.queryByText(/handle/i)).not.toBeInTheDocument();
  });

  it('asks for confirmation when the selected name has no reliable path match', async () => {
    const selected = new MockDirectoryHandle('שם מקומי');
    const adapter = new MockFileSystemAdapter({ pickerHandles: [selected] });
    render(<FileExplorerView adapter={adapter} target={target} />);

    fireEvent.click(await screen.findByRole('button', { name: 'בחר תיקיית רשת' }));
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

    expect(await screen.findByRole('heading', { name: 'נדרש אישור מחדש' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'מתן הרשאת קריאה' })).toBeInTheDocument();
    expect(screen.queryByText('prompt')).not.toBeInTheDocument();
  });

  it('restores an expired permission from a user gesture and opens on that click', async () => {
    const promptRoot = shareTree('prompt');
    const adapter = new MockFileSystemAdapter({
      connections: [connection(promptRoot, 'prompt')],
    });
    vi.spyOn(adapter, 'requestPermission').mockImplementation(async () => {
      promptRoot.permission = 'granted';
      return 'granted';
    });
    render(<FileExplorerView adapter={adapter} target={target} />);

    fireEvent.click(await screen.findByRole('button', { name: 'מתן הרשאת קריאה' }));
    expect(await screen.findByText('דוח שנתי.pdf')).toBeInTheDocument();
    expect(screen.getByText('החיבור נטען בהצלחה.')).toBeInTheDocument();
  });

  it('allows upward navigation only to the connected share root', async () => {
    const root = shareTree();
    const adapter = new MockFileSystemAdapter({ connections: [connection(root)] });
    render(<FileExplorerView adapter={adapter} target={target} />);

    await screen.findByText('דוח שנתי.pdf');
    const up = screen.getByRole('button', { name: 'תיקיית אב' });
    expect(up).toBeEnabled();
    fireEvent.click(up);
    await screen.findByText('Reports');
    fireEvent.click(up);
    await screen.findByText('Beta');
    fireEvent.click(up);
    await screen.findByText('Alpha');
    expect(up).toBeDisabled();
    expect(screen.getAllByText('\\\\Server\\Team Share')).toHaveLength(2);
  });

  it('keeps an exact-folder connection bounded at its granted root', async () => {
    const root = shareTree();
    const reports = await adapterDirectory(root, ['Alpha', 'Beta', 'Reports']);
    const exactConnection = connectionFor(target, reports, {
      id: 'exact-root',
      prefixSegments: ['Alpha', 'Beta', 'Reports'],
    });
    const adapter = new MockFileSystemAdapter({ connections: [exactConnection] });
    render(<FileExplorerView adapter={adapter} target={target} />);

    await screen.findByText('דוח שנתי.pdf');
    expect(screen.getByRole('button', { name: 'תיקיית אב' })).toBeDisabled();
    expect(screen.getAllByText('\\\\Server\\Team Share\\Alpha\\Beta\\Reports')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Alpha' })).not.toBeInTheDocument();
  });

  it('allows an intermediate-prefix connection to move up only to that intermediate root', async () => {
    const root = shareTree();
    const beta = await adapterDirectory(root, ['Alpha', 'Beta']);
    const intermediateConnection = {
      ...connectionFor(target, beta, {
        id: 'intermediate-root',
        prefixSegments: ['Alpha', 'Beta'],
      }),
      connectionMode: 'intermediate-prefix',
    };
    const adapter = new MockFileSystemAdapter({ connections: [intermediateConnection] });
    render(<FileExplorerView adapter={adapter} target={target} />);

    await screen.findByText('דוח שנתי.pdf');
    const up = screen.getByRole('button', { name: 'תיקיית אב' });
    fireEvent.click(up);
    await screen.findByText('Reports');
    expect(up).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Alpha' })).not.toBeInTheDocument();
  });

  it('shows connection management only to admins while regular users can still connect', async () => {
    const regularAdapter = new MockFileSystemAdapter({ connections: [connection(shareTree())] });
    const { unmount } = render(
      <FileExplorerView adapter={regularAdapter} canManageConnections={false} target={target} />,
    );
    await screen.findByText('דוח שנתי.pdf');
    expect(screen.queryByRole('button', { name: /ניהול חיבורים/ })).not.toBeInTheDocument();
    unmount();

    const adminAdapter = new MockFileSystemAdapter({ connections: [connection(shareTree())] });
    render(<FileExplorerView adapter={adminAdapter} canManageConnections target={target} />);
    await screen.findByText('דוח שנתי.pdf');
    fireEvent.click(screen.getByRole('button', { name: /ניהול חיבורים/ }));
    expect(await screen.findByRole('heading', { name: 'ניהול חיבורים' })).toBeInTheDocument();
  });

  it('labels preview and download actions in both list and grid views', async () => {
    const reports = new MockDirectoryHandle('Reports', [
      new MockFileHandle('readme.txt', { type: 'text/plain' }),
      new MockFileHandle('deck.pptx', {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      }),
    ]);
    const exactConnection = connectionFor(target, reports, {
      prefixSegments: ['Alpha', 'Beta', 'Reports'],
    });
    const adapter = new MockFileSystemAdapter({ connections: [exactConnection] });
    render(<FileExplorerView adapter={adapter} target={target} />);

    expect((await screen.findByText('readme.txt')).closest('button')).toHaveTextContent('צפייה');
    expect(screen.getByText('deck.pptx').closest('button')).toHaveTextContent('הורדה');
    fireEvent.click(screen.getByRole('button', { name: 'תצוגת אריחים' }));
    expect(screen.getByText('readme.txt').closest('button')).toHaveTextContent('צפייה');
    expect(screen.getByText('deck.pptx').closest('button')).toHaveTextContent('הורדה');

    vi.spyOn(adapter, 'openFile').mockResolvedValue({
      action: 'downloaded',
      metadata: { kind: 'presentation', name: 'deck.pptx' },
    });
    fireEvent.click(screen.getByText('deck.pptx').closest('button'));
    expect(await screen.findByText(/אפשר לפתוח אותו ב־PowerPoint/)).toBeInTheDocument();
  });

  it('explains bounded recursive search and provides explicit cancellation', async () => {
    const adapter = new MockFileSystemAdapter({ connections: [connection(shareTree())] });
    let observedSignal;
    vi.spyOn(adapter, 'searchDirectory').mockImplementation((_handle, _query, { signal }) => {
      observedSignal = signal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')));
      });
    });
    render(<FileExplorerView adapter={adapter} target={target} />);
    await screen.findByText('דוח שנתי.pdf');

    const recursiveToggle = screen.getByText('חפש גם בתוך תיקיות משנה').closest('label');
    expect(recursiveToggle).toHaveAttribute(
      'title',
      expect.stringContaining('החיפוש עשוי להימשך זמן רב יותר'),
    );
    fireEvent.change(screen.getByPlaceholderText('חיפוש בתיקייה הנוכחית'), {
      target: { value: 'דוח' },
    });
    fireEvent.click(recursiveToggle.querySelector('input'));
    fireEvent.click(await screen.findByRole('button', { name: 'ביטול חיפוש' }));
    expect(observedSignal.aborted).toBe(true);
  });

  it('does not show an error while an asynchronously restored registry is loading', async () => {
    const gate = deferred();
    const root = shareTree();
    const adapter = new MockFileSystemAdapter({ connections: [connection(root)] });
    vi.spyOn(adapter, 'loadConnections')
      .mockImplementationOnce(() => gate.promise)
      .mockResolvedValue([connection(root)]);
    render(<FileExplorerView adapter={adapter} target={target} />);

    expect(await screen.findByText('טוענים את החיבורים השמורים…')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await act(async () => gate.resolve([connection(root)]));
    expect(await screen.findByText('דוח שנתי.pdf')).toBeInTheDocument();
  });

  it('prevents a stale first target from overwriting a newer route target', async () => {
    const firstGate = deferred();
    const firstRoot = shareTree();
    const secondTarget = parseFileExplorerTarget('\\\\Server-B\\Second Share\\Folder');
    const secondRoot = new MockDirectoryHandle('Second Share', [
      new MockDirectoryHandle('Folder', [new MockFileHandle('second.txt', { type: 'text/plain' })]),
    ]);
    const firstConnection = connection(firstRoot);
    const secondConnection = connectionFor(secondTarget, secondRoot, { id: 'second' });
    const adapter = new MockFileSystemAdapter();
    vi.spyOn(adapter, 'loadConnections')
      .mockImplementationOnce(() => firstGate.promise)
      .mockResolvedValue([secondConnection]);

    const { rerender } = render(<FileExplorerView adapter={adapter} target={target} />);
    rerender(<FileExplorerView adapter={adapter} target={secondTarget} />);
    expect(await screen.findByText('second.txt')).toBeInTheDocument();

    await act(async () => firstGate.resolve([firstConnection]));
    expect(screen.getByText('second.txt')).toBeInTheDocument();
    expect(screen.queryByText('דוח שנתי.pdf')).not.toBeInTheDocument();
  });

  it('opens a restored connection under React Strict Mode on the first render', async () => {
    const adapter = new MockFileSystemAdapter({ connections: [connection(shareTree())] });
    render(
      <StrictMode>
        <FileExplorerView adapter={adapter} target={target} />
      </StrictMode>,
    );
    expect(await screen.findByText('דוח שנתי.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
