---
name: data-visualization
description: Selects and builds correct charts and dashboards — choosing encodings, scales, honest axes, accessible color, and tabular fallbacks for screen readers. Use when creating a new chart or dashboard, fixing a misleading visualization, or making data viz accessible.
---

# Data Visualization

**Use when:** building a chart, dashboard, or KPI row, correcting a chart that misleads, or making an existing visualization usable with assistive technology.
**Do not use when:** the answer is a formatted table of static values with no graphical encoding, which is a straightforward table with caption and header semantics.

## Instructions

1. Start from the question the chart must answer, and write it as a sentence. "Which regions are growing fastest?" implies a sorted bar chart; "is there a trend?" implies a line chart over time. The question picks the encoding.
2. Pick the encoding that matches the data type: position on a common scale is most accurate, then length, then angle and area. Never encode a quantity by area when position is available.
3. Use a bar chart for categorical comparison, a line for continuous change over time, a scatterplot for correlation between two measures, a histogram for distribution, and a box plot for spread with outliers. Reject pie charts with more than two slices.
4. Start quantitative bar axes at zero. Truncated axes exaggerate differences and are a correctness failure, not a style choice.
5. Label directly and drop the legend when direct labeling is possible. Legends force constant eye travel between mark and key.
6. Use a sequential single-hue ramp for magnitude and a diverging ramp with a meaningful zero for change around a midpoint. Categorical palettes need distinct hues, and no more than about six before grouping.
7. Never rely on color alone: add direct labels, shapes, or patterns, and verify the chart in grayscale. A red/green diverging ramp fails for deuteranopia.
8. Provide a tabular equivalent for every chart — a real `<table>` with `<caption>`, `<th scope>`, and the actual values — so screen reader and copy-paste users get the data.
9. State units, time zone, and aggregation in the chart subtitle. "Revenue" with no currency or period is not interpretable.
10. Handle the honest cases explicitly: missing data drawn as gaps rather than zero, very long series aggregated or sampled with the method disclosed, and outliers called out rather than silently clipped.

## Patterns

Question-to-encoding map:

```markdown
QUESTION                        ENCODING                NOTES
which categories are largest?   horizontal bar, sorted   zero baseline, direct labels
how does it change over time?   line, x = time          no smoothing beyond 3pt
is there a relationship?        scatterplot              trend line only if r reported
what is the spread?             box plot                 n on the axis, outliers shown
what is the distribution?       histogram                bin width stated
how much of the whole?          stacked bar, 100%        only 2-5 components
change vs last period           diverging bars           neutral zero, +/- labels
single current value            stat tile + sparkline    no gauge, no donut
```

Accessible chart with a tabular equivalent:

```html
<figure>
  <figcaption id="chart-cap">
    Revenue by region, January to March 2026, US dollars, invoiced totals.
    Highest growth: APAC.
  </figcaption>

  <!-- SVG marked decorative: the table below carries the same data as text -->
  <svg role="img" aria-labelledby="chart-cap chart-desc" viewBox="0 0 640 300">
    <desc id="chart-desc">
      Horizontal bar chart. APAC 412,000 from 205,000; EMEA 388,000 from 360,000;
      AMER 344,000 from 352,000; LATAM 96,000 from 88,000.
    </desc>
    <!-- bars -->
  </svg>

  <details>
    <summary>View as table</summary>
    <table>
      <caption>Revenue by region, Jan to Mar 2026 (USD)</caption>
      <thead>
        <tr><th scope="col">Region</th><th scope="col">January</th>
            <th scope="col">March</th><th scope="col">Change</th></tr>
      </thead>
      <tbody>
        <tr><th scope="row">APAC</th><td>205,000</td><td>412,000</td><td>+101%</td></tr>
        <tr><th scope="row">EMEA</th><td>360,000</td><td>388,000</td><td>+8%</td></tr>
        <tr><th scope="row">AMER</th><td>352,000</td><td>344,000</td><td>-2%</td></tr>
        <tr><th scope="row">LATAM</th><td>88,000</td><td>96,000</td><td>+9%</td></tr>
      </tbody>
    </table>
  </details>
</figure>
```

Sequential and diverging ramps with accessible steps:

```css
/* sequential: single hue, lightness-ordered (magnitude) */
--seq-100: oklch(0.95 0.03 250);
--seq-300: oklch(0.80 0.08 250);
--seq-500: oklch(0.62 0.13 250);
--seq-700: oklch(0.45 0.12 250);
--seq-900: oklch(0.30 0.08 250);

/* diverging: blue-grey-orange, distinguishable without red/green */
--div-neg-strong: oklch(0.45 0.13 250);
--div-neg-soft:   oklch(0.85 0.05 250);
--div-zero:       oklch(0.97 0 0);
--div-pos-soft:   oklch(0.88 0.09 70);
--div-pos-strong: oklch(0.58 0.15 60);
```

Chart rules and honest defaults:

```markdown
BAR AXIS      start at 0; otherwise state the truncation in the subtitle
LINE SERIES   no dual y-axes; two scales invite false correlation
MISSING DATA  gap in the line + annotation; never plotted as 0
SAMPLE SIZE   state n per point; 4-point smoothed lines hide real variance
TOOLTIP       hover AND keyboard-focus reachable; also present in the table
REFRESH       show "updated 4 min ago"; never animate the whole chart on poll
COLOR COUNT   <=6 categorical hues; beyond that, group or facet
GRIDLINES     light, horizontal only; never both x and y gridlines
```

## Checklist

- [ ] Chart answers a written question and the encoding matches it
- [ ] Bar axes start at zero; missing data drawn as gaps, never as zeros
- [ ] Units, period, time zone, and aggregation stated in the subtitle
- [ ] Direct labels used instead of a legend, with tooltips reachable by keyboard
- [ ] Sequential ramp for magnitude, diverging ramp with meaningful zero for change
- [ ] Chart verified in grayscale and for color-vision deficiency
- [ ] Tabular equivalent present with caption, header scope, and real values
- [ ] `n` per point stated for averages and smoothed series

## Anti-patterns

**Truncated bar axis.** Bars starting at 90 make a 2% difference look like a doubling. This is a chart that lies about magnitude. Fix: start at zero; if the interesting range is narrow, use a line chart or annotate the axis break explicitly.

**Pie chart with six slices.** Angle and area are the least accurate encodings, and the slices are impossible to compare without moving the labels. Fix: sorted horizontal bars, which are directly comparable on a common baseline.

**Rainbow categorical palette.** Twelve hues, adjacent ones indistinguishable, and it fails in grayscale and for color-blind users. Fix: cap at six hues and group the rest, or facet into small multiples.

**Chart-only accessibility.** An SVG with no text alternative, so the data is unavailable to screen reader users and to anyone trying to copy a number. Fix: always ship the table; mark the SVG's role and provide a description.

**Dual y-axis.** Two series scaled independently on the same plot, manufacturing or hiding correlation at will. Fix: two stacked charts sharing an x axis, or plot the derived ratio directly.