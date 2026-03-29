import spacetimedb from "./schema";
import { t, SenderError, type ReducerCtx } from "spacetimedb/server";

import {
  decodeClientDataJSON,
  decodeAttestationObject,
  parseAuthenticatorData,
  isoBase64URL,
  isoUint8Array,
  isoCBOR
} from "@simplewebauthn/server/helpers";
import { p256 } from "@noble/curves/nist.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { Timestamp } from "spacetimedb";





export {
  UserView,
  UserIdentitySelfView,
  PasskeyChallengeSelfView,
  VenueView,
  ChannelView,
  VenueMemberView,
  ChannelMemberRoleView,
  NotificationFilterView,
  MessageTemplateView,
  MessageView,
  DisplayDeviceView,
  DisplayPairingPinView,
  MessageDeliveryStatusView,
  VenueInviteTokenView,
} from "./schema";

/*** USER AUTHENTICATION & MANAGEMENT ***/

// ---------------------------------------------------------------------------
// Security constants
// ---------------------------------------------------------------------------
// Challenge TTL: 2 minutes
const CHALLENGE_TTL_MICROS = 2n * 60n * 1000000n;

const THIRTY_DAYS_MICROS = 30n * 24n * 3600n * 1000000n;

/**
 * Verifies and consumes a passkey challenge for ctx.sender.
 * Throws SenderError if the challenge is absent, expired, or mismatched.
 */
function consumeChallenge(ctx: any, expectedChallenge: string): void {
  const row = ctx.db.PasskeyChallenge.identity.find(ctx.sender);
  if (!row) {
    throw new SenderError("api_errors.challenge_not_found");
  }

  // Always delete the challenge first (single-use)
  ctx.db.PasskeyChallenge.identity.delete(ctx.sender);

  const now = ctx.timestamp.microsSinceUnixEpoch;
  if (now > row.expiresAt.microsSinceUnixEpoch) {
    throw new SenderError("api_errors.challenge_expired");
  }
  const storedBuf = isoBase64URL.toBuffer(row.challenge);
  const clientBuf = new Uint8Array(isoBase64URL.toBuffer(expectedChallenge) as any);

  if (!isoUint8Array.areEqual(storedBuf as any, clientBuf as any)) {
    throw new SenderError("api_errors.invalid_challenge");
  }
}

/**
 * Validates the fields of a decoded clientDataJSON object.
 * @param clientData  - The decoded object from decodeClientDataJSON
 * @param expectedType - "webauthn.create" | "webauthn.get"
 */
function verifyClientData(clientData: any, expectedType: string): string {
  if (clientData.type !== expectedType) {
    throw new SenderError("api_errors.invalid_client_data_type");
  }
  return clientData.challenge as string;
}

/**
 * Verifies the rpIdHash and UP flag inside authenticatorData.
 * authDataBuffer must be a raw Uint8Array.
 */
function verifyAuthenticatorData(authDataBuffer: Uint8Array): void {
  // Byte 32: flags
  const flags = authDataBuffer[32];
  const UP = 0x01; // User Present
  const UV = 0x04; // User Verified

  if (!(flags & UP)) {
    throw new SenderError("api_errors.user_not_present");
  }

  // Since we require user verification in the frontend, we must verify it here.
  if (!(flags & UV)) {
    throw new SenderError("api_errors.user_not_verified");
  }
}

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

/**
 * Robustly converts a DER-encoded ECDSA signature to a raw 64-byte (R, S) format.
 * WebAuthn authenticators return DER.
 */
function extractRawSignature(der: Uint8Array): Uint8Array {
  let pos = 0;
  if (der[pos++] !== 0x30) throw new Error("Invalid DER: not a sequence");

  // Skip length byte(s)
  let len = der[pos++];
  if (len & 0x80) pos += (len & 0x7f);

  const extractInteger = () => {
    if (der[pos++] !== 0x02) throw new Error("Invalid DER: expected integer");
    let iLen = der[pos++];
    let i = der.slice(pos, pos + iLen);
    pos += iLen;
    // Strip leading zero if it makes it 33 bytes (DER-encoding for positive integers)
    if (i.length > 32) i = i.slice(i.length - 32);
    // Pad to 32 bytes if shorter
    const padded = new Uint8Array(32);
    padded.set(i, 32 - i.length);
    return padded;
  };

  const r = extractInteger();
  const s = extractInteger();
  const raw = new Uint8Array(64);
  raw.set(r, 0);
  raw.set(s, 32);
  return raw;
}

