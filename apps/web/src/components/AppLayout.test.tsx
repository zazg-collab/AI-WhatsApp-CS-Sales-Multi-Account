import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppLayout } from './AppLayout';
import { setPathname } from '../../vitest.setup';

describe('AppLayout', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setPathname('/dashboard');
  });

  it('renders the sidebar and its children', () => {
    render(
      <AppLayout>
        <p>Page body</p>
      </AppLayout>,
    );
    expect(screen.getByText('Page body')).toBeInTheDocument();
    expect(screen.getByText('Inbox')).toBeInTheDocument(); // from Sidebar
  });
});
