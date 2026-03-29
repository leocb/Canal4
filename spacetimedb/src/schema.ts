import { schema, table, t } from "spacetimedb/server";

// Enums First
export const ChannelRole = t.enum("ChannelRole", {
  owner: t.string(),
  admin: t.string(),
  moderator: t.string(),
  member: t.string(),
});

export const NotificationFilterType = t.enum("NotificationFilterType", {
  enableAll: t.string(),
  disableAll: t.string(),
  filteredText: t.string(),
});

export const DeliveryStatus = t.enum("DeliveryStatus", {
  Queued: t.string(),
  InProgress: t.string(),
  Shown: t.string(),
  Skipped: t.string(),
  Unavailable: t.string(),
  Cancelled: t.string(),
});

// Tables
export const User = table(
  {
    name: "user",
    public: false,
    indexes: [
      { name: "user_name", accessor: "user_name", algorithm: "btree", columns: ["name"] },
      { name: "user_passkey_credential_id", accessor: "user_passkey_credential_id", algorithm: "btree", columns: ["passkeyCredentialId"] },
    ] as const,
  },
  {
    userId: t.u64().primaryKey().autoInc(),
    email: t.string().optional(),
    passkeyCredentialId: t.string().optional(), // left in so I don't have to delete the database, but nothing should be stored here
    name: t.string(),
    pushToken: t.string().optional(),
    createdAt: t.timestamp(),
  }
);


export const UserAuth = table(
  {
    name: "user_auth",
    public: false,
    indexes: [{ name: "user_auth_credential_id", accessor: "user_auth_credential_id", algorithm: "btree", columns: ["passkeyCredentialId"] }] as const,
  },
  {
    userId: t.u64().primaryKey(),
    passkeyCredentialId: t.string(),
    passkeyPublicKey: t.string(),
  }
);


export const UserIdentity = table(
  {
    name: "user_identity",
    public: false,
    indexes: [
      { name: "user_identity_user_id", accessor: "user_identity_user_id", algorithm: "btree", columns: ["userId"] }
    ] as const,
  },
  {
    identity: t.identity().primaryKey(),
    userId: t.u64(),
    lastLogin: t.timestamp(),
  }
);

/**
 * Stores a short-lived, server-generated random challenge for WebAuthn ceremonies.
 * Keyed by identity so each connection gets exactly one pending challenge at a time.
 * Expires after 2 minutes.
 */
export const PasskeyChallenge = table(
  { 
    name: "passkey_challenge", 
    public: false,
  },
  {
    identity: t.identity().primaryKey(),
    challenge: t.string(), // base64url-encoded 32 random bytes
    expiresAt: t.timestamp(),
  }
);



export const Venue = table(
  {
    name: "venue",
    public: false,
    indexes: [
      { name: "venue_link", accessor: "venue_link", algorithm: "btree", columns: ["link"] },
      { name: "venue_name", accessor: "venue_name", algorithm: "btree", columns: ["name"] },
    ] as const,
  },
  {
    venueId: t.u64().primaryKey().autoInc(),
    name: t.string(),
    link: t.string(),
    createdAt: t.timestamp(),
  }
);

export const Channel = table(
  {
    name: "channel",
    public: false,
    indexes: [
      { name: "channel_venue_id", accessor: "channel_venue_id", algorithm: "btree", columns: ["venueId"] },
      { name: "channel_name", accessor: "channel_name", algorithm: "btree", columns: ["name"] },
    ] as const,
  },
  {
    channelId: t.u64().primaryKey().autoInc(),
    venueId: t.u64(),
    name: t.string(),
    description: t.string(),
    minimumRoleToView: ChannelRole,
    messageMaxAgeHours: t.u64(),
    createdAt: t.timestamp(),
  }
);

