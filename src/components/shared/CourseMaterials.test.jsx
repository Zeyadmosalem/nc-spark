import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  useCourseMaterials: vi.fn(),
  addFile: vi.fn(), addLink: vi.fn(), remove: vi.fn(),
  materialUrl: vi.fn(),
  state: { addFile: { isPending: false, error: null } },
}));

const asMutation = (spy, extra = {}) => ({
  mutate: spy,
  mutateAsync: (...args) => { spy(...args); return Promise.resolve({}); },
  isPending: false,
  error: null,
  ...extra,
});

vi.mock('../../hooks/useMaterials', () => ({
  useCourseMaterials: mocks.useCourseMaterials,
  useAddMaterialFile: () => asMutation(mocks.addFile, mocks.state.addFile),
  useAddMaterialLink: () => asMutation(mocks.addLink),
  useRemoveMaterial: () => asMutation(mocks.remove),
}));
vi.mock('../../api/materials', () => ({ materialUrl: mocks.materialUrl }));

const CourseMaterials = (await import('./CourseMaterials')).default;

const query = (data, over) => ({ data, isLoading: false, error: null, ...over });
const varsOf = (spy) => spy.mock.calls.at(-1)?.[0];

const pdf = {
  id: 'm1', courseId: 'c1', name: 'Fire Handbook', kind: 'pdf',
  storagePath: 'c1/1-handbook.pdf', externalUrl: null, sizeBytes: 2_100_000,
};
const link = {
  id: 'm2', courseId: 'c1', name: 'Regulations', kind: 'link',
  storagePath: null, externalUrl: 'https://gov.example/reg', sizeBytes: null,
};

let openSpy;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.useCourseMaterials.mockReturnValue(query([]));
  mocks.materialUrl.mockResolvedValue('https://signed/x');
  mocks.state.addFile = { isPending: false, error: null };
  openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
});
afterEach(() => openSpy.mockRestore());

describe('the list', () => {
  it('shows a file with its type and readable size', () => {
    mocks.useCourseMaterials.mockReturnValue(query([pdf]));
    render(<CourseMaterials courseId="c1" />);
    const row = screen.getByText('Fire Handbook').closest('.data-row');
    expect(within(row).getByText(/PDF · 2\.0 MB/)).toBeInTheDocument();
  });

  it('labels a link differently from a download', () => {
    mocks.useCourseMaterials.mockReturnValue(query([pdf, link]));
    render(<CourseMaterials courseId="c1" />);
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open link' })).toBeInTheDocument();
  });

  /**
   * The bucket is private, so a stored file has no permanent URL. Signing the
   * whole list on render would mint a URL for every file whether or not anyone
   * wanted it, and they would be stale by the time they were used.
   */
  it('signs a file only when it is opened', async () => {
    mocks.useCourseMaterials.mockReturnValue(query([pdf]));
    render(<CourseMaterials courseId="c1" />);
    expect(mocks.materialUrl).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Download' }));
    await waitFor(() => expect(mocks.materialUrl).toHaveBeenCalledWith(pdf));
  });

  // Without noopener the opened page can reach back through window.opener.
  it('opens in a new tab without handing over a window reference', async () => {
    mocks.useCourseMaterials.mockReturnValue(query([pdf]));
    render(<CourseMaterials courseId="c1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Download' }));
    await waitFor(() => expect(openSpy).toHaveBeenCalledWith(
      'https://signed/x', '_blank', 'noopener,noreferrer',
    ));
  });

  it('says so when a signed link cannot be minted', async () => {
    mocks.useCourseMaterials.mockReturnValue(query([pdf]));
    mocks.materialUrl.mockRejectedValue(new Error('Object not found'));
    render(<CourseMaterials courseId="c1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Object not found');
  });

  it('shows a load failure rather than an empty shelf', () => {
    mocks.useCourseMaterials.mockReturnValue(query(undefined, { error: new Error('nope') }));
    render(<CourseMaterials courseId="c1" />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Could not load the course materials/);
  });
});

describe('what a trainee can do', () => {
  it('sees no add or remove controls', () => {
    mocks.useCourseMaterials.mockReturnValue(query([pdf]));
    render(<CourseMaterials courseId="c1" />);
    expect(screen.queryByRole('button', { name: '+ Add material' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });

  // The empty state should not tell a trainee to upload something.
  it('gets an empty state addressed to them', () => {
    render(<CourseMaterials courseId="c1" />);
    expect(screen.getByText(/Your trainer has not added any handouts/)).toBeInTheDocument();
  });
});

describe('what a manager can do', () => {
  it('gets an empty state addressed to them', () => {
    render(<CourseMaterials courseId="c1" canManage />);
    expect(screen.getByText(/Upload a handout, or link to something/)).toBeInTheDocument();
  });

  it('uploads a file', async () => {
    render(<CourseMaterials courseId="c1" canManage />);
    await userEvent.click(screen.getByRole('button', { name: '+ Add material' }));

    const file = new File(['x'], 'handbook.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('File'), file);
    await userEvent.type(screen.getByLabelText(/^Name/), 'Fire Handbook');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(varsOf(mocks.addFile)).toMatchObject({ courseId: 'c1', name: 'Fire Handbook' });
  });

  /**
   * The field draws the filename itself, because the input that would
   * normally show it is hidden to keep the browser's own button off a form
   * that looks nothing like it. So the name has to come from somewhere, and
   * this is the assertion that it still does.
   */
  it('names the chosen file, and says so when there is none', async () => {
    render(<CourseMaterials courseId="c1" canManage />);
    await userEvent.click(screen.getByRole('button', { name: '+ Add material' }));
    expect(screen.getByText('No file chosen')).toBeInTheDocument();

    await userEvent.upload(
      screen.getByLabelText('File'),
      new File(['x'], 'evacuation-plan.pdf', { type: 'application/pdf' }),
    );

    expect(screen.getByText('evacuation-plan.pdf')).toBeInTheDocument();
    expect(screen.queryByText('No file chosen')).not.toBeInTheDocument();
  });

  it('adds a link instead', async () => {
    render(<CourseMaterials courseId="c1" canManage />);
    await userEvent.click(screen.getByRole('button', { name: '+ Add material' }));
    await userEvent.click(screen.getByRole('button', { name: 'Link to something' }));
    await userEvent.type(screen.getByLabelText('Address'), 'https://gov.example/reg');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(varsOf(mocks.addLink)).toMatchObject({
      courseId: 'c1', url: 'https://gov.example/reg',
    });
  });

  it('will not submit an empty form', async () => {
    render(<CourseMaterials courseId="c1" canManage />);
    await userEvent.click(screen.getByRole('button', { name: '+ Add material' }));
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });

  // Removing takes a handout away from everyone on the course.
  it('does not remove on the first click', async () => {
    mocks.useCourseMaterials.mockReturnValue(query([pdf]));
    render(<CourseMaterials courseId="c1" canManage />);
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(mocks.remove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Remove for good' }));
    expect(varsOf(mocks.remove)).toEqual({
      id: 'm1', courseId: 'c1', storagePath: 'c1/1-handbook.pdf',
    });
  });

  it('surfaces a refused upload', async () => {
    mocks.state.addFile = {
      isPending: false,
      error: new Error('Only PDF, Word, PowerPoint and Excel files can be uploaded.'),
    };
    render(<CourseMaterials courseId="c1" canManage />);
    await userEvent.click(screen.getByRole('button', { name: '+ Add material' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Only PDF, Word, PowerPoint/);
  });
});
