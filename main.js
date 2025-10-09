// FOLNEB minimal Firebase wiring + recent jobs
(function () {
  // Firebase placeholders — replace in code comments with your configuration when ready
  const firebaseConfig = {
    apiKey: "YOUR_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT",
    storageBucket: "YOUR_PROJECT",
    appId: "YOUR_APP_ID",
  };

  let app, auth, db, storage;
  try {
    // Initialize only if Firebase SDK is present on the page
    if (window.firebase && window.firebase.initializeApp) {
      app = window.firebase.initializeApp(firebaseConfig);
      auth = window.firebase.auth();
      db = window.firebase.firestore();
      storage = window.firebase.storage();
    }
  } catch {}

  // Auth helpers
  window.authSignInGoogle = async function authSignInGoogle() {
    if (!auth || !window.firebase) return null;
    const provider = new window.firebase.auth.GoogleAuthProvider();
    const res = await auth.signInWithPopup(provider);
    return res.user;
  };

  window.authSignOut = async function authSignOut() {
    if (!auth) return;
    await auth.signOut();
  };

  // Storage upload
  window.uploadToStorage = async function uploadToStorage(path, data) {
    if (!storage || !window.firebase) return null;
    const ref = storage.ref().child(path);
    const snapshot = await ref.put(data);
    return snapshot.ref.getDownloadURL();
  };

  // Save job to Firestore
  window.saveJob = async function saveJob(job) {
    if (!db) return;
    const meta = Object.assign({ createdAt: Date.now() }, job || {});
    await db.collection('jobs').add(meta);
  };

  // List recent jobs into #recentJobs
  window.listRecentJobs = async function listRecentJobs() {
    const el = document.getElementById('recentJobs');
    if (!el) return;
    el.innerHTML = '';
    try {
      if (!db) {
        // Fallback to localStorage tracking
        const recent = JSON.parse(localStorage.getItem('folneb:recent') || '[]');
        recent.forEach((name) => {
          const li = document.createElement('li');
          li.textContent = name;
          el.appendChild(li);
        });
        return;
      }
      const snap = await db.collection('jobs').orderBy('createdAt', 'desc').limit(10).get();
      snap.forEach((doc) => {
        const j = doc.data();
        const li = document.createElement('li');
        li.textContent = `${j.type}: ${j.outputName || j.inputName || ''}`;
        el.appendChild(li);
      });
    } catch {}
  };

  // Populate recent on load (if element exists)
  window.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('recentJobs')) window.listRecentJobs();
  });
})();

