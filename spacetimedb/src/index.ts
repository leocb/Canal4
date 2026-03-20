import spacetimedb from "./schema";
import { t, SenderError } from "spacetimedb/server";
import { Timestamp } from "spacetimedb";

/*** USER AUTHENTICATION & MANAGEMENT ***/

const THIRTY_DAYS_MICROS = 30n * 24n * 3600n * 1000000n;

function getUserId(ctx: any): bigint {
  const ui = ctx.db.UserIdentity.identity.find(ctx.sender);
  if (!ui) throw new SenderError("api_errors.not_logged_in");

  // Check session expiration
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const lastLogin = ui.lastLogin.microsSinceUnixEpoch;

  // If lastLogin is 0 (newly migrated) or older than 30 days
  if (lastLogin > 0n && now > lastLogin + THIRTY_DAYS_MICROS) {
    throw new SenderError("api_errors.session_expired");
  }

  // Extend session if it's been more than 5 minutes since last update (to avoid excessive updates)
  // Actually, the user asked to extend it every time, so let's do it frequently
  if (now > lastLogin + 300n * 1000000n) { // 5 minutes buffer
    ctx.db.UserIdentity.identity.update({
      ...ui,
      lastLogin: ctx.timestamp
    });
  }

  return ui.userId;
}

export const register_new_user_with_passkey = spacetimedb.reducer(
  { credentialId: t.string() },
  (ctx, { credentialId }) => {
    // 1. Create a new user with empty name
    const user = ctx.db.User.insert({
      userId: 0n,
      email: undefined,
      passkeyCredentialId: credentialId,
      name: "", // We will ask for the name later
      pushToken: undefined,
      createdAt: ctx.timestamp,
    });

    // 2. Link this identity
    ctx.db.UserIdentity.insert({
      identity: ctx.sender,
      userId: user.userId,
      lastLogin: ctx.timestamp,
    });
    console.log(`[STDB] New user registered with passkey. Assigned ID: ${user.userId}`);
  }
);


export const extend_session = spacetimedb.reducer(
  {},
  (ctx) => {
    getUserId(ctx); // This will update lastLogin via side-effect in getUserId
  }
);

export const ping = spacetimedb.reducer(
  {},
  (_ctx) => {
    // No-op for connectivity check
  }
);

export const update_user_name = spacetimedb.reducer(
  { userId: t.u64(), newName: t.string() },
  (ctx, { userId, newName }) => {
    const callerId = getUserId(ctx);

    // Explicitly block others from changing names of other users
    if (callerId !== userId) {
      throw new SenderError("api_errors.change_name_forbidden");
    }

    const user = ctx.db.User.userId.find(userId);
    if (!user) throw new SenderError("api_errors.user_not_found");

    ctx.db.User.userId.update({
      ...user,
      name: newName.trim(),
    });
  }
);

export const delete_user_account = spacetimedb.reducer(
  { userId: t.u64(), confirmationName: t.string() },
  (ctx, { userId, confirmationName }) => {
    const callerId = getUserId(ctx);

    // Explicitly block others from deleting other users' accounts
    if (callerId !== userId) {
      throw new SenderError("api_errors.delete_account_forbidden");
    }

    const user = ctx.db.User.userId.find(userId);
    if (!user) throw new SenderError("api_errors.user_not_found");

    if (user.name !== confirmationName) {
      throw new SenderError("api_errors.confirmation_mismatch");
    }

    // Delete user identities
    const identities = [...ctx.db.UserIdentity.iter()].filter(ui => ui.userId === userId);
    for (const identity of identities) {
      ctx.db.UserIdentity.identity.delete(identity.identity);
    }

    // Delete venue memberships
    const memberships = [...ctx.db.VenueMember.iter()].filter(m => m.userId === userId);
    for (const m of memberships) {
      ctx.db.VenueMember.delete({ ...m });
    }

    // Delete channel roles
    const roles = [...ctx.db.ChannelMemberRole.iter()].filter(r => r.userId === userId);
    for (const r of roles) {
      ctx.db.ChannelMemberRole.delete({ ...r });
    }

    // Finally delete the user
    ctx.db.User.userId.delete(userId);
  }
);

export const register_passkey = spacetimedb.reducer(
  { credentialId: t.string() },
  (ctx, { credentialId }) => {
    const userId = getUserId(ctx);
    const user = ctx.db.User.userId.find(userId);
    if (!user) throw new SenderError("api_errors.user_not_found");
    ctx.db.User.userId.update({
      ...user,
      passkeyCredentialId: credentialId,
    });
  }
);