export const VenueMember = table(
  {
    name: "venue_member",
    public: false,
    indexes: [
      { name: "venue_member_venue_id", accessor: "venue_member_venue_id", algorithm: "btree", columns: ["venueId"] },
      { name: "venue_member_user_id", accessor: "venue_member_user_id", algorithm: "btree", columns: ["userId"] },
      { name: "venue_member_composite", accessor: "venue_member_composite", algorithm: "btree", columns: ["venueId", "userId"] },
    ] as const,
  },
  {
    venueId: t.u64(),
    userId: t.u64(),
    joinDate: t.timestamp(),
    lastSeen: t.timestamp(),
    isBlocked: t.bool(),
    role: ChannelRole,
  }
);

export const ChannelMemberRole = table(
  {
    name: "channel_member_role",
    public: false,
    indexes: [
      { name: "channel_member_role_channel_id", accessor: "channel_member_role_channel_id", algorithm: "btree", columns: ["channelId"] },
      { name: "channel_member_role_user_id", accessor: "channel_member_role_user_id", algorithm: "btree", columns: ["userId"] },
      { name: "channel_member_role_composite", accessor: "channel_member_role_composite", algorithm: "btree", columns: ["channelId", "userId"] },
    ] as const,
  },
  {
    channelId: t.u64(),
    userId: t.u64(),
    role: ChannelRole,
  }
);

export const NotificationFilter = table(
  {
    name: "notification_filter",
    public: false,
    indexes: [
      { name: "notification_filter_channel_id", accessor: "notification_filter_channel_id", algorithm: "btree", columns: ["channelId"] },
      { name: "notification_filter_user_id", accessor: "notification_filter_user_id", algorithm: "btree", columns: ["userId"] },
      { name: "notification_filter_composite", accessor: "notification_filter_composite", algorithm: "btree", columns: ["channelId", "userId"] },
    ] as const,
  },
  {
    channelId: t.u64(),
    userId: t.u64(),
    filterType: NotificationFilterType,
    filterTextsJson: t.string(), // Extracted JSON string
  }
);

export const MessageTemplate = table(
  {
    name: "message_template",
    public: false,
    indexes: [{ name: "message_template_channel_id", accessor: "message_template_channel_id", algorithm: "btree", columns: ["channelId"] }] as const,
  },
  {
    templateId: t.u64().primaryKey().autoInc(),
    channelId: t.u64(),
    name: t.string(),
    description: t.string(),
    fieldsJson: t.string(), // Extracted JSON string
  }
);

export const Message = table(
  {
    name: "message",
    public: false,
    indexes: [
      { name: "message_channel_id", accessor: "message_channel_id", algorithm: "btree", columns: ["channelId"] },
      { name: "message_sender_id", accessor: "message_sender_id", algorithm: "btree", columns: ["senderId"] },
    ] as const,
  },
  {
    messageId: t.u64().primaryKey().autoInc(),
    channelId: t.u64(),
    senderId: t.u64(),
    templateId: t.u64().optional(),
    content: t.string(),
    sentAt: t.timestamp(),
  }
);

export const DisplayDevice = table(
  {
    name: "display_device",
    public: false,
    indexes: [
      { name: "display_device_uid", accessor: "display_device_uid", algorithm: "btree", columns: ["uid"] },
      { name: "display_device_venue_id", accessor: "display_device_venue_id", algorithm: "btree", columns: ["venueId"] },
      { name: "display_device_identity", accessor: "display_device_identity", algorithm: "btree", columns: ["identity"] },
    ] as const,
  },
  {
    displayId: t.u64().primaryKey().autoInc(),
    uid: t.string(),
    identity: t.identity(),
    venueId: t.u64(),
    name: t.string(),
    registeredAt: t.timestamp(),
    lastConnectedAt: t.timestamp(),
  }
);

export const DisplayPairingPin = table(
  { 
    name: "display_pairing_pin", 
    public: false,
    indexes: [{ name: "display_pairing_pin_identity", accessor: "display_pairing_pin_identity", algorithm: "btree", columns: ["identity"] }] as const,
  },
  {
    pin: t.string().primaryKey(),
    displayUid: t.string(),
    identity: t.identity(),
    expiresAt: t.timestamp(),
  }
);

