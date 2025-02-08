// This file is responsible for sending push notifications to the Flutter app.

//The necessary imports are included.
const admin = require("firebase-admin")
const serviceAccount = require("./driveu-ee379-firebase-adminsdk-anqjy-2d2d762dcc.json")

//The Firebase app is initialized.
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
})

const sendNotification = async (title, body, token) => {
    const message = {
        notification: {
            title: title,
            body: body,
        },
        token: token,
    };
    
    //We try to send the notification through Firebase.
    const response = await admin.messaging().send(message);
    return response;
}

//The function is exported.
module.exports = { sendNotification };