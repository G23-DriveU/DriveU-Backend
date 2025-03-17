// This file is responsible for sending push notifications to the Flutter app.

//The necessary imports are included.
const admin = require("firebase-admin")
const serviceAccount = require("./driveu-ee379-firebase-adminsdk-anqjy-2d2d762dcc.json")
const cron = require("node-cron")

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

const scheduleNotification = async (token, title, body, cronTime) => {
    const message = {
        notification:{
            title: title,
            body: body,

        },
        token: token,
    };

    console.log(`Scheduling a job with cronTime: ${cronTime}`);

    const job = cron.schedule(cronTime, async () => {
        console.log('Cron job triggered'); // Debugging log
        try {
            const response = await admin.messaging().send(message);
            console.log(`Notification sent successfully: ${response.successCount} messages sent, ${response.failureCount} messages failed`);
        } catch (error) {
            console.error(`Error sending notification: ${error}`);
        }
        job.stop(); // Stop the job after it runs
    });

    console.log('Cron job scheduled'); // Debugging log
};

//The functions are exported.
module.exports = { sendNotification, scheduleNotification };