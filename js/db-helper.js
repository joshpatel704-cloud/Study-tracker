import { db, isFirebaseAvailable, handleFirestoreError, OperationType } from '../firebase/firebase-config.js';
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';

// Retrieve profile (online or offline fallback)
export async function getUserProfile(userId) {
  if (isFirebaseAvailable && !userId.startsWith('local_')) {
    const path = `users/${userId}`;
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        const data = userDoc.data();
        localStorage.setItem(`studymaster_profile_${userId}`, JSON.stringify(data));
        return data;
      }
    } catch (e) {
      console.warn("Firestore getUserProfile failed, falling back to cache.", e);
    }
  }
  
  const cached = localStorage.getItem(`studymaster_profile_${userId}`);
  if (cached) return JSON.parse(cached);
  
  // Formulate default specs
  const def = {
    uid: userId,
    displayName: 'StudyMaster Student',
    email: 'student@studymaster.com',
    dailyGoal: 6,
    weeklyGoal: 40,
    monthlyGoal: 160,
    currentStreak: 0,
    longestStreak: 0,
    lastStudyDate: '',
    examDate: '',
    examTitle: '',
    theme: 'dark',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(`studymaster_profile_${userId}`, JSON.stringify(def));
  return def;
}

// Update profile
export async function updateUserProfile(userId, data) {
  const profile = await getUserProfile(userId);
  const updated = { ...profile, ...data, updatedAt: new Date().toISOString() };
  localStorage.setItem(`studymaster_profile_${userId}`, JSON.stringify(updated));
  
  if (isFirebaseAvailable && !userId.startsWith('local_')) {
    const path = `users/${userId}`;
    try {
      await setDoc(doc(db, 'users', userId), updated, { merge: true });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, path);
    }
  }
  return updated;
}

// Get user schedules list
export async function getSchedules(userId) {
  if (isFirebaseAvailable && !userId.startsWith('local_')) {
    const path = `users/${userId}/schedules`;
    try {
      const q = collection(db, 'users', userId, 'schedules');
      const snap = await getDocs(q);
      const list = [];
      snap.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() });
      });
      localStorage.setItem(`studymaster_schedules_${userId}`, JSON.stringify(list));
      return list;
    } catch (e) {
      console.warn("Firestore getSchedules failed, falling back to cache.", e);
    }
  }
  
  try {
    return JSON.parse(localStorage.getItem(`studymaster_schedules_${userId}`)) || [];
  } catch {
    return [];
  }
}

// Add schedule item
export async function addSchedule(userId, item) {
  const id = isFirebaseAvailable && !userId.startsWith('local_') 
    ? 'sch_' + Math.random().toString(36).substr(2, 9) 
    : 'local_sch_' + Math.random().toString(36).substr(2, 9);
    
  const newItem = { id, ...item, createdAt: new Date().toISOString() };
  
  const list = await getSchedules(userId);
  list.push(newItem);
  localStorage.setItem(`studymaster_schedules_${userId}`, JSON.stringify(list));
  
  if (isFirebaseAvailable && !userId.startsWith('local_')) {
    const path = `users/${userId}/schedules/${id}`;
    try {
      await setDoc(doc(db, 'users', userId, 'schedules', id), newItem);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, path);
    }
  }
  return newItem;
}

// Delete schedule item
export async function deleteSchedule(userId, scheduleId) {
  const list = await getSchedules(userId);
  const updated = list.filter(item => item.id !== scheduleId);
  localStorage.setItem(`studymaster_schedules_${userId}`, JSON.stringify(updated));
  
  if (isFirebaseAvailable && !userId.startsWith('local_') && !scheduleId.startsWith('local_')) {
    const path = `users/${userId}/schedules/${scheduleId}`;
    try {
      await deleteDoc(doc(db, 'users', userId, 'schedules', scheduleId));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  }
  return true;
}

// Get user study logs
export async function getSessions(userId) {
  if (isFirebaseAvailable && !userId.startsWith('local_')) {
    const path = `users/${userId}/sessions`;
    try {
      const q = collection(db, 'users', userId, 'sessions');
      const snap = await getDocs(q);
      const list = [];
      snap.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() });
      });
      localStorage.setItem(`studymaster_sessions_${userId}`, JSON.stringify(list));
      return list;
    } catch (e) {
      console.warn("Firestore getSessions failed, using cache fallback:", e);
    }
  }
  
  try {
    return JSON.parse(localStorage.getItem(`studymaster_sessions_${userId}`)) || [];
  } catch {
    return [];
  }
}

