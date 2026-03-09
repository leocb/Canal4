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
  enqueued: t.string(),
  inProgress: t.string(),
  shown: t.string(),
});

// Tables
export const User = table(
  { name: "user", public: true },
  {
    identity: t.identity().primaryKey(),
    email: t.string().optional(),
    googleId: t.string().optional(),
    passkeyCredentialId: t.string().optional(),
    name: t.string(),
    pushToken: t.string().optional(),
    createdAt: t.timestamp(),
  }
);

export const Venue = table(
  { name: "venue", public: true },
  {
    venueId: t.u64().primaryKey().autoInc(),
    name: t.string(),
    ownerIdentity: t.identity(),
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
      { name: "venue_member_user_identity", accessor: "venue_member_user_identity", algorithm: "btree", columns: ["userIdentity"] },
    ] as const,
  },
  {
    venueId: t.u64(),
    userIdentity: t.identity(),
    joinDate: t.timestamp(),
    lastSeen: t.timestamp(),
    isBlocked: t.bool(),
  }
);

export const ChannelMemberRole = table(
  {
    name: "channel_member_role",
    public: true,
    indexes: [
      { name: "channel_member_role_channel_id", accessor: "channel_member_role_channel_id", algorithm: "btree", columns: ["channelId"] },
      { name: "channel_member_role_user_identity", accessor: "channel_member_role_user_identity", algorithm: "btree", columns: ["userIdentity"] },
    ] as const,
  },
  {
    channelId: t.u64(),
    userIdentity: t.identity(),
    role: ChannelRole,
  }
);

export const NotificationFilter = table(
  {
    name: "notification_filter",
    public: true,
    indexes: [
      { name: "notification_filter_channel_id", accessor: "notification_filter_channel_id", algorithm: "btree", columns: ["channelId"] },
      { name: "notification_filter_user_identity", accessor: "notification_filter_user_identity", algorithm: "btree", columns: ["userIdentity"] },
    ] as const,
  },
  {
    channelId: t.u64(),
    userIdentity: t.identity(),
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
    senderIdentity: t.identity(),
    templateId: t.u64().optional(),
    content: t.string(),
    sentAt: t.timestamp(),
  }
);

export const MessengerDevice = table(
  {
    name: "messenger_device",
    public: true,
    indexes: [
      { name: "messenger_device_uid", accessor: "messenger_device_uid", algorithm: "btree", columns: ["uid"] },
      { name: "messenger_device_venue_id", accessor: "messenger_device_venue_id", algorithm: "btree", columns: ["venueId"] },
    ] as const,
  },
  {
    messengerId: t.u64().primaryKey().autoInc(),
    uid: t.string(),
    venueId: t.u64(),
    name: t.string(),
    registeredAt: t.timestamp(),
    lastConnectedAt: t.timestamp(),
  }
);

export const MessengerPairingPin = table(
  { name: "messenger_pairing_pin", public: true },
  {
    pin: t.string().primaryKey(),
    messengerUid: t.string(),
    expiresAt: t.timestamp(),
  }
);

export const MessageDeliveryStatus = table(
  {
    name: "message_delivery_status",
    public: true,
    indexes: [
      { name: "delivery_status_message_id", accessor: "delivery_status_message_id", algorithm: "btree", columns: ["messageId"] },
      { name: "delivery_status_messenger_id", accessor: "delivery_status_messenger_id", algorithm: "btree", columns: ["messengerId"] },
    ] as const,
  },
  {
    messageId: t.u64(),
    messengerId: t.u64(),
    status: DeliveryStatus,
    updatedAt: t.timestamp(),
  }
);

// Final Export Module
const spacetimedb = schema({
  User,
  Venue,
  Channel,
  VenueMember,
  ChannelMemberRole,
  NotificationFilter,
  MessageTemplate,
  Message,
  MessengerDevice,
  MessengerPairingPin,
  MessageDeliveryStatus,
});

export default spacetimedb;
