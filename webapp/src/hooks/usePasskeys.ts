import { reducers } from '../module_bindings';
import { useReducer } from 'spacetimedb/react';

export const usePasskeys = () => {
  const registerNewUser = useReducer(reducers.registerNewUserWithPasskey);
  const loginWithPasskey = useReducer(reducers.loginWithPasskey);

  const createPasskey = async () => {
    if (!window.PublicKeyCredential) {
      throw new Error('login.passkey_not_supported');
    }

    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const userID = new Uint8Array(16);
    window.crypto.getRandomValues(userID);

    const createOptions: PublicKeyCredentialCreationOptions = {
      challenge,
      rp: {
        name: "Canal4",
        id: window.location.hostname,
      },
      user: {
        id: userID,
        name: "canal4-user",
        displayName: "Canal4 User",
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" }, // ES256
        { alg: -257, type: "public-key" }, // RS256
      ],
      timeout: 60000,
      attestation: "none",
    };

    const credential = (await navigator.credentials.create({
      publicKey: createOptions,
    })) as PublicKeyCredential;

    if (!credential) {
      throw new Error('login.passkey_cancelled');
    }

    await registerNewUser({ credentialId: credential.id });
    return credential.id;
  };

  const authenticatePasskey = async () => {
    if (!window.PublicKeyCredential) {
      throw new Error('login.passkey_not_supported');
    }

    const challenge = new Uint8Array(32);
    window.crypto.getRandomValues(challenge);

    const getOptions: PublicKeyCredentialRequestOptions = {
      challenge,
      rpId: window.location.hostname,
      timeout: 60000,
      userVerification: "required",
    };

    const credential = (await navigator.credentials.get({
      publicKey: getOptions,
    })) as PublicKeyCredential;

    if (!credential) {
      throw new Error('login.passkey_cancelled');
    }

    await loginWithPasskey({ credentialId: credential.id });
    return credential.id;
  };

  return { createPasskey, authenticatePasskey };
};
