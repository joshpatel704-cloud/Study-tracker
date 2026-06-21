import { auth, db, isFirebaseAvailable } from '../firebase/firebase-config.js';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  sendPasswordResetEmail, 
  onAuthStateChanged,
  updateProfile 
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';

// Local storage namespaces
const LOCAL_USERS_KEY = 'studymaster_local_users';
const SESSION_USER_KEY = 'studymaster_session_user';

export function getLocalUsers() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_USERS_KEY)) || [];
  } catch {
    return [];
  }
}

export function saveLocalUsers(users) {
  localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
}

// Retrieve currently active user session from Firestore or LocalStorage
export function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_USER_KEY)) || null;
  } catch {
    return null;
  }
}

// Register User Account
export async function signUpUser(fullName, email, password) {
  if (isFirebaseAvailable) {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      await updateProfile(user, { displayName: fullName });
      
      const p = {
        uid: user.uid,
        displayName: fullName,
        email: email,
        dailyGoal: 6, // Default per specifications
        weeklyGoal: 40,
        monthlyGoal: 160,
        currentStreak: 0,
        longestStreak: 0,
        lastStudyDate: '',
        examDate: '',
        examTitle: '',
        theme: 'light',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Store in firestore
      const userDoc = doc(db, 'users', user.uid);
      await setDoc(userDoc, p);

      // Save user session
      localStorage.setItem(SESSION_USER_KEY, JSON.stringify({
        uid: user.uid,
        displayName: fullName,
        email: email,
        isOffline: false
      }));

      return user;
    } catch (error) {
      console.error("Firebase Signup error, using offline store:", error);
      throw error;
    }
  } else {
    // Offline database fallback
    const users = getLocalUsers();
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error("An account with this email already exists locally.");
    }
    const newUid = 'local_' + Math.random().toString(36).substr(2, 9);
    const newUserProfile = {
      uid: newUid,
      displayName: fullName,
      email: email,
      password: password,
      dailyGoal: 6,
      weeklyGoal: 40,
      monthlyGoal: 160,
      currentStreak: 0,
      longestStreak: 0,
      lastStudyDate: '',
      examDate: '',
      examTitle: '',
      theme: 'light',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    users.push(newUserProfile);
    saveLocalUsers(users);

    const userProfileKey = `studymaster_profile_${newUid}`;
    localStorage.setItem(userProfileKey, JSON.stringify(newUserProfile));

    localStorage.setItem(SESSION_USER_KEY, JSON.stringify({
      uid: newUid,
      displayName: fullName,
      email: email,
      isOffline: true
    }));
    return newUserProfile;
  }
}

// Login
export async function loginUser(email, password, rememberMe) {
  if (isFirebaseAvailable) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Sync and retrieve user settings
      let displayName = user.displayName || 'StudyMaster Student';
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          displayName = userDoc.data().displayName || displayName;
        }
      } catch (err) {
        console.warn("Could not retrieve user info from Firestore.", err);
      }

      localStorage.setItem(SESSION_USER_KEY, JSON.stringify({
        uid: user.uid,
        displayName: displayName,
        email: user.email,
        isOffline: false
      }));

      if (rememberMe) {
        localStorage.setItem('studymaster_remember_me', email);
      } else {
        localStorage.removeItem('studymaster_remember_me');
      }

      return user;
    } catch (error) {
      console.warn("Firebase sign in failed. Trying offline validation:", error);
      return loginOfflineUser(email, password, rememberMe);
    }
  } else {
    return loginOfflineUser(email, password, rememberMe);
  }
}

function loginOfflineUser(email, password, rememberMe) {
  const users = getLocalUsers();
  const matched = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (matched) {
    if (matched.password === password) {
      localStorage.setItem(SESSION_USER_KEY, JSON.stringify({
        uid: matched.uid,
        displayName: matched.displayName,
        email: matched.email,
        isOffline: true
      }));

      if (rememberMe) {
        localStorage.setItem('studymaster_remember_me', email);
      } else {
        localStorage.removeItem('studymaster_remember_me');
      }
      return matched;
    } else {
      throw new Error("Incorrect password entered for local user.");
    }
  } else {
    throw new Error("Account not found. Sign up first or check internet connection.");
  }
}

// Reset password request
export async function resetPassword(email) {
  if (isFirebaseAvailable) {
    return sendPasswordResetEmail(auth, email);
  } else {
    const users = getLocalUsers();
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      alert("Local account detected. Password resets are not available in local mode. Please sign up again under a new account.");
      return true;
    } else {
      throw new Error("Email not found.");
    }
  }
}

// Signout User
export async function logoutUser() {
  localStorage.removeItem(SESSION_USER_KEY);
  if (isFirebaseAvailable) {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Signout error:", error);
    }
  }
  window.location.href = 'login.html';
}

// Global Auth monitor
export function monitorAuth(onAuthenticated, onUnauthenticated) {
  if (isFirebaseAvailable) {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        let displayName = user.displayName || 'StudyMaster Student';
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            displayName = userDoc.data().displayName || displayName;
          }
        } catch (e) {
          console.warn("Offline Firestore state:", e);
        }
        const profile = {
          uid: user.uid,
          displayName: displayName,
          email: user.email,
          isOffline: false
        };
        localStorage.setItem(SESSION_USER_KEY, JSON.stringify(profile));
        onAuthenticated(profile);
      } else {
        const localSession = getCurrentUser();
        if (localSession && localSession.isOffline) {
          onAuthenticated(localSession);
        } else {
          onUnauthenticated();
        }
      }
    });
  } else {
    // Offline static timer fallback
    setTimeout(() => {
      const localSession = getCurrentUser();
      if (localSession) {
        onAuthenticated(localSession);
      } else {
        onUnauthenticated();
      }
    }, 150);
  }
}

// Update authentication profile details
export async function updateAuthProfile(fullName) {
  if (isFirebaseAvailable && auth.currentUser) {
    await updateProfile(auth.currentUser, { displayName: fullName });
  }
  const curr = getCurrentUser();
  if (curr) {
    curr.displayName = fullName;
    localStorage.setItem(SESSION_USER_KEY, JSON.stringify(curr));
  }
}