export const MessageDeliveryStatus = table(
  {
    name: "message_delivery_status",
    public: false,
    indexes: [
      { name: "delivery_status_message_id", accessor: "delivery_status_message_id", algorithm: "btree", columns: ["messageId"] },
      { name: "delivery_status_display_id", accessor: "delivery_status_display_id", algorithm: "btree", columns: ["displayId"] },
      { name: "delivery_status_composite", accessor: "delivery_status_composite", algorithm: "btree", columns: ["messageId", "displayId"] },
    ] as const,
  },
  {
    statusId: t.u64().primaryKey().autoInc(),
    messageId: t.u64(),
    displayId: t.u64(),
    status: DeliveryStatus,
    updatedAt: t.timestamp(),
  }
);

export const VenueInviteToken = table(
  {
    name: "venue_invite_token",
    public: false,
    indexes: [
      { name: "venue_invite_token_venue_id", accessor: "venue_invite_token_venue_id", algorithm: "btree", columns: ["venueId"] },
    ] as const,
  },
  {
    token: t.string().primaryKey(),
    venueId: t.u64(),
    createdAt: t.timestamp(),
    expiresAt: t.timestamp(),
  }
);

const spacetimedb = schema({
  User,
  UserAuth,
  UserIdentity,
  PasskeyChallenge,
  Venue,
  Channel,
  VenueMember,
  ChannelMemberRole,
  NotificationFilter,
  MessageTemplate,
  Message,
  DisplayDevice,
  DisplayPairingPin,
  MessageDeliveryStatus,
  VenueInviteToken,
});



// Views
export const UserView = spacetimedb.view({ name: "user_view", public: true }, t.array(User.rowType), (ctx) => {
  const results = new Map<bigint, any>();
  if (!ctx.sender) return [];

  const ui = ctx.db.UserIdentity.identity.find(ctx.sender);
  if (ui) {
    const self = ctx.db.User.userId.find(ui.userId);
    if (self) results.set(self.userId, self);
    for (const m of ctx.db.VenueMember.venue_member_user_id.filter(ui.userId)) {
      for (const otherMember of ctx.db.VenueMember.venue_member_venue_id.filter(m.venueId)) {
        if (!results.has(otherMember.userId)) {
          const u = ctx.db.User.userId.find(otherMember.userId);
          if (u) results.set(u.userId, u);
        }
      }
    }
  }

  // Display Case
  for (const d of ctx.db.DisplayDevice.display_device_identity.filter(ctx.sender)) {
    for (const vm of ctx.db.VenueMember.venue_member_venue_id.filter(d.venueId)) {
      if (!results.has(vm.userId)) {
        const u = ctx.db.User.userId.find(vm.userId);
        if (u) results.set(u.userId, u);
      }
    }
  }

  return Array.from(results.values());
});

export const UserIdentitySelfView = spacetimedb.view({ name: "user_identity_self_view", public: true }, t.array(UserIdentity.rowType), (ctx) => {
  if (!ctx.sender) return [];
  const ui = ctx.db.UserIdentity.identity.find(ctx.sender);
  return ui ? [ui] : [];
});

export const PasskeyChallengeSelfView = spacetimedb.view({ name: "passkey_challenge_self_view", public: true }, t.array(PasskeyChallenge.rowType), (ctx) => {
  if (!ctx.sender) return [];
  const ch = ctx.db.PasskeyChallenge.identity.find(ctx.sender);
  return ch ? [ch] : [];
});

export const VenueView = spacetimedb.view({ name: "venue_view", public: true }, t.array(Venue.rowType), (ctx) => {
  const results = new Set<bigint>();
  if (!ctx.sender) return [];

  const ui = ctx.db.UserIdentity.identity.find(ctx.sender);
  if (ui) {
    for (const m of ctx.db.VenueMember.venue_member_user_id.filter(ui.userId)) {
      results.add(m.venueId);
    }
  }

  for (const d of ctx.db.DisplayDevice.display_device_identity.filter(ctx.sender)) {
    results.add(d.venueId);
  }

  const finalVenues = [];
  for (const id of results) {
    const v = ctx.db.Venue.venueId.find(id);
    if (v) finalVenues.push(v);
  }
  return finalVenues;
});

