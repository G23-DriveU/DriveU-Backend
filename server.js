/*
This is the server.js file and runs the backend server for DriveU.

After login, userId from Postgres will be used, NOT firebase_uid

TODO
fix trip database entries and include transitioning to trip
fix trip view to find all past trips
Add notification functionality
notify riders when future trip is deleted, and when ride request is rejected
Incorporate paypal and cost functionality to ride requests
add edit user info functionality and profile pic functionality
add find future_trips functionality for riders (dont pull up trips where they are driver)
automatically cancel future trips 30 mins after and send notis to driver 5 mins before??
*/

//Necessary imports are handled for server.js.
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { doesUserExist, insertUser, findUser, findUserById, findRiderTrips, findDriverTrips, insertFutureTrip, findFutureTrips, setFutureTripFull, deleteFutureTrip, findFutureTrip, insertRideRequest, findRideRequest, findRideRequestsForTrip, findRideRequestsForRider, deleteRideRequest, updateDeviceId, acceptRideRequest } = require('./database');
const User = require('./User');
const Driver = require('./Driver');
const FutureTrip = require('./FutureTrip');
const RideRequest = require('./RideRequest');
const paypal = require('./paypal')

//The express app is created and the port is set to 8080.
const app = express();
const port = 8080;

//initialize session to store user specific data (temporary solution)
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

//GET users will take in firebaseUid and send user info from database to client.
app.get('/users', async (req, res) => {
    console.log("GET USERS: ", req.query);
    try {
        let result = {};
        result.deviceId = await updateDeviceId(req.query.firebaseUid, req.query.deviceId);
        result.user = await findUser(req.query.firebaseUid)
        
        res.json(result);
    } catch (error) {
        console.log("GET USER ERROR", error);
        res.status(500).send(error);
    }
});

//POST users will take in user info and insert into database, sending database response back to client.
app.post('/users', async (req, res) => {
    console.log("POST USERS: ", req.query);

    //User object is created based on if user is a driver.
    let curUser = null;
    if (req.query.driver == 'true') curUser = new Driver(req.query);
    else curUser = new User(req.query);

    try {
        //If the user does not exist, it is inserted into the database.
        if (await doesUserExist(curUser.firebaseUid) == false) {
            result = await insertUser(curUser);
            res.status(201).json(result);
        }
        else {
            console.log("User already exists");
            res.status(409).send('User already exists');
        }
    } catch (error) {
        console.log("POST USER ERROR: ", error);
        res.status(500).send(error);
    }
});

//DOESNT WORK
app.get('/trips', async (req, res) => {
    console.log("GET TRIP: ", req.query);
    try {
        let firebase_uid = req.query.firebase_uid;
        //get driver trips
        let user = await findUser(firebase_uid);
        if (user.length == 0) {
            console.log("User not found");
            res.status(404).send('User not found');
            return;
        }

        let riderTrips = await findRiderTrips(user[0].id);
        let driverTrips = await findDriverTrips(user[0].id);
        let response = { 
            "riderTrips": riderTrips, 
            "driverTrips": driverTrips
        };
        res.json(response);
    } catch (error) {
        console.log("GET TRIPS ERROR", error)
        res.status(500).send(error);
    }
});

//GET futureTrips will take in driverId and send all future trips for that driver to client.
app.get('/futureTrips', async (req, res) => {
    console.log("GET FUTURE TRIPS: ", req.query);
    try {
        let result = await findFutureTrips(req.query.driverId);
        res.json(result);
    } catch (error) {  
        console.log("GET FUTURE TRIPS ERROR", error)
        res.status(500).send(error);
    }
});

//POST futureTrips will take in future trip info and insert into database, sending database response back to client.
app.post('/futureTrips', async (req, res) => {
    console.log("POST FUTURE TRIPS: ", req.query);
    try {
        //The FutureTrip object is created.
        let newTrip = await FutureTrip.createFutureTrip(req.query);

        //Other FutureTrips for the driver are found.
        let prevFutureTrips = await findFutureTrips(newTrip.driverId);
        prevFutureTripsCount = prevFutureTrips.rowCount;
        prevFutureTrips = prevFutureTrips.rows;
        
        //If the driver has overlapping future trips, a 409 error is sent.
        for (let i = 0; i < prevFutureTripsCount; i++) {
            if (prevFutureTrips[i].start_time <= newTrip.eta && prevFutureTrips[i].eta >= newTrip.startTime) {
                console.log("Overlapping future trips");
                res.status(409).send('Overlapping future trips');
                return;
            }
        }

        //The new FutureTrip is inserted into the database.
        result = await insertFutureTrip(newTrip);
        res.status(201).json(result);
    } catch (error) {
        //The error is caught if there is an error in the API response.
        if (error.toString().trim() == "Error: Error in API response") {
            res.status(404).send('No route found');
        }
        else {
            console.log("POST FUTURE TRIPS ERROR", error);
            res.status(500).send(error);
        }
    }
});

