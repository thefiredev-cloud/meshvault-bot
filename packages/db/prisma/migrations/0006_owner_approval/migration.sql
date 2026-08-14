CREATE UNIQUE INDEX "external_effects_one_awaiting_approval_per_run"
ON "external_effects"("runId")
WHERE "status" = 'awaiting_approval';
