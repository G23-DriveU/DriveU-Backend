/*
This is the server.js file and runs the backend server for DriveU.

After login, userId from Postgres will be used, NOT firebase_uid

TODO
UNIT TESTING
Add notification functionality
Incorporate paypal and cost functionality to ride requests (completed payment voiding and capturing, still need to implement payouts)
automatically cancel future trips 30 mins after and send notifications to driver 5 mins before?
*/

//Necessary imports are handled for server.js.
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const fs = require('fs');
const bodyParser = require('body-parser');
const { gatherCurrentTripData, doesUserExist, insertUser, findUser, findUserById, updateUser, findRiderTrips, findDriverTrips, insertFutureTrip, findFutureTripsForDriver, findFutureTripsForRider, findFutureTripsByRadius, setFutureTripFull, deleteFutureTrip, findFutureTrip, insertRideRequest, findRideRequest, findRideRequestsForTrip, findRideRequestsForRider, deleteRideRequest, insertTrip, updateFcmToken, updateRideRequestStatus, updateFutureTripETA, updateFutureTripTimeAtDestination, updateFutureTripStartTime, updateRideRequestPickupTime, updateRideRequestDropOffTime, updateRiderRating, updateDriverRating } = require('./database');
const User = require('./User');
const Driver = require('./Driver');
const FutureTrip = require('./FutureTrip');
const RideRequest = require('./RideRequest');
const Trip = require('./Trip');
const fuelPrices = require('./fuelPrices');
const paypal = require('./paypal');
const carStats = require('./carStats');
const sendNotification = require('./notification.js').sendNotification;

//The express app is created and the port is set to 8080.
const app = express();
const port = process.env.PORT || 8080;

//initialize session to store user specific data (temporary solution)
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use('/uploads', express.static('uploads'));

//A generic welcome message is sent to the client.
app.get('/', (req, res) => {
    res.send('Welcome to DriveU!')
    console.log("pinged");
});

//GET users will take in firebaseUid and send user info from database to client.
app.get('/users', async (req, res) => {
    console.log("GET USERS: ", req.query);
    let response = {};
    try {
        await updateFcmToken(req.query.firebaseUid, req.query.fcmToken);
        response.user = await findUser(req.query.firebaseUid);
        if (!response.user) {
            response.status = "ERROR";
            response.error = "User does not exist";
            res.status(404).json(response);
            return;
        }
        response.status = "OK";
        res.json(response);
    } catch (error) {
        response.status = "ERROR";
        response.error = error.toString();
        console.log("GET USER ERROR", error);
        res.status(500).json(response);
    }
});

//POST users will take in user info and insert into database, sending database response back to client.
app.post('/users', async (req, res) => {
    console.log("POST USERS: ", req.query);

    //User object is created based on if user is a driver.
    let curUser = null;
    if (req.query.driver == 'true') {
        let driverInfo = null;
        try {
            driverInfo = await paypal.getUserInfo(req.query.authCode);
        } catch (error) {
            response.status = "ERROR";
            response.error = error.toString();
            console.log("PAYPAL PAYER ID ERROR: ", error);
            res.status(500).json(response);
        }
        req.query.payerId = driverInfo.payer_id;
        curUser = new Driver(req.query);
    }
    else curUser = new User(req.query);
    let response = {};

    try {
        //If the user does not exist, it is inserted into the database.
        if (await doesUserExist(curUser.firebaseUid) == false) {
            result = await insertUser(curUser);
            if (result.rowCount == 0) {
                response.status = "ERROR";
                response.error = "User not inserted into database";
                res.status(500).json(response);
            }
            else {
                response.user = User.createUserFromDatabase(result.rows[0]);
                response.status = "OK";
                res.status(201).json(response);
            }
        }
        else {
            console.log("User already exists");
            response.status = "CONFLICT";
            response.conflict = "User already exists";
            res.status(409).json(response);
        }
    } catch (error) {
        response.status = "ERROR";
        response.error = error.toString();
        console.log("POST USER ERROR: ", error);
        res.status(500).json(response);
    }
});

//PUT users will take in user info and update the user in the database, sending database response back to client.
app.put('/users', async (req, res) => {
    console.log("PUT USERS: ", req.query);
    let response = {};
    let driverInfo = null;
    try {
        if (req.query.driver == 'true' && req.query.authCode) {
            driverInfo = await paypal.getUserInfo(req.query.authCode);
            req.query.payerId = driverInfo.payer_id;
        }
        let result = await updateUser(req.query);
        if (result.rowCount === 0) {
            response.status = "ERROR";
            response.error = "Failed to update user";
            console.log("UPDATE USER ERROR");
            res.status(500).json(response);
            return;
        }
        response.status = "OK";
        response.item = result.rows[0];
        res.json(response);
    } catch (error) {
        response.status = "ERROR";
        response.error = error.toString();
        console.log("PUT USER ERROR", error);
        res.status(500).json(response);
    }
});

//GET Users Interactions will take in the userId and send back the past users they have interacted with.
app.get('/users/interactions', async (req, res) => {
    console.log("GET INTERACTIONS: ", req.query);
    let response = {};
    try {
        let riderTrips = await findRiderTrips(req.query.userId);
        let driverTrips = await findDriverTrips(req.query.userId);
        let drivers = [];
        let riders = [];

        //The drivers and riders are found from the trips.
        let i = 0;
        for (i = 0; i < riderTrips.length; i++) {
            if (!drivers.some(driver => driver.id === riderTrips[i].driver.id)) {
                drivers.push(riderTrips[i].driver);
            }
        }
        for (i = 0; i < driverTrips.length; i++) {
            if (!riders.some(rider => rider.id === driverTrips[i].rider.id)) {
                riders.push(driverTrips[i].rider);
            }
        }

        response.riders = riders;
        response.drivers = drivers;
        response.status = "OK";
        res.json(response);
    } catch (error) {
        response.status = "ERROR";
        response.error = error.toString();
        console.log("GET INTERACTIONS ERROR", error);
        res.status(500).json(response);
    }
});