// Save study session
export async function addSession(userId, session) {
  const id = isFirebaseAvailable && !userId.startsWith('local_') 
    ? 'ses_' + Math.random().toString(36).substr(2, 9) 
    : 'local_ses_' + Math.random().toString(36).substr(2, 9);
    
  const newSession = { id, ...session, createdAt: new Date().toISOString() };
  
  const list = await getSessions(userId);
  list.push(newSession);
  localStorage.setItem(`studymaster_sessions_${userId}`, JSON.stringify(list));
  
  if (isFirebaseAvailable && !userId.startsWith('local_')) {
    const path = `users/{userId}/sessions/${id}`;
    try {
      await setDoc(doc(db, 'users', userId, 'sessions', id), newSession);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, path);
    }
  }
  
  await recalculateStreaks(userId);
  return newSession;
}

// Delete study session
export async function deleteSession(userId, sessionId) {
  const list = await getSessions(userId);
  const updated = list.filter(item => item.id !== sessionId);
  localStorage.setItem(`studymaster_sessions_${userId}`, JSON.stringify(updated));
  
  if (isFirebaseAvailable && !userId.startsWith('local_') && !sessionId.startsWith('local_')) {
    const path = `users/${userId}/sessions/${sessionId}`;
    try {
      await deleteDoc(doc(db, 'users', userId, 'sessions', sessionId));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, path);
    }
  }
  
  await recalculateStreaks(userId);
  return true;
}

// Streak Engine
export async function recalculateStreaks(userId) {
  const sessions = await getSessions(userId);
  if (!sessions || sessions.length === 0) {
    await updateUserProfile(userId, { currentStreak: 0, lastStudyDate: '' });
    return;
  }

  // Group study times per day (in seconds)
  const durationsPerDate = {};
  sessions.forEach(s => {
    const dateStr = s.date; // YYYY-MM-DD
    durationsPerDate[dateStr] = (durationsPerDate[dateStr] || 0) + s.duration;
  });

  // Filter completed streak dates (study >= 30 mins, i.e., 1800s)
  const streakDates = Object.keys(durationsPerDate)
    .filter(d => durationsPerDate[d] >= 1800)
    .sort();

  if (streakDates.length === 0) {
    await updateUserProfile(userId, { currentStreak: 0 });
    return;
  }

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;
  let prevDate = null;

  // Day difference helper (in client local timezone)
  const getDiffDays = (d1Str, d2Str) => {
    const d1 = new Date(d1Str + 'T00:00:00');
    const d2 = new Date(d2Str + 'T00:00:00');
    const diff = d2 - d1;
    return Math.round(diff / (1000 * 60 * 60 * 24));
  };

  streakDates.forEach(dStr => {
    if (!prevDate) {
      tempStreak = 1;
    } else {
      const diff = getDiffDays(prevDate, dStr);
      if (diff === 1) {
        tempStreak++;
      } else if (diff > 1) {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
    }
    prevDate = dStr;
  });
  longestStreak = Math.max(longestStreak, tempStreak);

  // Compute live current streak
  const today = new Date().toISOString().split('T')[0];
  const yesterdayObj = new Date();
  yesterdayObj.setDate(yesterdayObj.getDate() - 1);
  const yesterday = yesterdayObj.toISOString().split('T')[0];

  const hasStudiedToday = streakDates.includes(today);
  const hasStudiedYesterday = streakDates.includes(yesterday);

  if (!hasStudiedToday && !hasStudiedYesterday) {
    currentStreak = 0;
  } else {
    let lastDate = streakDates[streakDates.length - 1];
    let streakCount = 1;
    let idx = streakDates.length - 2;

    const diffFromToday = getDiffDays(lastDate, today);
    if (diffFromToday <= 1) {
      while (idx >= 0) {
        const diff = getDiffDays(streakDates[idx], lastDate);
        if (diff === 1) {
          streakCount++;
          lastDate = streakDates[idx];
          idx--;
        } else {
          break;
        }
      }
      currentStreak = streakCount;
    } else {
      currentStreak = 0;
    }
  }

  const user = await getUserProfile(userId);
  const oldLongest = user.longestStreak || 0;
  const finalLongest = Math.max(longestStreak, currentStreak, oldLongest);

  await updateUserProfile(userId, {
    currentStreak,
    longestStreak: finalLongest,
    lastStudyDate: streakDates[streakDates.length - 1] || ''
  });
}