export const ChannelView = spacetimedb.view({ name: "channel_view", public: true }, t.array(Channel.rowType), (ctx) => {
  const venueIds = new Set<bigint>();
  if (!ctx.sender) return [];

  const ui = ctx.db.UserIdentity.identity.find(ctx.sender);
  if (ui) {
    for (const m of ctx.db.VenueMember.venue_member_user_id.filter(ui.userId)) {
      venueIds.add(m.venueId);
    }
  }

  for (const d of ctx.db.DisplayDevice.display_device_identity.filter(ctx.sender)) {
    venueIds.add(d.venueId);
  }

  const results = [];
  for (const vId of venueIds) {
    for (const c of ctx.db.Channel.channel_venue_id.filter(vId)) {
      results.push(c);
    }
  }
  return results;
});

export const VenueMemberView = spacetimedb.view({ name: "venue_member_view", public: true }, t.array(VenueMember.rowType), (ctx) => {
  if (!ctx.sender) return [];
  const venueIds = new Set<bigint>();

  const ui = ctx.db.UserIdentity.identity.find(ctx.sender);
  if (ui) {
    for (const m of ctx.db.VenueMember.venue_member_user_id.filter(ui.userId)) {
      venueIds.add(m.venueId);
    }
  }
  for (const d of ctx.db.DisplayDevice.display_device_identity.filter(ctx.sender)) {
    venueIds.add(d.venueId);
  }

  const results = [];
  for (const id of venueIds) {
    for (const m of ctx.db.VenueMember.venue_member_venue_id.filter(id)) {
      results.push(m);
    }
  }
  return results;
});

export const ChannelMemberRoleView = spacetimedb.view({ name: "channel_member_role_view", public: true }, t.array(ChannelMemberRole.rowType), (ctx) => {
  const sender = typeof (ctx as any).sender === 'function' ? (ctx as any).sender() : (ctx as any).sender;
  if (!sender) return [];
  const venueIds = new Set<bigint>();

  const ui = ctx.db.UserIdentity.identity.find(sender);
  if (ui) {
    // Optimization: Filter directly by user_id instead of joining Venue -> Channel -> Role
    return [...ctx.db.ChannelMemberRole.channel_member_role_user_id.filter(ui.userId)];
  }
  
  // Display Case: Must still join via Venue
  for (const d of ctx.db.DisplayDevice.display_device_identity.filter(sender)) {
    venueIds.add(d.venueId);
  }

  const results = [];
  for (const vid of venueIds) {
    for (const ch of ctx.db.Channel.channel_venue_id.filter(vid)) {
      for (const role of ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(ch.channelId)) {
        results.push(role);
      }
    }
  }
  return results;
});

export const NotificationFilterView = spacetimedb.view({ name: "notification_filter_view", public: true }, t.array(NotificationFilter.rowType), (ctx) => {
  const sender = typeof (ctx as any).sender === 'function' ? (ctx as any).sender() : (ctx as any).sender;
  if (!sender) return [];
  const ui = ctx.db.UserIdentity.identity.find(sender);
  if (!ui) return [];
  
  // Optimization: Filter directly by user_id
  return [...ctx.db.NotificationFilter.notification_filter_user_id.filter(ui.userId)];
});

export const MessageTemplateView = spacetimedb.view({ name: "message_template_view", public: true }, t.array(MessageTemplate.rowType), (ctx) => {
  if (!ctx.sender) return [];
  const venueIds = new Set<bigint>();

  const ui = ctx.db.UserIdentity.identity.find(ctx.sender);
  if (ui) {
    for (const m of ctx.db.VenueMember.venue_member_user_id.filter(ui.userId)) {
      venueIds.add(m.venueId);
    }
  }
  for (const d of ctx.db.DisplayDevice.display_device_identity.filter(ctx.sender)) {
    venueIds.add(d.venueId);
  }

  const results = [];
  for (const vid of venueIds) {
    for (const ch of ctx.db.Channel.channel_venue_id.filter(vid)) {
      for (const tpl of ctx.db.MessageTemplate.message_template_channel_id.filter(ch.channelId)) {
        results.push(tpl);
      }
    }
  }
  return results;
});