//GET trips will take in the userId and send all trips for that user to client.
app.get('/trips', async (req, res) => {
    console.log("GET TRIP: ", req.query);
    let response = {};
    try {
        let user = await findUserById(req.query.userId);
        if (user.length == 0) {
            console.log("User not found");
            res.status(404).send('User not found');
            return;
        }

        let riderTrips = await findRiderTrips(req.query.userId);
        let driverTrips = await findDriverTrips(req.query.userId);
        response.riderTrips = riderTrips;
        response.driverTrips = driverTrips;
        response.status = "OK";
        res.json(response);
    } catch (error) {
        response.status = "ERROR";
        response.error = error.toString();
        console.log("GET TRIPS ERROR", error)
        res.status(500).json(response);
    }
});

//GET futureTrip will return all trip information associated with a future trip.
app.get('/futureTrip', async (req, res) => {
    console.log("GET FUTURE TRIP: ", req.query);
    let response = {};
    try {
        response.futureTrip = await findFutureTrip(req.query.futureTripId);
        response.status = "OK";
        if (response.futureTrip == null) {
            response.status = "ERROR";
            response.error = "Future trip not found";
            res.status(404).send('Future Trip not found');
            return;
        }
        res.json(response);
    } catch (error) {
        response.status = "ERROR";
        response.error = error.toString();
        console.log("GET FUTURE TRIP ERROR", error);
        res.status(500).json(response);
    }
});

//GET futureTripsForDriver will take in driverId and send all future trips for that driver to client.
app.get('/futureTripsForDriver', async (req, res) => {
    console.log("GET FUTURE TRIPS FOR DRIVER: ", req.query);
    let response = {};
    try {
        let result = await findFutureTripsForDriver(req.query.driverId);
        response.count = result.rowCount;
        response.items = result.rows;
        response.status = "OK";
        res.json(response);
    } catch (error) {
        response.status = "ERROR";
        response.error = error.toString();
        console.log("GET FUTURE TRIPS FOR DRIVER ERROR", error)
        res.status(500).json(response);
    }
});

//GET futureTripsForRider will take in riderId and send all future trips to client (not including trips they may be driving).
app.get('/futureTripsForRider', async (req, res) => {
    console.log("GET FUTURE TRIPS FOR RIDER: ", req.query);
    let response = {};
    try {
        let result = await findFutureTripsForRider(req.query.riderId);
        response.count = result.rows.length;
        response.items = result.rows;
        for (let i = 0; i < response.count; i++) {
            response.items[i].driver = await findUserById(response.items[i].driverId);
        }
        response.status = "OK";
        res.json(response);
    } catch (error) {  
        response.status = "ERROR";
        response.error = error.toString();
        console.log("GET FUTURE TRIPS FOR RIDER ERROR", error)
        res.status(500).json(response);
    }
});

//GET futureTripsByRadius will take in riderId, radius, lat, and lng, and send all future trips in the area to the user.
app.get('/futureTripsByRadius', async (req, res) => {
    console.log("GET FUTURE TRIPS BY RADIUS: ", req.query);
    let response = {};
    try {
        let result = await findFutureTripsByRadius(req.query.riderId, req.query.radius, req.query.lat, req.query.lng, req.query.roundTrip);
        response.count = result.count;
        response.items = [];
        for (let i = 0; i < result.count; i++) {
            req.query.futureTripId = result.items[i].id;
            response.items[response.items.length] = result.items[i];
            try {
                response.items[response.items.length - 1].rideRequest = await RideRequest.createRideRequest(req.query);
            } catch (error) {
                if (error.toString().trim() == "Error: Rider already requested ride") {
                    response.items.pop();
                    continue;
                }
            }
            response.items[response.items.length - 1].driver = await findUserById(response.items[response.items.length - 1].driverId);
        }
        response.count = response.items.length;
        response.status = "OK";
        res.json(response);
    } catch (error) {
        response.status = "ERROR";
        response.error = error.toString();
        console.log("GET FUTURE TRIPS BY RADIUS ERROR", error);
        res.status(500).json(response);
    }
});

//POST profilePic will take in firebaseUid and the new profile picture, and update the user's profile picture in the uploads folder.
app.post('/profilePic', async (req, res) => {
    console.log("POST PROFILE PIC: ", req.body);
    let response = {};
    try {
        if (!req.body.profilePic) {
            response.status = "ERROR";
            response.error = "Profile picture data is required";
            return res.status(400).json(response);
        }
        let buffer = Buffer.from(req.body.profilePic, 'base64');
        let outputPath = 'uploads/' + req.body.firebaseUid + '.jpeg';
        fs.writeFileSync(outputPath, buffer);
        console.log(`JPEG image saved to ${outputPath}`);
        response.status = "OK";
        res.json(response);
    } catch (error) {
        response.status = "ERROR";
        response.error = error.toString();
        console.log("POST PROFILE PIC ERROR", error);
        res.status(500).json(response);
    }
});

