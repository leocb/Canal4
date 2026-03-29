import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON
} from '@simplewebauthn/types';
import { reducers, tables } from '../module_bindings';
import { useAuth } from './useAuth';
import { useReducer } from 'spacetimedb/react';
import { useReadyTable } from './useReadyTable';
import type { Identity } from 'spacetimedb';
import { useTranslation } from 'react-i18next';
import { useRef, useEffect } from 'react';



/**
 * Hook to manage WebAuthn passkey operations using SimpleWebAuthn.
 */
export function usePasskeys() {
  const { identity, connected } = useAuth();
  const { t } = useTranslation();
  const lastCredentialIdRef = useRef<string | null>(null);

  const registerNewUserWithPasskey = useReducer(reducers.registerNewUserWithPasskey);
  const loginWithPasskey = useReducer(reducers.loginWithPasskey);
  const registerPasskey = useReducer(reducers.registerPasskey);
  const createPasskeyChallenge = useReducer(reducers.createPasskeyChallenge);
  const handleCeremonyError = (error: any) => {
    if (error?.name === 'NotAllowedError') throw new Error('login.passkey_cancelled');
    if (error?.name === 'AbortError') throw new Error('login.passkey_aborted');
    if (error?.name === 'SecurityError') throw new Error('login.passkey_security_error');
    throw error;
  };

  // Subscribe to our own pending challenge (filtered server-side to our identity)
  const [challengeRows] = useReadyTable(tables.PasskeyChallengeSelfView);

  // Use a ref to capture the latest state since the polling logic is a closure
  const rowsRef = useRef(challengeRows);
  useEffect(() => {
    rowsRef.current = challengeRows;
  }, [challengeRows]);


  /**
   * Requests a fresh server-generated challenge and waits for it to arrive
   * via the PasskeyChallengeView subscription.
   *
   * Returns the base64url challenge string once received, or rejects on timeout.
   */
  const requestChallenge = (overrideIdentity?: Identity): Promise<string> => {
    const activeIdentity = overrideIdentity || identity;
    if (!activeIdentity) return Promise.reject(new Error('login.passkey_no_identity'));

    // Record the current challenge for this identity (if any) to ignore it
    const oldRow = rowsRef.current.find(
      r => (r as any).identity?.toHexString?.() === activeIdentity.toHexString()
    );
    const oldChallenge = (oldRow as any)?.challenge;

    // Fire the reducer to make the server generate and store a NEW challenge
    createPasskeyChallenge();

    // Poll challengeRows until we see a challenge different from the old one
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + 10_000; // 10-second timeout

      const check = () => {
        const row = rowsRef.current.find(
          r => (r as any).identity?.toHexString?.() === activeIdentity.toHexString()
        );
        const newChallenge = (row as any)?.challenge;

        if (newChallenge && newChallenge !== oldChallenge) {
          resolve(newChallenge as string);
          return;
        }
        if (Date.now() > deadline) {
          reject(new Error('login.passkey_challenge_timeout'));
          return;
        }
        setTimeout(check, 100);
      };
      check();
    });
  };

  /**
   * Registration / Signup flow.
   * Creates a new passkey and registers a new user account.
   */
  const createPasskey = async (name: string, overrideIdentity?: Identity) => {
    const activeIdentity = overrideIdentity || identity;
    if (!activeIdentity) throw new Error('login.passkey_no_identity');

    // 1. Get a fresh server-issued challenge
    const challenge = await requestChallenge(activeIdentity);

    // 2. Prepare registration options
    const options: PublicKeyCredentialCreationOptionsJSON = {
      challenge,
      rp: {
        name: t('app.name'),
        id: window.location.hostname,
      },
      user: {
        // Stable user handle: base64url of the identity bytes. Not shown to the user.
        id: btoa(String.fromCharCode(...activeIdentity.toUint8Array()))
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''),
        name,
        displayName: name,
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },   // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      timeout: 60000,
      attestation: 'none',
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
      },
    };

    // 3. Perform the WebAuthn registration ceremony
    try {
      const credential = await startRegistration({ optionsJSON: options });

      // 4. Send credential + clientDataJSON to backend for verification
      await registerNewUserWithPasskey({
        credentialId: credential.id,
        attestationObject: credential.response.attestationObject,
        clientDataJson: credential.response.clientDataJSON,
        name,
      });

      return credential;
    } catch (error: any) {
      handleCeremonyError(error);
    }
  };

  /**
   * Login / Authentication flow.
   * Authenticates using an existing passkey.
   */
  const authenticatePasskey = async (overrideIdentity?: Identity) => {
    const activeIdentity = overrideIdentity || identity;
    if (!activeIdentity) throw new Error('login.passkey_no_identity');

    // 1. Get a fresh server-issued challenge
    const challenge = await requestChallenge(activeIdentity);

    // 2. Prepare authentication options
    const options: PublicKeyCredentialRequestOptionsJSON = {
      challenge,
      timeout: 60000,
      userVerification: 'required',
      rpId: window.location.hostname,
    };

    // 3. Perform the WebAuthn authentication ceremony
    try {
      const assertion = await startAuthentication({ optionsJSON: options });

      // 4. Send the assertion to our SpacetimeDB backend for cryptographic verification
      lastCredentialIdRef.current = assertion.id;
      await loginWithPasskey({
        credentialId: assertion.id,
        authenticatorData: assertion.response.authenticatorData,
        clientDataJson: assertion.response.clientDataJSON,
        signature: assertion.response.signature,
      });

      return assertion;
    } catch (error: any) {
      handleCeremonyError(error);
    }
  };

  /**
   * Register a new passkey for an already logged-in user (replaces existing one).
   */
  const addPasskey = async () => {
    if (!identity) throw new Error('login.passkey_no_identity');

    // 1. Get a fresh server-issued challenge
    const challenge = await requestChallenge();

    // 2. Prepare registration options (same as create, but for an existing user)
    const options: PublicKeyCredentialCreationOptionsJSON = {
      challenge,
      rp: {
        name: t('app.name'),
        id: window.location.hostname,
      },
      user: {
        id: btoa(String.fromCharCode(...identity.toUint8Array()))
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''),
        name: t('login.new_passkey_name'),
        displayName: t('login.new_passkey_name'),
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },
        { alg: -257, type: 'public-key' },
      ],
      timeout: 60000,
      attestation: 'none',
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
      },
    };

    // 3. Perform ceremony
    try {
      const credential = await startRegistration({ optionsJSON: options });

      // 4. Register (updates existing UserAuth row)
      await registerPasskey({
        credentialId: credential.id,
        attestationObject: credential.response.attestationObject,
        clientDataJson: credential.response.clientDataJSON,
      });
    } catch (error: any) {
      handleCeremonyError(error);
    }
  };


  return {
    createPasskey,
    authenticatePasskey,
    addPasskey,
    isReady: connected,
  };
}
