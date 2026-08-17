-- Existing empty allowlists came from the old open-by-default configuration.
UPDATE "deployment_settings"
SET "signupsEnabled" = false
WHERE BTRIM("signupAllowlist") = '';

ALTER TABLE "deployment_settings"
ALTER COLUMN "signupsEnabled" SET DEFAULT false;

-- This server-only marker lets startup recover an owner user committed before a process crash.
ALTER TABLE "user"
ADD COLUMN "ownerBootstrapReservation" TEXT;

CREATE UNIQUE INDEX "user_ownerBootstrapReservation_key"
ON "user"("ownerBootstrapReservation");