export const login_with_passkey = spacetimedb.reducer(
  { credentialId: t.string() },
  (ctx, { credentialId }) => {
    const expectedUser = [...ctx.db.User.iter()].find((u) => u.passkeyCredentialId === credentialId);
    if (!expectedUser) {
      throw new SenderError("api_errors.passkey_not_found");
    }
    // With UserIdentity pattern we just link identity if valid.
    const existingIdentity = ctx.db.UserIdentity.identity.find(ctx.sender);
    if (!existingIdentity) {
      ctx.db.UserIdentity.insert({
        identity: ctx.sender,
        userId: expectedUser.userId,
        lastLogin: ctx.timestamp,
      });
    } else if (existingIdentity.userId !== expectedUser.userId) {
      ctx.db.UserIdentity.identity.update({
        identity: ctx.sender,
        userId: expectedUser.userId,
        lastLogin: ctx.timestamp,
      });
    }
  }
);

export const update_push_token = spacetimedb.reducer(
  { token: t.string() },
  (ctx, { token }) => {
    const userId = getUserId(ctx);
    const user = ctx.db.User.userId.find(userId);
    if (!user) throw new SenderError("api_errors.user_not_found");
    ctx.db.User.userId.update({ ...user, pushToken: token });
  }
);

/*** VENUE & CHANNEL MANAGEMENT ***/

export const create_venue = spacetimedb.reducer(
  { name: t.string(), link: t.string() },
  (ctx, { name, link }) => {
    const userId = getUserId(ctx);
    const row = ctx.db.Venue.insert({
      venueId: 0n,
      name,
      ownerId: userId,
      link,
      createdAt: ctx.timestamp,
    });

    ctx.db.VenueMember.insert({
      venueId: row.venueId,
      userId: userId,
      joinDate: ctx.timestamp,
      lastSeen: ctx.timestamp,
      isBlocked: false,
      role: { tag: "owner", value: "" },
    });
  }
);

export const update_venue = spacetimedb.reducer(
  { venueId: t.u64(), newName: t.string() },
  (ctx, { venueId, newName }) => {
    const userId = getUserId(ctx);
    const venue = ctx.db.Venue.venueId.find(venueId);
    if (!venue) throw new SenderError("api_errors.venue_not_found");
    if (venue.ownerId !== userId) {
      throw new SenderError("api_errors.update_venue_forbidden");
    }
    ctx.db.Venue.venueId.update({ ...venue, name: newName });
  }
);

export const delete_venue = spacetimedb.reducer(
  { venueId: t.u64(), confirmationName: t.string() },
  (ctx, { venueId, confirmationName }) => {
    const userId = getUserId(ctx);
    const venue = ctx.db.Venue.venueId.find(venueId);
    if (!venue) throw new SenderError("api_errors.venue_not_found");
    if (venue.ownerId !== userId) {
      throw new SenderError("api_errors.delete_venue_forbidden");
    }
    if (venue.name !== confirmationName) {
      throw new SenderError("api_errors.confirmation_venue_mismatch");
    }

    for (const channel of ctx.db.Channel.channel_venue_id.filter(venueId)) {
      ctx.db.Channel.channelId.delete(channel.channelId);
    }
    for (const member of ctx.db.VenueMember.venue_member_venue_id.filter(venueId)) {
      ctx.db.VenueMember.delete(member);
    }
    ctx.db.Venue.venueId.delete(venueId);
  }
);

export const create_channel = spacetimedb.reducer(
  { venueId: t.u64(), name: t.string(), description: t.string(), minRole: t.string(), maxAgeHours: t.u64() },
  (ctx, { venueId, name, description, minRole, maxAgeHours }) => {
    const userId = getUserId(ctx);
    const venue = ctx.db.Venue.venueId.find(venueId);
    if (!venue) throw new SenderError("api_errors.venue_not_found");

    const isVenueOwner = venue.ownerId === userId;
    const members = [...ctx.db.VenueMember.venue_member_venue_id.filter(venueId)];
    const myMembership = members.find(m => m.userId === userId);
    const isVenueAdmin = myMembership?.role.tag === "admin";

    if (!isVenueOwner && !isVenueAdmin) {
      throw new SenderError("api_errors.create_channel_forbidden");
    }

    const row = ctx.db.Channel.insert({
      channelId: 0n,
      venueId,
      name,
      description,
      minimumRoleToView: { tag: minRole as any, value: "" },
      messageMaxAgeHours: maxAgeHours,
      createdAt: ctx.timestamp,
    });

    ctx.db.ChannelMemberRole.insert({
      channelId: row.channelId,
      userId: userId,
      role: { tag: "owner", value: "" },
    });
  }
);