/**
 * Extracts the hostname from a full origin (e.g. http://localhost:3000 -> localhost)
 */
function decodeHostname(origin: string): string {
  try {
    // Simple extraction for common patterns: scheme://hostname[:port]
    let hostname = origin.split("://")[1] || origin;
    hostname = hostname.split(":")[0].split("/")[0];
    return hostname;
  } catch (e) {
    return origin;
  }
}

/**
 * Verifies that the rpIdHash in authData matches the expected hostname's hash.
 */
function verifyRpId(authData: Uint8Array, origin: string): void {
  const rpId = decodeHostname(origin);
  // Use a reliable way to convert string to Uint8Array in this environment
  const rpIdBytes = new TextEncoder().encode(rpId);
  const expectedRpIdHash = new Uint8Array(sha256(rpIdBytes));
  const actualRpIdHash = new Uint8Array(authData.slice(0, 32));

  if (!isoUint8Array.areEqual(expectedRpIdHash, actualRpIdHash)) {
    throw new SenderError("api_errors.invalid_rp_id");
  }
}

/**
 * Normalizes a buffer to exactly 32 bytes for P-256 coordinates.
 */
function normalizeBuffer32(buf: Uint8Array): Uint8Array {
  const source = new Uint8Array(buf as any);
  if (source.length === 32) return source;
  const result = new Uint8Array(32);
  if (source.length > 32) {
    result.set(source.slice(source.length - 32));
  } else {
    result.set(source, 32 - source.length);
  }
  return result;
}

function getRoleRank(role: string): number {
  switch (role) {
    case "owner": return 4;
    case "admin": return 3;
    case "moderator": return 2;
    case "member": return 1;
    default: return 0;
  }
}

export const register_new_user_with_passkey = spacetimedb.reducer(
  { credentialId: t.string(), attestationObject: t.string(), clientDataJson: t.string(), name: t.string() },
  (ctx, { credentialId, attestationObject, clientDataJson, name }) => {
    // 0. Validate name length
    const trimmedName = name.trim();
    if (trimmedName.length === 0 || trimmedName.length > 64) {
      throw new SenderError("api_errors.invalid_name_length");
    }

    // 1. Verify clientDataJSON: type, origin, and retrieve the challenge
    const clientData = decodeClientDataJSON(clientDataJson);
    const challengeFromClient = verifyClientData(clientData, "webauthn.create");

    // 2. Consume the server-issued challenge (single-use, time-limited)
    consumeChallenge(ctx, challengeFromClient);

    // 3. Extract and verify authenticatorData from the attestation object
    const attestationBytes = new Uint8Array(isoBase64URL.toBuffer(attestationObject) as any);
    const decodedAttestation = decodeAttestationObject(attestationBytes as any) as Map<string, any>;
    const authDataBuffer = decodedAttestation.get('authData') as Uint8Array;
    if (!authDataBuffer) throw new SenderError("api_errors.invalid_attestation");

    // Verify UP/UV flags
    verifyAuthenticatorData(authDataBuffer);

    const parsedAuthData = parseAuthenticatorData(authDataBuffer);
    if (!parsedAuthData.credentialPublicKey) {
      throw new SenderError("api_errors.invalid_attestation");
    }

    // Verify RP ID Hash
    verifyRpId(authDataBuffer, clientData.origin);

    const publicKeyBase64 = isoBase64URL.fromBuffer(parsedAuthData.credentialPublicKey as Uint8Array);

    // 4. Check if identity already has a user
    const existingIdentity = ctx.db.UserIdentity.identity.find(ctx.sender);
    if (existingIdentity) {
      const existingUser = ctx.db.User.userId.find(existingIdentity.userId);
      if (existingUser) throw new SenderError("api_errors.identity_already_registered");
      ctx.db.UserIdentity.identity.delete(ctx.sender);
    }

    // 5. Create user and auth
    const user = ctx.db.User.insert({
      userId: 0n,
      name: trimmedName,
      createdAt: ctx.timestamp,
    });

    ctx.db.UserAuth.insert({
      userId: user.userId,
      passkeyCredentialId: credentialId,
      passkeyPublicKey: publicKeyBase64,
    });

    ctx.db.UserIdentity.insert({
      identity: ctx.sender,
      userId: user.userId,
      lastLogin: ctx.timestamp,
    });
  }
);


