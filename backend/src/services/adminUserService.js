import { randomBytes } from 'node:crypto';
import * as users from '../models/adminUserModel.js';
import * as refreshTokens from '../models/refreshTokenModel.js';
import * as resetTokens from '../models/passwordResetModel.js';
import { HttpError } from '../utils/httpError.js';
import { buildMeta, offsetOf } from '../utils/pagination.js';
import { withTransaction } from '../utils/transaction.js';
import { generateOpaqueToken } from './tokenService.js';

export const INVITATION_TTL_SECONDS = 48 * 60 * 60;

const notFound = () => new HttpError(404, 'USER_NOT_FOUND', 'Usuario no encontrado.');

// Whitelist of what the panel may see of an account.
export const toAdminUser = (row) => ({
  id: row.id,
  full_name: row.full_name,
  email: row.email,
  role: row.role,
  area: row.area_id == null ? null : { id: row.area_id, name: row.area_name },
  is_active: row.is_active,
  last_login_at: row.last_login_at,
  created_at: row.created_at,
});

// Pure rule used inside the transaction (and unit tested on its own): an admin never removes their
// own admin access, and the system never ends up without an active admin.
export function assertAdminSafety({ actorId, target, next, activeAdminIds }) {
  const wasActiveAdmin = target.role === 'admin' && target.is_active;
  const willBeActiveAdmin = next.role === 'admin' && next.is_active;
  if (!wasActiveAdmin || willBeActiveAdmin) return;
  if (actorId === target.id) {
    throw new HttpError(
      409,
      'SELF_PROTECTION',
      'No puedes quitarte tu propio acceso de administrador ni desactivar tu cuenta.',
    );
  }
  if (activeAdminIds.length <= 1) {
    throw new HttpError(
      409,
      'LAST_ADMIN',
      'Debe quedar al menos un administrador activo. Nombra a otro antes de hacer este cambio.',
    );
  }
}

export function createAdminUserService({ db, passwords, mailer, audit }) {
  async function assertArea(areaId) {
    if (areaId != null && !(await users.areaExists(db, areaId))) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'area_id: área desconocida');
    }
  }

  // The link is the only credential-bearing artifact and goes by email, never in the response.
  async function sendInvitation(user) {
    const invitation = generateOpaqueToken();
    await resetTokens.insertResetToken(db, {
      userId: user.id,
      tokenHash: invitation.hash,
      ttlSeconds: INVITATION_TTL_SECONDS,
    });
    try {
      await mailer.sendInvitation({
        to: user.email,
        name: user.full_name,
        token: invitation.token,
        ttlHours: INVITATION_TTL_SECONDS / 3600,
      });
      return true;
    } catch {
      return false;
    }
  }

  return {
    async listUsers(query) {
      const { page, limit, ...filters } = query;
      const [rows, total] = await Promise.all([
        users.findPage(db, { ...filters, limit, offset: offsetOf({ page, limit }) }),
        users.count(db, filters),
      ]);
      return { data: rows.map(toAdminUser), meta: buildMeta({ page, limit }, total) };
    },

    async listAreas() {
      return { data: await users.findAreas(db) };
    },

    async createUser(input, actor) {
      await assertArea(input.area_id);
      // An unguessable placeholder: nobody knows it, the person picks theirs through the invitation.
      const passwordHash = await passwords.hash(randomBytes(32).toString('base64url'));
      const id = await users.insertStaff(db, {
        fullName: input.full_name,
        email: input.email,
        passwordHash,
        role: input.role,
        areaId: input.area_id ?? null,
      });
      if (!id) throw new HttpError(409, 'EMAIL_TAKEN', 'Ya existe una cuenta con ese correo.');
      const created = await users.findById(db, id);
      const invitationSent = await sendInvitation(created);
      audit.record('user.created', actor, { targetId: id, role: input.role, invitationSent });
      return { data: toAdminUser(created), meta: { invitation_sent: invitationSent } };
    },

    async resendInvitation(id, actor) {
      const user = await users.findById(db, id);
      if (!user) throw notFound();
      if (!user.is_active) {
        throw new HttpError(409, 'USER_INACTIVE', 'La cuenta está desactivada.');
      }
      const invitationSent = await sendInvitation(user);
      audit.record('user.invitation_resent', actor, { targetId: id, invitationSent });
      return { data: toAdminUser(user), meta: { invitation_sent: invitationSent } };
    },

    async updateUser(id, input, actor) {
      await assertArea(input.area_id);
      const outcome = await withTransaction(db, async (client) => {
        const activeAdminIds = await users.lockActiveAdmins(client);
        const target = await users.lockById(client, id);
        if (!target) throw notFound();
        const next = {
          role: input.role ?? target.role,
          is_active: input.is_active ?? target.is_active,
          area_id: input.area_id !== undefined ? input.area_id : target.area_id,
        };
        assertAdminSafety({ actorId: actor.id, target, next, activeAdminIds });
        await users.update(client, id, {
          ...(input.full_name !== undefined && { fullName: input.full_name }),
          ...(input.role !== undefined && { role: input.role }),
          ...(input.area_id !== undefined && { areaId: input.area_id }),
          ...(input.is_active !== undefined && { isActive: input.is_active }),
        });
        // Deactivated accounts and accounts whose permissions changed must sign in again.
        const permissionsChanged =
          next.role !== target.role ||
          next.is_active !== target.is_active ||
          next.area_id !== target.area_id;
        if (permissionsChanged) await refreshTokens.revokeAllRefreshTokens(client, id);
        return { before: target, after: next, revoked: permissionsChanged };
      });
      audit.record('user.updated', actor, {
        targetId: id,
        roleFrom: outcome.before.role,
        roleTo: outcome.after.role,
        activeFrom: outcome.before.is_active,
        activeTo: outcome.after.is_active,
        sessionsRevoked: outcome.revoked,
      });
      return { data: toAdminUser(await users.findById(db, id)) };
    },
  };
}