export const update_channel = spacetimedb.reducer(
  { channelId: t.u64(), name: t.string(), description: t.string(), minRole: t.string(), maxAgeHours: t.u64() },
  (ctx, { channelId, name, description, minRole, maxAgeHours }) => {
    const userId = getUserId(ctx);
    const channel = ctx.db.Channel.channelId.find(channelId);
    if (!channel) throw new SenderError("api_errors.channel_not_found");

    const venue = ctx.db.Venue.venueId.find(channel.venueId);
    if (!venue) throw new SenderError("api_errors.venue_not_found");

    const isVenueOwner = venue.ownerId === userId;
    const roles = [...ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(channelId)];
    const myRole = roles.find(r => r.userId === userId);
    const isChannelOwner = myRole?.role.tag === "owner";

    if (!isVenueOwner && !isChannelOwner) {
      throw new SenderError("api_errors.update_channel_forbidden");
    }

    ctx.db.Channel.channelId.update({
      ...channel,
      name,
      description,
      minimumRoleToView: { tag: minRole as any, value: "" },
      messageMaxAgeHours: maxAgeHours,
    });
  }
);

export const delete_channel = spacetimedb.reducer(
  { channelId: t.u64(), confirmationName: t.string() },
  (ctx, { channelId, confirmationName }) => {
    const userId = getUserId(ctx);
    const channel = ctx.db.Channel.channelId.find(channelId);
    if (!channel) throw new SenderError("api_errors.channel_not_found");

    if (channel.name !== confirmationName) {
      throw new SenderError("api_errors.confirmation_channel_mismatch");
    }

    const venue = ctx.db.Venue.venueId.find(channel.venueId);
    if (!venue) throw new SenderError("api_errors.venue_not_found");

    const isVenueOwner = venue.ownerId === userId;
    const roles = [...ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(channelId)];
    const myRole = roles.find(r => r.userId === userId);
    const isChannelOwner = myRole?.role.tag === "owner";

    if (!isVenueOwner && !isChannelOwner) {
      throw new SenderError("api_errors.delete_channel_forbidden");
    }

    // Delete associated data
    for (const msg of ctx.db.Message.message_channel_id.filter(channelId)) {
      ctx.db.Message.messageId.delete(msg.messageId);
    }
    for (const tpl of ctx.db.MessageTemplate.message_template_channel_id.filter(channelId)) {
      ctx.db.MessageTemplate.templateId.delete(tpl.templateId);
    }
    for (const role of roles) {
      ctx.db.ChannelMemberRole.delete({ ...role });
    }
    for (const nf of ctx.db.NotificationFilter.notification_filter_channel_id.filter(channelId)) {
      ctx.db.NotificationFilter.delete({ ...nf });
    }

    ctx.db.Channel.channelId.delete(channelId);
  }
);

/*** MEMBERSHIP & PERMISSIONS ***/

export const create_invite_token = spacetimedb.reducer(
  { venueId: t.u64(), token: t.string() },
  (ctx, { venueId, token }) => {
    const userId = getUserId(ctx);
    const venue = ctx.db.Venue.venueId.find(venueId);
    if (!venue) throw new SenderError("api_errors.venue_not_found");

    const allMembers = [...ctx.db.VenueMember.venue_member_venue_id.filter(venueId)];
    const myMember = allMembers.find(m => m.userId === userId);
    if (!myMember || myMember.isBlocked) {
      throw new SenderError("api_errors.create_invite_forbidden");
    }

    const expiresAtMicros = ctx.timestamp.microsSinceUnixEpoch + (24n * 3600n * 1000000n);
    ctx.db.VenueInviteToken.insert({
      token,
      venueId,
      createdAt: ctx.timestamp,
      expiresAt: new Timestamp(expiresAtMicros)
    });
  }
);

export const join_venue = spacetimedb.reducer(
  { token: t.string() },
  (ctx, { token }) => {
    const userId = getUserId(ctx);

    const invite = ctx.db.VenueInviteToken.token.find(token);
    if (!invite) throw new SenderError("api_errors.invalid_token");
    if (ctx.timestamp.microsSinceUnixEpoch > invite.expiresAt.microsSinceUnixEpoch) {
      throw new SenderError("api_errors.invite_expired");
    }

    const venueId = invite.venueId;
    const venue = ctx.db.Venue.venueId.find(venueId);
    if (!venue) throw new SenderError("api_errors.venue_not_found");

    const existingMembers = [...ctx.db.VenueMember.venue_member_venue_id.filter(venueId)];
    if (existingMembers.some(m => m.userId === userId)) {
      throw new SenderError("api_errors.already_member");
    }

    ctx.db.VenueMember.insert({
      venueId,
      userId: userId,
      joinDate: ctx.timestamp,
      lastSeen: ctx.timestamp,
      isBlocked: false,
      role: { tag: "member", value: "" },
    });
  }
);