//POST futureTrips will take in future trip info and insert into database, sending database response back to client.
app.post('/futureTrips', async (req, res) => {
    console.log("POST FUTURE TRIPS: ", req.query);
    let response = {};
    try {
        //The FutureTrip object is created.
        let newTrip = await FutureTrip.createFutureTrip(req.query);

        //Other FutureTrips for the driver are found.
        let prevFutureTrips = await findFutureTripsForDriver(newTrip.driverId);
        prevFutureTripsCount = prevFutureTrips.rowCount;
        prevFutureTrips = prevFutureTrips.rows;

        //If the driver has overlapping future trips, a 409 error is sent.
        for (let i = 0; i < prevFutureTripsCount; i++) {
            if (prevFutureTrips[i].startTime <= newTrip.ets && prevFutureTrips[i].ets >= newTrip.startTime) {
                console.log("Overlapping future trips");
                response.status = "CONFLICT";
                response.conflict = "Overlapping future trips";
                res.status(409).json(response);
                return;
            }
        }

        //The new FutureTrip is inserted into the database.
        result = await insertFutureTrip(newTrip);
        if (result.rowCount === 0) {
            response.status = "ERROR";
            response.error = "Failed to insert future trip";
            console.log("INSERT FUTURE TRIP ERROR");
            res.status(500).json(response);
            return;
        }

        let driver = await findUserById(newTrip.driverId);
        let driverFcm = driver.fcmToken;
        let beforeTime = newTrip.startTime - 1800;
        //CREATE CHRON JOB TO REMIND DRIVER 30 MIN BEFORE

        let afterTime = newTrip.startTime + 1800;
        //IF FUTURE TRIP IS FULL AND RIDE REQUEST IS NOT PENDING/ACCEPTED, DELETE
        //CREATE CHRON JOB TO DELETE TRIP 30 MIN AFTER

        response.item = result.rows[0];
        response.status = "OK";
        res.status(201).json(response);
    } catch (error) {
        //The error is caught if there is an error in the API response.
        if (error.toString().trim() == "Error: Error in API response") {
            response.status = "ERROR";
            response.error = "No route found";
            res.status(404).json(response);
        }
        else {
            response.status = "ERROR";
            response.error = error.toString();
            console.log("POST FUTURE TRIPS ERROR", error);
            res.status(500).json(response);
        }
    }
});

//DELETE futureTrips will take in futureTripId and delete the future trip from the database.
app.delete('/futureTrips', async (req, res) => {
    let response = {};
    console.log("DELETE FUTURE TRIPS: ", req.query);
    try {
        let result = await findRideRequestsForTrip(req.query.futureTripId);
        for (let i = 0; i < result.items.length; i++) {
            let authId = result.items[i].authorizationId;
            //void payment
            let voidPaymentResult = await paypal.voidAuthorization(authId);
            if (voidPaymentResult.error) {
                response.status = "ERROR";
                response.error = "Failed to void payment";
                console.log("VOID PAYMENT ERROR", error);
                res.status(500).json(response);
                return;
            }

            if (result.items[i].status == "accepted") {
                let rideRequest = result.items[i];
                let futureTrip = await findFutureTrip(rideRequest.futureTripId);
                let rider = await findUserById(rideRequest.riderId);
                let riderFcm = rider.fcmToken;
                //SEND NOTIFICATION TO RIDER THAT THE FUTURE TRIP IS CANCELLED ============================================================
                
                try{
                    const notification = await sendNotification(
                        "Ride Cancelled",
                        `Yor upcoming ride has been cancelled`,
                        riderFcm
                    );
                    console.log("NOTIFICATION SENT: ", notification);
                    
                }catch(error){
                    console.log("NOTIFICATION ERROR: ", error);
                }
            }

        }

        await deleteFutureTrip(req.query.futureTripId);
        response.status = "OK";
        res.json(response);
    } catch (error) {
        response.status = "ERROR";
        response.error = error.toString();
        console.log("DELETE FUTURE TRIPS ERROR", error);
        res.status(500).json(response);
    }
});

//GET rideRequestsForTrip will take in futureTripId and send all ride requests for that trip to client.
app.get('/rideRequestsForTrip', async (req, res) => {
    console.log("GET RIDE REQUESTS FOR TRIP: ", req.query);
    let response = {};
    try {
        let result = await findRideRequestsForTrip(req.query.futureTripId);
        response.status = "OK";
        response.items = result.items;
        response.count = result.count;
        res.json(response);
    } catch (error) {
        response.status = "ERROR";
        response.error = error.toString();
        console.log("GET RIDE REQUESTS ERROR", error);
        res.status(500).json(response);
    }
});

//GET rideRequestsForRider will take in riderId and send all ride requests for that rider to client.
app.get('/rideRequestsForRider', async (req, res) => {
    console.log("GET RIDE REQUESTS FOR RIDER: ", req.query);
    let response = {};
    try {
        let result = await findRideRequestsForRider(req.query.riderId);
        response.status = "OK";
        response.items = result.items;
        response.count = result.count;
        res.json(response);
    } catch (error) {
        response.status = "ERROR";
        response.error = error.toString();
        console.log("GET RIDE REQUESTS ERROR", error);
        res.status(500).json(response);
    }
});

//POST rideRequests will take in ride request info and insert into database, sending database response back to client.
app.post('/rideRequests', async (req, res) => {
    console.log("POST RIDE REQUESTS: ", req.query);
    let response = {};
    try {
        let newRideRequest = await RideRequest.createRideRequest(req.query);

        let futureTrip = await findFutureTrip(newRideRequest.futureTripId);
        let rider = await findUserById(newRideRequest.riderId);
        let driver = await findUserById(futureTrip.driverId);
        let driverFcm = driver.fcmToken;
        
        //SEND NOTIFICATION TO DRIVER FOR NEW RIDE REQUEST ============================================================
        try{
            const notification = await sendNotification(
                "New Ride Request",
                `${rider.name} has requested to join your ride`,
                driverFcm
            );
            console.log("NOTIFICATION SENT: ", notification);
            
        }catch(error){
            console.log("NOTIFICATION ERROR: ", error);
        }
        
        result = await insertRideRequest(newRideRequest);
        if (result.rowCount === 0) {
            response.status = "ERROR";
            response.error = "Failed to insert ride request";
            console.log("INSERT RIDE REQUEST ERROR");
            res.status(500).json(response);
            return;
        }
        response.item = result.rows[0];
        response.status = "OK";
        res.status(201).json(response);
    } catch (error) {
        //The error is caught if the rider has already requested a ride.
        if (error.toString().trim() == "Error: Rider already requested ride") {
            response.status = "CONFLICT";
            response.conflict = "Rider already requested ride";
            res.status(409).json(response);
            return;
        }
        //The error is caught if there is an error in the API response.
        if (error.toString().trim() == "Error: Error in API response") {
            response.status = "ERROR";
            response.error = "No route found";
            res.status(404).json(response);
            return;
        }
        response.status = "ERROR";
        response.error = error.toString();
        console.log("POST RIDE REQUESTS ERROR", error);
        res.status(500).json(response);
    }
});

