import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { AppProvider } from '../store/AppContext';
import { installFetchMock, NOW } from './fixtures';
import { clearHttpCache } from '../adapters/http';
import { STORAGE_KEYS } from '../config';
import { DEFAULT_VAULT } from '../lib/storage';

function mount() {
  return render(
    <AppProvider autoPoll={false} clock={() => NOW}>
      <App />
    </AppProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  clearHttpCache();
  history.replaceState(null, '', '/#today');
  window.scrollTo = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});

describe('E2E primary user journey', () => {
  it('open → hourly briefing → deep dive (auto-read) → term → AI follow-up → frame it → source → archive → opportunities → checklist → knowledge hub', async () => {
    localStorage.setItem(STORAGE_KEYS.vault, JSON.stringify({ ...DEFAULT_VAULT, gemini: 'test-key' }));
    installFetchMock();
    const user = userEvent.setup();
    mount();

    // 1. Live hourly IST briefing
    await user.click(screen.getByRole('button', { name: /Poll Live News Now/i }));
    const headline = await screen.findByRole('button', { name: /^RBI keeps repo rate unchanged/ }, { timeout: 4000 });
    expect(screen.getByText(/10:00–10:59 AM IST/)).toBeInTheDocument();
    expect(screen.getAllByText(/No verified stories collected in this hour window/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Live web/i).length).toBeGreaterThan(0);

    // 2. Deep story — auto-marks read
    await user.click(headline);
    expect(await screen.findByText(/Plain-English TL;DR/i, {}, { timeout: 4000 })).toBeInTheDocument();
    await waitFor(() => {
      const u = JSON.parse(localStorage.getItem(STORAGE_KEYS.user)!);
      expect(Object.keys(u.readMap)).toHaveLength(1);
    });
    expect(screen.getByText(/written by Gemini/)).toBeInTheDocument();
    expect(screen.getByText(/Entrepreneur’s Lens/)).toBeInTheDocument();

    // 3. Interactive term
    const termBtn = screen.getAllByRole('button', { name: /^repo rate$/i })[0];
    await user.click(termBtn);
    const drawer = screen.getByRole('complementary', { name: /Research drawer/i });
    expect(await within(drawer).findByText(/17yo everyday analogy/i)).toBeInTheDocument();

    // 4. Contextual AI follow-up
    await user.click(within(drawer).getByRole('button', { name: /Story AI Research Chat/i }));
    await user.click(within(drawer).getByRole('button', { name: /Who benefits most\?/i }));
    expect(await within(drawer).findByText(/Borrowers and banks benefit most/)).toBeInTheDocument();
    expect(within(drawer).getByText(/Answered by Gemini/)).toBeInTheDocument();
    await user.click(within(drawer).getByRole('button', { name: /Close drawer/i }));

    // 5. Frame it my way
    await user.type(screen.getByLabelText('My framing'), 'RBI chilled on rates. EMIs same for now.');
    await user.click(screen.getByRole('button', { name: /Save my framing/i }));
    expect(screen.getByText(/Saved to My Knowledge/)).toBeInTheDocument();

    // 6. Source link verification
    const src = screen.getByRole('link', { name: /Reserve Bank of India ↗/ });
    expect(src).toHaveAttribute('href', 'https://www.rbi.org.in/pr/1');

    // 7. Historical archive (yesterday's story lives here, not in today)
    await user.click(screen.getByRole('button', { name: /Back to Intelligence Feed/i }));
    await user.click(await screen.findByRole('button', { name: /Historical Archive/i }));
    expect(await screen.findByText(/GST council meeting outcome/)).toBeInTheDocument();
    expect(screen.getAllByText(/Archive record/i).length).toBeGreaterThan(0);

    // 8. Global opportunity engine — idea-stage + India-eligible
    await user.click(screen.getByRole('button', { name: /Global Opportunity Engine/ }));
    await user.selectOptions(screen.getByLabelText('Stage'), 'Idea');
    await user.selectOptions(screen.getByLabelText('Eligibility'), 'india');
    expect(screen.queryByText('D-Prize Global Competition 2026/27')).toBeInTheDocument();
    expect(screen.queryByText('L’Oréal Brandstorm 2027')).not.toBeInTheDocument(); // India eligibility unclear → filtered
    const thielCard = screen.getByText('Thiel Fellowship').closest('div.rounded-2xl') as HTMLElement;
    await user.click(within(thielCard).getByRole('button', { name: /21-Point Sheet/ }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/21 · /)).toBeInTheDocument();
    expect(within(dialog).getByText('$200,000 spread over two years')).toBeInTheDocument();

    // 9. Check off submission items + update stage
    await user.click(within(dialog).getByLabelText(/Online application/));
    await user.selectOptions(within(dialog).getByLabelText('Tracker stage'), 'Drafting Application');
    expect(within(dialog).getByText(/1\/3 Done/)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });

    // 10. Verify in My Knowledge hub
    await user.click(screen.getByRole('button', { name: /My Knowledge & Tracker/ }));
    expect(await screen.findByText(/Opportunity Application Tracker/)).toBeInTheDocument();
    const row = screen.getAllByText('Thiel Fellowship').map((n) => n.closest('tr')).find(Boolean)!;
    expect(within(row).getByText('1/3 Done')).toBeInTheDocument();
    expect((within(row).getByRole('combobox') as HTMLSelectElement).value).toBe('Drafting Application');
    expect(screen.getByText(/RBI chilled on rates/)).toBeInTheDocument();
    expect(screen.getAllByText(/RBI keeps repo rate unchanged/).length).toBeGreaterThan(0); // read history
  }, 20000);

  it('read/unread and application checklist state persist across reloads', async () => {
    installFetchMock();
    const user = userEvent.setup();
    const { unmount } = mount();
    await user.click(screen.getByRole('button', { name: /Poll Live News Now/i }));
    await screen.findByRole('button', { name: /^Sensex climbs/ }, { timeout: 4000 });
    const unreadBadges = screen.getAllByRole('button', { name: /● Unread/ });
    await user.click(unreadBadges[0]);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    // tick a checklist item on an opportunity
    await user.click(screen.getByRole('button', { name: /Global Opportunity Engine/ }));
    const card = screen.getByText('Emergent Ventures India').closest('div.rounded-2xl') as HTMLElement;
    await user.click(within(card).getByRole('button', { name: /21-Point Sheet/ }));
    await user.click(within(screen.getByRole('dialog')).getByLabelText(/EV online application/));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    unmount();
    history.replaceState(null, '', '/#today');
    const second = mount();
    expect(await screen.findAllByRole('button', { name: /✓ Read/ }, { timeout: 4000 })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: /My Knowledge & Tracker/ }));
    const row = (await screen.findAllByText('Emergent Ventures India')).map((n) => n.closest('tr')).find(Boolean)!;
    expect(within(row).getByText('1/3 Done')).toBeInTheDocument();
    second.unmount();
  });
});
