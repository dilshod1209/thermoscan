import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile
} from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, query, where, orderBy, limit, getDocs, serverTimestamp, getDocFromServer, deleteDoc } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    // Save/Update user profile
    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      lastLogin: new Date().toISOString()
    }, { merge: true });
    
    return user;
  } catch (error: any) {
    if (error.code === 'auth/popup-closed-by-user') {
      console.warn("Foydalanuvchi tizimga kirish oynasini yopdi.");
    } else if (error.code === 'auth/popup-blocked') {
      console.error("Popup brauzer tomonidan bloklandi. Iltimos, popuplarga ruxsat bering.");
    } else {
      console.error("Login xatosi:", error);
    }
    throw error;
  }
};

export const logout = () => signOut(auth);

export const registerWithUsername = async (username: string, pass: string) => {
  try {
    const internalEmail = `${username.toLowerCase().replace(/\s/g, '')}@thermoscan.ai`;
    const result = await createUserWithEmailAndPassword(auth, internalEmail, pass);
    const user = result.user;
    
    await updateProfile(user, { displayName: username });
    
    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid,
      username: username,
      displayName: username,
      photoURL: null,
      lastLogin: new Date().toISOString()
    }, { merge: true });
    
    return user;
  } catch (error) {
    console.error("Registratsiya xatosi:", error);
    throw error;
  }
};

export const loginWithUsername = async (username: string, pass: string) => {
  try {
    const internalEmail = `${username.toLowerCase().replace(/\s/g, '')}@thermoscan.ai`;
    const result = await signInWithEmailAndPassword(auth, internalEmail, pass);
    return result.user;
  } catch (error) {
    console.error("Login xatosi:", error);
    throw error;
  }
};

export const logActivity = async (userId: string, type: 'snapshot' | 'report' | 'alert', zone: string, description: string, metadata: any = {}) => {
  try {
    await addDoc(collection(db, 'activities'), {
      userId,
      type,
      zone,
      description,
      metadata,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error("Faoliyatni saqlashda xato:", error);
  }
};

export const getUserActivities = async (userId: string) => {
  try {
    // Note: orderBy('timestamp', 'desc') requires a composite index (userId, timestamp).
    // If it fails with "Missing or insufficient permissions", it's likely due to missing index.
    const q = query(
      collection(db, 'activities'),
      where('userId', '==', userId),
      limit(50)
    );
    const querySnapshot = await getDocs(q);
    const docs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    // Client-side sort as fallback for missing index
    return docs.sort((a: any, b: any) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
  } catch (error) {
    console.error("Faoliyatlarni yuklashda xato:", error);
    return [];
  }
};

// Connection test as required by instructions
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Iltimos, Firebase sozlamalarini tekshiring.");
    }
  }
}