/**
 * Must be called before any WebAuthn ceremony. Generates a cryptographically
 * random 32-byte challenge, stores it server-side for this identity, and
 * makes it readable via PasskeyChallengeView. Expires in 2 minutes.
 */
export const create_passkey_challenge = spacetimedb.reducer(
  {},
  (ctx) => {
    // Generate 32 random bytes using available entropy:
    // ... (rest of logic unchanged)
    const identityBytes = ctx.sender.toUint8Array();
    // ...
    const tsMicros = ctx.timestamp.microsSinceUnixEpoch;
    // ...
    const tsBytes = new Uint8Array(8);
    let tmp = tsMicros;
    for (let i = 7; i >= 0; i--) {
      tsBytes[i] = Number(tmp & 0xffn);
      tmp >>= 8n;
    }

    const seed = new Uint8Array(isoUint8Array.concat([new Uint8Array(identityBytes as any), tsBytes] as any));
    const challengeBytes = sha256(seed as any);
    const challenge = isoBase64URL.fromBuffer(challengeBytes);

    const expiresAtMicros = tsMicros + CHALLENGE_TTL_MICROS;

    // Upsert — replace any stale challenge for this identity
    const existing = ctx.db.PasskeyChallenge.identity.find(ctx.sender);
    if (existing) {
      ctx.db.PasskeyChallenge.identity.delete(ctx.sender);
    }
    ctx.db.PasskeyChallenge.insert({
      identity: ctx.sender,
      challenge,
      expiresAt: new Timestamp(expiresAtMicros),
    });
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

    const trimmedName = newName.trim();
    if (trimmedName.length === 0 || trimmedName.length > 64) {
      throw new SenderError("api_errors.invalid_name_length");
    }

    const user = ctx.db.User.userId.find(userId);
    if (!user) throw new SenderError("api_errors.user_not_found");

    ctx.db.User.userId.update({
      ...user,
      name: trimmedName,
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

    // Delete user identities (use index instead of full table scan)
    for (const identity of ctx.db.UserIdentity.user_identity_user_id.filter(userId)) {
      ctx.db.UserIdentity.identity.delete(identity.identity);
    }

    // Delete venue memberships (use index instead of full table scan)
    for (const m of ctx.db.VenueMember.venue_member_user_id.filter(userId)) {
      ctx.db.VenueMember.delete({ ...m });
    }

    // Delete channel roles (use index instead of full table scan)
    for (const r of ctx.db.ChannelMemberRole.channel_member_role_user_id.filter(userId)) {
      ctx.db.ChannelMemberRole.delete({ ...r });
    }

    // Remove any pending passkey challenge
    const pendingChallenge = ctx.db.PasskeyChallenge.identity.find(ctx.sender);
    if (pendingChallenge) ctx.db.PasskeyChallenge.identity.delete(ctx.sender);

    // Delete user auth
    ctx.db.UserAuth.userId.delete(userId);

    // Finally delete the user
    ctx.db.User.userId.delete(userId);
  }
);

export const register_passkey = spacetimedb.reducer(
  { credentialId: t.string(), attestationObject: t.string(), clientDataJson: t.string() },
  (ctx, { credentialId, attestationObject, clientDataJson }) => {
    const userId = getUserId(ctx);

    // Verify clientDataJSON: type, origin, and retrieve the challenge
    const clientData = decodeClientDataJSON(clientDataJson);
    const challengeFromClient = verifyClientData(clientData, "webauthn.create");

    // Consume the server-issued challenge (single-use, time-limited)
    consumeChallenge(ctx, challengeFromClient);

    // Extract and verify authenticatorData
    const attestationBytes = new Uint8Array(isoBase64URL.toBuffer(attestationObject) as any);
    const decodedAttestation = decodeAttestationObject(attestationBytes as any) as Map<string, any>;
    const authDataBuffer = decodedAttestation.get('authData') as Uint8Array;
    if (!authDataBuffer) throw new SenderError("api_errors.invalid_attestation");

    verifyAuthenticatorData(authDataBuffer);

    const parsedAuthData = parseAuthenticatorData(authDataBuffer);
    if (!parsedAuthData.credentialPublicKey) throw new SenderError("api_errors.invalid_attestation");

    // Verify RP ID Hash
    verifyRpId(authDataBuffer, clientData.origin);

    const publicKeyBase64 = isoBase64URL.fromBuffer(parsedAuthData.credentialPublicKey as Uint8Array);

    ctx.db.UserAuth.userId.update({
      userId,
      passkeyCredentialId: credentialId,
      passkeyPublicKey: publicKeyBase64,
    });
  }
);



export const login_with_passkey = spacetimedb.reducer(
  { credentialId: t.string(), authenticatorData: t.string(), clientDataJson: t.string(), signature: t.string() },
  (ctx, { credentialId, authenticatorData, clientDataJson, signature }) => {
    // 1. Lookup credential via index in the system (UserAuth)
    let authRecord = ctx.db.UserAuth.user_auth_credential_id.filter(credentialId).next().value;

    // 2. If not in the system, throw error
    if (!authRecord) {
      throw new SenderError("api_errors.passkey_not_found");
    }

    const expectedUser = ctx.db.User.userId.find(authRecord.userId);
    if (!expectedUser) throw new SenderError("api_errors.user_not_found");

    // 2. Decode and validate clientDataJSON (type, origin, challenge)
    const clientData = decodeClientDataJSON(clientDataJson);
    const challengeFromClient = verifyClientData(clientData, "webauthn.get");

    // 3. Consume the server-issued challenge (single-use, time-limited)
    consumeChallenge(ctx, challengeFromClient);

    // 4. Decode authenticatorData and verify rpId hash + UP flag
    const authDataBuffer = new Uint8Array(isoBase64URL.toBuffer(authenticatorData) as any);
    verifyAuthenticatorData(authDataBuffer);

    // Verify RP ID Hash (Strict match against clientData.origin)
    verifyRpId(authDataBuffer, clientData.origin);

    // 5. Decode COSE Public Key from Database using library parser
    const publicKeyBytes = isoBase64URL.toBuffer(authRecord.passkeyPublicKey);
    const decodedKey = isoCBOR.decodeFirst(new Uint8Array(publicKeyBytes as any) as any) as Map<number, Uint8Array>;

    // P-256 keys: kty=2(EC2), crv=1(P-256), x=-2, y=-3
    const x = decodedKey.get(-2);
    const y = decodedKey.get(-3);
    if (!x || !y) throw new SenderError("api_errors.invalid_public_key");

    const x32 = normalizeBuffer32(x);
    const y32 = normalizeBuffer32(y);
    const pubKeyRaw = new Uint8Array(isoUint8Array.concat([new Uint8Array([0x04]), x32, y32]));

    // 6. Verify Signature using standard bytes
    const clientDataBytes = new Uint8Array(isoBase64URL.toBuffer(clientDataJson) as any);
    const clientDataHash = new Uint8Array(sha256(clientDataBytes as any));

    // WebAuthn signature is over (authenticatorData || clientDataHash).
    // Noble's p256.verify internally hashes the message with SHA256 by default.
    // We pass the raw concatenated bytes (signedPayload) so it hashes them exactly once.
    const signedPayload = new Uint8Array(isoUint8Array.concat([authDataBuffer, clientDataHash] as any));

    // Convert DER signature to raw 64-byte format for Noble
    const rawSignature = extractRawSignature(new Uint8Array(isoBase64URL.toBuffer(signature) as any));

    let isValid = false;
    try {
      isValid = p256.verify(
        rawSignature,
        signedPayload,
        pubKeyRaw,
        { lowS: false }
      );
    } catch (e) {
      // Keep internal error for server-side troubleshooting but remove hex dumps
    }

    if (!isValid) {
      throw new SenderError("api_errors.invalid_signature");
    }

    // 7. Link identity
    const existingIdentity = ctx.db.UserIdentity.identity.find(ctx.sender);
    if (!existingIdentity || existingIdentity.userId !== expectedUser.userId) {
      if (existingIdentity) ctx.db.UserIdentity.identity.delete(ctx.sender);
      ctx.db.UserIdentity.insert({
        identity: ctx.sender,
        userId: expectedUser.userId,
        lastLogin: ctx.timestamp,
      });
    }
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

    const callerMember = [...ctx.db.VenueMember.venue_member_venue_id.filter(venueId)].find(m => m.userId === userId);
    if (callerMember?.role.tag !== "owner" && callerMember?.role.tag !== "admin") {
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

    const callerMember = [...ctx.db.VenueMember.venue_member_venue_id.filter(venueId)].find(m => m.userId === userId);
    if (callerMember?.role.tag !== "owner") {
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

    const myMembership = [...ctx.db.VenueMember.venue_member_venue_id.filter(venueId)].find(m => m.userId === userId);
    const isVenueAdmin = myMembership?.role.tag === "admin" || myMembership?.role.tag === "owner";

    if (!isVenueAdmin) {
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

    const myVenueMembership = [...ctx.db.VenueMember.venue_member_venue_id.filter(channel.venueId)].find(m => m.userId === userId);
    const isVenueOwner = myVenueMembership?.role.tag === "owner";

    const myChannelRole = [...ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(channelId)].find(r => r.userId === userId);
    const isChannelOwner = myChannelRole?.role.tag === "owner";
    const isChannelAdmin = myChannelRole?.role.tag === "admin";

    if (!isVenueOwner && !isChannelOwner && !isChannelAdmin) {
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

    const myVenueMembership = [...ctx.db.VenueMember.venue_member_venue_id.filter(channel.venueId)].find(m => m.userId === userId);
    const isVenueOwner = myVenueMembership?.role.tag === "owner";

    const allChannelRoles = [...ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(channelId)];
    const myChannelRole = allChannelRoles.find(r => r.userId === userId);
    const isChannelOwner = myChannelRole?.role.tag === "owner";

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
    for (const role of allChannelRoles) {
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

    const allMembers = [...ctx.db.VenueMember.venue_member_venue_id.filter(venueId)];
    const myMembership = allMembers.find(m => m.userId === userId);
    if (!myMembership) {
      throw new SenderError("api_errors.not_member");
    }

    if (myMembership.role.tag === "owner") {
      const otherOwnersCount = allMembers.filter(m => m.userId !== userId && m.role.tag === "owner").length;
      if (otherOwnersCount === 0) {
        throw new SenderError("api_errors.cannot_leave_last_owner");
      }
    }

    const channels = [...ctx.db.Channel.channel_venue_id.filter(venueId)];
    for (const ch of channels) {
      const roles = [...ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(ch.channelId)];
      const userRole = roles.find(r => r.userId === userId);
      if (userRole) {
        ctx.db.ChannelMemberRole.delete({ ...userRole });
      }
    }

    ctx.db.VenueMember.delete({ ...myMembership });
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

    const callerRole = callerMember.role.tag;
    const isVenueOwner = callerRole === "owner";
    const isVenueAdmin = callerRole === "admin";

    if (!isVenueOwner && !isVenueAdmin) {
      throw new SenderError("api_errors.set_venue_role_forbidden");
    }

    const targetMember = allMembers.find(r => r.userId === targetUserId);
    if (!targetMember) throw new SenderError("api_errors.target_user_not_found");

    const targetCurrentRole = targetMember.role.tag;

    // RULE: Owners cannot demote another owner
    if (isVenueOwner && targetUserId !== userId && targetCurrentRole === "owner" && role !== "owner") {
      throw new SenderError("api_errors.cannot_demote_same_role");
    }

    // RULE: Admins cannot demote another admin (or owner obviously)
    if (isVenueAdmin && !isVenueOwner && (getRoleRank(targetCurrentRole) >= getRoleRank("admin"))) {
      throw new SenderError("api_errors.cannot_demote_same_role");
    }

    // RULE: Admin cannot grant "owner" or "admin" to others
    if (isVenueAdmin && !isVenueOwner && (role === "owner" || role === "admin")) {
      throw new SenderError("api_errors.admin_role_limit");
    }

    // RULE: Cannot demote self if last owner
    if (targetUserId === userId && targetCurrentRole === "owner" && role !== "owner") {
      const ownersCount = allMembers.filter(m => m.role.tag === "owner").length;
      if (ownersCount <= 1) {
        throw new SenderError("api_errors.cannot_demote_last_owner");
      }
    }

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

    const myVenueMembership = [...ctx.db.VenueMember.venue_member_venue_id.filter(ch.venueId)].find(m => m.userId === userId);
    const isVenueOwner = myVenueMembership?.role.tag === "owner";

    const allChannelRoles = [...ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(channelId)];
    const myChannelRoleRow = allChannelRoles.find(r => r.userId === userId);
    const myChannelRole = myChannelRoleRow?.role.tag || "member";

    const isChannelOwner = isVenueOwner || myChannelRole === "owner";
    const isChannelAdmin = isChannelOwner || myChannelRole === "admin";

    if (!isChannelAdmin) {
      throw new SenderError("api_errors.set_channel_role_forbidden");
    }

    const existingTargetRoleRow = allChannelRoles.find(r => r.userId === targetUserId);
    const targetCurrentRole = existingTargetRoleRow?.role.tag || "member";

    // RULE: Owners cannot demote another owner
    if (isChannelOwner && targetUserId !== userId && targetCurrentRole === "owner" && role !== "owner") {
      throw new SenderError("api_errors.cannot_demote_same_role");
    }

    // RULE: Admins cannot demote another admin
    if (myChannelRole === "admin" && !isChannelOwner && (getRoleRank(targetCurrentRole) >= getRoleRank("admin"))) {
      throw new SenderError("api_errors.cannot_demote_same_role");
    }

    // RULE: Admin cannot grant "owner" or "admin" to others
    if (myChannelRole === "admin" && !isChannelOwner && (role === "owner" || role === "admin")) {
      throw new SenderError("api_errors.admin_role_limit");
    }

    // RULE: Cannot demote self if last owner
    if (targetUserId === userId && targetCurrentRole === "owner" && role !== "owner") {
      const ownersCount = allChannelRoles.filter(r => r.role.tag === "owner").length;
      if (ownersCount <= 1) {
        throw new SenderError("api_errors.cannot_demote_last_owner");
      }
    }

    if (existingTargetRoleRow) {
      ctx.db.ChannelMemberRole.delete({ ...existingTargetRoleRow });
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
    const isAdmin = callerMember?.role.tag === "owner" || callerMember?.role.tag === "admin";

    if (!isAdmin) throw new SenderError("api_errors.block_user_forbidden");

    const targetMember = allMembers.find(m => m.userId === targetUserId);
    if (!targetMember) throw new SenderError("api_errors.target_user_not_in_venue");
    if (targetUserId === userId) {
      throw new SenderError("api_errors.cannot_block_self");
    }

    // New rules:
    // 1. Cannot block owners
    if (targetMember.role.tag === "owner") {
      throw new SenderError("api_errors.cannot_block_owner");
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
    const isAdmin = callerMember?.role.tag === "owner" || callerMember?.role.tag === "admin";

    if (!isAdmin) throw new SenderError("api_errors.unblock_user_forbidden");

    // New rule: cannot unblock self
    if (targetUserId === userId) {
      throw new SenderError("api_errors.cannot_unblock_self");
    }

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
  const venueId = ch.venueId;
  const venue = ctx.db.Venue.venueId.find(venueId);
  if (!venue) throw new SenderError("api_errors.venue_not_found");

  const myVenueMembership = [...ctx.db.VenueMember.venue_member_venue_id.filter(venueId)].find(m => m.userId === userId);
  if (myVenueMembership?.role.tag === "owner") return;

  const myChannelRoleRow = [...ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(channelId)].find(r => r.userId === userId);
  if (myChannelRoleRow?.role.tag !== "owner" && myChannelRoleRow?.role.tag !== "admin") {
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

    const myVenueMembership = [...ctx.db.VenueMember.venue_member_venue_id.filter(ch.venueId)].find(m => m.userId === userId);

    const myChannelRoleRow = [...ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(channelId)].find(r => r.userId === userId);
    const userRole = myChannelRoleRow?.role.tag;
    const isOwner = myVenueMembership?.role.tag === "owner" || userRole === "owner";

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
      if (!ch) throw new SenderError("api_errors.channel_not_found");
      const myVenueMember = [...ctx.db.VenueMember.venue_member_venue_id.filter(ch.venueId)].find(m => m.userId === userId);
      const isVenueOwner = myVenueMember?.role.tag === "owner";
      const myChannelRoleRow = [...ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(msg.channelId)].find(r => r.userId === userId);
      const myChannelRole = myChannelRoleRow?.role.tag;
      const isChannelManager = myChannelRole === "owner" || myChannelRole === "admin" || myChannelRole === "moderator";
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
    const myVenueMember = [...ctx.db.VenueMember.venue_member_venue_id.filter(ch.venueId)].find(m => m.userId === userId);
    const isVenueOwner = myVenueMember?.role.tag === "owner";
    const myChannelRoleRow = [...ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(msg.channelId)].find(r => r.userId === userId);
    const myChannelRole = myChannelRoleRow?.role.tag;
    if (!isVenueOwner && myChannelRole !== "owner" && myChannelRole !== "admin" && myChannelRole !== "moderator") {
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
    const sender = ctx.sender;

    // Clean up existing pins for this displayUid + identity
    for (const p of ctx.db.DisplayPairingPin) {
      if (p.displayUid === displayUid && p.identity.isEqual(sender)) {
        ctx.db.DisplayPairingPin.pin.delete(p.pin);
      }
    }

    const pin = ctx.random.integerInRange(100000, 999999).toString();
    const expiresAt = ctx.timestamp.microsSinceUnixEpoch + (10n * 60n * 1000000n); // 10 mins

    ctx.db.DisplayPairingPin.insert({
      pin,
      displayUid,
      identity: sender,
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
    const isVenueOwner = callerMembership.role.tag === "owner";
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
    // 1. Find the message and its venue
    const msg = ctx.db.Message.messageId.find(messageId);
    if (!msg) throw new SenderError("api_errors.message_not_found");

    const channel = ctx.db.Channel.channelId.find(msg.channelId);
    if (!channel) throw new SenderError("api_errors.channel_not_found_for_message");

    // 2. Find the SPECIFIC device pairing for this machine and this venue
    const devicesByUid = [...ctx.db.DisplayDevice.display_device_uid.filter(uid)];
    const device = devicesByUid.find(d => d.identity.isEqual(ctx.sender) && d.venueId === channel.venueId);

    if (!device) {
      throw new SenderError("api_errors.display_device_mismatch");
    }

    // 3. Update the status row
    const statusRow = [...ctx.db.MessageDeliveryStatus.delivery_status_message_id.filter(messageId)]
      .find(s => s.displayId === device.displayId);

    if (statusRow) {
      ctx.db.MessageDeliveryStatus.statusId.update({
        ...statusRow,
        status: { tag: statusTag as any, value: "" },
        updatedAt: ctx.timestamp,
      });
    } else {
      ctx.db.MessageDeliveryStatus.insert({
        statusId: 0n,
        messageId,
        displayId: device.displayId,
        status: { tag: statusTag as any, value: "" },
        updatedAt: ctx.timestamp,
      });
    }

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
    const callerMember = [...ctx.db.VenueMember.venue_member_venue_id.filter(device.venueId)].find(m => m.userId === userId);
    const isVenueOwner = callerMember?.role.tag === "owner";

    if (!isVenueOwner) {
      const channels = [...ctx.db.Channel.channel_venue_id.filter(device.venueId)];
      const myRolesInVenue = channels.flatMap(ch =>
        [...ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(ch.channelId)]
          .filter(r => r.userId === userId)
      );
      const isAdmin = myRolesInVenue.some(r => r.role.tag === "owner" || r.role.tag === "admin");
      if (!isVenueOwner && !isAdmin) throw new SenderError("api_errors.delete_node_forbidden");
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

    const callerMember = [...ctx.db.VenueMember.venue_member_venue_id.filter(device.venueId)].find(m => m.userId === userId);
    const isVenueOwner = callerMember?.role.tag === "owner";

    if (!isVenueOwner) {
      const channels = [...ctx.db.Channel.channel_venue_id.filter(device.venueId)];
      const myRolesInVenue = channels.flatMap(ch =>
        [...ctx.db.ChannelMemberRole.channel_member_role_channel_id.filter(ch.channelId)]
          .filter(r => r.userId === userId)
      );
      const isAdmin = myRolesInVenue.some(r => r.role.tag === "owner" || r.role.tag === "admin");
      if (!isVenueOwner && !isAdmin) throw new SenderError("api_errors.rename_node_forbidden");
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