//PUT acceptRideRequest will take in rideRequestId and check for overlapping accepted ride requests, then accept the ride request and set the future trip to full, finally sending a notification to the rider.
app.put('/acceptRideRequest', async (req, res) => {
    console.log("PUT ACCEPT RIDE REQUEST: ", req.query);
    let response = {};
    try {
        //The ride request and future trip are found.
        let rideRequest = await findRideRequest(req.query.rideRequestId);
        let futureTrip = await findFutureTrip(rideRequest.futureTripId);

        //The existing ride requests for the rider are found.
        let prevRideRequests = await findRideRequestsForRider(rideRequest.riderId);
        let prevRideRequestsCount = prevRideRequests.rowCount;
        prevRideRequests = prevRideRequests.rows;
        
        //If the rider has overlapping ride requests, a 409 error is sent.
        for (let i = 0; i < prevRideRequestsCount; i++) {
            if  (prevRideRequests[i].futureTripId == futureTrip.id) {
                continue;
            }
            if (prevRideRequests[i].futureTrip.startTime <= futureTrip.ets && prevRideRequests[i].futureTrip.ets >= futureTrip.startTime && prevRideRequests[i].status != "pending") {
                response.status = "CONFLICT";
                response.conflict = "Rider has overlapping ride requests";
                console.log("Overlapping ride requests");
                res.status(409).json(response);
                return;
            }
        }

        //The ride request is accepted and the future trip is set to full.
        let result = {};
        result.rideRequest = await updateRideRequestStatus(req.query.rideRequestId, "accepted");
        if (result.rideRequest.rowCount === 0) {
            response.status = "ERROR";
            response.error = "Failed to accept ride request";
            console.log("ACCEPT RIDE REQUEST ERROR");
            res.status(500).json(response);
            return;
        }
        result.futureTrip = await setFutureTripFull(futureTrip.id, true);
        if (result.futureTrip.rowCount === 0) {
            response.status = "ERROR";
            response.error = "Failed to set future trip to full";
            console.log("SET FUTURE TRIP FULL ERROR");
            res.status(500).json(response);
            return;
        }

        let rider = await findUserById(rideRequest.riderId);
        let driver = await findUserById(futureTrip.driverId);
        let riderFcm = rider.fcmToken;
        //SEND NOTIFICATION TO RIDER THAT REQUEST IS ACCEPTED ============================================================
        try{
            const notification = await sendNotification(
                "Ride Request Accepted",
                `${driver.name} has accepted your ride request`,
                riderFcm
            );
            console.log("NOTIFICATION SENT: ", notification);
            
        }catch(error){
            console.log("NOTIFICATION ERROR: ", error);
        }
        //The response is sent to the client.
        response.status = "OK";
        response.tripInfo = await gatherCurrentTripData(futureTrip.id, req.query.rideRequestId);
        res.status(201).json(response);
    } catch (error) {
        response.status = "ERROR";
        response.error = error.toString();
        console.log("ACCEPT RIDE REQUEST ERROR", error);
        res.status(500).json(response);
    }
});

//DELETE rideRequestsByRider will take in rideRequestId and delete from database.
app.delete('/rideRequestsByRider', async (req, res) => {
    console.log("DELETE RIDE REQUEST BY RIDER: ", req.query);
    let response = {};
    try {
        let rideRequest = await findRideRequest(req.query.rideRequestId);
        if (!(rideRequest.status == "accepted" || rideRequest.status == "pending")) {
            response.status = "ERROR";
            response.error = "Ride request is already in progress";
            console.log("RIDE REQUEST ALREADY IN PROGRESS");
            res.status(409).json(response);
        }
        let authId = rideRequest.authorizationId;
        //void payment
        let voidPaymentResult = await paypal.voidAuthorization(authId);
        if (voidPaymentResult.error) {
            response.status = "ERROR";
            response.error = "Failed to void payment";
            console.log("VOID PAYMENT ERROR", error);
            res.status(500).json(response);
            return;
        }

        if (rideRequest.status == "accepted") {
            let futureTrip = await findFutureTrip(rideRequest.futureTripId);
            
            //We set the future trip to not full.
            let full = setFutureTripFull(futureTrip.id, false);
            if (full.rowCount === 0) {
                response.status = "ERROR";
                response.error = "Failed to set future trip to not full";
                console.log("SET FUTURE TRIP NOT FULL ERROR");
                res.status(500).json(response);
                return;
            }
            
            let driver = await findUserById(futureTrip.driverId);
            let rider = await findUserById(rideRequest.riderId);
            let driverFcm = driver.fcmToken;
            //NOTIFY DRIVER THAT RIDER HAS CANCELLED ====================================================================
        }

        await deleteRideRequest(req.query.rideRequestId);
        response.status = "OK";
        res.json(response);
    }
    catch (error) {
        response.status = "ERROR";
        response.error = error.toString();
        console.log("DELETE RIDE REQUEST ERROR", error);
        res.status(500).json(response);
    }
});

