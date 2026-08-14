-- Persist each bot's exact model selection.
ALTER TABLE "bots"
  ADD COLUMN "modelProvider" TEXT,
  ADD COLUMN "modelId" TEXT;

-- Keep the newest credential when older builds created duplicates for one provider.
WITH ranked AS (
  SELECT
    "id",
    "secretId",
    ROW_NUMBER() OVER (
      PARTITION BY "userId", "workspaceId", "provider"
      ORDER BY "updatedAt" DESC, "id" DESC
    ) AS "rank"
  FROM "user_model_credentials"
)
DELETE FROM "secrets"
WHERE "id" IN (SELECT "secretId" FROM ranked WHERE "rank" > 1)
  AND "id" NOT IN (SELECT "secretId" FROM ranked WHERE "rank" = 1);

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "userId", "workspaceId", "provider"
      ORDER BY "updatedAt" DESC, "id" DESC
    ) AS "rank"
  FROM "user_model_credentials"
)
DELETE FROM "user_model_credentials"
WHERE "id" IN (SELECT "id" FROM ranked WHERE "rank" > 1);

-- Keep one workspace default before adding the partial uniqueness rule.
WITH ranked_defaults AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "userId", "workspaceId"
      ORDER BY "updatedAt" DESC, "id" DESC
    ) AS "rank"
  FROM "user_model_credentials"
  WHERE "isDefault" = true
)
UPDATE "user_model_credentials"
SET "isDefault" = false
WHERE "id" IN (SELECT "id" FROM ranked_defaults WHERE "rank" > 1);

CREATE UNIQUE INDEX "user_model_credentials_userId_workspaceId_provider_key"
  ON "user_model_credentials"("userId", "workspaceId", "provider");

CREATE UNIQUE INDEX "user_model_credentials_one_default_per_workspace"
  ON "user_model_credentials"("userId", "workspaceId")
  WHERE "isDefault" = true;