//DELETE futureTrips will take in futureTripId and delete the future trip from the database.
app.delete('/futureTrips', async (req, res) => {
    console.log("DELETE FUTURE TRIPS: ", req.query);
    try {
        let result = await deleteFutureTrip(req.query.futureTripId);
        res.json(result);
    } catch (error) {
        console.log("DELETE FUTURE TRIPS ERROR", error);
        res.status(500).send(error);
    }
});

//GET rideRequestsForTrip will take in futureTripId and send all ride requests for that trip to client.
app.get('/rideRequestsForTrip', async (req, res) => {
    console.log("GET RIDE REQUESTS FOR TRIP: ", req.query);
    try {
        let result = await findRideRequestsForTrip(req.query.futureTripId);
        res.json(result);
    } catch (error) {
        console.log("GET RIDE REQUESTS ERROR", error);
        res.status(500).send(error);
    }
});

//GET rideRequestsForRider will take in riderId and send all ride requests for that rider to client.
app.get('/rideRequestsForRider', async (req, res) => {
    console.log("GET RIDE REQUESTS FOR RIDER: ", req.query);
    try {
        let result = await findRideRequestsForRider(req.query.riderId);
        res.json(result);
    } catch (error) {
        console.log("GET RIDE REQUESTS ERROR", error);
        res.status(500).send(error);
    }
});

//POST rideRequests will take in ride request info and insert into database, sending database response back to client.
app.post('/rideRequests', async (req, res) => {
    console.log("POST RIDE REQUESTS: ", req.query);
    try {
        let newRideRequest = await RideRequest.createRideRequest(req.query);

        //SEND NOTIFICATION TO DRIVER============================================================

        result = await insertRideRequest(newRideRequest);
        res.status(201).json(result);
    } catch (error) {
        //The error is caught if the rider has already requested a ride.
        if (error.toString().trim() == "Error: Rider already requested ride") {
            res.status(409).send('Rider already requested ride');
            return;
        }
        //The error is caught if there is an error in the API response.
        if (error.toString().trim() == "Error: Error in API response") {
            res.status(404).send('No route found');
        }
        console.log("POST RIDE REQUESTS ERROR", error);
        res.status(500).send(error);
    }
});

//PUT acceptRideRequest will take in rideRequestId and check for overlapping accepted ride requests, then accept the ride request and set the future trip to full, finally sending a notification to the rider.
app.put('/acceptRideRequest', async (req, res) => {
    console.log("PUT ACCEPT RIDE REQUEST: ", req.query);
    try {
        //The ride request and future trip are found.
        let rideRequest = await findRideRequest(req.query.rideRequestId);
        let futureTrip = await findFutureTrip(rideRequest.future_trip_id);

        //The existing ride requests for the rider are found.
        let prevRideRequests = await  findRideRequestsForRider(rideRequest.rider_id);
        let prevRideRequestsCount = prevRideRequests.rowCount;
        prevRideRequests = prevRideRequests.rows;
        
        //If the rider has overlapping ride requests, a 409 error is sent.
        for (let i = 0; i < prevRideRequestsCount; i++) {
            if  (prevRideRequests[i].future_trip_id == futureTrip.id) {
                continue;
            }
            if (prevRideRequests[i].futureTrip.start_time <= futureTrip.eta && prevRideRequests[i].futureTrip.eta >= futureTrip.start_time && prevRideRequests[i].status != "pending") {
                console.log("Overlapping ride requests");
                res.status(409).send('Overlapping ride requests');
                return;
            }
        }

        //The ride request is accepted and the future trip is set to full.
        let result = {};
        result.rideRequest = await acceptRideRequest(req.query.rideRequestId);
        result.futureTrip = await setFutureTripFull(futureTrip.id);

        //SEND NOTIFICATION TO RIDER============================================================

        res.status(201).json(result);
    } catch (error) {
        console.log("ACCEPT RIDE REQUEST ERROR", error);
        res.status(500).send(error);
    }
});

