export const PERMIT_HEADERS = {
  purpose: "x-meshbot-permit-purpose",
  operationFence: "x-meshbot-operation-fence",
  runId: "x-meshbot-run-id",
  runLeaseFence: "x-meshbot-run-lease-fence",
  controlLeaseId: "x-meshbot-control-lease-id",
  bootToken: "x-meshbot-boot-token",
} as const;

export type MutationPermit =
  | {
      purpose: "run";
      operationFence: number;
      runId: string;
      runLeaseFence: number;
    }
  | {
      purpose: "control";
      operationFence: number;
      controlLeaseId: string;
    }
  | {
      purpose: "lifecycle";
      operationFence: number;
      bootToken?: string;
    };

export class MutationPermitError extends Error {
  readonly status = 409;

  constructor(message = "missing or stale mutation permit") {
    super(message);
    this.name = "MutationPermitError";
  }
}

type HeaderReader = (name: string) => string | undefined;

export function readMutationPermit(readHeader: HeaderReader): MutationPermit {
  const purpose = readHeader(PERMIT_HEADERS.purpose);
  const operationFence = readFence(readHeader(PERMIT_HEADERS.operationFence));
  if (purpose === "run") {
    rejectHeaders(readHeader, [PERMIT_HEADERS.controlLeaseId, PERMIT_HEADERS.bootToken]);
    return {
      purpose,
      operationFence,
      runId: requiredHeader(readHeader, PERMIT_HEADERS.runId),
      runLeaseFence: readFence(readHeader(PERMIT_HEADERS.runLeaseFence)),
    };
  }
  if (purpose === "control") {
    rejectHeaders(readHeader, [
      PERMIT_HEADERS.runId,
      PERMIT_HEADERS.runLeaseFence,
      PERMIT_HEADERS.bootToken,
    ]);
    return {
      purpose,
      operationFence,
      controlLeaseId: requiredHeader(readHeader, PERMIT_HEADERS.controlLeaseId),
    };
  }
  if (purpose === "lifecycle") {
    rejectHeaders(readHeader, [
      PERMIT_HEADERS.runId,
      PERMIT_HEADERS.runLeaseFence,
      PERMIT_HEADERS.controlLeaseId,
    ]);
    const bootToken = readHeader(PERMIT_HEADERS.bootToken)?.trim();
    return { purpose, operationFence, ...(bootToken ? { bootToken } : {}) };
  }
  throw new MutationPermitError();
}

type PermitRow = {
  providerRef: string | null;
  operationFence: number;
  bootToken: string | null;
  controlHolder: string;
  controlLeaseId: string | null;
  deletingAt: Date | null;
  runId: string | null;
  runStatus: string | null;
  runLeaseFence: number | null;
  runLeaseActive: boolean | null;
};

export type PermitQuery = {
  query<Row>(sql: string, values: unknown[]): Promise<{ rows: Row[] }>;
};

export type MutationAuthorization = {
  workspaceId: string;
  botId: string;
  permit: MutationPermit;
  allowedPurposes: readonly MutationPermit["purpose"][];
  expectedProviderRef?: string;
  allowedRunStatuses?: readonly string[];
  requireLifecycleBootToken?: boolean;
  allowDeleting?: boolean;
};

export async function authorizeMutation(
  database: PermitQuery,
  authorization: MutationAuthorization,
): Promise<void> {
  if (!authorization.allowedPurposes.includes(authorization.permit.purpose)) {
    throw new MutationPermitError();
  }
  const runId = authorization.permit.purpose === "run" ? authorization.permit.runId : null;
  const result = await database.query<PermitRow>(
    `SELECT
       c."providerRef" AS "providerRef",
       c."operationFence" AS "operationFence",
       c."bootToken" AS "bootToken",
       c."controlHolder" AS "controlHolder",
       c."controlLeaseId" AS "controlLeaseId",
       b."deletingAt" AS "deletingAt",
       r."id" AS "runId",
       r."status" AS "runStatus",
       r."leaseFence" AS "runLeaseFence",
       (r."leaseExpiresAt" > NOW()) AS "runLeaseActive"
     FROM "computers" c
     JOIN "bots" b ON b."id" = c."botId"
     LEFT JOIN "runs" r
       ON r."id" = $3 AND r."workspaceId" = c."workspaceId" AND r."botId" = c."botId"
     WHERE c."workspaceId" = $1 AND c."botId" = $2`,
    [authorization.workspaceId, authorization.botId, runId],
  );
  validateMutationPermit(result.rows[0], authorization);
}

export function validateMutationPermit(
  row: PermitRow | undefined,
  authorization: MutationAuthorization,
): void {
  const { permit } = authorization;
  if (
    !row ||
    row.operationFence !== permit.operationFence ||
    (authorization.expectedProviderRef !== undefined &&
      row.providerRef !== authorization.expectedProviderRef)
  ) {
    throw new MutationPermitError();
  }
  if (permit.purpose === "run") {
    if (
      row.deletingAt ||
      row.runId !== permit.runId ||
      row.runLeaseFence !== permit.runLeaseFence ||
      row.runLeaseActive !== true ||
      !authorization.allowedRunStatuses?.includes(row.runStatus ?? "")
    ) {
      throw new MutationPermitError();
    }
    return;
  }
  if (permit.purpose === "control") {
    if (
      row.deletingAt ||
      row.controlHolder !== "user" ||
      row.controlLeaseId !== permit.controlLeaseId
    ) {
      throw new MutationPermitError();
    }
    return;
  }
  if (authorization.requireLifecycleBootToken && !permit.bootToken) {
    throw new MutationPermitError();
  }
  if (!authorization.allowDeleting && row.deletingAt) throw new MutationPermitError();
  if (permit.bootToken !== undefined && row.bootToken !== permit.bootToken) {
    throw new MutationPermitError();
  }
}

function requiredHeader(readHeader: HeaderReader, name: string) {
  const value = readHeader(name)?.trim();
  if (!value) throw new MutationPermitError();
  return value;
}

function readFence(value: string | undefined) {
  if (!value || !/^[1-9]\d*$/.test(value)) throw new MutationPermitError();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new MutationPermitError();
  return parsed;
}

function rejectHeaders(readHeader: HeaderReader, names: string[]) {
  if (names.some((name) => readHeader(name) !== undefined)) throw new MutationPermitError();
}
