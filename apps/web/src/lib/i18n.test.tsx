import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LanguageProvider, useT, useLang, type Dict } from './i18n';

const dict: Dict = {
  greeting: { id: 'Halo', en: 'Hello' },
  picked: { id: '{n} dipilih', en: '{n} selected' },
};

function Probe() {
  const t = useT(dict);
  const { lang, setLang } = useLang();
  return (
    <div>
      <span data-testid="greeting">{t('greeting')}</span>
      <span data-testid="picked">{t('picked', { n: 3 })}</span>
      <span data-testid="missing">{t('does.not.exist')}</span>
      <span data-testid="lang">{lang}</span>
      <button onClick={() => setLang('id')}>ID</button>
    </div>
  );
}

describe('i18n', () => {
  it('defaults to English when no provider is mounted', () => {
    render(<Probe />);
    expect(screen.getByTestId('greeting')).toHaveTextContent('Hello');
    expect(screen.getByTestId('lang')).toHaveTextContent('en');
  });

  it('interpolates {vars} and falls back to the raw key when missing', () => {
    render(<Probe />);
    expect(screen.getByTestId('picked')).toHaveTextContent('3 selected');
    expect(screen.getByTestId('missing')).toHaveTextContent('does.not.exist');
  });

  it('switches every phrase to Indonesian via the provider', async () => {
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByTestId('greeting')).toHaveTextContent('Hello');
    await userEvent.click(screen.getByRole('button', { name: 'ID' }));
    expect(screen.getByTestId('lang')).toHaveTextContent('id');
    expect(screen.getByTestId('greeting')).toHaveTextContent('Halo');
    expect(screen.getByTestId('picked')).toHaveTextContent('3 dipilih');
  });
});