export const leave_venue = spacetimedb.reducer(
  { venueId: t.u64() },
  (ctx, { venueId }) => {
    const userId = getUserId(ctx);
    const venue = ctx.db.Venue.venueId.find(venueId);
    if (!venue) throw new SenderError("api_errors.venue_not_found");

    if (venue.ownerId === userId) {
      throw new SenderError("api_errors.owner_cannot_leave");
    }

    const existingMembers = [...ctx.db.VenueMember.venue_member_venue_id.filter(venueId)];
    const membership = existingMembers.find(m => m.userId === userId);
    if (!membership) {
      throw new SenderError("api_errors.not_member");
    }

    const channels = [...ctx.db.Channel.channel_venue_id.filter(venueId)];
    for (const ch of channels) {
      const roles = [...ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(ch.channelId)];
      const userRole = roles.find(r => r.userId === userId);
      if (userRole) {
        ctx.db.ChannelMemberRole.delete({ ...userRole });
      }
    }

    ctx.db.VenueMember.delete({ ...membership });
  }
);

export const set_venue_role = spacetimedb.reducer(
  { venueId: t.u64(), targetUserId: t.u64(), role: t.string() },
  (ctx, { venueId, targetUserId, role }) => {
    const userId = getUserId(ctx);
    const venue = ctx.db.Venue.venueId.find(venueId);
    if (!venue) throw new SenderError("api_errors.venue_not_found");

    const allMembers = [...ctx.db.VenueMember.venue_member_venue_id.filter(venueId)];
    const callerMember = allMembers.find(m => m.userId === userId);
    if (!callerMember) throw new SenderError("api_errors.not_member");

    const isVenueOwner = venue.ownerId === userId || callerMember.role.tag === "owner";
    const isVenueAdmin = callerMember.role.tag === "admin";

    if (!isVenueOwner && !isVenueAdmin) {
      throw new SenderError("api_errors.set_venue_role_forbidden");
    }

    // Admin cannot grant "owner" or "admin" to others
    if (isVenueAdmin && !isVenueOwner && (role === "owner" || role === "admin")) {
      throw new SenderError("api_errors.admin_role_limit");
    }

    const targetMember = allMembers.find(r => r.userId === targetUserId);
    if (!targetMember) throw new SenderError("api_errors.target_user_not_found");

    ctx.db.VenueMember.delete({ ...targetMember });
    ctx.db.VenueMember.insert({
      ...targetMember,
      role: { tag: role as any, value: "" },
    });
  }
);

export const set_channel_role = spacetimedb.reducer(
  { channelId: t.u64(), targetUserId: t.u64(), role: t.string() },
  (ctx, { channelId, targetUserId, role }) => {
    const userId = getUserId(ctx);
    const ch = ctx.db.Channel.channelId.find(channelId);
    if (!ch) throw new SenderError("api_errors.channel_not_found");

    const venue = ctx.db.Venue.venueId.find(ch.venueId);
    if (!venue) throw new SenderError("api_errors.venue_not_found");

    const callerRoles = [...ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(channelId)];
    const callerRole = callerRoles.find(r => r.userId === userId);

    const isVenueOwner = venue.ownerId === userId;
    const isChannelOwner = callerRole?.role.tag === "owner";
    const isChannelAdmin = callerRole?.role.tag === "admin";

    if (!isVenueOwner && !isChannelOwner && !isChannelAdmin) {
      throw new SenderError("api_errors.set_channel_role_forbidden");
    }

    if (isChannelAdmin && !isChannelOwner && !isVenueOwner && role !== "moderator" && role !== "member") {
      throw new SenderError("api_errors.admin_role_limit");
    }

    const existingTargetRole = callerRoles.find(r => r.userId === targetUserId);
    if (existingTargetRole) {
      ctx.db.ChannelMemberRole.delete({ ...existingTargetRole });
    }

    ctx.db.ChannelMemberRole.insert({
      channelId,
      userId: targetUserId,
      role: { tag: role as any, value: "" },
    });
  }
);

export const block_user = spacetimedb.reducer(
  { venueId: t.u64(), targetUserId: t.u64() },
  (ctx, { venueId, targetUserId }) => {
    const userId = getUserId(ctx);
    const venue = ctx.db.Venue.venueId.find(venueId);
    if (!venue) throw new SenderError("api_errors.venue_not_found");

    const allMembers = [...ctx.db.VenueMember.venue_member_venue_id.filter(venueId)];
    const callerMember = allMembers.find(m => m.userId === userId);

    const isVenueOwner = venue.ownerId === userId || callerMember?.role.tag === "owner";
    const isAdmin = isVenueOwner || callerMember?.role.tag === "admin";

    if (!isAdmin) throw new SenderError("api_errors.block_user_forbidden");

    const targetMember = allMembers.find(m => m.userId === targetUserId);
    if (!targetMember) throw new SenderError("api_errors.target_user_not_in_venue");
    if (targetUserId === userId) {
      throw new SenderError("api_errors.cannot_block_self");
    }

    ctx.db.VenueMember.delete({ ...targetMember });
    ctx.db.VenueMember.insert({ ...targetMember, isBlocked: true });
  }
);

