# Cloud progress sync

This app uses the Firebase project `mb-500-learning-path`. Google sign-in connects the website and Android home-screen app. Firestore stores progress in `users/{Firebase UID}/progress/current`; access is limited to the signed-in account that owns that document.

The saved progress includes question history, accuracy, bookmarks, daily practice totals, streak dates, XP, and an unfinished session. The full question bank is not uploaded. An unfinished session snapshot includes the questions and choices needed to resume that session. Local progress stays in the browser and merges with cloud progress at first sign-in.

## Install on Android

Open the GitHub Pages address in Chrome, then choose **⋮ → Add to Home screen** (or **Install app**). Open the installed app and sign in with Google. Sign in with the same account on the website and other devices to share progress.

## Firebase maintenance

The web app configuration in `firebase-config.js` is public client configuration. Do not add a service-account key to the site. Firestore permissions are defined in `firestore.rules`; they allow access only to the signed-in owner's `current` progress document.