//DELETE rideRequestsByRider will take in rideRequestId and delete from database.
app.delete('/rideRequestsByRider', async (req, res) => {
    console.log("DELETE RIDE REQUEST BY RIDER: ", req.query);
    try {
        let result = await deleteRideRequest(req.query.rideRequestId);
        res.status(201).json(result);
    }
    catch (error) {
        console.log("DELETE RIDE REQUEST ERROR", error);
        res.status(500).send(error);
    }
});

//DELETE rideRequestsByDriver (reject) will take in rideRequestId, delete from database, and notify the rider.
app.delete('/rideRequestsByDriver', async (req, res) => {
    console.log("DELETE RIDE REQUEST BY DRIVER: ", req.query);
    try {
        let result = await deleteRideRequest(req.query.rideRequestId);

        //SEND NOTIFICATION TO RIDER============================================================

        res.status(201).json(result);
    }
    catch (error) {
        console.log("DELETE RIDE REQUEST ERROR", error);
        res.status(500).send(error);
    }
});

//DOESNT WORK
app.post('/trips', async (req, res) => {
    console.log("POST TRIP: ", req.query);
    try {
        let { src, dest, avoidHighways, avoidTolls, driver_fbid, rider_fbids } = req.query;
        //get route info
        let mapsResponse = await getBestRoute(src, dest, avoidHighways, avoidTolls);

        //find driver in database
        let driver = await findUser(driver_fbid);
        if (driver.length == 0) {
            console.log("Driver not found");
            res.status(404).send('Driver not found');
            return;
        }
        driver_id = driver[0].id;

        //find riders in database
        riders_fbid_split = rider_fbids.split("|");
        riders = [];
        for (let i = 0; i < riders_fbid_split.length; i++) {
            let rider = await findUser(riders_fbid_split[i]);
            if (rider.length == 0) {
                console.log("Rider not found");
                res.status(404).send('Rider not found');
                return;
            }
            else {
                riders.push(rider[0].id);
            }
        }

        //insert trip into database
        let start_location = mapsResponse.routes[0].legs[0].start_address;
        let destination = mapsResponse.routes[0].legs[0].end_address;
        let distance = mapsResponse.routes[0].legs[0].distance.value; //meters
        let started_at = new Date(); // Current time
        let ended_at = new Date(started_at.getTime() + mapsResponse.routes[0].legs[0].duration.value * 1000); // Adding duration to start time
        try {
            let resultTrips = await client.query(
                'INSERT INTO trips (driver_id, start_location, destination, started_at, ended_at, distance) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
                [driver_id, start_location, destination, started_at, ended_at, distance]
            );
            response = [];
            response.push(resultTrips.rows[0]);
            
            //insert trip_passenger into database
            for (let i = 0; i < riders.length; i++) {
                let resultUserTrips = await client.query(
                    'INSERT INTO trip_passenger (trip_id, user_id, start_location, cost, started_at, ended_at, distance, round_trip) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
                    [resultTrips.rows[0].id, riders[i], start_location, 5, started_at, ended_at, distance, true]
                );
                response.push(resultUserTrips.rows[0]);
            }
            res.status(201).json(response);
        } catch (error) {
            console.log("POST TRIP QUERY ERROR");
            res.status(500).send(error);
        }
    } catch (error) {
        console.log("POST TRIP ERROR")
        res.status(500).send(error);
    }
});

//PAYPAL FUNCTIONALITY
//The server will redirect to the paypal payment page.
app.get('/pay', async (req, res) => {
    try {
        const url = await paypal.createOrder()
        res.send(url)
    } catch (e) { 
        res.status(500).send('Internal Server Error')
    }
})

//The server will redirect to the paypal approval page.
//Triggered automatically via createOrder returnUrl
app.get('/authorize-order', async (req, res) => {
    try {
        const orderId = req.query.token
        req.session.orderId = orderId; // Store order ID in session
        const authorizationID = await paypal.authorizeOrder(orderId)
        req.session.authorizationID = authorizationID
        console.log('Authorization ID:', authorizationID);
        res.redirect(process.env.BASE_URL + '/after-approval')
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
        console.log('Amount received:', amountReceived);
        paypal.createPayout('sb-driver5033257492@personal.example.com', amountReceived-process.env.PAYPAL_PAYOUT_FEE)
        res.send('Payment successful')
    } catch (e) {
        res.status(500).send('Error: ' + e);
    }
});

app.get('/cancel-order', (req, res) => {
    console.log('Order canceled');
    //res.redirect('/')
})

//The server is started.
app.listen(port, (error) => {
    if (error) {
        console.log('Something went wrong', error);
    } else {
        console.log(`Server is listening on port ${port}`);
    }
});