export const unblock_user = spacetimedb.reducer(
  { venueId: t.u64(), targetUserId: t.u64() },
  (ctx, { venueId, targetUserId }) => {
    const userId = getUserId(ctx);
    const venue = ctx.db.Venue.venueId.find(venueId);
    if (!venue) throw new SenderError("api_errors.venue_not_found");

    const allMembers = [...ctx.db.VenueMember.venue_member_venue_id.filter(venueId)];
    const callerMember = allMembers.find(m => m.userId === userId);

    const isVenueOwner = venue.ownerId === userId || callerMember?.role.tag === "owner";
    const isAdmin = isVenueOwner || callerMember?.role.tag === "admin";

    if (!isAdmin) throw new SenderError("api_errors.unblock_user_forbidden");

    const targetMember = allMembers.find(m => m.userId === targetUserId);
    if (!targetMember) throw new SenderError("api_errors.target_user_not_in_venue");

    ctx.db.VenueMember.delete({ ...targetMember });
    ctx.db.VenueMember.insert({ ...targetMember, isBlocked: false });
  }
);

/*** MESSAGING & TEMPLATES ***/

// Helper: asserts caller is at least channel owner or admin (or venue owner)
function assertChannelManager(ctx: any, channelId: bigint): void {
  const userId = getUserId(ctx);
  const ch = ctx.db.Channel.channelId.find(channelId);
  if (!ch) throw new SenderError("api_errors.channel_not_found");
  const venue = ctx.db.Venue.venueId.find(ch.venueId);
  if (!venue) throw new SenderError("api_errors.venue_not_found");
  const isVenueOwner = venue.ownerId === userId;
  if (isVenueOwner) return;
  const roles = [...ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(channelId)];
  const myRole = roles.find(r => r.userId === userId);
  if (myRole?.role.tag !== "owner" && myRole?.role.tag !== "admin") {
    throw new SenderError("api_errors.manage_templates_forbidden");
  }
}

export const create_message_template = spacetimedb.reducer(
  { channelId: t.u64(), name: t.string(), description: t.string(), fieldsJson: t.string() },
  (ctx, { channelId, name, description, fieldsJson }) => {
    assertChannelManager(ctx, channelId);
    ctx.db.MessageTemplate.insert({
      templateId: 0n,
      channelId,
      name,
      description,
      fieldsJson,
    });
  }
);

export const update_message_template = spacetimedb.reducer(
  { templateId: t.u64(), name: t.string(), description: t.string(), fieldsJson: t.string() },
  (ctx, { templateId, name, description, fieldsJson }) => {
    const template = ctx.db.MessageTemplate.templateId.find(templateId);
    if (!template) throw new SenderError("api_errors.template_not_found");
    assertChannelManager(ctx, template.channelId);
    ctx.db.MessageTemplate.templateId.update({ ...template, name, description, fieldsJson });
  }
);

export const delete_message_template = spacetimedb.reducer(
  { templateId: t.u64() },
  (ctx, { templateId }) => {
    const template = ctx.db.MessageTemplate.templateId.find(templateId);
    if (!template) throw new SenderError("api_errors.template_not_found");
    assertChannelManager(ctx, template.channelId);
    ctx.db.MessageTemplate.templateId.delete(templateId);
  }
);

export const send_message = spacetimedb.reducer(
  { channelId: t.u64(), content: t.string(), templateId: t.u64().optional() },
  (ctx, { channelId, content, templateId }) => {
    console.log(`[SendMessage] Channel: ${channelId}, Template: ${templateId}`);
    const userId = getUserId(ctx);
    const ch = ctx.db.Channel.channelId.find(channelId);
    if (!ch) throw new SenderError("api_errors.channel_not_found");

    const venue = ctx.db.Venue.venueId.find(ch.venueId);
    if (!venue) throw new SenderError("api_errors.venue_not_found");

    // Must be a venue member
    const allMembers = [...ctx.db.VenueMember.venue_member_venue_id.filter(ch.venueId)];
    const member = allMembers.find(m => m.userId === userId);
    if (!member) throw new SenderError("api_errors.not_member_short");
    if (member.isBlocked) {
      throw new SenderError("api_errors.blocked_from_sending");
    }

    const callerRoles = [...ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(channelId)];
    const userRole = callerRoles.find(r => r.userId === userId)?.role.tag;
    const isOwner = venue.ownerId === userId || userRole === "owner";

    if (!isOwner && userRole !== "admin" && userRole !== "moderator") {
      throw new SenderError("api_errors.send_message_forbidden");
    }

    const row = ctx.db.Message.insert({
      messageId: 0n,
      channelId,
      senderId: userId,
      templateId,
      content,
      sentAt: ctx.timestamp,
    });

    const activeDisplays = [...ctx.db.DisplayDevice.display_device_venue_id.filter(ch.venueId)];
    for (const display of activeDisplays) {
      ctx.db.MessageDeliveryStatus.insert({
        statusId: 0n,
        messageId: row.messageId,
        displayId: display.displayId,
        status: { tag: "Queued", value: "" },
        updatedAt: ctx.timestamp,
      });
    }
  }
);

