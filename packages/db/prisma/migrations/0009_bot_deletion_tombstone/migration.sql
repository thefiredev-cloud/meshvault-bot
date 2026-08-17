-- Cleanup can fail after deletion starts, so retain durable ownership until every resource is gone.
ALTER TABLE "bots" ADD COLUMN "deletingAt" TIMESTAMP(3);
