const admin = require('firebase-admin');
const serviceAccount = require('./chatbot-food-ba9n-firebase-adminsdk-ztkru-8b04ed6631.json');

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://chatbot-food-ba9n-default-rtdb.firebaseio.com"
});

const db = admin.database();

module.exports = { admin, db };