export const delete_message = spacetimedb.reducer(
  { messageId: t.u64() },
  (ctx, { messageId }) => {
    const userId = getUserId(ctx);
    const msg = ctx.db.Message.messageId.find(messageId);
    if (!msg) throw new SenderError("api_errors.message_not_found");

    // Caller must be the original sender, a channel owner/admin, or the venue owner
    const isSender = msg.senderId === userId;
    if (!isSender) {
      const ch = ctx.db.Channel.channelId.find(msg.channelId);
      const venue = ch ? ctx.db.Venue.venueId.find(ch.venueId) : undefined;
      const isVenueOwner = venue?.ownerId === userId;
      const roles = [...ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(msg.channelId)];
      const myRole = roles.find(r => r.userId === userId);
      const isChannelManager = myRole?.role.tag === "owner" || myRole?.role.tag === "admin" || myRole?.role.tag === "moderator";
      if (!isVenueOwner && !isChannelManager) {
        throw new SenderError("api_errors.delete_message_forbidden");
      }
    }

    const statuses = [...ctx.db.MessageDeliveryStatus.delivery_status_message_id.filter(messageId)];
    for (const st of statuses) {
      ctx.db.MessageDeliveryStatus.statusId.update({
        ...st,
        status: { tag: "Cancelled", value: "" },
        updatedAt: ctx.timestamp,
      });
    }
  }
);

export const repeat_message = spacetimedb.reducer(
  { messageId: t.u64() },
  (ctx, { messageId }) => {
    const userId = getUserId(ctx);
    const msg = ctx.db.Message.messageId.find(messageId);
    if (!msg) throw new SenderError("api_errors.message_not_found");

    // Must have at least moderator role to repeat a message
    const ch = ctx.db.Channel.channelId.find(msg.channelId);
    if (!ch) throw new SenderError("api_errors.channel_not_found");
    const venue = ctx.db.Venue.venueId.find(ch.venueId);
    const allMembers = [...ctx.db.VenueMember.venue_member_venue_id.filter(ch.venueId)];
    const member = allMembers.find(m => m.userId === userId);
    if (!member) throw new SenderError("api_errors.member_of_venue_required");
    if (member.isBlocked) throw new SenderError("api_errors.blocked_in_venue");
    const roles = [...ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(msg.channelId)];
    const myRole = roles.find(r => r.userId === userId)?.role.tag;
    const isVenueOwner = venue?.ownerId === userId;
    if (!isVenueOwner && myRole !== "owner" && myRole !== "admin" && myRole !== "moderator") {
      throw new SenderError("api_errors.repeat_message_forbidden");
    }

    const row = ctx.db.Message.insert({
      messageId: 0n,
      channelId: msg.channelId,
      senderId: userId,
      templateId: msg.templateId,
      content: msg.content,
      sentAt: ctx.timestamp,
    });

    const activeDisplays = [...ctx.db.DisplayDevice.display_device_venue_id.filter(ch.venueId)];
    for (const display of activeDisplays) {
      ctx.db.MessageDeliveryStatus.insert({
        statusId: 0n, // Added statusId
        messageId: row.messageId,
        displayId: display.displayId,
        status: { tag: "Queued", value: "" },
        updatedAt: ctx.timestamp,
      });
    }
  }
);

/*** ELECTRON DISPLAY SYNC ***/

export const create_display_pin = spacetimedb.reducer(
  { displayUid: t.string() },
  (ctx, { displayUid }) => {
    // We allow anonymous callers to generate a PIN.
    // The PIN is linked to the caller's identity so only they can use it to pair later.
    const pin = ctx.random.integerInRange(100000, 999999).toString();
    const expiresAt = ctx.timestamp.microsSinceUnixEpoch + (10n * 60n * 1000000n); // 10 mins

    ctx.db.DisplayPairingPin.insert({
      pin,
      displayUid,
      identity: ctx.sender,
      expiresAt: new Timestamp(expiresAt)
    });
  }
);

