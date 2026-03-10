import spacetimedb from "./schema";
import { t, SenderError } from "spacetimedb/server";
import { Timestamp } from "spacetimedb";

/*** USER AUTHENTICATION & MANAGEMENT ***/

export const login_or_create_user = spacetimedb.reducer(
  { email: t.string().optional(), googleId: t.string().optional(), name: t.string() },
  (ctx, { email, googleId, name }) => {
    if (!email && !googleId) {
      throw new SenderError("Must provide either email or googleId to login/create user");
    }

    let targetUser = ctx.db.User.identity.find(ctx.sender);

    const normalizedEmail = email?.trim().toLowerCase();

    // Promiscuous mode: if no identity match, try to find an existing user by email
    let promiscuousMatch = false;
    if (!targetUser && normalizedEmail) {
      targetUser = [...ctx.db.User.iter()].find((u) => u.email?.trim().toLowerCase() === normalizedEmail) || null;
      if (targetUser) {
        promiscuousMatch = true;
      }
    }

    if (!targetUser) {
      // 1. Fresh user
      ctx.db.User.insert({
        identity: ctx.sender,
        email: normalizedEmail,
        googleId,
        passkeyCredentialId: undefined,
        name: name.trim(),
        pushToken: undefined,
        createdAt: ctx.timestamp,
      });
    } else if (promiscuousMatch) {
      // 2. Transferred user (promiscuous match)
      const oldIdentity = targetUser.identity;

      for (const venue of ctx.db.Venue.iter()) {
        if (venue.ownerIdentity.toHexString() === oldIdentity.toHexString()) {
          ctx.db.Venue.venueId.update({ ...venue, ownerIdentity: ctx.sender });
        }
      }

      for (const member of ctx.db.VenueMember.iter()) {
        if (member.userIdentity.toHexString() === oldIdentity.toHexString()) {
          ctx.db.VenueMember.delete(member);
          ctx.db.VenueMember.insert({ ...member, userIdentity: ctx.sender });
        }
      }

      for (const role of ctx.db.ChannelMemberRole.iter()) {
        if (role.userIdentity.toHexString() === oldIdentity.toHexString()) {
          ctx.db.ChannelMemberRole.delete(role);
          ctx.db.ChannelMemberRole.insert({ ...role, userIdentity: ctx.sender });
        }
      }

      // Transfer User record to new identity
      ctx.db.User.identity.delete(oldIdentity);
      ctx.db.User.insert({
        identity: ctx.sender,
        email: normalizedEmail || targetUser.email,
        googleId: googleId || targetUser.googleId,
        passkeyCredentialId: targetUser.passkeyCredentialId,
        name: name.trim() || targetUser.name,
        pushToken: targetUser.pushToken,
        createdAt: targetUser.createdAt,
      });
    } else {
      // 3. Normal update of existing identity
      ctx.db.User.identity.update({
        identity: ctx.sender,
        email: normalizedEmail || targetUser.email,
        googleId: googleId || targetUser.googleId,
        passkeyCredentialId: targetUser.passkeyCredentialId,
        name: name.trim() || targetUser.name,
        pushToken: targetUser.pushToken,
        createdAt: targetUser.createdAt,
      });
    }
  }
);

