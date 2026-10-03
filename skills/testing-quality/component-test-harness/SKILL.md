---
name: component-test-harness
description: Builds a component test harness with Testing Library, user-event, Vitest browser mode, and provider wrappers. Use when a component's behaviour needs real DOM events and network mocking rather than jsdom or a full E2E run.
---

# Component Test Harness

**Use when:** you need to verify a component's interactive behaviour — typing, focus, validation, optimistic updates — with millisecond feedback and real DOM events.
**Do not use when:** the defect is a pixel or layout difference — use `visual-regression-testing`; or the flow requires navigation across pages and a backend — use `e2e-test-authoring`.

## Instructions

1. Test behaviour through the accessibility tree, not the implementation. If `getByRole('button', { name: 'Save' })` cannot find your element, the component is broken for users too.
2. Set up `userEvent.setup()` per test, not once per file, so fake timers and document state are isolated.
3. Never call `fireEvent` where `user-event` works: `fireEvent.click` does not move focus or fire the sequence a real click produces, hiding broken keyboard and focus behaviour.
4. Wrap the harness once. Export a `renderWithProviders` that mounts every context, router, and query client, so tests never re-implement provider setup.
5. Put the harness in `test/harness.tsx` and expose only `render`, `user`, and the standard queries — resist adding project-specific helpers that hide what the component does.
6. Query asynchronously (`findByRole`) for anything that awaits data, and assert with `waitForElementToBeRemoved` for spinners instead of fixed sleeps.
7. Run in Vitest browser mode when you need real layout, `:focus-visible`, or CSS containment — jsdom silently ignores all of it.
8. Mock HTTP with MSW, not by stubbing the data-fetching hook, so the component's real loading, error, and empty branches execute.
9. Keep one test per user-visible outcome. A single "renders correctly" test that clicks through five steps cannot tell you which behaviour broke.
10. Cap the suite: a component with more than ~8 tests is usually a sign the logic belongs in a hook or reducer, which should get its own unit tests.

## Patterns

Shared harness with providers and network mocking:

```tsx
// test/harness.tsx
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';

export function renderWithProviders(ui: ReactElement, { route = '/' }: { route?: string } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 }, mutations: { retry: false } },
  });
  const user = userEvent.setup();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...utils, user, queryClient };
}
```

```tsx
// src/features/checkout/PaymentForm.test.tsx
import { http, HttpResponse } from 'msw';
import { expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { server } from '../../../test/mocks/server';
import { renderWithProviders } from '../../../test/harness';
import { PaymentForm } from './PaymentForm';

it('shows a field error for an invalid card', async () => {
  const { user } = renderWithProviders(<PaymentForm onPaid={vi.fn()} />, { route: '/checkout' });

  await user.type(screen.getByLabelText('Card number'), '4242');
  await user.click(screen.getByRole('button', { name: 'Pay now' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Card number is invalid');
});

it('surfaces a server error and keeps the entered card', async () => {
  server.use(
    http.post('https://api.payments.test/charge', () =>
      HttpResponse.json({ message: 'issuer unavailable' }, { status: 503 }),
    ),
  );
  const { user } = renderWithProviders(<PaymentForm onPaid={vi.fn()} />, { route: '/checkout' });

  await user.type(screen.getByLabelText('Card number'), '4242424242424242');
  await user.click(screen.getByRole('button', { name: 'Pay now' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(/try again/i);
  expect(screen.getByLabelText('Card number')).toHaveValue('4242424242424242');
});
```

Vitest browser mode for cases jsdom cannot model:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser/providers';

export default defineConfig({
  test: {
    browser: { enabled: true, provider: playwright(), headless: true, instances: [{ browser: 'chromium' }] },
    setupFiles: ['./test/browser-setup.ts'],
    include: ['src/**/*.browser.test.tsx'],
  },
});
```

```ts
// src/components/Combobox.browser.test.tsx — focus and layout need a real engine
import { expect, it } from 'vitest';
import { page } from '@vitest/browser/context';
import { render } from './Combobox';

it('moves selection with the keyboard', async () => {
  render(<Combobox options={['alpha', 'beta']} />);
  await page.getByRole('combobox').focus();
  await page.getByRole('combobox').press('ArrowDown');
  expect(page.getByRole('option', { name: 'alpha' })).toHaveAttribute('aria-selected', 'true');
});
```

## Checklist

- [ ] Elements found by role, label, or text — not by test id or DOM structure
- [ ] `userEvent.setup()` created per test; no shared clipboard or pointer state
- [ ] `user-event` used everywhere instead of `fireEvent` for user actions
- [ ] Providers mounted by one shared `renderWithProviders` helper
- [ ] Loading, empty, error, and success states each have a case via MSW
- [ ] Async assertions use `findBy*`/`waitFor`, never fixed delays
- [ ] CSS-dependent behaviour runs in browser mode, not jsdom
- [ ] Logic extracted to hooks or reducers once a component exceeds ~8 tests

## Anti-patterns

**Props and state assertions.** `expect(props.onChange).toHaveBeenCalled()` couples the test to the component's internal contract and passes even when nothing renders. Fix: assert on visible output through the accessibility tree.

**A bespoke wrapper in every test file.** Each file wires its own MemoryRouter and QueryClient, so a provider change breaks forty files at once. Fix: one `renderWithProviders` used everywhere.

**jsdom for CSS-dependent behaviour.** jsdom has no layout engine, so `toBeVisible`, `:focus-visible`, and containment checks pass or fail for the wrong reasons. Fix: move those cases to browser mode.

**One giant interaction test.** Five flows in one test means the first assertion failure hides all later behaviour and re-running repeats everything. Fix: one user-visible outcome per test, setup shared through the harness.