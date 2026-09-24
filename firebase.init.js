// Firebase configuration.
// 1. Go to https://console.firebase.google.com -> Project settings -> Your apps
//    -> "</>" (Web app). Register a new web app.
// 2. Copy the "firebaseConfig" object and paste it below (replace the empty object).
// 3. The sign-in button stays hidden until a valid config is present.
const firebaseConfig = {
  apiKey: "AIzaSyCYwuNehVGt56-Uz1_NSOlf4G6m4vWuomA",
  authDomain: "goaltracker-59e4e.firebaseapp.com",
  projectId: "goaltracker-59e4e",
  storageBucket: "goaltracker-59e4e.firebasestorage.app",
  messagingSenderId: "878733813713",
  appId: "1:878733813713:web:2f01f1341dd48cc42022f0",
  measurementId: "G-38KCM6RSL4"
};

if (
  firebaseConfig.apiKey &&
  firebase.apps.length === 0
) {
  firebase.initializeApp(
    firebaseConfig
  );
}