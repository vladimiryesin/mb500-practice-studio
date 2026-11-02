import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
  signOut
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
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

  let unsubscribeProgress = null;
  let pendingWrite = null;
  let activeProgressRef = null;
  let lastRemoteJson = '';

  function stateJson(state) {
    return JSON.stringify(state || {});
  }

  function scheduleWrite() {
    if (!auth.currentUser || !activeProgressRef) return;
    clearTimeout(pendingWrite);
    pendingWrite = setTimeout(async () => {
      const current = window.practiceGetState?.();
      if (!current || !auth.currentUser || !activeProgressRef) return;
      const payload = stateJson(current);
      if (payload === lastRemoteJson) return;
      try {
        await setDoc(activeProgressRef, {
          state: current,
          writer: deviceId,
          updatedAt: serverTimestamp()
        });
        lastRemoteJson = payload;
        cloudStatus('synced');
      } catch (error) {
        cloudStatus('error', error);
      }
    }, 700);
  }

  window.addEventListener('practice-state-change', scheduleWrite);

  window.practiceCloudSignIn = async () => {
    try {
      if (matchMedia('(display-mode: standalone)').matches) {
        await signInWithRedirect(auth, provider);
      } else {
        await signInWithPopup(auth, provider);
      }
    } catch (error) {
      cloudStatus('error', error);
      throw error;
    }
  };
  window.practiceCloudSignOut = () => signOut(auth);
  window.addEventListener('online', () => scheduleWrite());

  function cloudStatus(status, error) {
    window.dispatchEvent(new CustomEvent('practice-cloud-status', { detail: { status, error: error?.message || '' } }));
  }

  getRedirectResult(auth).catch(error => cloudStatus('error', error));

  onAuthStateChanged(auth, async user => {
    unsubscribeProgress?.();
    unsubscribeProgress = null;
    activeProgressRef = null;
    window.practiceCloudUser = user ? { uid: user.uid, email: user.email || '' } : null;
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
        const merged = window.practiceGetState?.() || {};
        if (stateJson(merged) !== lastRemoteJson) scheduleWrite();
      } else {
        lastRemoteJson = '';
        if (Object.keys(local).length) scheduleWrite();
      }
      unsubscribeProgress = onSnapshot(activeProgressRef, snapshotUpdate => {
        if (!snapshotUpdate.exists()) return;
        const data = snapshotUpdate.data();
        if (data.writer === deviceId) return;
        const remote = data.state || {};
        const remoteJson = stateJson(remote);
        if (remoteJson === lastRemoteJson) return;
        lastRemoteJson = remoteJson;
        window.practiceApplyRemote?.(remote);
        const merged = window.practiceGetState?.() || {};
        if (stateJson(merged) !== remoteJson) scheduleWrite();
        cloudStatus('synced');
      }, error => cloudStatus('error', error));
      cloudStatus('synced');
    } catch (error) {
      cloudStatus('error', error);
    }
  });
}

window.addEventListener('practice-cloud-status', event => {
  const status = event.detail?.status;
  const label = document.querySelector('#cloud-status');
  if (!label || !window.practiceCloudUser) return;
  if (status === 'loading') label.textContent = 'Syncing progress…';
  else if (status === 'synced') label.textContent = 'Progress synced';
  else if (status === 'error') label.textContent = 'Cloud sync paused';
});