//DELETE rideRequestsByDriver (reject) will take in rideRequestId, delete from database, and notify the rider.
app.delete('/rideRequestsByDriver', async (req, res) => {
    console.log("DELETE RIDE REQUEST BY DRIVER: ", req.query);
    let response = {};
    try {
        let rideRequest = await findRideRequest(req.query.rideRequestId);
        let authId = rideRequest.authorizationId;
        //void payment
        let voidPaymentResult = await paypal.voidAuthorization(authId);
        if (voidPaymentResult.error) {
            response.status = "ERROR";
            response.error = "Failed to void payment";
            console.log("VOID PAYMENT ERROR", error);
            res.status(500).json(response);
            return;
        }

        let result = await deleteRideRequest(req.query.rideRequestId);

        let rider = await findUserById(rideRequest.riderId);
        let riderFcm = rider.fcmToken;
        let futureTrip = await findFutureTrip(rideRequest.futureTripId);
        let driver = await findUserById(futureTrip.driverId);
        //SEND NOTIFICATION TO RIDER THAT REQUEST IS REJECTED ============================================================

        try{
            const notification = await sendNotification(
                "Ride Request Rejected",
                `${driver.name} has rejected your ride request`,
                riderFcm
            );
            console.log("NOTIFICATION SENT: ", notification);
            
        }catch(error){
            console.log("NOTIFICATION ERROR: ", error);
        }
        
        response.status = "OK";
        res.json(response);
    }
    catch (error) {
        response.status = "ERROR";
        response.error = error.toString();
        console.log("DELETE RIDE REQUEST ERROR", error);
        res.status(500).json(response);
    }
});

//PUT startTrip will take in rideRequestId and update the future trip start time, then send a notification to the rider.
app.put('/startTrip', async (req, res) => {
    console.log("PUT START TRIP: ", req.query);
    let response = {};
    try {
        //The accepted ride request is found using the futureTripId.
        let rideRequests = (await findRideRequestsForTrip(req.query.futureTripId)).items;
        let rideRequest = null;
        for (let i = 0; i < rideRequests.length; i++) {
            if (rideRequests[i].status == "accepted") {
                rideRequest = rideRequests[i];
                console.log("Accepted ride request: ", rideRequest);
            }
        }

        //The ride request is found and the future trip start time is updated.
        let updateStartTime = await updateFutureTripStartTime(rideRequest.futureTripId, req.query.startTime);
        if (updateStartTime.rowCount === 0) {
            response.status = "ERROR";
            response.error = "Failed to update start time";
            console.log("UPDATE START TIME ERROR", error);
            res.status(500).json(response);
            return;
        }

        //All pending ride requests for the future trip are removed.
        let existingRideRequests = await findRideRequestsForTrip(rideRequest.futureTripId);
        let futureTrip = await findFutureTrip(rideRequest.futureTripId);
        for (let i = 0; i < existingRideRequests.count; i++) {
            let rideRequest = existingRideRequests.items[i];
            if (rideRequest.status == "pending") {
                let authId = rideRequest.authorizationId;
                //void all other payments
                let voidOtherPaymentsResult= await paypal.voidAuthorization(authId);
                if (voidOtherPaymentsResult.error) {
                    response.status = "ERROR";
                    response.error = "Failed to void other payments";
                    console.log("VOID PAYMENT ERROR", error);
                    res.status(500).json(response);
                    return;
                }

                let riderFcm = await rideRequest.rider.fcmToken;
                //SEND NOTIFICATION TO RIDER THAT THEIR RIDE REQUEST IS REJECTED ============================================================
                
                try{
                    const notification = await sendNotification(
                        "Ride Request Timed Out",
                        `Your pending ride request has timed out due to the driver accepting a different rider`,
                        riderFcm
                    );
                    console.log("NOTIFICATION SENT: ", notification);
                    
                }catch(error){
                    console.log("NOTIFICATION ERROR: ", error);
                }
                let result = await deleteRideRequest(rideRequest.id);
                if (result.rowCount === 0) {
                    response.status = "ERROR";
                    response.error = "Failed to delete pending ride request";
                    console.log("DELETE RIDE REQUEST ERROR", error);
                    res.status(500).json(response);
                    return;
                }
            }
        }

        let rider = await findUserById(rideRequest.riderId);
        let riderFcm = rider.fcmToken;
        let eta = rideRequest.pickupTime;
        let driver = await findUserById(futureTrip.driverId);

        const date = new Date(eta * 1000);
        let hours = date.getHours();
        const minutes = date.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // the hour is 0, so it will be 12
        const minutesStr = minutes < 10 ? '0' + minutes : minutes;
        const formattedEta = hours + ':' + minutesStr + ' ' + ampm;
        //SEND NOTIFICATION TO RIDER OF DRIVER PICKUP TIME ============================================================
        
        try{
            const notification = await sendNotification(
                "Pickup Time Update",
                `${driver.name} is estimated to pick you up at ${formattedEta}`,
                riderFcm
            );
            console.log("NOTIFICATION SENT: ", notification);
            
        }catch(error){
            console.log("NOTIFICATION ERROR: ", error);
        }
        //charge rider for trip
        let authId = rideRequest.authorizationId;
        let paymentCaptureResult = await paypal.capturePayment(authId);

        //The ride request status is updated.
        let updateStatus = await updateRideRequestStatus(rideRequest.id, "started");
        if (updateStatus.rowCount === 0) {
            response.status = "ERROR";
            response.error = "Failed to update status";
            console.log("UPDATE STATUS ERROR");
            res.status(500).json(response);
            return;
        }

        response.tripInfo = await gatherCurrentTripData(futureTrip.id, rideRequest.id);
        response.status = "OK";
        res.json(response);
    } catch (error) {
        response.status = "ERROR";
        response.error = error.toString();
        console.log("PUT START TRIP ERROR", error);
        res.status(500).json(response);
    }
});

