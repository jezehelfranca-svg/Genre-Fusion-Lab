import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, type User } from "firebase/auth";
import firebaseConfig from "../firebase-applet-config.json";

// The Firebase API key is intentionally NOT committed to the repo.
// Provide it via VITE_FIREBASE_API_KEY in .env (see .env.example).
const apiKey = import.meta.env.VITE_FIREBASE_API_KEY || firebaseConfig.apiKey;
export const isDriveSyncConfigured = Boolean(apiKey);

// Initialize Firebase only when a key is configured — getAuth throws
// auth/invalid-api-key at load time otherwise, which would crash the app
const app = isDriveSyncConfigured ? initializeApp({ ...firebaseConfig, apiKey }) : null;
export const auth = app ? getAuth(app) : null;

const provider = new GoogleAuthProvider();
provider.addScope("https://www.googleapis.com/auth/drive.file");

let isSigningIn = false;
let cachedAccessToken: string | null = null;

// Initialize auth state listener
export const initAuth = (
  onAuthSuccess: (user: User, token: string) => void,
  onAuthFailure: () => void
) => {
  if (!auth) {
    onAuthFailure();
    return () => {};
  }
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      if (cachedAccessToken) {
        onAuthSuccess(user, cachedAccessToken);
      } else {
        // If we don't have the token in memory, but we have a user session, we can prompt for sign in
        // or check if we can retrieve it. Since Firebase Auth doesn't persist provider tokens,
        // we'll require a fresh sign-in to get the token, which is the secure, expected behavior.
        onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      onAuthFailure();
    }
  });
};

// Start Google sign-in flow
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  if (!auth) {
    throw new Error("Google Drive sync is not configured: set VITE_FIREBASE_API_KEY in your .env file.");
  }
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("Failed to get access token from Google Auth");
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    if (error?.code === 'auth/popup-closed-by-user') {
      console.log("Sign-in popup closed by user.");
      return null;
    }
    console.error("Sign in error:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

// Logout from active account
export const logout = async () => {
  if (auth) {
    await auth.signOut();
  }
  cachedAccessToken = null;
};

// Retrieve current cached token
export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

// Google Drive file API helpers
const FILE_NAME = "genre_fusion_history.json";

interface HistoryItem {
  id: string;
  name: string;
  ingredients: string[];
  result: string;
  timestamp: string;
}

/**
 * Searches for 'genre_fusion_history.json' on Google Drive.
 * Returns the file ID if found, otherwise null.
 */
export async function findHistoryFile(accessToken: string): Promise<string | null> {
  const query = `name = '${FILE_NAME}' and trashed = false`;
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`;
    try {
      const errorData = await response.json();
      if (errorData?.error?.message) {
        errMsg += `: ${errorData.error.message}`;
      }
    } catch (e) {
      if (response.statusText) {
        errMsg += ` ${response.statusText}`;
      }
    }
    throw new Error(`Failed to query Google Drive: ${errMsg}`);
  }
  const data = await response.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }
  return null;
}

/**
 * Reads context from the given Google Drive file ID
 */
export async function readHistoryFile(accessToken: string, fileId: string): Promise<HistoryItem[]> {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`;
    try {
      const errorData = await response.json();
      if (errorData?.error?.message) {
        errMsg += `: ${errorData.error.message}`;
      }
    } catch (e) {
      if (response.statusText) {
        errMsg += ` ${response.statusText}`;
      }
    }
    throw new Error(`Failed to read file contents: ${errMsg}`);
  }
  const content = await response.json();
  return Array.isArray(content) ? content : [];
}

/**
 * Saves (creates or overrides) history list into Google Drive
 */
export async function saveHistoryToDrive(
  accessToken: string,
  history: HistoryItem[]
): Promise<boolean> {
  try {
    const fileId = await findHistoryFile(accessToken);

    if (fileId) {
      // Update existing file using multipart or media PATCH
      const response = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(history),
        }
      );
      if (!response.ok) {
        let errMsg = `HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData?.error?.message) errMsg += `: ${errorData.error.message}`;
        } catch (e) {}
        throw new Error(`Failed to update Drive file: ${errMsg}`);
      }
      return true;
    } else {
      // Create new file with uploadType=multipart
      const boundary = "genre_fusion_boundary_marker";
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;

      const metadata = {
        name: FILE_NAME,
        mimeType: "application/json",
        description: "Created automatically by Genre Fusion Lab to store your custom sound fusions",
      };

      const multipartRequestBody =
        delimiter +
        "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
        JSON.stringify(metadata) +
        delimiter +
        "Content-Type: application/json\r\n\r\n" +
        JSON.stringify(history) +
        closeDelimiter;

      const response = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body: multipartRequestBody,
        }
      );
      if (!response.ok) {
        let errMsg = `HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData?.error?.message) errMsg += `: ${errorData.error.message}`;
        } catch (e) {}
        throw new Error(`Failed to create Drive file: ${errMsg}`);
      }
      return true;
    }
  } catch (error) {
    console.error("Error saving history to Google Drive:", error);
    throw error;
  }
}