export const register_display_to_venue = spacetimedb.reducer(
  { pin: t.string(), venueId: t.u64(), name: t.string() },
  (ctx, { pin, venueId, name }) => {
    const userId = getUserId(ctx);
    // Caller must be a member of the target venue
    const venueMemberships = [...ctx.db.VenueMember.venue_member_venue_id.filter(venueId)];
    const callerMembership = venueMemberships.find(m => m.userId === userId);
    if (!callerMembership) throw new SenderError("api_errors.register_node_member_required");
    if (callerMembership.isBlocked) throw new SenderError("api_errors.blocked_in_venue");

    // Only venue owner or channel-level owners/admins can register nodes
    const venue = ctx.db.Venue.venueId.find(venueId);
    if (!venue) throw new SenderError("api_errors.venue_not_found");
    const isVenueOwner = venue.ownerId === userId;
    if (!isVenueOwner) {
      const channels = [...ctx.db.Channel.channel_venue_id.filter(venueId)];
      const myRolesInVenue = channels.flatMap(ch =>
        [...ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(ch.channelId)]
          .filter(r => r.userId === userId)
      );
      const isAdmin = myRolesInVenue.some(r => r.role.tag === "owner" || r.role.tag === "admin");
      if (!isAdmin) throw new SenderError("api_errors.register_node_forbidden");
    }

    const pairing = ctx.db.DisplayPairingPin.pin.find(pin);
    if (!pairing) throw new SenderError("api_errors.invalid_pin_expired");
    if (ctx.timestamp.microsSinceUnixEpoch > pairing.expiresAt.microsSinceUnixEpoch) {
      throw new SenderError("api_errors.pin_expired");
    }

    // Clean up old registrations for this UID in THIS venue 
    // (prevents ghost nodes on re-pairing after reset)
    const oldDevices = [...ctx.db.DisplayDevice.display_device_uid.filter(pairing.displayUid)]
      .filter(d => d.venueId === venueId);
    for (const old of oldDevices) {
      ctx.db.DisplayDevice.displayId.delete(old.displayId);
    }

    ctx.db.DisplayDevice.insert({
      displayId: 0n,
      uid: pairing.displayUid,
      identity: pairing.identity,
      venueId,
      name,
      registeredAt: ctx.timestamp,
      lastConnectedAt: ctx.timestamp,
    });

    ctx.db.DisplayPairingPin.pin.delete(pin);
  }
);

export const display_connect = spacetimedb.reducer(
  { displayUid: t.string() },
  (ctx, { displayUid }) => {
    // Find devices with this UID and verify the identity matches the one stored at pairing time
    const devices = [...ctx.db.DisplayDevice.display_device_uid.filter(displayUid)]
      .filter(d => d.identity.isEqual(ctx.sender));

    if (devices.length === 0) {
      throw new SenderError("api_errors.display_device_not_registered");
    }

    for (const device of devices) {
      ctx.db.DisplayDevice.displayId.update({
        ...device,
        lastConnectedAt: ctx.timestamp,
      });
    }
  }
);

export const update_message_delivery_status = spacetimedb.reducer(
  { uid: t.string(), messageId: t.u64(), statusTag: t.string() },
  (ctx, { uid, messageId, statusTag }) => {
    console.log(`[UpdateStatus] UID: ${uid}, Msg: ${messageId}, Status: ${statusTag}`);

    // 1. Find the message and its venue
    const msg = ctx.db.Message.messageId.find(messageId);
    if (!msg) throw new SenderError("api_errors.message_not_found");

    const channel = ctx.db.Channel.channelId.find(msg.channelId);
    if (!channel) throw new SenderError("api_errors.channel_not_found_for_message");

    // 2. Find the SPECIFIC device pairing for this machine and this venue
    const devicesByUid = [...ctx.db.DisplayDevice.display_device_uid.filter(uid)];
    const device = devicesByUid.find(d => d.identity.isEqual(ctx.sender) && d.venueId === channel.venueId);

    if (!device) {
      const senderHex = ctx.sender.toHexString().slice(0, 10);
      console.error(`[UpdateStatus] Identity mismatch for UID ${uid}. Sender: ${senderHex}... Venue: ${channel.venueId}`);
      if (devicesByUid.length > 0) {
        console.error(`[UpdateStatus] Found ${devicesByUid.length} devices with this UID but none match sender/venue.`);
        devicesByUid.forEach(d => console.log(` - Device ${d.displayId} Identity: ${d.identity.toHexString().slice(0, 10)}... Venue: ${d.venueId}`));
      }
      throw new SenderError("api_errors.display_device_mismatch");
    }

    console.log(`[UpdateStatus] Found device: ${device.displayId} (${device.name})`);

    // 3. Update the status row
    const statusRow = [...ctx.db.MessageDeliveryStatus.delivery_status_message_id.filter(messageId)]
      .find(s => s.displayId === device.displayId);

    if (statusRow) {
      console.log(`[UpdateStatus] Updating status for ID ${statusRow.statusId} to ${statusTag}`);
      ctx.db.MessageDeliveryStatus.statusId.update({
        ...statusRow,
        status: { tag: statusTag as any, value: "" },
        updatedAt: ctx.timestamp,
      });
    } else {
      console.log(`[UpdateStatus] No status row found, creating new one.`);
      ctx.db.MessageDeliveryStatus.insert({
        statusId: 0n,
        messageId,
        displayId: device.displayId,
        status: { tag: statusTag as any, value: "" },
        updatedAt: ctx.timestamp,
      });
    }

    console.log(`[UpdateStatus] Successfully set ${messageId}/${device.displayId} to ${statusTag}`);
  }
);

