import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

const firebaseConfig = {
  apiKey: extra.FIREBASE_API_KEY,
  authDomain: extra.FIREBASE_AUTH_DOMAIN,
  projectId: extra.FIREBASE_PROJECT_ID,
  storageBucket: extra.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: extra.FIREBASE_MESSAGING_SENDER_ID,
  appId: extra.FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage),
});

// memoryLocalCache is the required choice for React Native (Hermes engine).
// persistentLocalCache + persistentMultipleTabManager are web-only APIs:
//   - persistentLocalCache relies on IndexedDB (not available in Hermes)
//   - persistentMultipleTabManager requires the BroadcastChannel API (web-only)
// Both will throw at runtime and break the Firestore instance, causing all
// reads and writes — including login — to fail.
//
// With memoryLocalCache, writes are applied to the in-session local cache
// synchronously (fire-and-forget mutations see them immediately) and are
// queued for server sync. For cross-session persistence, use the AsyncStorage
// image queue in utils/imageQueue.ts.
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
  ignoreUndefinedProperties: true, // prevents crashes when optional/geocoded fields are undefined
});

export const storage = getStorage(app);
export default app;