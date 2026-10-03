---
name: backup-and-restore
description: Designs backups with RPO/RTO targets, point-in-time database recovery, object versioning with lock, cross-account copies and rehearsed restore drills. Use when defining a backup strategy, enabling point-in-time recovery, or proving a restore actually works.
---

# Backup and Restore

**Use when:** Defining a backup strategy, enabling point-in-time recovery or object versioning, or proving that a backup can actually be restored.
**Do not use when:** Recovering from corruption right now; use `incident-response` first, then this skill for the recovery path.

## Instructions

1. Write down RPO (how much data loss is acceptable) and RTO (how long recovery may take) per system before choosing any technology. Tools are chosen to satisfy those numbers, not the other way round.
2. Classify data by recoverability: recoverable from source, reconstructible from events, or genuinely irreplaceable. Only the last category is worth expensive backups.
3. Use the 3-2-1 approach: three copies, on two different media or services, with one copy offline or immutable and separated from credentials that could delete it.
4. Enable point-in-time database recovery, not just daily snapshots. Daily snapshots mean up to 24 hours of loss, which most applications cannot survive.
5. Set snapshot retention to cover the longest realistic mistake window plus regulatory requirements, and enable storage-class transitions on older snapshots.
6. Enable object versioning with a retention lock or governance mode. Ransomware that deletes objects cannot remove old versions without generating an alert.
7. Replicate backups to a separate account, not just a separate region. Account-level compromise deletes regional backups along with everything else.

## Patterns

A recovery matrix that ties tooling to measurable targets:

```yaml
recovery_targets:
  - system: postgres-primary
    tier: 1
    rpo: 60s           # continuous WAL archiving
    rto: 15m
    method: pitr
    backup: "RDS automated backups, 35 day retention, WAL archived to CloudWatch"
    restore_test_cadence: monthly
    owner: platform-eng

  - system: s3-user-uploads
    tier: 1
    rpo: 0s            # versioning makes the previous version immediately available
    rto: 30m
    method: versioning + cross-account replication
    backup: "versioning enabled, MFA delete on, object lock COMPLIANCE 365d"
    restore_test_cadence: quarterly
    owner: platform-eng

  - system: node-local-build-cache
    tier: 3
    rpo: n/a
    rto: n/a
    method: none
    note: Fully reconstructible from source and lockfile; never back this up
```

Versioning with object lock, and cross-account replication of both versions and deletions:

```terraform
resource "aws_s3_bucket_object_lock_configuration" "uploads" {
  bucket              = aws_s3_bucket.uploads.id
  object_lock_enabled = "Enabled"
  rule {
    default_retention {
      mode = "COMPLIANCE" # cannot be shortened, not even by the root user
      days = 365
    }
  }
}

resource "aws_s3_bucket_replication_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  role   = aws_iam_role.replication.arn
  rule {
    id     = "cross-account-dr"
    status = "Enabled"
    filter { prefix = "" }
    destination {
      bucket        = aws_s3_bucket.uploads_replica.arn
      storage_class = "STANDARD_IA"
      account       = var.dr_account_id
    }
    # Replicate deletions too, or the replica silently keeps data you deleted.
    delete_marker_replication { status = "Enabled" }
  }
}
```

A restore drill that measures the real RTO and verifies the data is actually correct:

```bash
#!/usr/bin/env bash
# Quarterly drill: restore a PITR copy and time it end to end.
set -euo pipefail
TARGET_TIME="2026-02-14T09:31:00Z"
START=$(date +%s)

CREDENTIALS=$(aws sts assume-role \
  --role-arn "arn:aws:iam::222222223333:role/backup-restore-drill" \
  --session-name restore-drill --query Credentials --output json)
export AWS_ACCESS_KEY_ID=$(jq -r .AccessKeyId <<< "$CREDENTIALS")
export AWS_SECRET_ACCESS_KEY=$(jq -r .SecretAccessKey <<< "$CREDENTIALS")
export AWS_SESSION_TOKEN=$(jq -r .SessionToken <<< "$CREDENTIALS")

aws rds restore-db-instance-to-point-in-time \
  --db-instance-identifier "orders-restore-drill" \
  --source-db-instance-identifier "orders-primary" \
  --restore-type "copy-on-write" --restore-time "$TARGET_TIME" --multi-az
aws rds wait db-instance-available --db-instance-identifier "orders-restore-drill"

RESTORED=$(psql -h orders-restore-drill.xxxxx.us-east-1.rds.amazonaws.com -U admin -d orders \
  -tAc "SELECT max(created_at) FROM orders;")
[[ "$RESTORED" == "2026-02-14 09:30:41.882913+00" ]] || { echo "FAIL: wrong point in time"; exit 1; }

ELAPSED=$(( $(date +%s) - START ))
echo "PASS: full restore in ${ELAPSED}s (RTO target: 900s)"
aws rds delete-db-instance --db-instance-identifier "orders-restore-drill" --skip-final-snapshot
```

## Checklist

- [ ] RPO and RTO written down per system, not assumed
- [ ] Data classified by recoverability; only irreplaceable data gets expensive backups
- [ ] 3-2-1 satisfied with one copy offline or immutable
- [ ] Point-in-time recovery enabled on every stateful database
- [ ] Object versioning plus object lock enabled on user data buckets
- [ ] Backups replicated to a separate account, not only a separate region
- [ ] Restore drills run on schedule and the measured time recorded as the real RTO
- [ ] Alerts fire on backup failure and on staleness, with runbooks attached

## Anti-patterns

- **Daily snapshots treated as a backup strategy.** Losing up to 24 hours of transactions is losing the data. Enable point-in-time recovery with WAL archiving.
- **Backups in the same account as the data.** One compromised credential deletes both. Replicate to a separate account that production credentials cannot reach.
- **Restores never tested.** Backups are a hypothesis until proven. Run drills on a schedule, time them, and verify the data is correct rather than assuming the file exists.
- **Object versioning without object lock.** Ransomware deletes objects and then removes the versions; without a compliance lock there is nothing to recover. Enable lock with a retention you cannot shorten.
- **No alert on backup staleness.** Backups fail quietly for weeks while everyone believes they are protected. Alert on both failure and absence of a recent success.
