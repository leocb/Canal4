import spacetimedb from "./schema";
import { t, SenderError } from "spacetimedb/server";
import { Timestamp } from "spacetimedb";

/*** USER AUTHENTICATION & MANAGEMENT ***/

function getUserId(ctx: any): bigint {
  const ui = ctx.db.UserIdentity.identity.find(ctx.sender);
  if (!ui) throw new SenderError("Not logged in");
  return ui.userId;
}

export const login_or_create_user = spacetimedb.reducer(
  { email: t.string().optional(), name: t.string() },
  (ctx, { email, name }) => {
    if (!email) {
      throw new SenderError("Must provide email to login/create user");
    }

    const normalizedEmail = email?.trim().toLowerCase();

    // Find the user if they already exist
    let user = null;
    if (normalizedEmail) {
      user = [...ctx.db.User.iter()].find((u) => u.email?.trim().toLowerCase() === normalizedEmail) || null;
    }

    if (!user) {
      user = ctx.db.User.insert({
        userId: 0n,
        email: normalizedEmail,
        passkeyCredentialId: undefined,
        name: name.trim(),
        pushToken: undefined,
        createdAt: ctx.timestamp,
      });
    } else {
      ctx.db.User.userId.update({
        ...user,
        email: normalizedEmail || user.email,
        // Intentionally do not allow updating the name through login_or_create_user to prevent spoofing
      });
    }

    // Link this connection's identity to the user
    const existingIdentity = ctx.db.UserIdentity.identity.find(ctx.sender);
    if (!existingIdentity) {
      ctx.db.UserIdentity.insert({
        identity: ctx.sender,
        userId: user.userId,
      });
    } else if (existingIdentity.userId !== user.userId) {
      ctx.db.UserIdentity.identity.update({
        identity: ctx.sender,
        userId: user.userId,
      });
    }
  }
);

export const update_user_name = spacetimedb.reducer(
  { userId: t.u64(), newName: t.string() },
  (ctx, { userId, newName }) => {
    const callerId = getUserId(ctx);
    
    // Explicitly block others from changing names of other users
    if (callerId !== userId) {
      throw new SenderError("You are only permitted to change your own name.");
    }
    
    const user = ctx.db.User.userId.find(userId);
    if (!user) throw new SenderError("User not found");
    
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
      throw new SenderError("You are only permitted to delete your own account.");
    }

    const user = ctx.db.User.userId.find(userId);
    if (!user) throw new SenderError("User not found");
    
    if (user.name !== confirmationName) {
      throw new SenderError("Confirmation name does not match");
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
    if (!user) throw new SenderError("User not found");
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
      throw new SenderError("No user found with this passkey credential");
    }
    // With UserIdentity pattern we just link identity if valid.
    const existingIdentity = ctx.db.UserIdentity.identity.find(ctx.sender);
    if (!existingIdentity) {
      ctx.db.UserIdentity.insert({
        identity: ctx.sender,
        userId: expectedUser.userId,
      });
    } else if (existingIdentity.userId !== expectedUser.userId) {
      ctx.db.UserIdentity.identity.update({
        identity: ctx.sender,
        userId: expectedUser.userId,
      });
    }
  }
);

export const update_push_token = spacetimedb.reducer(
  { token: t.string() },
  (ctx, { token }) => {
    const userId = getUserId(ctx);
    const user = ctx.db.User.userId.find(userId);
    if (!user) throw new SenderError("User not found");
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
    if (!venue) throw new SenderError("Venue not found");
    if (venue.ownerId !== userId) {
      throw new SenderError("Only the original creator/owner can update the venue");
    }
    ctx.db.Venue.venueId.update({ ...venue, name: newName });
  }
);

