import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { emailAllowed, parseAllowlist } from "@meshbot/core";
import type { PrismaClient } from "@meshbot/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { bearer, organization } from "better-auth/plugins";

// Modified by FireDev LLC dba MeshVault on 2026-08-13.

export interface AuthEnv {
  secret: string;
  baseURL: string;
  webOrigin: string;
  ownerBootstrapToken?: string;
  extraOrigins?: string[];
}

export const OWNER_BOOTSTRAP_PREFIX = "bootstrap:";
const OWNER_BOOTSTRAP_HEADER = "x-meshbot-owner-bootstrap";

function newId(): string {
  return randomBytes(16).toString("hex");
}

export function ownerBootstrapId(email: string): string {
  const digest = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
  return `${OWNER_BOOTSTRAP_PREFIX}${digest}`;
}

function sameSecret(actual: string | null | undefined, expected: string | undefined): boolean {
  if (!actual || !expected) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function removeUnclaimedBootstrapUser(
  prisma: PrismaClient,
  userId: string,
  reservation: string,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const cleared = await tx.deploymentSettings.updateMany({
      where: { id: "default", ownerUserId: reservation },
      data: { ownerUserId: null, signupsEnabled: false, signupAllowlist: "" },
    });
    if (cleared.count !== 1) return false;
    await tx.organization.deleteMany({
      where: {
        slug: `user-${userId.slice(0, 12)}`,
        OR: [{ members: { some: { userId } } }, { members: { none: {} } }],
      },
    });
    await tx.user.deleteMany({ where: { id: userId, ownerBootstrapReservation: reservation } });
    return true;
  });
}

