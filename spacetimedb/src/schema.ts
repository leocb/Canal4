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
  Unavailable: t.string(),
  Cancelled: t.string(),
});

// Tables
export const User = table(
  { name: "user", public: true },
  {
    userId: t.u64().primaryKey().autoInc(),
    email: t.string().optional(),
    passkeyCredentialId: t.string().optional(),
    name: t.string(),
    pushToken: t.string().optional(),
    createdAt: t.timestamp(),
  }
);

export const UserIdentity = table(
  {
    name: "user_identity",
    public: true,
    indexes: [{ name: "user_identity_user_id", accessor: "user_identity_user_id", algorithm: "btree", columns: ["userId"] }] as const,
  },
  {
    identity: t.identity().primaryKey(),
    userId: t.u64(),
    lastLogin: t.timestamp(),
  }
);

export const EmailLoginPin = table(
  { name: "email_login_pin", public: true },
  {
    email: t.string().primaryKey(),
    pin: t.string(),
    attempts: t.u32(),
    expiresAt: t.timestamp(),
  }
);

export const LoginLockout = table(
  { name: "login_lockout", public: true },
  {
    email: t.string().primaryKey(),
    lockedUntil: t.timestamp(),
  }
);

export const ServerConfig = table(
  { name: "server_config", public: true },
  {
    id: t.u32().primaryKey(),
    serverToken: t.string(),
  }
);

export const Venue = table(
  { name: "venue", public: true },
  {
    venueId: t.u64().primaryKey().autoInc(),
    name: t.string(),
    ownerId: t.u64(),
    link: t.string(),
    createdAt: t.timestamp(),
  }
);

export const Channel = table(
  {
    name: "channel",
    public: true,
    indexes: [{ name: "channel_venue_id", accessor: "channel_venue_id", algorithm: "btree", columns: ["venueId"] }] as const,
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
    public: true,
    indexes: [
      { name: "venue_member_venue_id", accessor: "venue_member_venue_id", algorithm: "btree", columns: ["venueId"] },
      { name: "venue_member_user_id", accessor: "venue_member_user_id", algorithm: "btree", columns: ["userId"] },
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
    public: true,
    indexes: [
      { name: "channel_member_role_channel_id", accessor: "channel_member_role_channel_id", algorithm: "btree", columns: ["channelId"] },
      { name: "channel_member_role_user_id", accessor: "channel_member_role_user_id", algorithm: "btree", columns: ["userId"] },
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
    public: true,
    indexes: [
      { name: "notification_filter_channel_id", accessor: "notification_filter_channel_id", algorithm: "btree", columns: ["channelId"] },
      { name: "notification_filter_user_id", accessor: "notification_filter_user_id", algorithm: "btree", columns: ["userId"] },
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
    public: true,
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
    public: true,
    indexes: [{ name: "message_channel_id", accessor: "message_channel_id", algorithm: "btree", columns: ["channelId"] }] as const,
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
    public: true,
    indexes: [
      { name: "display_device_uid", accessor: "display_device_uid", algorithm: "btree", columns: ["uid"] },
      { name: "display_device_venue_id", accessor: "display_device_venue_id", algorithm: "btree", columns: ["venueId"] },
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
  { name: "display_pairing_pin", public: true },
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
    public: true,
    indexes: [
      { name: "delivery_status_message_id", accessor: "delivery_status_message_id", algorithm: "btree", columns: ["messageId"] },
      { name: "delivery_status_display_id", accessor: "delivery_status_display_id", algorithm: "btree", columns: ["displayId"] },
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
    public: true,
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

// Final Export Module
const spacetimedb = schema({
  User,
  UserIdentity,
  EmailLoginPin,
  LoginLockout,
  ServerConfig,
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

export default spacetimedb;