export const delete_venue = spacetimedb.reducer(
  { venueId: t.u64(), confirmationName: t.string() },
  (ctx, { venueId, confirmationName }) => {
    const userId = getUserId(ctx);
    const venue = ctx.db.Venue.venueId.find(venueId);
    if (!venue) throw new SenderError("Venue not found");
    if (venue.ownerId !== userId) {
      throw new SenderError("Only the venue owner can delete it");
    }
    if (venue.name !== confirmationName) {
      throw new SenderError("Confirmation name does not match venue name");
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
    if (!venue) throw new SenderError("Venue not found");

    const isVenueOwner = venue.ownerId === userId;
    const members = [...ctx.db.VenueMember.venue_member_venue_id.filter(venueId)];
    const myMembership = members.find(m => m.userId === userId);
    const isVenueAdmin = myMembership?.role.tag === "admin";
    
    if (!isVenueOwner && !isVenueAdmin) {
      throw new SenderError("Only owners/admins can create channels");
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
    if (!channel) throw new SenderError("Channel not found");

    const venue = ctx.db.Venue.venueId.find(channel.venueId);
    if (!venue) throw new SenderError("Venue not found");

    const isVenueOwner = venue.ownerId === userId;
    const roles = [...ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(channelId)];
    const myRole = roles.find(r => r.userId === userId);
    const isChannelOwner = myRole?.role.tag === "owner";

    if (!isVenueOwner && !isChannelOwner) {
      throw new SenderError("Only owners can update the channel");
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
    if (!channel) throw new SenderError("Channel not found");

    if (channel.name !== confirmationName) {
      throw new SenderError("Confirmation name does not match channel name");
    }

    const venue = ctx.db.Venue.venueId.find(channel.venueId);
    if (!venue) throw new SenderError("Venue not found");

    const isVenueOwner = venue.ownerId === userId;
    const roles = [...ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(channelId)];
    const myRole = roles.find(r => r.userId === userId);
    const isChannelOwner = myRole?.role.tag === "owner";

    if (!isVenueOwner && !isChannelOwner) {
      throw new SenderError("Only owners can delete the channel");
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
    if (!venue) throw new SenderError("Venue not found");

    const allMembers = [...ctx.db.VenueMember.venue_member_venue_id.filter(venueId)];
    const myMember = allMembers.find(m => m.userId === userId);
    if (!myMember || myMember.isBlocked) {
      throw new SenderError("You are not allowed to create invites.");
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
    if (!invite) throw new SenderError("Invalid invitation token");
    if (ctx.timestamp.microsSinceUnixEpoch > invite.expiresAt.microsSinceUnixEpoch) {
      throw new SenderError("Invitation link has expired");
    }

    const venueId = invite.venueId;
    const venue = ctx.db.Venue.venueId.find(venueId);
    if (!venue) throw new SenderError("Venue not found");

    const existingMembers = [...ctx.db.VenueMember.venue_member_venue_id.filter(venueId)];
    if (existingMembers.some(m => m.userId === userId)) {
      throw new SenderError("You are already a member of this venue");
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
    if (!venue) throw new SenderError("Venue not found");

    if (venue.ownerId === userId) {
      throw new SenderError("The original venue owner cannot leave the venue. You must transfer ownership or delete the venue.");
    }

    const existingMembers = [...ctx.db.VenueMember.venue_member_venue_id.filter(venueId)];
    const membership = existingMembers.find(m => m.userId === userId);
    if (!membership) {
      throw new SenderError("You are not a member of this venue");
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
    if (!venue) throw new SenderError("Venue not found");

    const allMembers = [...ctx.db.VenueMember.venue_member_venue_id.filter(venueId)];
    const callerMember = allMembers.find(m => m.userId === userId);
    if (!callerMember) throw new SenderError("Not a member of this venue");

    const isVenueOwner = venue.ownerId === userId || callerMember.role.tag === "owner";
    const isVenueAdmin = callerMember.role.tag === "admin";

    if (!isVenueOwner && !isVenueAdmin) {
      throw new SenderError("Insufficient permissions to set venue roles");
    }
    
    // Admin cannot grant "owner" or "admin" to others
    if (isVenueAdmin && !isVenueOwner && (role === "owner" || role === "admin")) {
      throw new SenderError("Admins can only assign Moderator or Member roles");
    }

    const targetMember = allMembers.find(r => r.userId === targetUserId);
    if (!targetMember) throw new SenderError("Target user not found in venue");

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
    if (!ch) throw new SenderError("Channel not found");

    const venue = ctx.db.Venue.venueId.find(ch.venueId);
    if (!venue) throw new SenderError("Venue not found");

    const callerRoles = [...ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(channelId)];
    const callerRole = callerRoles.find(r => r.userId === userId);

    const isVenueOwner = venue.ownerId === userId;
    const isChannelOwner = callerRole?.role.tag === "owner";
    const isChannelAdmin = callerRole?.role.tag === "admin";

    if (!isVenueOwner && !isChannelOwner && !isChannelAdmin) {
      throw new SenderError("Insufficient permissions to set roles");
    }

    if (isChannelAdmin && !isChannelOwner && !isVenueOwner && role !== "moderator" && role !== "member") {
      throw new SenderError("Admins can only assign Moderator or Member roles");
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
    if (!venue) throw new SenderError("Venue not found");

    const allMembers = [...ctx.db.VenueMember.venue_member_venue_id.filter(venueId)];
    const callerMember = allMembers.find(m => m.userId === userId);
    
    const isVenueOwner = venue.ownerId === userId || callerMember?.role.tag === "owner";
    const isAdmin = isVenueOwner || callerMember?.role.tag === "admin";

    if (!isAdmin) throw new SenderError("Only venue Admins or Owners can block users");

    const targetMember = allMembers.find(m => m.userId === targetUserId);
    if (!targetMember) throw new SenderError("Target user is not in this venue");
    if (targetUserId === userId) {
      throw new SenderError("You cannot block yourself");
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
    if (!venue) throw new SenderError("Venue not found");

    const allMembers = [...ctx.db.VenueMember.venue_member_venue_id.filter(venueId)];
    const callerMember = allMembers.find(m => m.userId === userId);
    
    const isVenueOwner = venue.ownerId === userId || callerMember?.role.tag === "owner";
    const isAdmin = isVenueOwner || callerMember?.role.tag === "admin";

    if (!isAdmin) throw new SenderError("Only venue Admins or Owners can unblock users");

    const targetMember = allMembers.find(m => m.userId === targetUserId);
    if (!targetMember) throw new SenderError("Target user is not in this venue");

    ctx.db.VenueMember.delete({ ...targetMember });
    ctx.db.VenueMember.insert({ ...targetMember, isBlocked: false });
  }
);

/*** MESSAGING & TEMPLATES ***/

// Helper: asserts caller is at least channel owner or admin (or venue owner)
function assertChannelManager(ctx: any, channelId: bigint): void {
  const userId = getUserId(ctx);
  const ch = ctx.db.Channel.channelId.find(channelId);
  if (!ch) throw new SenderError("Channel not found");
  const venue = ctx.db.Venue.venueId.find(ch.venueId);
  if (!venue) throw new SenderError("Venue not found");
  const isVenueOwner = venue.ownerId === userId;
  if (isVenueOwner) return;
  const roles = [...ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(channelId)];
  const myRole = roles.find(r => r.userId === userId);
  if (myRole?.role.tag !== "owner" && myRole?.role.tag !== "admin") {
    throw new SenderError("Only channel owners/admins or venue owners can manage templates");
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
    if (!template) throw new SenderError("Template not found");
    assertChannelManager(ctx, template.channelId);
    ctx.db.MessageTemplate.templateId.update({ ...template, name, description, fieldsJson });
  }
);

export const delete_message_template = spacetimedb.reducer(
  { templateId: t.u64() },
  (ctx, { templateId }) => {
    const template = ctx.db.MessageTemplate.templateId.find(templateId);
    if (!template) throw new SenderError("Template not found");
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
    if (!ch) throw new SenderError("Channel not found");

    const venue = ctx.db.Venue.venueId.find(ch.venueId);
    if (!venue) throw new SenderError("Venue not found");

    // Must be a venue member
    const allMembers = [...ctx.db.VenueMember.venue_member_venue_id.filter(ch.venueId)];
    const member = allMembers.find(m => m.userId === userId);
    if (!member) throw new SenderError("You are not a member of this venue.");
    if (member.isBlocked) {
      throw new SenderError("You are blocked in this venue and cannot send messages.");
    }

    const callerRoles = [...ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(channelId)];
    const userRole = callerRoles.find(r => r.userId === userId)?.role.tag;
    const isOwner = venue.ownerId === userId || userRole === "owner";

    if (!isOwner && userRole !== "admin" && userRole !== "moderator") {
      throw new SenderError("Only Moderators and above can send messages.");
    }

    const row = ctx.db.Message.insert({
      messageId: 0n,
      channelId,
      senderId: userId,
      templateId,
      content,
      sentAt: ctx.timestamp,
    });

    const activeMessengers = [...ctx.db.MessengerDevice.messenger_device_venue_id.filter(ch.venueId)];
    for (const messenger of activeMessengers) {
      ctx.db.MessageDeliveryStatus.insert({
        statusId: 0n,
        messageId: row.messageId,
        messengerId: messenger.messengerId,
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
    if (!msg) throw new SenderError("Message not found");

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
        throw new SenderError("You can only delete your own messages, or must be a channel admin/moderator/venue owner.");
      }
    }

    ctx.db.Message.messageId.delete(messageId);
    const statuses = [...ctx.db.MessageDeliveryStatus.delivery_status_message_id.filter(messageId)];
    for (const st of statuses) {
      ctx.db.MessageDeliveryStatus.delete({ ...st });
    }
  }
);

export const repeat_message = spacetimedb.reducer(
  { messageId: t.u64() },
  (ctx, { messageId }) => {
    const userId = getUserId(ctx);
    const msg = ctx.db.Message.messageId.find(messageId);
    if (!msg) throw new SenderError("Message not found");

    // Must have at least moderator role to repeat a message
    const ch = ctx.db.Channel.channelId.find(msg.channelId);
    if (!ch) throw new SenderError("Channel not found");
    const venue = ctx.db.Venue.venueId.find(ch.venueId);
    const allMembers = [...ctx.db.VenueMember.venue_member_venue_id.filter(ch.venueId)];
    const member = allMembers.find(m => m.userId === userId);
    if (!member) throw new SenderError("You are not a member of this venue.");
    if (member.isBlocked) throw new SenderError("You are blocked in this venue.");
    const roles = [...ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(msg.channelId)];
    const myRole = roles.find(r => r.userId === userId)?.role.tag;
    const isVenueOwner = venue?.ownerId === userId;
    if (!isVenueOwner && myRole !== "owner" && myRole !== "admin" && myRole !== "moderator") {
      throw new SenderError("Only Moderators and above can repeat messages.");
    }

    const row = ctx.db.Message.insert({
      messageId: 0n,
      channelId: msg.channelId,
      senderId: userId,
      templateId: msg.templateId,
      content: msg.content,
      sentAt: ctx.timestamp,
    });

    const activeMessengers = [...ctx.db.MessengerDevice.messenger_device_venue_id.filter(ch.venueId)];
    for (const messenger of activeMessengers) {
      ctx.db.MessageDeliveryStatus.insert({
        statusId: 0n, // Added statusId
        messageId: row.messageId,
        messengerId: messenger.messengerId,
        status: { tag: "Queued", value: "" },
        updatedAt: ctx.timestamp,
      });
    }
  }
);

/*** ELECTRON MESSENGER SYNC ***/

export const create_messenger_pin = spacetimedb.reducer(
  { messengerUid: t.string() },
  (ctx, { messengerUid }) => {
    // We allow anonymous callers to generate a PIN.
    // The PIN is linked to the caller's identity so only they can use it to pair later.
    const pin = ctx.random.integerInRange(100000, 999999).toString();
    const expiresAt = ctx.timestamp.microsSinceUnixEpoch + (10n * 60n * 1000000n); // 10 mins

    ctx.db.MessengerPairingPin.insert({
      pin,
      messengerUid,
      identity: ctx.sender,
      expiresAt: new Timestamp(expiresAt)
    });
  }
);

export const register_messenger_to_venue = spacetimedb.reducer(
  { pin: t.string(), venueId: t.u64(), name: t.string() },
  (ctx, { pin, venueId, name }) => {
    const userId = getUserId(ctx);
    // Caller must be a member of the target venue
    const venueMemberships = [...ctx.db.VenueMember.venue_member_venue_id.filter(venueId)];
    const callerMembership = venueMemberships.find(m => m.userId === userId);
    if (!callerMembership) throw new SenderError("You must be a member of this venue to register a display node");
    if (callerMembership.isBlocked) throw new SenderError("You are blocked in this venue");

    // Only venue owner or channel-level owners/admins can register nodes
    const venue = ctx.db.Venue.venueId.find(venueId);
    if (!venue) throw new SenderError("Venue not found");
    const isVenueOwner = venue.ownerId === userId;
    if (!isVenueOwner) {
      const channels = [...ctx.db.Channel.channel_venue_id.filter(venueId)];
      const myRolesInVenue = channels.flatMap(ch =>
        [...ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(ch.channelId)]
          .filter(r => r.userId === userId)
      );
      const isAdmin = myRolesInVenue.some(r => r.role.tag === "owner" || r.role.tag === "admin");
      if (!isAdmin) throw new SenderError("Only venue owners or channel admins can register display nodes");
    }

    const pairing = ctx.db.MessengerPairingPin.pin.find(pin);
    if (!pairing) throw new SenderError("Invalid or expired PIN");
    if (ctx.timestamp.microsSinceUnixEpoch > pairing.expiresAt.microsSinceUnixEpoch) {
      throw new SenderError("PIN has expired");
    }

    // Clean up old registrations for this UID in THIS venue 
    // (prevents ghost nodes on re-pairing after reset)
    const oldDevices = [...ctx.db.MessengerDevice.messenger_device_uid.filter(pairing.messengerUid)]
      .filter(d => d.venueId === venueId);
    for (const old of oldDevices) {
      ctx.db.MessengerDevice.messengerId.delete(old.messengerId);
    }

    ctx.db.MessengerDevice.insert({
      messengerId: 0n,
      uid: pairing.messengerUid,
      identity: pairing.identity,
      venueId,
      name,
      registeredAt: ctx.timestamp,
      lastConnectedAt: ctx.timestamp,
    });

    ctx.db.MessengerPairingPin.pin.delete(pin);
  }
);

export const messenger_connect = spacetimedb.reducer(
  { messengerUid: t.string() },
  (ctx, { messengerUid }) => {
    // Find devices with this UID and verify the identity matches the one stored at pairing time
    const devices = [...ctx.db.MessengerDevice.messenger_device_uid.filter(messengerUid)]
      .filter(d => d.identity.isEqual(ctx.sender));
    
    if (devices.length === 0) {
      throw new SenderError("Messenger device not registered or identity mismatch");
    }

    for (const device of devices) {
      ctx.db.MessengerDevice.messengerId.update({
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
    if (!msg) throw new SenderError(`Message ${messageId} not found`);
    
    const channel = ctx.db.Channel.channelId.find(msg.channelId);
    if (!channel) throw new SenderError(`Channel for message ${messageId} not found`);

    // 2. Find the SPECIFIC device pairing for this machine and this venue
    const devicesByUid = [...ctx.db.MessengerDevice.messenger_device_uid.filter(uid)];
    const device = devicesByUid.find(d => d.identity.isEqual(ctx.sender) && d.venueId === channel.venueId);
    
    if (!device) {
      const senderHex = ctx.sender.toHexString().slice(0, 10);
      console.error(`[UpdateStatus] Identity mismatch for UID ${uid}. Sender: ${senderHex}... Venue: ${channel.venueId}`);
      if (devicesByUid.length > 0) {
          console.error(`[UpdateStatus] Found ${devicesByUid.length} devices with this UID but none match sender/venue.`);
          devicesByUid.forEach(d => console.log(` - Device ${d.messengerId} Identity: ${d.identity.toHexString().slice(0, 10)}... Venue: ${d.venueId}`));
      }
      throw new SenderError("Messenger device not paired with this venue or identity mismatch");
    }

    console.log(`[UpdateStatus] Found device: ${device.messengerId} (${device.name})`);

    // 3. Update the status row
    const statusRow = [...ctx.db.MessageDeliveryStatus.delivery_status_message_id.filter(messageId)]
      .find(s => s.messengerId === device.messengerId);

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
        messengerId: device.messengerId,
        status: { tag: statusTag as any, value: "" },
        updatedAt: ctx.timestamp,
      });
    }
    
    console.log(`[UpdateStatus] Successfully set ${messageId}/${device.messengerId} to ${statusTag}`);
  }
);

export const delete_messenger_device = spacetimedb.reducer(
  { messengerId: t.u64() },
  (ctx, { messengerId }) => {
    const userId = getUserId(ctx);
    const device = ctx.db.MessengerDevice.messengerId.find(messengerId);
    if (!device) throw new SenderError("Device not found");

    // Must be venue owner or admin to delete nodes
    const venue = ctx.db.Venue.venueId.find(device.venueId);
    if (!venue) throw new SenderError("Venue not found");
    const isVenueOwner = venue.ownerId === userId;
    
    if (!isVenueOwner) {
       const channels = [...ctx.db.Channel.channel_venue_id.filter(device.venueId)];
       const myRolesInVenue = channels.flatMap(ch =>
        [...ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(ch.channelId)]
          .filter(r => r.userId === userId)
       );
       const isAdmin = myRolesInVenue.some(r => r.role.tag === "owner" || r.role.tag === "admin");
       if (!isAdmin) throw new SenderError("Only venue owners or channel admins can delete display nodes");
    }

    ctx.db.MessengerDevice.messengerId.delete(messengerId);
    
    // Cleanup delivery statuses
    const statuses = [...ctx.db.MessageDeliveryStatus.delivery_status_messenger_id.filter(messengerId)];
    for (const s of statuses) {
      ctx.db.MessageDeliveryStatus.delete({ ...s });
    }
  }
);

export const update_messenger_name = spacetimedb.reducer(
  { messengerId: t.u64(), newName: t.string() },
  (ctx, { messengerId, newName }) => {
    const userId = getUserId(ctx);
    const device = ctx.db.MessengerDevice.messengerId.find(messengerId);
    if (!device) throw new SenderError("Device not found");

    const venue = ctx.db.Venue.venueId.find(device.venueId);
    if (!venue) throw new SenderError("Venue not found");
    const isVenueOwner = venue.ownerId === userId;
    
    if (!isVenueOwner) {
       const channels = [...ctx.db.Channel.channel_venue_id.filter(device.venueId)];
       const myRolesInVenue = channels.flatMap(ch =>
        [...ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(ch.channelId)]
          .filter(r => r.userId === userId)
       );
       const isAdmin = myRolesInVenue.some(r => r.role.tag === "owner" || r.role.tag === "admin");
       if (!isAdmin) throw new SenderError("Only venue owners or channel admins can rename display nodes");
    }

    ctx.db.MessengerDevice.messengerId.update({
      ...device,
      name: newName.trim(),
    });
  }
);

export const unpair_messenger = spacetimedb.reducer(
  { messengerId: t.u64() },
  (ctx, { messengerId }) => {
    const device = ctx.db.MessengerDevice.messengerId.find(messengerId);
    if (!device) throw new SenderError("Device not found");

    // Allow the device ITSELF to unpair (security check: identity must match)
    if (!device.identity.isEqual(ctx.sender)) {
      throw new SenderError("Only the registered device identity can unpair itself.");
    }

    ctx.db.MessengerDevice.messengerId.delete(messengerId);
    
    // Cleanup delivery statuses
    const statuses = [...ctx.db.MessageDeliveryStatus.delivery_status_messenger_id.filter(messengerId)];
    for (const s of statuses) {
      ctx.db.MessageDeliveryStatus.delete({ ...s });
    }
  }
);

export default spacetimedb;
