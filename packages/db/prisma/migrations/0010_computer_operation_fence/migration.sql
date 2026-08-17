-- A computer-wide fence survives run replacement; bootToken keeps remote provisioning outside DB locks.
ALTER TABLE "computers" RENAME COLUMN "controlFence" TO "operationFence";
ALTER TABLE "computers" ADD COLUMN "bootToken" TEXT;
