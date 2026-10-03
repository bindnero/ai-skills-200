---
name: metrics-and-alerting
description: Defines Prometheus metrics with the RED method, controls cardinality, and writes recording and multi-window multi-burn-rate alerting rules. Use when adding a metric, tuning an SLO alert, or when Prometheus is high-cardinality, expensive, or paging on noise.
---

# Metrics and Alerting

**Use when:** Adding a metric, defining or tuning Prometheus alerts, or fixing a Prometheus instance that is expensive, high-cardinality, or paging on non-actionable noise.
**Do not use when:** You are deciding the reliability target itself; use `sre-slos` for SLI and error-budget policy.

## Instructions

1. Instrument inbound requests with the RED method: rate, errors, duration. Add saturation and business metrics only where an operator would actually act on them.
2. Name metrics with a namespace, subsystem and unit suffix such as `http_server_request_duration_seconds`, and never mix units under one name.
3. Keep labels bounded. Do not label by user id, full URL path, email or raw exception message; put those in logs and traces where cardinality is affordable.
4. Choose histogram buckets from observed percentiles, not guesses, and include the bucket edges your SLO is expressed at.
5. Write recording rules for anything used by more than one alert, so the expensive query is computed once per interval rather than per alert.
6. Alert on symptom, not cause. Alerting on CPU saturation generates pages for conditions that are normal under load; alert on error budget burn rate instead.
7. Use multi-window multi-burn-rate alerts: page on a fast burn over a short window, and open a ticket on a slow burn over a long window.
8. Attach a runbook URL, the owning team and a dashboard link to every alert annotation. An alert with no runbook is an alert nobody can action.
9. Route by severity so `severity: ticket` never reaches the pager, and make `severity: page` mean only that a user-visible SLO is burning.
10. Replay historical data with `promtool tsdb create-blocks-from openmetrics` to confirm the rule set fires when it should and stays silent otherwise.

## Patterns

Metric definition and a handler that produces bounded labels:

```go
var httpRequests = prometheus.NewCounterVec(
	prometheus.CounterOpts{
		Namespace: "http_server", Subsystem: "requests", Name: "total",
		Help: "Total HTTP requests by route template, method and status class.",
	},
	[]string{"route", "method", "status_class"}, // route = template, never the raw path
)

var httpDuration = prometheus.NewHistogramVec(
	prometheus.HistogramOpts{
		Namespace: "http_server", Subsystem: "request", Name: "duration_seconds",
		Help:      "HTTP request duration in seconds.",
		Buckets:   []float64{0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10},
	},
	[]string{"route", "method"},
)

func Instrument(route string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		httpRequests.WithLabelValues(route, r.Method, rec.statusClass()).Inc()
		httpDuration.WithLabelValues(route, r.Method).Observe(time.Since(start).Seconds())
	})
}
```

Recording rules that precompute the expensive parts of the SLO query:

```yaml
groups:
  - name: api-slo-recording
    interval: 30s
    rules:
      - record: job:http_requests:rate5m
        expr: sum by (service) (rate(http_server_requests_total[5m]))

      - record: job:http_errors:rate5m
        expr: |
          sum by (service) (rate(http_server_requests_total{status_class=~"5.."}[5m]))

      - record: job:http_request_error_ratio:rate5m
        expr: job:http_errors:rate5m / job:http_requests:rate5m

      - record: job:http_request_error_ratio:rate1h
        expr: |
          sum by (service) (rate(http_server_requests_total{status_class=~"5.."}[1h]))
          / sum by (service) (rate(http_server_requests_total[1h]))
```

Multi-window multi-burn-rate alerting on the recorded ratio, with a ticket-level slow burn:

```yaml
  - name: api-slo-multiwindow
    rules:
      - alert: ApiErrorBudgetFastBurn
        expr: |
          (job:http_request_error_ratio:rate5m > (14.4 * 0.001)
           and job:http_request_error_ratio:rate1h > (14.4 * 0.001))
          or
          (job:http_request_error_ratio:rate5m > (6 * 0.001)
           and job:http_request_error_ratio:rate6h > (6 * 0.001))
        for: 2m
        labels:
          severity: page
          service: api
        annotations:
          summary: "API error budget burning 6x-14.4x faster than sustainable"
          runbook_url: "https://runbooks.acme.com/api/error-budget-burn"
          dashboard: "https://grafana.acme.com/d/api-slo"

      - alert: ApiErrorBudgetSlowBurn
        expr: |
          (job:http_request_error_ratio:rate6h > (3 * 0.001)
           and job:http_request_error_ratio:rate1d > (3 * 0.001))
        for: 15m
        labels:
          severity: ticket
        annotations:
          summary: "API error budget burn rate elevated; remaining budget is shrinking"
          runbook_url: "https://runbooks.acme.com/api/error-budget-burn"
```

## Checklist

- [ ] Every metric has a namespace, unit suffix and documented help text
- [ ] RED metrics present on every inbound request path
- [ ] Label values bounded; no user ids, emails or raw paths
- [ ] Histogram buckets include the percentiles your SLO is stated at
- [ ] Recording rules used for queries referenced by more than one alert
- [ ] Alerts are multi-window multi-burn-rate, not single-threshold
- [ ] Every alert has `severity`, `runbook_url` and a dashboard link
- [ ] Routing configured so `severity: ticket` never reaches the pager

## Anti-patterns

- **Alerting on CPU or memory utilisation.** Saturation is normal at peak and the alert either never fires or fires constantly. Alert on user-visible symptoms: errors, latency, or budget burn.
- **Labelling metrics with user id, request id or full URL.** Each unique value creates a new time series and eventually takes Prometheus down. Keep high-cardinality data in logs and traces.
- **A single-threshold alert on an SLO.** One bad scrape or a 30-second blip pages you. Multi-window multi-burn-rate requires the burn to persist across two independent windows.
- **`status` labelled as an exact code.** Hundreds of rare codes explode cardinality. Label by status class (`2xx`, `4xx`, `5xx`) unless you genuinely need per-code analysis.
- **Alerts with no runbook and no owner.** When it fires at 3am nobody knows what to do, so the only safe action is to ignore it. Link the runbook and set the owning team in the routing.