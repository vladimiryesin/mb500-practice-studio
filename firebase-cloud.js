import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const ready = firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId;
window.practiceCloudReady = Boolean(ready);
window.practiceCloudUser = null;
window.dispatchEvent(new Event('practice-auth-state'));

if (ready) {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const provider = new GoogleAuthProvider();
  const deviceKey = 'mb500.studio.device.v1';
  let deviceId = localStorage.getItem(deviceKey);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(deviceKey, deviceId);
  }

  let activeProgressRef = null;
  let lastRemoteJson = '';

  function stateJson(state) {
    return JSON.stringify(state || {});
  }

  async function saveProgress() {
    if (!auth.currentUser || !activeProgressRef) return;
    const current = window.practiceGetState?.();
    if (!current) return;
    const payload = stateJson(current);
    if (payload === lastRemoteJson) return;
    try {
      await setDoc(activeProgressRef, {
        state: current,
        writer: deviceId,
        updatedAt: serverTimestamp()
      });
      lastRemoteJson = payload;
      cloudStatus('saved');
    } catch (error) {
      cloudStatus('error', error);
    }
  }

  // Cloud writes happen only after explicit Next or Previous button clicks.
  window.addEventListener('practice-cloud-save-requested', saveProgress);

  window.practiceCloudSignIn = async () => {
    try {
      // The app is hosted on GitHub Pages, while Firebase Auth's helper is on
      // firebaseapp.com. Redirect sign-in can lose its auth state in browsers
      // that partition third-party storage; popup sign-in avoids that flow.
      await signInWithPopup(auth, provider);
    } catch (error) {
      cloudStatus('error', error);
      throw error;
    }
  };
  window.practiceCloudSignOut = () => signOut(auth);

  function cloudStatus(status, error) {
    window.dispatchEvent(new CustomEvent('practice-cloud-status', { detail: { status, error: error?.message || '' } }));
  }

  onAuthStateChanged(auth, async user => {
    activeProgressRef = null;
    window.practiceCloudUser = user ? {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || '',
      photoURL: user.photoURL || ''
    } : null;
    if (user) window.practiceSelectCloudOwner?.(user.uid);
    window.dispatchEvent(new Event('practice-auth-state'));
    if (!user) {
      cloudStatus('local');
      return;
    }

    activeProgressRef = doc(db, 'users', user.uid, 'progress', 'current');
    cloudStatus('loading');
    try {
      const local = window.practiceGetState?.() || {};
      const snapshot = await getDoc(activeProgressRef);
      if (snapshot.exists()) {
        const data = snapshot.data();
        const remote = data.state || {};
        lastRemoteJson = stateJson(remote);
        window.practiceApplyRemote?.(remote, true);
      } else {
        lastRemoteJson = '';
      }
      cloudStatus('ready');
    } catch (error) {
      cloudStatus('error', error);
    }
  });
}

window.addEventListener('practice-cloud-status', event => {
  const status = event.detail?.status;
  const label = document.querySelector('#cloud-status');
  if (!label || !window.practiceCloudUser) return;
  if (status === 'loading') label.textContent = 'Checking cloud backup…';
  else if (status === 'ready') label.textContent = 'Cloud backup ready';
  else if (status === 'saved') label.textContent = 'Cloud backup saved';
  else if (status === 'error') label.textContent = 'Cloud backup failed';
});