export const MessageView = spacetimedb.view({ name: "message_view", public: true }, t.array(Message.rowType), (ctx) => {
  if (!ctx.sender) return [];
  const venueIds = new Set<bigint>();

  const ui = ctx.db.UserIdentity.identity.find(ctx.sender);
  if (ui) {
    for (const m of ctx.db.VenueMember.venue_member_user_id.filter(ui.userId)) {
      venueIds.add(m.venueId);
    }
  }
  for (const d of ctx.db.DisplayDevice.display_device_identity.filter(ctx.sender)) {
    venueIds.add(d.venueId);
  }

  const results = [];
  for (const vid of venueIds) {
    for (const ch of ctx.db.Channel.channel_venue_id.filter(vid)) {
      for (const msg of ctx.db.Message.message_channel_id.filter(ch.channelId)) {
        results.push(msg);
      }
    }
  }
  return results;
});

export const DisplayDeviceView = spacetimedb.view({ name: "display_device_view", public: true }, t.array(DisplayDevice.rowType), (ctx) => {
  if (!ctx.sender) return [];
  const venueIds = new Set<bigint>();

  const ui = ctx.db.UserIdentity.identity.find(ctx.sender);
  if (ui) {
    for (const m of ctx.db.VenueMember.venue_member_user_id.filter(ui.userId)) {
      venueIds.add(m.venueId);
    }
  }
  for (const d of ctx.db.DisplayDevice.display_device_identity.filter(ctx.sender)) {
    venueIds.add(d.venueId);
  }

  const results = [];
  for (const vid of venueIds) {
    for (const device of ctx.db.DisplayDevice.display_device_venue_id.filter(vid)) {
      results.push(device);
    }
  }
  return results;
});

export const DisplayPairingPinView = spacetimedb.view({ name: "display_pairing_pin_view", public: true }, t.array(DisplayPairingPin.rowType), (ctx) => {
  if (!ctx.sender) return [];
  return [...ctx.db.DisplayPairingPin.display_pairing_pin_identity.filter(ctx.sender)];
});

export const MessageDeliveryStatusView = spacetimedb.view({ name: "message_delivery_status_view", public: true }, t.array(MessageDeliveryStatus.rowType), (ctx) => {
  const sender = typeof (ctx as any).sender === 'function' ? (ctx as any).sender() : (ctx as any).sender;
  if (!sender) return [];
  const venueIds = new Set<bigint>();

  const ui = ctx.db.UserIdentity.identity.find(sender);
  if (ui) {
    for (const m of ctx.db.VenueMember.venue_member_user_id.filter(ui.userId)) {
      venueIds.add(m.venueId);
    }
  }
  for (const d of ctx.db.DisplayDevice.display_device_identity.filter(sender)) {
    venueIds.add(d.venueId);
  }

  const results = [];
  for (const vid of venueIds) {
    for (const ch of ctx.db.Channel.channel_venue_id.filter(vid)) {
      for (const msg of ctx.db.Message.message_channel_id.filter(ch.channelId)) {
        for (const st of ctx.db.MessageDeliveryStatus.delivery_status_message_id.filter(msg.messageId)) {
          results.push(st);
        }
      }
    }
  }
  return results;
});


export const VenueInviteTokenView = spacetimedb.anonymousView({ name: "venue_invite_token_view", public: true }, t.array(VenueInviteToken.rowType), (ctx) => {
  // Optimization: Use Query Builder for shared shared result sets
  return ctx.from.VenueInviteToken;
});

export default spacetimedb;
