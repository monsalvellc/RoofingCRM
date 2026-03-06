import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import Constants from 'expo-constants';
import { auth, db } from '../../config/firebaseConfig';
import { COLLECTIONS } from '../../constants/config';
import type { Company, SalesRep } from '../../types';

// ─── Company ──────────────────────────────────────────────────────────────────

/**
 * Fetches a single company document by ID.
 * @throws If the document doesn't exist or the Firestore read fails.
 */
export async function getCompany(companyId: string): Promise<Company> {
  try {
    const snap = await getDoc(doc(db, COLLECTIONS.companies, companyId));
    if (!snap.exists()) throw new Error('Company not found.');
    return { id: snap.id, ...snap.data() } as Company;
  } catch (error) {
    console.error('[companiesService] getCompany failed:', error);
    throw new Error('Failed to load company data. Please try again.');
  }
}

// ─── Sales Reps ───────────────────────────────────────────────────────────────

/**
 * Fetches all users in the company whose role is 'Sales'.
 */
export async function getSalesReps(companyId: string): Promise<SalesRep[]> {
  try {
    const q = query(
      collection(db, COLLECTIONS.users),
      where('companyId', '==', companyId),
      where('role', '==', 'Sales'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SalesRep));
  } catch (error) {
    console.error('[companiesService] getSalesReps failed:', error);
    throw new Error('Failed to load reps. Please try again.');
  }
}

/**
 * Writes a new Sales rep's profile document to the users collection.
 * The document ID is the Firebase Auth UID created beforehand.
 */
export async function createRepProfile(
  uid: string,
  data: Omit<SalesRep, 'id'>,
): Promise<void> {
  try {
    await setDoc(doc(db, COLLECTIONS.users, uid), data);
  } catch (error) {
    console.error('[companiesService] createRepProfile failed:', error);
    throw new Error('Failed to save rep profile. Please try again.');
  }
}

/**
 * Soft-deletes a rep by setting isActive = false on their user document.
 */
export async function deactivateRep(userId: string): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.users, userId), { isActive: false });
  } catch (error) {
    console.error('[companiesService] deactivateRep failed:', error);
    throw new Error('Failed to revoke access. Please try again.');
  }
}

/**
 * Restores a previously deactivated rep by setting isActive = true.
 */
export async function reactivateRep(userId: string): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.users, userId), { isActive: true });
  } catch (error) {
    console.error('[companiesService] reactivateRep failed:', error);
    throw new Error('Failed to reactivate rep. Please try again.');
  }
}

// ─── Magic Reactivation Helpers ───────────────────────────────────────────────

/**
 * Looks up a user document by email address (company-agnostic).
 * Returns the SalesRep document if found, or null if no match.
 */
export async function checkUserByEmail(email: string): Promise<SalesRep | null> {
  try {
    const q = query(
      collection(db, COLLECTIONS.users),
      where('email', '==', email.toLowerCase().trim()),
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() } as SalesRep;
  } catch (error) {
    console.error('[companiesService] checkUserByEmail failed:', error);
    throw new Error('Failed to look up user. Please try again.');
  }
}

/**
 * Reactivates an existing inactive rep: sets isActive = true, updates their
 * name fields, and sends a password reset email so they can regain access.
 */
export async function magicReactivateRep(
  userId: string,
  email: string,
  firstName: string,
  lastName: string,
): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTIONS.users, userId), {
      isActive: true,
      firstName,
      lastName,
    });
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    console.error('[companiesService] magicReactivateRep failed:', error);
    throw new Error('Failed to reactivate rep. Please try again.');
  }
}

// ─── Secondary App Auth Helper ────────────────────────────────────────────────

/**
 * Creates a Firebase Auth account for a new rep WITHOUT signing out the
 * currently logged-in SuperAdmin.
 *
 * Strategy: spin up a temporary named Firebase App instance that is
 * completely isolated from the primary `app`. After the account is created
 * the secondary app is deleted immediately to prevent memory leaks.
 *
 * @returns The UID of the newly created user.
 * @throws If the email is already in use or the Auth call fails.
 */
export async function createAuthUserSecondary(
  email: string,
  password: string,
): Promise<string> {
  const extra = Constants.expoConfig?.extra ?? {};
  const firebaseConfig = {
    apiKey: extra.FIREBASE_API_KEY,
    authDomain: extra.FIREBASE_AUTH_DOMAIN,
    projectId: extra.FIREBASE_PROJECT_ID,
    storageBucket: extra.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: extra.FIREBASE_MESSAGING_SENDER_ID,
    appId: extra.FIREBASE_APP_ID,
  };

  // Use a timestamped name so parallel calls never collide.
  const secondaryApp = initializeApp(firebaseConfig, `secondary-${Date.now()}`);
  try {
    const secondaryAuth = getAuth(secondaryApp);
    const credential = await createUserWithEmailAndPassword(
      secondaryAuth,
      email,
      password,
    );
    return credential.user.uid;
  } finally {
    // Always clean up — even if createUserWithEmailAndPassword throws.
    await deleteApp(secondaryApp);
  }
}
