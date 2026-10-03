---
name: helm-chart-authoring
description: Builds and debugs Helm 3 charts including Chart.yaml, typed values.schema.json, named templates in _helpers.tpl, subchart dependencies, hooks and helm-unittest suites. Use when packaging a service for helm install or helm upgrade, templating values, or fixing a chart that fails helm lint or renders empty manifests.
---

# Helm Chart Authoring

**Use when:** Creating or fixing a Helm chart that `helm install`/`helm upgrade` consumes, especially template logic, values schema or subchart wiring.
**Do not use when:** There is no cluster involved and you are packaging a function or a container for a PaaS; use `serverless-functions` instead.

## Instructions

1. Run `helm create`, then delete the sample scaffolding rather than shipping it. Keep `Chart.yaml`, `values.yaml`, `values.schema.json` and `templates/`.
2. Guard every template with `{{- if }}` and default every value access with `| default`, so a partial override renders valid output instead of `null` or an empty string.
3. Write `values.schema.json` with `additionalProperties: false` so a typo such as `replicaCount` versus `replica_count` fails at install time rather than silently falling back to the default.
4. Centralise names and labels in `_helpers.tpl` using `define` and `include`, then reference them everywhere as `include "api.fullname" .` so every object shares one identity.
5. Merge resource maps through a shared `common.tpl` from an internal library chart instead of hand-rolling `merge`/`default` logic in each template.
6. Put migration jobs behind `helm.sh/hook: pre-upgrade` with `hook-delete-policy: before-hook-creation`, and deploy with `--atomic` so a failed hook rolls the release back.
7. Commit `Chart.lock` and vendor dependencies into `charts/` in CI so `helm dependency build` is reproducible and works offline.
8. Keep `values.yaml` to safe defaults and put environment overrides in a separate `values-production.yaml`; never branch on `.Values.environment == "prod"` inside a template.
9. Add `helm-unittest` cases for the critical branches, including ingress disabled and autoscaling disabled, which are the paths nobody renders manually.
10. Validate with `helm lint --strict`, `helm template` against several value permutations, and `ct lint --all` so version bumps stay backward compatible.

## Patterns

`_helpers.tpl` with a single source of truth for identity and labels:

```gotemplate
{{- define "api.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "api.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "api.selectorLabels" -}}
app.kubernetes.io/name: {{ include "api.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "api.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{ include "api.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}
```

A Deployment template that degrades gracefully when optional features are off:

```gotemplate
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "api.fullname" . }}
  labels:
    {{- include "api.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "api.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      annotations:
        {{- if not .Values.autoscaling.enabled }}
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
        {{- end }}
      labels:
        {{- include "api.selectorLabels" . | nindent 8 }}
    spec:
      serviceAccountName: {{ include "api.fullname" . }}
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}@{{ .Values.image.digest }}"
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: {{ .Values.service.targetPort }}
          {{- if .Values.securityContext.enabled }}
          securityContext:
            {{- toYaml .Values.securityContext | nindent 12 }}
          {{- end }}
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
          readinessProbe:
            httpGet: { path: /health/ready, port: http }
---
{{- if .Values.ingress.enabled }}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ include "api.fullname" . }}
spec:
  {{- with .Values.ingress.className }}
  ingressClassName: {{ . }}
  {{- end }}
  tls:
    {{- toYaml .Values.ingress.tls | nindent 4 }}
  rules:
    {{- toYaml .Values.ingress.rules | nindent 4 }}
{{- end }}
```

A schema that rejects typos at install time rather than defaulting silently:

```json
{
  "$schema": "https://json-schema.org/draft-07/schema#",
  "type": "object",
  "additionalProperties": false,
  "required": ["image", "service"],
  "properties": {
    "replicaCount": { "type": "integer", "minimum": 0, "maximum": 200 },
    "image": {
      "type": "object",
      "additionalProperties": false,
      "required": ["repository", "digest"],
      "properties": {
        "repository": { "type": "string", "pattern": "^ghcr\\.io/[a-z0-9._/-]+$" },
        "digest": { "type": "string", "pattern": "^sha256:[a-f0-9]{64}$" },
        "pullPolicy": { "enum": ["Always", "IfNotPresent", "Never"] }
      }
    },
    "ingress": {
      "type": "object",
      "additionalProperties": false,
      "properties": { "enabled": { "type": "boolean" } }
    }
  }
}
```

## Checklist

- [ ] `helm lint --strict` and `ct lint --all` pass
- [ ] `values.schema.json` present with `additionalProperties: false`
- [ ] Every conditional block is guarded and every value has a `default`
- [ ] Names and labels come from `_helpers.tpl`, not hand-written per template
- [ ] Images pinned by digest; config changes force a restart via `checksum/config`
- [ ] Subcharts committed to `charts/` alongside a `Chart.lock`
- [ ] Unit tests cover the disabled-ingress and disabled-autoscaling branches
- [ ] `helm template` renders valid YAML under at least three value permutations

## Anti-patterns

- **`{{ .Values.foo.bar }}` with no guard.** When a user omits an optional block the template renders an empty value or throws, and the release half-applies. Wrap optional sections in `{{- if }}` and default everything else.
- **`count` over a list of objects in a template.** Adding an item in the middle renumbers every index and destroys and recreates resources. Key the resource on a stable name instead.
- **Secrets in `values.yaml`.** Helm stores release values in the cluster as a Secret, which protects them no more than whatever sits next to them. Use an external secrets operator and reference the resulting key.
- **A chart with no version bump.** Chart versions are how `helm upgrade` and `helm rollback` find history. Bumping `appVersion` without `version` makes the upgrade a no-op.
- **Testing only the happy value set.** Branches behind ingress, autoscaling and auth rarely execute. Render every permutation in CI, not just the defaults.