//PUT pickupRider will take in rideRequestId and update the pickup time.
app.put('/pickupRider', async (req, res) => {
    console.log("PUT PICKUP RIDER: ", req.query);
    let response = {};
    try {
        //The rider's pickup time is updated in the ride request.
        let updatePickupTime = await updateRideRequestPickupTime(req.query.rideRequestId, req.query.pickupTime);
        if (updatePickupTime.rowCount === 0) {
            response.status = "ERROR";
            response.error = "Failed to update pickup time";
            console.log("UPDATE PICKUP TIME ERROR", error);
            res.status(500).json(response);
            return;
        }

        //The ride request status is updated.
        let updateStatus = await updateRideRequestStatus(req.query.rideRequestId, "picked up");
        if (updateStatus.rowCount === 0) {
            response.status = "ERROR";
            response.error = "Failed to update status";
            console.log("UPDATE STATUS ERROR", error);
            res.status(500).json(response);
            return;
        }

        let rideRequest = await findRideRequest(req.query.rideRequestId);

        response.tripInfo = await gatherCurrentTripData(rideRequest.futureTripId, req.query.rideRequestId);
        response.status = "OK";
        res.json(response);
    } catch (error) {
        response.status = "ERROR";
        response.error = error.toString();
        console.log("PUT PICKUP RIDER ERROR", error);
        res.status(500).json(response);
    }
});

//PUT reachedDestination will take in rideRequestId and update the ETA, ending the trip if one-way, or setting up notifications for round trip.
app.put('/reachedDestination', async (req, res) => {
    console.log("PUT REACHED DESTINATION: ", req.query);
    let response = {};
    try {
        //The accepted ride request is found using the futureTripId.
        let rideRequests = (await findRideRequestsForTrip(req.query.futureTripId)).items;
        let rideRequest = null;
        for (let i = 0; i < rideRequests.length; i++) {
            if (rideRequests[i].status == "picked up") {
                rideRequest = rideRequests[i];
                console.log("Accepted ride request: ", rideRequest);
            }
        }
        let futureTrip = await findFutureTrip(req.query.futureTripId);

        //The driver's location is checked to see if they are close enough to the destination.
        latConversion = 0.1 / 69;
        lngConversion = 0.1 / (69 * Math.cos(futureTrip.destinationLat * Math.PI / 180));
        let calculation = ((futureTrip.destinationLng - req.query.lng) ** 2) / (lngConversion ** 2) + ((futureTrip.destinationLat - req.query.lat) ** 2) / (latConversion ** 2);
        if (calculation > 1) {
            //The driver is not close enough to the destination.
            response.status = "ERROR";
            response.error = "Driver is not close enough to the destination";
            console.log("REACHED DESTINATION ERROR: Driver is not close enough to the destination");
            res.status(500).json(response);
            return;
        }

        //The ETA is updated in the future trip.
        let updateStartTime = await updateFutureTripETA(rideRequest.futureTripId, req.query.arrivalTime);
        if (updateStartTime.rowCount === 0) {
            response.status = "ERROR";
            response.error = "Failed to update ETA";
            console.log("UPDATE ETA ERROR", error);
            res.status(500).json(response);
            return;
        }

        //The ride request status is updated.
        let updateStatus = await updateRideRequestStatus(rideRequest.id, "at destination");
        if (updateStatus.rowCount === 0) {
            response.status = "ERROR";
            response.error = "Failed to update status";
            console.log("UPDATE STATUS ERROR", error);
            res.status(500).json(response);
            return;
        }

        if (rideRequest.roundTrip === true) {
            let rider = await findUserById(rideRequest.riderId);
            let driver = await findUserById(futureTrip.driverId);
            let riderFcm = rider.fcmToken;
            let driverFcm = driver.fcmToken;
            let notificationTime = req.query.arrivalTime + futureTrip.timeAtDestination; //in seconds from epoch

            //SETUP CHRON JOB TO NOTIFY RIDER AND DRIVER 5 MIN BEFORE
        } else {
            //The trip is ended and moved to past trips.
            try {
                let updateTAD = await updateFutureTripTimeAtDestination(rideRequest.futureTripId, 0);
                if (updateTAD.rowCount === 0) {
                    response.status = "ERROR";
                    response.error = "Failed to update time at destination";
                    console.log("UPDATE TIME AT DESTINATION ERROR", error);
                    res.status(500).json(response);
                    return;
                }
                rideRequest = await findRideRequest(rideRequest.id);
                futureTrip = await findFutureTrip(rideRequest.futureTripId);
                let trip = new Trip(futureTrip, rideRequest);
                result = await insertTrip(trip);
                if (result.rowCount === 0) {
                    response.status = "ERROR";
                    response.error = "Failed to insert trip";
                    console.log("INSERT TRIP ERROR");
                    res.status(500).json(response);
                    return;
                }
                await deleteFutureTrip(rideRequest.futureTripId);
                await deleteRideRequest(rideRequest.id);

                //SEND PAYPAL PAYOUT TO DRIVER =============================================================================================
                let driverCost = trip.driverPayout;
                let driver = await findUserById(trip.driverId);
                let driverPaypalId = driver.payerId;

                let rider = await findUserById(trip.riderId);
                let riderFcm = rider.fcmToken;
                //SEND NOTIFICATION TO RIDER TO RATE =======================================================================================
                
                try{
                    const notification = await sendNotification(
                        "Rate Your Ride",
                        `Please give ${driver.name} a rating`,
                        riderFcm
                    );
                    console.log("NOTIFICATION SENT: ", notification);
                    
                }catch(error){
                    console.log("NOTIFICATION ERROR: ", error);
                }

                response.tripInfo = {};
                response.tripInfo.trip = result.rows[0];
                response.tripInfo.driver = await findUserById(trip.driverId);
                response.tripInfo.rider = await findUserById(trip.riderId);
                response.status = "OK";
                res.status(201).json(response);
                return;
            }    
            catch (error) {
                response.status = "ERROR";
                response.error = error.toString();
                console.log("PUT REACHED DESTINATION ERROR", error);
                res.status(500).json(response);
                return;
            }
        }

        response.tripInfo = await gatherCurrentTripData(futureTrip.id, rideRequest.id);
        response.status = "OK";
        res.json(response);
    } catch (error) {
        response.status = "ERROR";
        response.error = error.toString();
        console.log("PUT REACHED DESTINATION ERROR", error);
        res.status(500).json(response);
    }
});