export function createAuth(prisma: PrismaClient, env: AuthEnv) {
  return betterAuth({
    appName: "Mesh Bot",
    secret: env.secret,
    baseURL: env.baseURL,
    trustedOrigins: [env.webOrigin, env.baseURL, ...(env.extraOrigins ?? [])],
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    user: {
      additionalFields: {
        ownerBootstrapReservation: {
          type: "string",
          required: false,
          input: false,
          returned: false,
        },
      },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: false,
    },
    plugins: [
      bearer(),
      organization({
        allowUserToCreateOrganization: false,
        creatorRole: "owner",
      }),
    ],
    hooks: {
      before: async (ctx) => {
        const path = String((ctx as { path?: string }).path ?? "");
        if (!path.includes("sign-up")) return;
        const settings = await prisma.deploymentSettings.findUnique({ where: { id: "default" } });
        const allowlist = parseAllowlist(settings?.signupAllowlist);
        const email =
          typeof ctx.body === "object" && ctx.body && "email" in ctx.body
            ? String((ctx.body as { email?: string }).email ?? "")
            : "";
        if (settings?.ownerUserId?.startsWith(OWNER_BOOTSTRAP_PREFIX)) {
          const bootstrapRequest =
            Boolean(email) &&
            settings.ownerUserId === ownerBootstrapId(email) &&
            sameSecret(ctx.headers?.get(OWNER_BOOTSTRAP_HEADER), env.ownerBootstrapToken);
          if (!bootstrapRequest) {
            throw new APIError("BAD_REQUEST", { message: "Registration is unavailable" });
          }
          return;
        }
        if (!settings?.signupsEnabled || !email || !emailAllowed(email, allowlist)) {
          throw new APIError("BAD_REQUEST", { message: "Registration is unavailable" });
        }
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user, context) => {
            const reservation = ownerBootstrapId(user.email);
            const settings = await prisma.deploymentSettings.findUnique({
              where: { id: "default" },
            });
            if (
              settings?.ownerUserId === reservation &&
              sameSecret(context?.getHeader(OWNER_BOOTSTRAP_HEADER), env.ownerBootstrapToken)
            ) {
              return { data: { ...user, ownerBootstrapReservation: reservation } };
            }
          },
          after: async (user) => {
            const orgId = newId();
            await prisma.organization.create({
              data: {
                id: orgId,
                name: "Personal",
                slug: `user-${user.id.slice(0, 12)}`,
                createdAt: new Date(),
              },
            });
            await prisma.member.create({
              data: {
                id: newId(),
                organizationId: orgId,
                userId: user.id,
                role: "owner",
                createdAt: new Date(),
              },
            });
            await prisma.memoryDocument.create({
              data: {
                workspaceId: orgId,
                userId: user.id,
                scope: "user",
                path: "MEMORY.md",
                content: "# User memory\n\nAccount-wide preferences live here.\n",
              },
            });
            await prisma.notificationPreference.create({
              data: {
                workspaceId: orgId,
                userId: user.id,
              },
            });
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

export async function recoverReservedDeploymentOwner(
  prisma: PrismaClient,
): Promise<"recovered" | "cleared" | "none"> {
  const current = await prisma.deploymentSettings.findUnique({ where: { id: "default" } });
  const reservation = current?.ownerUserId;
  if (!reservation?.startsWith(OWNER_BOOTSTRAP_PREFIX)) return "none";

  const markedUser = await prisma.user.findFirst({
    where: { ownerBootstrapReservation: reservation },
  });
  if (!markedUser) {
    const cleared = await prisma.deploymentSettings.updateMany({
      where: { id: "default", ownerUserId: reservation },
      data: { ownerUserId: null, signupsEnabled: false, signupAllowlist: "" },
    });
    return cleared.count === 1 ? "cleared" : "none";
  }

  const [workspace, credential] = await Promise.all([
    prisma.organization.findFirst({
      where: {
        slug: `user-${markedUser.id.slice(0, 12)}`,
        members: { some: { userId: markedUser.id, role: "owner" } },
        memoryDocuments: {
          some: { userId: markedUser.id, scope: "user", path: "MEMORY.md" },
        },
        notificationPreferences: { some: { userId: markedUser.id } },
      },
      select: { id: true },
    }),
    prisma.account.findFirst({
      where: { userId: markedUser.id, providerId: "credential", password: { not: null } },
      select: { id: true },
    }),
  ]);
  if (!workspace || !credential) {
    const cleared = await removeUnclaimedBootstrapUser(prisma, markedUser.id, reservation);
    return cleared ? "cleared" : "none";
  }

  const claimed = await prisma.deploymentSettings.updateMany({
    where: { id: "default", ownerUserId: reservation },
    data: { ownerUserId: markedUser.id, signupsEnabled: false, signupAllowlist: "" },
  });
  if (claimed.count !== 1) return "none";
  await prisma.session.deleteMany({ where: { userId: markedUser.id } });
  await prisma.user.update({
    where: { id: markedUser.id },
    data: { ownerBootstrapReservation: null },
  });
  return "recovered";
}

export async function bootstrapDeploymentOwner(
  prisma: PrismaClient,
  auth: Auth,
  input: { email: string; password: string; token: string },
): Promise<"created" | "already-owned"> {
  const email = input.email.trim().toLowerCase();
  const reservation = ownerBootstrapId(email);
  const current = await prisma.deploymentSettings.findUnique({ where: { id: "default" } });
  if (current?.ownerUserId && current.ownerUserId !== reservation) return "already-owned";

  const reserved = await prisma.deploymentSettings.updateMany({
    where: {
      id: "default",
      OR: [{ ownerUserId: null }, { ownerUserId: reservation }],
    },
    data: { ownerUserId: reservation, signupsEnabled: false, signupAllowlist: "" },
  });
  if (reserved.count !== 1) return "already-owned";

  let createdUserId: string | undefined;
  let ownerClaimed = false;
  try {
    const created = await auth.api.signUpEmail({
      body: { email, password: input.password, name: "Owner" },
      headers: new Headers({ [OWNER_BOOTSTRAP_HEADER]: input.token }),
    });
    createdUserId = created.user.id;
    const claimed = await prisma.deploymentSettings.updateMany({
      where: { id: "default", ownerUserId: reservation },
      data: { ownerUserId: created.user.id, signupsEnabled: false, signupAllowlist: "" },
    });
    if (claimed.count !== 1) {
      const recovered = await prisma.deploymentSettings.findUnique({ where: { id: "default" } });
      if (recovered?.ownerUserId !== created.user.id) {
        throw new Error("Owner bootstrap lost its deployment reservation");
      }
    }
    ownerClaimed = true;
    await prisma.session.deleteMany({ where: { userId: created.user.id } });
    await prisma.user.update({
      where: { id: created.user.id },
      data: { ownerBootstrapReservation: null },
    });
    const settings = await prisma.deploymentSettings.findUnique({ where: { id: "default" } });
    if (settings?.ownerUserId !== created.user.id) {
      throw new Error("Owner bootstrap did not claim the deployment");
    }
    return "created";
  } catch (error) {
    if (createdUserId && !ownerClaimed) {
      await removeUnclaimedBootstrapUser(prisma, createdUserId, reservation);
    }
    throw error;
  } finally {
    await prisma.deploymentSettings.updateMany({
      where: { id: "default", ownerUserId: reservation },
      data: { signupsEnabled: false, signupAllowlist: "" },
    });
  }
}

export const blockedAuthPaths = [
  "/organization/create",
  "/organization/invite",
  "/organization/accept-invitation",
  "/organization/reject-invitation",
  "/organization/remove-member",
  "/organization/update-member-role",
];
