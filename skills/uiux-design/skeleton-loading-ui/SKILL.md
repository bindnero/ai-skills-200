---
name: skeleton-loading-ui
description: Designs loading placeholders that match final layout, prevent layout shift, and set honest timing expectations without fake progress bars. Use when a view waits on data before rendering, when perceived performance is the complaint, or when spinners make an interface feel unpredictable.
---

# Skeleton Loading UI

**Use when:** a view cannot render until data arrives and the wait is long enough to be felt, or when a spinner is the only thing on screen during a slow load.
**Do not use when:** the wait is under roughly 300 ms and a placeholder would flash - use `microinteraction-design`; the content is genuinely absent rather than pending - use `empty-state-design`.

## Instructions

1. Reserve the space before the data exists. Skeletons exist to hold the final layout so content arriving causes no reflow; if the placeholder does not match the real geometry, it has defeated its only purpose.
2. Match the real content's structure, not a generic grey rectangle. Reproduce the line lengths, the image aspect ratio, the number of rows, and the column alignment that the loaded state will produce.
3. Skip the placeholder for fast responses. Render nothing for the first 200-300 ms, then show a skeleton, so quick loads do not flash a grey screen that the user never needed to see.
4. Reserve height from a known container. Fixed-height rows, `aspect-ratio` on media, and a documented row count prevent cumulative layout shift when data lands.
5. Reflect real progress only. A determinate progress bar implies a known fraction of work; when the client cannot know the percentage, use an indeterminate bar or skeleton and say nothing about completion.
6. Animate at low cost. One opacity pulse between two shades, GPU-friendly, under 1.5 seconds per cycle. Skip the animation entirely for `prefers-reduced-motion`.
7. Keep skeletons inside the region that is loading. A full-page skeleton on every navigation discards the user's sense of place and doubles the perceived work.
8. Announce the state. Mark the loading region `aria-busy="true"` and give it a label, so screen reader users are told the content is pending rather than hearing nothing at all.
9. Design the error and empty outcomes first. A skeleton that never resolves into an error state is worse than a spinner, because the user waits on a promise the system has already abandoned.
10. Prove it. Measure CLS before and after, and check that the skeleton is not taller or shorter than the loaded content by more than a few pixels.

## Patterns

A skeleton whose geometry is derived from the same layout as the loaded state:

```tsx
// One source of truth for row geometry, so the placeholder and the real
// content cannot drift apart.
const ROW = { height: 72, avatar: 40, gap: 12 } as const;

export function Feed({ state }: { state: LoadState<Post> }) {
  if (state.kind === "error") return <ErrorState error={state.error} />;
  if (state.kind === "empty") return <EmptyFeed />;
  if (state.kind === "loaded") return state.posts.map((p) => <PostRow key={p.id} post={p} />);

  return (
    <ul aria-busy="true" aria-label="Loading posts" className="feed">
      {Array.from({ length: state.placeholderRows }, (_, i) => (
        <li key={i} className="feed__row skeleton" style={{ height: ROW.height }}>
          <span className="skeleton__block" style={{ width: ROW.avatar, height: ROW.avatar }} />
          <span className="skeleton__lines">
            <span className="skeleton__line" style={{ width: "60%" }} />
            <span className="skeleton__line" style={{ width: "40%" }} />
          </span>
        </li>
      ))}
    </ul>
  );
}
```

```css
.feed__row { display: flex; align-items: center; gap: 12px; padding: 16px 0; }

.skeleton__block,
.skeleton__line {
  background: linear-gradient(90deg, var(--surface-2) 0%, var(--surface-3) 50%, var(--surface-2) 100%);
  background-size: 200% 100%;
  border-radius: var(--radius-sm);
  animation: skeleton-shimmer 1.4s ease-in-out infinite;
}

.skeleton__line { height: 12px; display: block; }
.skeleton__lines { display: grid; gap: 8px; flex: 1; }

@keyframes skeleton-shimmer {
  from { background-position: 200% 0; }
  to   { background-position: -200% 0; }
}

/* Media slots reserve their aspect ratio so nothing shifts when the image lands. */
.skeleton__media { display: block; width: 100%; aspect-ratio: 16 / 9; }

@media (prefers-reduced-motion: reduce) {
  .skeleton__block, .skeleton__line { animation: none; }
}
```

Delaying the placeholder so fast loads never flash:

```tsx
import { useEffect, useState } from "react";

const SKELETON_DELAY_MS = 250;

export function DelayedSkeleton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!pending) { setShow(false); return; }
    const timer = setTimeout(() => setShow(true), SKELETON_DELAY_MS);
    return () => clearTimeout(timer);   // data arrived inside the window: never shown
  }, [pending]);

  return (
    <>
      {show ? <FeedSkeleton /> : null}
      <div hidden={show} aria-busy={pending}>{children}</div>
    </>
  );
}
```

## Checklist

- [ ] Skeleton geometry matches the loaded content's real line lengths, ratios, and row count
- [ ] Heights and aspect ratios reserved so arrival causes no layout shift
- [ ] Placeholder delayed by 200-300 ms so fast loads do not flash it
- [ ] No determinate progress shown unless the fraction is genuinely known
- [ ] Animation is a single subtle shimmer and disabled under `prefers-reduced-motion`
- [ ] Loading region scoped to the content that is loading, not the whole page
- [ ] Region marked `aria-busy` with an accessible label
- [ ] Error and empty states designed alongside the loading state
- [ ] CLS measured before and after the change

## Anti-patterns

**Skeleton geometry that does not match the content.** A uniform grey card for a list whose real rows are a different height guarantees a layout shift the moment data arrives, so the placeholder adds motion instead of removing it. Derive both from one shared layout definition.

**Fake progress percentages.** A bar sweeping to 90% and then jumping to 100% teaches users that the number is decoration, and it destroys trust in every real progress indicator in the product. Use an indeterminate state when the client cannot know the work.

**Skeleton on every navigation.** Blanking the whole screen for a 150 ms transition throws away the user's spatial context and feels slower than the wait it covers. Reserve the region and keep stable chrome visible.

**A skeleton with no failure exit.** When the request fails, the placeholder stays on screen indefinitely and the user has no way forward. Resolve into an error or empty state, always.

**Skeleton that ignores reduced-motion.** Continuous shimmering is a motion trigger for vestibular-sensitive users. Stop the animation under `prefers-reduced-motion` and keep a static placeholder.
