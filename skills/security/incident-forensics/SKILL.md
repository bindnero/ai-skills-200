---
name: incident-forensics
description: Investigates security incidents by preserving volatile evidence, establishing timeline and blast radius, containing spread, and producing defensible findings. Use when responding to suspected account takeover, unauthorized access, data exfiltration, or a breach requiring root cause analysis.
---

# Incident Forensics

**Use when:** responding to a suspected compromise — unauthorized access, account takeover, data exfiltration, a critical vulnerability found in production, or a breach requiring root cause analysis.
**Do not use when:** auditing code or planning an authorized assessment — use `secure-coding-review` or `penetration-test-planning`.

## Instructions

1. Declare the incident and establish the commander, the scribe, and the technical lead. Open a written timeline immediately and record every action with a timestamp in UTC; narrative reconstruction after the fact is unreliable.
2. Preserve volatile evidence before containment: running processes, network connections, memory, and loaded modules. Then snapshot the disk and capture container images or filesystem layers for the affected hosts before restarting anything.
3. Collect logs from every relevant source with a consistent clock reference — application, reverse proxy, WAF, database audit, authentication events, cloud control-plane, and CI/CD — and verify time synchronization across hosts, since skewed clocks destroy correlation.
4. Establish scope by answering who, what, when, and how many. Identify affected accounts, tenants, records, and systems, and quantify exposure of regulated data so the notification clock can start on time.
5. Build the timeline from evidence, not assumption: first malicious action, persistence mechanism, privilege escalation, lateral movement, data access, and exfiltration. Mark every inference explicitly and distinguish confirmed facts from hypotheses.
6. Determine the entry vector: stolen credential, unpatched dependency, exposed endpoint, misconfiguration, or insider. Trace from the initial foothold forward so containment targets the actual path rather than one server.
7. Contain in proportion and in order: revoke credentials and tokens, then block the vector, then isolate hosts. Avoid destructive actions that would destroy evidence before it is captured, and record the justification for each containment step.
8. Eradicate the root cause and every persistence path — modified code, added cron or systemd units, new IAM roles, changed DNS, injected dependencies, web shells, altered build artifacts — and verify removal rather than assuming it.
9. Recover with verified-clean artifacts, monitor for re-entry indicators for an extended window, and define the exit criteria that end the incident.
10. Write the post-incident report: timeline, root cause, blast radius, what made detection and containment slow, and specific remediations with owners and dates. Report to affected parties per applicable obligations, on time.

## Patterns

Declared incident and timeline:

```text
INC-2026-014   Severity: SEV-1   Declared: 2026-02-02T09:14Z   Commander: <name>
Summary: anomalous token use from ASN <x> on /api/v1/admin; scope under assessment
09:14Z  Alert fired: 5x admin API calls from new ASN in 60s
09:16Z  Declared SEV-1; scribe opened timeline; comms channel opened
09:22Z  Host app-prod-3 memory and network capture taken BEFORE containment
09:31Z  Admin session tokens revoked (all users, forced re-auth)
09:34Z  Blocked source ASN at edge; verified via proxy logs
```

Evidence preservation before containment:

```bash
# volatile state first
date -u +%Y-%m-%dT%H:%M:%SZ
ps -ef > /forensics/ps.txt
ss -tulpn > /forensics/sockets.txt
cat /proc/net/tcp > /forensics/tcp.txt
cp /var/log/auth.log /var/log/syslog /forensics/ 2>/dev/null

# disk snapshot before restart
cp -a /var/lib/app /forensics/var-lib-app-snapshot
tar czf /forensics/etc-config.tgz /etc/systemd/system /etc/cron* 2>/dev/null
sha256sum /forensics/*.txt /forensics/*.tgz > /forensics/MANIFEST.sha256
```

Correlating the entry vector:

```bash
# first anomalous authentication, then everything that session touched
grep 'Nov  1 09:0' /forensics/auth.log | grep -Ei 'accepted|session' | head -50
grep 'admin' /var/log/nginx/access.log | awk '$1 ~ /^203.0.113\./' | head -50

# what code changed near the incident window
git log --since='2026-01-25' --until='2026-02-02' --oneline --all
git diff --stat HEAD~5 HEAD -- deploy/ infra/
```

Persistence sweep:

```bash
systemctl list-units --type=service --state=running | grep -v -f /etc/systemd/system.manifest
crontab -l; ls -la /etc/cron.*/ ; cat /etc/ld.so.preload 2>/dev/null
find / -perm -4000 -type f 2>/dev/null | head            # unexpected SUID binaries
aws iam list-roles --query 'Roles[].RoleLastUsed.LastUsedDate' --output table
```

Blast-radius quantification:

```sql
-- scope of data actually read by the compromised session, from audit logs
SELECT actor, action, resource_type, COUNT(*) AS n, MIN(ts) AS first_seen, MAX(ts) AS last_seen
FROM   audit_log
WHERE  ts BETWEEN '2026-02-01' AND '2026-02-03'
  AND  actor IN ('admin_user_4421')
GROUP BY actor, action, resource_type
ORDER BY n DESC;
```

## Checklist

- [ ] Incident declared with commander, scribe, and technical lead, and a UTC timeline opened at t=0.
- [ ] Volatile evidence captured before containment; disk images and container layers preserved with checksums.
- [ ] Logs collected from application, proxy, database audit, auth, cloud control plane, and CI/CD, with clocks verified.
- [ ] Entry vector identified from evidence, and every subsequent attacker action traced from that foothold.
- [ ] Persistence mechanisms enumerated and verified removed, not assumed removed.
- [ ] Blast radius quantified by accounts, tenants, records, and regulated data categories.
- [ ] Containment, eradication, and recovery each have explicit completion criteria and verification evidence.
- [ ] Post-incident report includes timeline, root cause, detection and response gaps, and owned remediation with dates.

## Anti-patterns

- **Rebooting before capture.** Restarting destroys the process table, memory, and network state that identify the intrusion path. Capture volatile state first, always.
- **Killing the threat and declaring victory.** Removing one process or rotating one credential leaves persistence, a modified binary, or a new access key in place. Hunt the full path and verify eradication explicitly.
- **Assuming the earliest log entry is the breach.** Attackers may have valid access weeks earlier, and log retention may predate the compromise. Establish the window by evidence and expand the search until you find the real first event.
- **Logging the important things only.** If authentication events, authorization denials, and admin actions are not logged with actor and resource, scope cannot be quantified and notification deadlines may be missed retroactively.
- **No timeline discipline.** Reconstructing the sequence from memory and chat messages produces a narrative that omits the delay that actually mattered. Record timestamped entries as they happen, including the time each containment step completed.