/*
This is the server.js file and runs the backend server for DriveU.

After login, userId from Postgres will be used, NOT firebase_uid

TODO
UNIT TESTING
Add notification functionality
Incorporate paypal and cost functionality to ride requests
add profile pic functionality
automatically cancel future trips 30 mins after and send notifications to driver 5 mins before?
*/

//Necessary imports are handled for server.js.
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const fs = require('fs');
const bodyParser = require('body-parser');
const { doesUserExist, insertUser, findUser, findUserById, updateUser, findRiderTrips, findDriverTrips, insertFutureTrip, findFutureTripsForDriver, findFutureTripsForRider, findFutureTripsByRadius, setFutureTripFull, deleteFutureTrip, findFutureTrip, insertRideRequest, findRideRequest, findRideRequestsForTrip, findRideRequestsForRider, deleteRideRequest, insertTrip, updateFcmToken, acceptRideRequest } = require('./database');
const User = require('./User');
const Driver = require('./Driver');
const FutureTrip = require('./FutureTrip');
const RideRequest = require('./RideRequest');
const Trip = require('./Trip');
const paypal = require('./paypal');
const carStats = require('./carStats');

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
    if (req.query.driver == 'true') curUser = new Driver(req.query);
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
    try {
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
            response.items[i] = result.items[i];
            response.items[i].rideRequest = await RideRequest.createRideRequest(req.query);
            response.items[i].driver = await findUserById(response.items[i].driverId);
        }
        response.status = "OK";
        res.json(response);
    } catch (error) {
        response.status = "ERROR";
        response.error = error.toString();
        console.log("GET FUTURE TRIPS FOR RIDER ERROR", error);
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

        //SEND NOTIFICATION TO DRIVER============================================================

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
        result.rideRequest = await acceptRideRequest(req.query.rideRequestId);
        if (result.rideRequest.rowCount === 0) {
            response.status = "ERROR";
            response.error = "Failed to accept ride request";
            console.log("ACCEPT RIDE REQUEST ERROR");
            res.status(500).json(response);
            return;
        }
        result.futureTrip = await setFutureTripFull(futureTrip.id);
        if (result.futureTrip.rowCount === 0) {
            response.status = "ERROR";
            response.error = "Failed to set future trip to full";
            console.log("SET FUTURE TRIP FULL ERROR");
            res.status(500).json(response);
            return;
        }

        //SEND NOTIFICATION TO RIDER============================================================

        //The response is sent to the client.
        response.status = "OK";
        response.rideRequest = result.rideRequest.rows[0];
        response.futureTrip = result.futureTrip.rows[0];
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
        let result = await deleteRideRequest(req.query.rideRequestId);

        //SEND NOTIFICATION TO RIDER============================================================

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

//PUT endTrip will end the given future trip and move it to past trips.
app.put('/endTrip', async (req, res) => {
    console.log("PUT END TRIP: ", req.query);
    let response = {};
    try {
        let futureTrip = await findFutureTrip(req.query.futureTripId);
        let rideRequest = await findRideRequest(req.query.rideRequestId);
        let trip = new Trip(futureTrip, rideRequest);
        result = await insertTrip(trip);
        if (result.rowCount === 0) {
            response.status = "ERROR";
            response.error = "Failed to insert trip";
            console.log("INSERT TRIP ERROR");
            res.status(500).json(response);
            return;
        }
        await deleteFutureTrip(req.query.futureTripId);
        await deleteRideRequest(req.query.rideRequestId);
        response.item = result.rows[0];
        response.status = "OK";
        res.status(201).json(response);
    }    
    catch (error) {
        response.status = "ERROR";
        response.error = error.toString();
        console.log("PUT END TRIP ERROR", error);
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
        //AMOUNT RECIEVED MUST BE SAVED IN CURRENT TRIP OBJECT IN DB
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

//The app and server are exported.
module.exports = { app, server };