export const register_passkey = spacetimedb.reducer(
  { credentialId: t.string() },
  (ctx, { credentialId }) => {
    const existing = ctx.db.User.identity.find(ctx.sender);
    if (!existing) {
      throw new SenderError("User must be logged in to register a passkey");
    }
    ctx.db.User.identity.update({
      ...existing,
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
    if (expectedUser.identity.toHexString() !== ctx.sender.toHexString()) {
      throw new SenderError("Passkey valid, but SpacetimeDB Identity mismatch. Please recover your Identity Token.");
    }
  }
);

export const update_push_token = spacetimedb.reducer(
  { token: t.string() },
  (ctx, { token }) => {
    const user = ctx.db.User.identity.find(ctx.sender);
    if (!user) throw new SenderError("User not found");
    ctx.db.User.identity.update({ ...user, pushToken: token });
  }
);

/*** VENUE & CHANNEL MANAGEMENT ***/

export const create_venue = spacetimedb.reducer(
  { name: t.string(), link: t.string() },
  (ctx, { name, link }) => {
    const row = ctx.db.Venue.insert({
      venueId: 0n,
      name,
      ownerIdentity: ctx.sender,
      link,
      createdAt: ctx.timestamp,
    });

    ctx.db.VenueMember.insert({
      venueId: row.venueId,
      userIdentity: ctx.sender,
      joinDate: ctx.timestamp,
      lastSeen: ctx.timestamp,
      isBlocked: false,
    });
  }
);

export const update_venue = spacetimedb.reducer(
  { venueId: t.u64(), newName: t.string() },
  (ctx, { venueId, newName }) => {
    const venue = ctx.db.Venue.venueId.find(venueId);
    if (!venue) throw new SenderError("Venue not found");
    if (venue.ownerIdentity.toHexString() !== ctx.sender.toHexString()) {
      throw new SenderError("Only the original creator/owner can update the venue");
    }
    ctx.db.Venue.venueId.update({ ...venue, name: newName });
  }
);

export const delete_venue = spacetimedb.reducer(
  { venueId: t.u64(), confirmationName: t.string() },
  (ctx, { venueId, confirmationName }) => {
    const venue = ctx.db.Venue.venueId.find(venueId);
    if (!venue) throw new SenderError("Venue not found");
    if (venue.ownerIdentity.toHexString() !== ctx.sender.toHexString()) {
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
    const venue = ctx.db.Venue.venueId.find(venueId);
    if (!venue) throw new SenderError("Venue not found");

    if (venue.ownerIdentity.toHexString() !== ctx.sender.toHexString()) {
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
      userIdentity: ctx.sender,
      role: { tag: "owner", value: "" },
    });
  }
);

/*** MEMBERSHIP & PERMISSIONS ***/

export const join_venue = spacetimedb.reducer(
  { venueId: t.u64() },
  (ctx, { venueId }) => {
    const venue = ctx.db.Venue.venueId.find(venueId);
    if (!venue) throw new SenderError("Venue not found");

    const existingMembers = [...ctx.db.VenueMember.venue_member_venue_id.filter(venueId)];
    if (existingMembers.some(m => m.userIdentity.toHexString() === ctx.sender.toHexString())) {
      throw new SenderError("You are already a member of this venue");
    }

    ctx.db.VenueMember.insert({
      venueId,
      userIdentity: ctx.sender,
      joinDate: ctx.timestamp,
      lastSeen: ctx.timestamp,
      isBlocked: false,
    });
  }
);

export const leave_venue = spacetimedb.reducer(
  { venueId: t.u64() },
  (ctx, { venueId }) => {
    const venue = ctx.db.Venue.venueId.find(venueId);
    if (!venue) throw new SenderError("Venue not found");

    if (venue.ownerIdentity.toHexString() === ctx.sender.toHexString()) {
      throw new SenderError("The original venue owner cannot leave the venue. You must transfer ownership or delete the venue.");
    }

    const existingMembers = [...ctx.db.VenueMember.venue_member_venue_id.filter(venueId)];
    const membership = existingMembers.find(m => m.userIdentity.toHexString() === ctx.sender.toHexString());
    if (!membership) {
      throw new SenderError("You are not a member of this venue");
    }

    const channels = [...ctx.db.Channel.channel_venue_id.filter(venueId)];
    for (const ch of channels) {
      const roles = [...ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(ch.channelId)];
      const userRole = roles.find(r => r.userIdentity.toHexString() === ctx.sender.toHexString());
      if (userRole) {
        ctx.db.ChannelMemberRole.delete({ ...userRole });
      }
    }

    ctx.db.VenueMember.delete({ ...membership });
  }
);

export const set_channel_role = spacetimedb.reducer(
  { channelId: t.u64(), targetIdentity: t.identity(), role: t.string() },
  (ctx, { channelId, targetIdentity, role }) => {
    const ch = ctx.db.Channel.channelId.find(channelId);
    if (!ch) throw new SenderError("Channel not found");

    const venue = ctx.db.Venue.venueId.find(ch.venueId);
    if (!venue) throw new SenderError("Venue not found");

    const callerRoles = [...ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(channelId)];
    const callerRole = callerRoles.find(r => r.userIdentity.toHexString() === ctx.sender.toHexString());

    const isVenueOwner = venue.ownerIdentity.toHexString() === ctx.sender.toHexString();
    const isChannelOwner = callerRole?.role.tag === "owner";
    const isChannelAdmin = callerRole?.role.tag === "admin";

    if (!isVenueOwner && !isChannelOwner && !isChannelAdmin) {
      throw new SenderError("Insufficient permissions to set roles");
    }

    if (isChannelAdmin && !isChannelOwner && !isVenueOwner && role !== "moderator" && role !== "member") {
      throw new SenderError("Admins can only assign Moderator or Member roles");
    }

    const existingTargetRole = callerRoles.find(r => r.userIdentity.toHexString() === targetIdentity.toHexString());
    if (existingTargetRole) {
      ctx.db.ChannelMemberRole.delete({ ...existingTargetRole });
    }

    ctx.db.ChannelMemberRole.insert({
      channelId,
      userIdentity: targetIdentity,
      role: { tag: role as any, value: "" },
    });
  }
);

export const block_user = spacetimedb.reducer(
  { venueId: t.u64(), targetIdentity: t.identity() },
  (ctx, { venueId, targetIdentity }) => {
    const allMembers = [...ctx.db.VenueMember.venue_member_venue_id.filter(venueId)];
    const targetMember = allMembers.find(m => m.userIdentity.toHexString() === targetIdentity.toHexString());
    if (!targetMember) throw new SenderError("Target user is not in this venue");

    ctx.db.VenueMember.delete({ ...targetMember });
    ctx.db.VenueMember.insert({ ...targetMember, isBlocked: true });
  }
);

export const unblock_user = spacetimedb.reducer(
  { venueId: t.u64(), targetIdentity: t.identity() },
  (ctx, { venueId, targetIdentity }) => {
    const allMembers = [...ctx.db.VenueMember.venue_member_venue_id.filter(venueId)];
    const targetMember = allMembers.find(m => m.userIdentity.toHexString() === targetIdentity.toHexString());
    if (!targetMember) throw new SenderError("Target user is not in this venue");

    ctx.db.VenueMember.delete({ ...targetMember });
    ctx.db.VenueMember.insert({ ...targetMember, isBlocked: false });
  }
);

/*** MESSAGING & TEMPLATES ***/

export const create_message_template = spacetimedb.reducer(
  { channelId: t.u64(), name: t.string(), description: t.string(), fieldsJson: t.string() },
  (ctx, { channelId, name, description, fieldsJson }) => {
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
  { templateId: t.u64(), fieldsJson: t.string() },
  (ctx, { templateId, fieldsJson }) => {
    const template = ctx.db.MessageTemplate.templateId.find(templateId);
    if (!template) throw new SenderError("Template not found");
    ctx.db.MessageTemplate.templateId.update({ ...template, fieldsJson });
  }
);

export const delete_message_template = spacetimedb.reducer(
  { templateId: t.u64() },
  (ctx, { templateId }) => {
    const template = ctx.db.MessageTemplate.templateId.find(templateId);
    if (!template) throw new SenderError("Template not found");
    ctx.db.MessageTemplate.templateId.delete(templateId);
  }
);

export const send_message = spacetimedb.reducer(
  { channelId: t.u64(), content: t.string(), templateId: t.u64().optional() },
  (ctx, { channelId, content, templateId }) => {
    const ch = ctx.db.Channel.channelId.find(channelId);
    if (!ch) throw new SenderError("Channel not found");

    const allMembers = [...ctx.db.VenueMember.venue_member_venue_id.filter(ch.venueId)];
    const member = allMembers.find(m => m.userIdentity.toHexString() === ctx.sender.toHexString());
    if (member && member.isBlocked) {
      throw new SenderError("You are blocked in this venue and cannot send messages.");
    }

    const callerRoles = [...ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(channelId)];
    const userRole = callerRoles.find(r => r.userIdentity.toHexString() === ctx.sender.toHexString())?.role.tag;
    const venue = ctx.db.Venue.venueId.find(ch.venueId);
    const isOwner = venue?.ownerIdentity.toHexString() === ctx.sender.toHexString() || userRole === "owner";

    if (!isOwner && userRole !== "admin" && userRole !== "moderator") {
      throw new SenderError("Only Moderators and above can send messages.");
    }

    const row = ctx.db.Message.insert({
      messageId: 0n,
      channelId,
      senderIdentity: ctx.sender,
      templateId,
      content,
      sentAt: ctx.timestamp,
    });

    const activeMessengers = [...ctx.db.MessengerDevice.messenger_device_venue_id.filter(ch.venueId)];
    for (const messenger of activeMessengers) {
      ctx.db.MessageDeliveryStatus.insert({
        messageId: row.messageId,
        messengerId: messenger.messengerId,
        status: { tag: "enqueued", value: "" },
        updatedAt: ctx.timestamp,
      });
    }
  }
);

export const delete_message = spacetimedb.reducer(
  { messageId: t.u64() },
  (ctx, { messageId }) => {
    const msg = ctx.db.Message.messageId.find(messageId);
    if (!msg) throw new SenderError("Message not found");
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
    const msg = ctx.db.Message.messageId.find(messageId);
    if (!msg) throw new SenderError("Message not found");

    ctx.db.Message.insert({
      messageId: 0n,
      channelId: msg.channelId,
      senderIdentity: ctx.sender,
      templateId: msg.templateId,
      content: msg.content,
      sentAt: ctx.timestamp,
    });
  }
);

/*** ELECTRON MESSENGER SYNC ***/

export const create_messenger_pin = spacetimedb.reducer(
  { messengerUid: t.string() },
  (ctx, { messengerUid }) => {
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = ctx.timestamp.microsSinceUnixEpoch + (10n * 60n * 1000000n); // 10 mins 

    ctx.db.MessengerPairingPin.insert({ pin, messengerUid, expiresAt: new Timestamp(expiresAt) });
  }
);

export const register_messenger_to_venue = spacetimedb.reducer(
  { pin: t.string(), venueId: t.u64(), name: t.string() },
  (ctx, { pin, venueId, name }) => {
    const pairing = ctx.db.MessengerPairingPin.pin.find(pin);
    if (!pairing) throw new SenderError("Invalid or expired PIN");
    if (ctx.timestamp.microsSinceUnixEpoch > pairing.expiresAt.microsSinceUnixEpoch) {
      throw new SenderError("PIN has expired");
    }

    ctx.db.MessengerDevice.insert({
      messengerId: 0n,
      uid: pairing.messengerUid,
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
    const devices = [...ctx.db.MessengerDevice.messenger_device_uid.filter(messengerUid)];
    if (devices.length === 0) {
      throw new SenderError("Messenger device not registered");
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
    const device = [...ctx.db.MessengerDevice.messenger_device_uid.filter(uid)][0];
    if (!device) throw new SenderError("Messenger device not found");

    const allStatuses = [...ctx.db.MessageDeliveryStatus.delivery_status_message_id.filter(messageId)];
    const statusRow = allStatuses.find(s => s.messengerId === device.messengerId);

    if (statusRow) {
      ctx.db.MessageDeliveryStatus.delete({ ...statusRow });
    }

    ctx.db.MessageDeliveryStatus.insert({
      messageId,
      messengerId: device.messengerId,
      status: { tag: statusTag as any, value: "" },
      updatedAt: ctx.timestamp,
    });
  }
);

export default spacetimedb;