export const skip_missed_messages = spacetimedb.reducer(
  { uid: t.string(), appStartTimeMicros: t.u64() },
  (ctx, { uid, appStartTimeMicros }) => {
    // 1. Get all devices for this UID that match the sender's identity
    const myDevices = [...ctx.db.DisplayDevice.display_device_uid.filter(uid)]
      .filter(d => d.identity.isEqual(ctx.sender));

    if (myDevices.length === 0) return;

    const myDisplayIds = myDevices.map(d => d.displayId);
    
    // 2. Find all 'Queued' statuses for these displays that were sent before the app started
    // We use a small buffer (1s = 1,000,000 micros) to avoid racing with messages sent exactly at startup
    const buffer = 1000000n;
    const threshold = BigInt(appStartTimeMicros) - buffer;

    for (const statusRow of ctx.db.MessageDeliveryStatus.iter()) {
      if (!myDisplayIds.includes(statusRow.displayId)) continue;
      if (statusRow.status.tag !== "Queued") continue;

      const msg = ctx.db.Message.messageId.find(statusRow.messageId);
      if (msg && msg.sentAt.microsSinceUnixEpoch < threshold) {
        ctx.db.MessageDeliveryStatus.statusId.update({
          ...statusRow,
          status: { tag: "Skipped", value: "" },
          updatedAt: ctx.timestamp
        });
      }
    }
  }
);

export const delete_display_device = spacetimedb.reducer(
  { displayId: t.u64() },
  (ctx, { displayId }) => {
    const userId = getUserId(ctx);
    const device = ctx.db.DisplayDevice.displayId.find(displayId);
    if (!device) throw new SenderError("api_errors.device_not_found");

    // Must be venue owner or admin to delete nodes
    const venue = ctx.db.Venue.venueId.find(device.venueId);
    if (!venue) throw new SenderError("api_errors.venue_not_found");
    const isVenueOwner = venue.ownerId === userId;

    if (!isVenueOwner) {
      const channels = [...ctx.db.Channel.channel_venue_id.filter(device.venueId)];
      const myRolesInVenue = channels.flatMap(ch =>
        [...ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(ch.channelId)]
          .filter(r => r.userId === userId)
      );
      const isAdmin = myRolesInVenue.some(r => r.role.tag === "owner" || r.role.tag === "admin");
      if (!isAdmin) throw new SenderError("api_errors.delete_node_forbidden");
    }

    ctx.db.DisplayDevice.displayId.delete(displayId);

    // Cleanup delivery statuses
    const statuses = [...ctx.db.MessageDeliveryStatus.delivery_status_display_id.filter(displayId)];
    for (const s of statuses) {
      ctx.db.MessageDeliveryStatus.delete({ ...s });
    }
  }
);

export const update_display_name = spacetimedb.reducer(
  { displayId: t.u64(), newName: t.string() },
  (ctx, { displayId, newName }) => {
    const userId = getUserId(ctx);
    const device = ctx.db.DisplayDevice.displayId.find(displayId);
    if (!device) throw new SenderError("api_errors.device_not_found");

    const venue = ctx.db.Venue.venueId.find(device.venueId);
    if (!venue) throw new SenderError("api_errors.venue_not_found");
    const isVenueOwner = venue.ownerId === userId;

    if (!isVenueOwner) {
      const channels = [...ctx.db.Channel.channel_venue_id.filter(device.venueId)];
      const myRolesInVenue = channels.flatMap(ch =>
        [...ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(ch.channelId)]
          .filter(r => r.userId === userId)
      );
      const isAdmin = myRolesInVenue.some(r => r.role.tag === "owner" || r.role.tag === "admin");
      if (!isAdmin) throw new SenderError("api_errors.rename_node_forbidden");
    }

    ctx.db.DisplayDevice.displayId.update({
      ...device,
      name: newName.trim(),
    });
  }
);

export const unpair_display = spacetimedb.reducer(
  { displayId: t.u64() },
  (ctx, { displayId }) => {
    const device = ctx.db.DisplayDevice.displayId.find(displayId);
    if (!device) throw new SenderError("api_errors.device_not_found");

    // Allow the device ITSELF to unpair (security check: identity must match)
    if (!device.identity.isEqual(ctx.sender)) {
      throw new SenderError("api_errors.unpair_node_forbidden");
    }

    ctx.db.DisplayDevice.displayId.delete(displayId);

    // Cleanup delivery statuses
    const statuses = [...ctx.db.MessageDeliveryStatus.delivery_status_display_id.filter(displayId)];
    for (const s of statuses) {
      ctx.db.MessageDeliveryStatus.delete({ ...s });
    }
  }
);

export default spacetimedb;