//PUT leaveDestination will take in rideRequestId and update the time at destination, then update status of the ride request.
app.put('/leaveDestination', async (req, res) => {
    console.log("PUT LEAVE DESTINATION: ", req.query);
    let response = {};
    try {
        let rideRequest = await findRideRequest(req.query.rideRequestId);
        let futureTrip = await findFutureTrip(rideRequest.futureTripId);

        //The time at destination is updated.
        let updateTAD = await updateFutureTripTimeAtDestination(rideRequest.futureTripId, (req.query.leavingTime - futureTrip.eta));
        if (updateTAD.rowCount === 0) {
            response.status = "ERROR";
            response.error = "Failed to update time at destination";
            console.log("UPDATE TIME AT DESTINATION ERROR");
            res.status(500).json(response);
            return;
        }

        //The ride request status is updated.
        let updateStatus = await updateRideRequestStatus(req.query.rideRequestId, "left destination");
        if (updateStatus.rowCount === 0) {
            response.status = "ERROR";
            response.error = "Failed to update status";
            console.log("UPDATE STATUS ERROR");
            res.status(500).json(response);
            return;
        }

        response.tripInfo = await gatherCurrentTripData(futureTrip.id, rideRequest.id);
        response.status = "OK";
        res.json(response);
    } catch (error) {
        response.status = "ERROR";
        response.error = error.toString();
        console.log("PUT LEAVE DESTINATION ERROR", error);
        res.status(500).json(response);
    }
});

//PUT dropOffRider will take in rideRequestId and update the dropoff time, then move the trip to past trips and send a notification to the rider.
app.put('/dropOffRider', async (req, res) => {
    console.log("PUT DROP OFF RIDER: ", req.query);
    let response = {};
    try {
        //The accepted ride request is found using the futureTripId.
        let rideRequests = (await findRideRequestsForTrip(req.query.futureTripId)).items;
        let rideRequest = null;
        for (let i = 0; i < rideRequests.length; i++) {
            if (rideRequests[i].status == "left destination") {
                rideRequest = rideRequests[i];
                console.log("Accepted ride request: ", rideRequest);
            }
        }

        //The ride request and future trip are retrieved from the database.
        let futureTrip = await findFutureTrip(req.query.futureTripId);

        //The driver's location is checked to see if they are close enough to the rider's dropoff location.
        latConversion = 0.1 / 69;
        lngConversion = 0.1 / (69 * Math.cos(rideRequest.riderLocationLat * Math.PI / 180));
        let calculation = ((rideRequest.riderLocationLng - req.query.lng) ** 2) / (lngConversion ** 2) + ((rideRequest.riderLocationLat - req.query.lat) ** 2) / (latConversion ** 2);
        if (calculation > 1) {
            //The driver is not close enough to the rider's dropoff location.
            response.status = "ERROR";
            response.error = "Driver is not close enough to the rider dropoff location";
            console.log("REACHED DESTINATION ERROR: Driver is not close enough to the rider dropoff location");
            res.status(500).json(response);
            return;
        }

        //The dropoff time is updated in the database.
        let updateDropOffTime = await updateRideRequestDropOffTime(rideRequest.id, req.query.dropOffTime);
        if (updateDropOffTime.rowCount === 0) {
            response.status = "ERROR";
            response.error = "Failed to update dropoff time";
            console.log("UPDATE DROPOFF TIME ERROR", error);
            res.status(500).json(response);
            return;
        }

        //The ride request and future trip are converted to a past trip.
        rideRequest = await findRideRequest(rideRequest.id);
        futureTrip = await findFutureTrip(rideRequest.futureTripId);
        let trip = new Trip(futureTrip, rideRequest);
        result = await insertTrip(trip);
        if (result.rowCount === 0) {
            response.status = "ERROR";
            response.error = "Failed to insert trip";
            console.log("INSERT TRIP ERROR");
            res.status(500).json(response);
            return;
        }
        await deleteFutureTrip(rideRequest.futureTripId);
        await deleteRideRequest(rideRequest.id);
        response.tripInfo = {};
        response.tripInfo.trip = result.rows[0];
        response.tripInfo.driver = await findUserById(trip.driverId);
        response.tripInfo.rider = await findUserById(trip.riderId);

        //SEND PAYPAL PAYOUT TO DRIVER =============================================================================================
        let driverCost = trip.driverPayout;
        let driver = await findUserById(trip.driverId);
        let driverPaypalId = driver.payerId;

        let rider = await findUserById(trip.riderId);
        let riderFcm = rider.fcmToken;
        //SEND NOTIFICATION TO RIDER TO RATE =======================================================================================
        
        response.status = "OK";
        res.status(201).json(response);
        return;
    } catch (error) {
        response.status = "ERROR";
        response.error = error.toString();
        console.log("PUT DROPOFF RIDER ERROR", error);
        res.status(500).json(response);
    }
});

//PUT rateRider will take in riderId and rating, and update the rider's rating in the database.
app.put('/rateRider', async (req, res) => {
    console.log("PUT RATE RIDER: ", req.query);
    let response = {};
    try {
        let rider = await findUserById(req.query.riderId);
        req.query.rating = parseInt(req.query.rating);
        let newRating = (rider.riderRating * rider.riderReviewCount + req.query.rating) / (rider.riderReviewCount + 1);
        let result = await updateRiderRating(req.query.riderId, rider.riderReviewCount + 1, newRating);
        if (result.rowCount === 0) {
            response.status = "ERROR";
            response.error = "Failed to update rider rating";
            console.log("UPDATE RIDER RATING ERROR");
            res.status(500).json(response);
            return;
        }

        response.status = "OK";
        res.json(response);
    } catch (error) {
        response.status = "ERROR";
        response.error = error.toString();
        console.log("PUT RATE RIDER ERROR", error);
        res.status(500).json(response);
    }
});

