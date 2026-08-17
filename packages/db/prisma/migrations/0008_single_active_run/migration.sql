-- One bot owns one computer, so overlapping computer-using runs would share mutable state.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "botId" ORDER BY "createdAt" DESC, "id" DESC) AS position
  FROM "runs"
  WHERE "status" IN ('leased', 'running', 'waiting_input', 'waiting_takeover')
), cancelled_runs AS (
  UPDATE "runs"
  SET "status" = 'cancelled', "completedAt" = NOW()
  WHERE "id" IN (SELECT "id" FROM ranked WHERE position > 1)
  RETURNING "id", "taskId"
), cancelled_attempts AS (
  UPDATE "attempts"
  SET "status" = 'cancelled', "finishedAt" = NOW()
  WHERE "runId" IN (SELECT "id" FROM cancelled_runs)
    AND "status" = 'running'
), cancelled_effects AS (
  UPDATE "external_effects"
  SET "status" = CASE WHEN "status" = 'intended' THEN 'ambiguous' ELSE 'failed' END,
      "result" = jsonb_build_object('error', 'run cancelled during active-run migration')
  WHERE "runId" IN (SELECT "id" FROM cancelled_runs)
    AND "status" IN ('awaiting_approval', 'approved', 'intended')
)
UPDATE "tasks" AS task
SET "status" = 'cancelled'
WHERE task."id" IN (SELECT "taskId" FROM cancelled_runs)
  AND task."status" NOT IN ('completed', 'cancelled')
  AND NOT EXISTS (
    SELECT 1 FROM "runs" AS run
    WHERE run."taskId" = task."id" AND run."status" <> 'cancelled'
  );

CREATE UNIQUE INDEX "runs_one_active_per_bot_key"
ON "runs"("botId")
WHERE "status" IN ('leased', 'running', 'cancelling', 'waiting_input', 'waiting_takeover');
