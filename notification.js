// This file is responsible for sending push notifications to the Flutter app.

//The necessary imports are included.
const admin = require("firebase-admin")
const serviceAccount = require("./driveu-ee379-firebase-adminsdk-anqjy-2d2d762dcc.json")
const cron = require("node-cron")
const { deleteFutureTrip, findFutureTrip } = require('./database');
const paypal = require('./paypal');

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

const scheduleFutureTripDeletion = async (futureTripId, cronTime, driverFcm) => {
    console.log(`Scheduling a job to delete future trip with ID: ${futureTripId}`);

    const job = cron.schedule(cronTime, async () => {
        console.log('Cron job triggered'); // Debugging log
        try {
            let futureTrip = await findFutureTrip(futureTripId);
            //if future trip is already done
            if (futureTrip == null) {
                job.stop();
                return;
            }

            if (futureTrip.rideRequest.status === "pending" || futureTrip.rideRequest.status === "accepted" || futureTripId.rideRequest == null) {
                if (futureTrip.rideRequest && futureTrip.rideRequest.status === "accepted") {
                    //NOTIFY RIDER THAT TRIP IS CANCELLED
                    const riderFcm = futureTrip.rideRequest.rider.fcmToken;
                    const notification = await sendNotification(
                        "Ride Cancelled",
                        `The driver failed to start your trip, so it has been cancelled.`,
                        riderFcm
                    );
                    await paypal.voidAuthorization(futureTrip.rideRequest.authorizationId);
                }

                //NOTIFY DRIVER THAT TRIP IS CANCELLED
                const notification = await sendNotification(
                    "Ride Cancelled",
                    `Due to your ride not starting, your upcoming ride has been cancelled `,
                    driverFcm
                );

                // Delete the future trip from the database
                await deleteFutureTrip(futureTripId);
                console.log(`Future trip with ID ${futureTripId} deleted`);
            }
        } catch (error) {
            console.error(`Error deleting future trip: ${error}`);
        }
        job.stop(); // Stop the job after it runs
    });

    console.log('Cron job scheduled'); // Debugging log
}

//The functions are exported.
module.exports = { sendNotification, scheduleNotification, scheduleFutureTripDeletion };