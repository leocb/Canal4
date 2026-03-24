import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON
} from '@simplewebauthn/types';
import { reducers } from '../module_bindings';
import { useAuth } from './useAuth';
import { useReducer } from 'spacetimedb/react';
import type { Identity } from 'spacetimedb';
import * as base64js from 'base64-js';
import { useTranslation } from 'react-i18next';



/**
 * Hook to manage WebAuthn passkey operations using SimpleWebAuthn.
 */
export function usePasskeys() {
  const { identity, connected } = useAuth();
  const { t } = useTranslation();

  
  const registerNewUserWithPasskey = useReducer(reducers.registerNewUserWithPasskey);
  const loginWithPasskey = useReducer(reducers.loginWithPasskey);
  const registerPasskey = useReducer(reducers.registerPasskey);


  /**
   * Helper to convert a Uint8Array to a base64url string.
   */
  const toBase64Url = (bytes: Uint8Array): string => {
    return base64js.fromByteArray(bytes)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  };

  /**
   * Helper to convert an Identity to a WebAuthn challenge (Uint8Array).
   */
  const getChallengeFromIdentity = (id: Identity): Uint8Array => {
    return id.toUint8Array();
  };

  /**
   * Registration / Signup flow.
   * Creates a new passkey and calls the backend to register the user.
   */
  const createPasskey = async (name: string, overrideIdentity?: Identity) => {
    const activeIdentity = overrideIdentity || identity;
    if (!activeIdentity) throw new Error("No identity available for passkey creation");

    try {
      // 1. Prepare registration options
      const challenge = toBase64Url(getChallengeFromIdentity(activeIdentity));
      const options: PublicKeyCredentialCreationOptionsJSON = {
        challenge,
        rp: {
          name: t('app.name'),
          id: window.location.hostname,
        },

        user: {
          id: challenge, // using identity as user ID too
          name: name,
          displayName: name,
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' }, // ES256
          { alg: -257, type: 'public-key' }, // RS256
        ],
        timeout: 60000,
        attestation: 'none',
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'preferred',
        },
      };

      // 2. Perform the WebAuthn ceremony
      const credential = await startRegistration({ optionsJSON: options });

      // 3. Send to backend
      await registerNewUserWithPasskey({ 
        credentialId: credential.id, 
        attestationObject: credential.response.attestationObject,
        name 
      });

      return credential;
    } catch (error) {
      console.error("Passkey registration error:", error);
      throw error;
    }
  };

  /**
   * Login / Authentication flow.
   * Authenticates using a passkey and calls the backend to verify the challenge.
   */
  const authenticatePasskey = async (overrideIdentity?: Identity) => {
    const activeIdentity = overrideIdentity || identity;
    if (!activeIdentity) throw new Error("No identity available for authentication");

    try {
      // 1. Prepare authentication options
      const challenge = toBase64Url(getChallengeFromIdentity(activeIdentity));
      const options: PublicKeyCredentialRequestOptionsJSON = {
        challenge,
        timeout: 60000,
        userVerification: 'preferred',
        rpId: window.location.hostname,
      };

      // 2. Perform the ceremony
      const assertion = await startAuthentication({ optionsJSON: options });

      // 3. Send the assertion to our SpacetimeDB backend for cryptographic verification
      await loginWithPasskey({ 
        credentialId: assertion.id,
        authenticatorData: assertion.response.authenticatorData,
        clientDataJson: assertion.response.clientDataJSON,
        signature: assertion.response.signature
      });

      return assertion;
    } catch (error) {
      console.error("Passkey authentication error:", error);
      throw error;
    }
  };

  /**
   * Register a new passkey for an already logged-in user.
   */
  const addPasskey = async () => {
    if (!identity) throw new Error("Must be connected to add a passkey");
    const name = t('login.new_passkey_name'); 
    const credential = await createPasskey(name);

    await registerPasskey({
        credentialId: credential.id,
        attestationObject: credential.response.attestationObject
    });
  };


  return {
    createPasskey,
    authenticatePasskey,
    addPasskey,
    isReady: connected,
  };
}