//PUT rateDriver will take in driverId and rating, and update the driver's rating in the database.
app.put('/rateDriver', async (req, res) => {
    console.log("PUT RATE DRIVER: ", req.query);
    let response = {};
    try {
        let driver = await findUserById(req.query.driverId);
        req.query.rating = parseInt(req.query.rating);
        let newRating = (driver.driverRating * driver.driverReviewCount + req.query.rating) / (driver.driverReviewCount + 1);
        let result = await updateDriverRating(req.query.driverId, driver.driverReviewCount + 1, newRating);
        if (result.rowCount === 0) {
            response.status = "ERROR";
            response.error = "Failed to update driver rating";
            console.log("UPDATE DRIVER RATING ERROR");
            res.status(500).json(response);
            return;
        }

        response.status = "OK";
        res.json(response);
    } catch (error) {
        response.status = "ERROR";
        response.error = error.toString();
        console.log("PUT RATE DRIVER ERROR", error);
        res.status(500).json(response);
    }
});

//PAYPAL FUNCTIONALITY
//The server will redirect to the paypal payment page.
app.get('/pay', async (req, res) => {
    try {
        const url = await paypal.createOrder(req.query.tripCost)
        res.send(url)
    } catch (e) { 
        res.status(500).send('Internal Server Error: ' + e)
    }
})

//The server will redirect to the paypal approval page.
//Triggered automatically via createOrder returnUrl
app.get('/authorize-order', async (req, res) => {
    try {
        const orderId = req.query.token
        req.session.orderId = orderId; // Store order ID in session
        // ORDERID MUST BE SAVED IN TRIP REQUEST OBJECT IN DB
        const authorizationID = await paypal.authorizeOrder(orderId)
        req.session.authorizationID = authorizationID
        console.log('Authorization ID:', authorizationID);
        res.redirect(process.env.BASE_URL + '/after-approval?authId=' + authorizationID)
        //res.send('Order authorized. You can now capture the payment.');
    } catch (e) {
        res.status(500).send('Error: ' + e)
    }
})

//
app.get('/after-approval', (req, res) => {
    res.send("Payment approved")
})

//The server will capture the payment and send the payment to the driver.
app.post('/capture-payment', async (req, res) => {
    try {
        //console.log('Session data:', req.session);
        //const orderId = req.session.authorizationID; // Retrieve order ID from session
        const orderId = req.query.orderId; // Retrieve order ID from session
        if (!orderId) {
            return res.status(400).send('No order ID found in session.');
        }
        //res.send('orderID: ' + orderId)

        const response = await paypal.capturePayment(orderId)
        if (response.status !== 'COMPLETED') {
            orderId = await paypal.reauthorizeOrder(orderId)
            const response = await paypal.capturePayment(orderId)
        }
        //console.log('Capture response:', response);
        const amountReceived = response.seller_receivable_breakdown.net_amount.value
        //AMOUNT RECEIVED MUST BE SAVED IN CURRENT TRIP OBJECT IN DB
        console.log('Amount received:', amountReceived);
        //paypal.createPayout('sb-driver5033257492@personal.example.com', amountReceived-process.env.PAYPAL_PAYOUT_FEE)
        res.send('Payment captured')
    } catch (e) {
        res.status(500).send('Error: ' + e);
    }
});

app.post('/payout', async (req, res) => {
    try {
        const response = await paypal.createPayout(req.query.email, req.query.amount)
        console.log('Payout response:', response);
        res.send('Payout successful')
    } catch (e) {
        res.status(500).send('Error: ' + e);
    }
});

app.get('/cancel-order', (req, res) => {
    const orderId = req.query.orderId;
    const response = paypal.cancelOrder(orderId);
    console.log('Order canceled');
    //res.redirect('/')
})

// API endpoint to get all car makes
app.get('/api/car-makes', async (req, res) => {
    try {
        const makes = await carStats.getAllCarMakes();
        res.json(makes);
    } catch (error) {
        console.error('Error fetching car makes:', error);
        res.status(500).json({ error: 'Error fetching car makes' });
    }
});

// API endpoint to get models for a specific make
app.get('/api/car-makes/:make/models', async (req, res) => {
    try {
        const make = req.query.make;
        const models = await carStats.getModelsForMake(make);
        res.json(models);
    } catch (error) {
        console.error(`Error fetching models for make ${make}:`, error);
        res.status(500).json({ error: `Error fetching models for make ${make}` });
    }
});

// For testing of fuelPrices.js
app.get('/fuel-prices', async (req, res) => {
    try {
        const fuelPrice = await fuelPrices.getLocalGasPrices(req.query.lat, req.query.lng);
        res.json(fuelPrice);
    } catch (error) {
        console.error('Error fetching gas prices:', error);
        res.status(500).json({ error: 'Error fetching gas prices' });
    }
});


//The server is started.
const server = app.listen(port, (error) => {
    if (error) {
        console.log('Something went wrong', error);
    } else {
        console.log(`Server is listening on port ${port}`);
    }
});

//The notification endpoint is created for testing purposes.
app.post("/notification", async (req, res) => {
    let response = {};
    try {
        response.notification = await sendNotification(req.query.title, req.query.body, req.query.token);
        response.status = "OK";
        console.log("Notification sent successfully: ", response.notification);
        res.status(201).json(response);
    } catch (error) {
        response = {};
        console.log("POST NOTIFICATION ERROR: ", error);
        response.status = "ERROR";
        response.error = error.toString()
        res.status(500).json(response);
    }
});

//The app and server are exported.
module.exports = { app, server };