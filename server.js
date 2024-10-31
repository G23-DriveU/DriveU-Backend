/*
fix trip database entries
fix ride request database entries
add edit user info functionality and profile pic functionality
add find future_trips functionality for riders (dont pull up trips where they are driver)
automatically cancel future trips 30 mins after and send notis to driver 5 mins before??
*/

const express = require('express');
const { client, doesUserExist, insertUser, findUser, findRiderTrips, findDriverTrips, insertFutureTrip, findFutureTrips } = require('./database'); // Import the client from database.js
const User = require('./User');
const Driver = require('./Driver');
const FutureTrip = require('./FutureTrip');

const app = express();
const port = 8080;

app.get('/users', async (req, res) => {
    console.log("GET USERS: ", req.query);
    try {
        let result = await findUser(req.query.firebase_uid)
        res.json(result);
    } catch (error) {
        console.log("GET USER ERROR", error);
        res.status(500).send(error);
    }
});

app.post('/users', async (req, res) => {
    console.log("POST USERS: ", req.query);

    let curUser = null;
    if (req.query.driver == 'true') curUser = new Driver(req.query);
    else curUser = new User(req.query);

    try {
        if (await doesUserExist(curUser.firebase_uid) == false) {
            result = insertUser(curUser);
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
        let response = { //TESTTT INCLUDING DRIVER/RIDER INFO
            "riderTrips": riderTrips, 
            "driverTrips": driverTrips
        };
        res.json(response);
    } catch (error) {
        console.log("GET TRIPS ERROR", error)
        res.status(500).send(error);
    }
});

app.get('/futureTrips', async (req, res) => {
    console.log("GET FUTURE TRIPS: ", req.query);
    try {
        let result = await findFutureTrips(req.query.driverFbid);
        res.json(result);
    } catch (error) {  
        console.log("GET FUTURE TRIPS ERROR", error)
        res.status(500).send(error);
    }
});

app.post('/futureTrips', async (req, res) => {
    console.log("POST FUTURE TRIPS: ", req.query);
    try {
        let newTrip = await FutureTrip.createFutureTrip(req.query);
        let prevFutureTrips = await findFutureTrips(newTrip.driverFbid);
        prevFutureTripsCount = prevFutureTrips.rowCount;
        prevFutureTrips = prevFutureTrips.rows;
        
        //check for overlapping future trips before adding new future trip
        for (let i = 0; i < prevFutureTripsCount; i++) {
            if (prevFutureTrips[i].start_time <= newTrip.eta && prevFutureTrips[i].eta >= newTrip.startTime) {
                console.log("Overlapping future trips");
                res.status(409).send('Overlapping future trips');
                return;
            }
        }

        insertFutureTrip(newTrip);
        res.status(201).json(newTrip);
    } catch (error) {
        //catches invalid routes or addresses
        if (error.toString().trim() == "Error: Error in API response") {
            res.status(404).send('No route found');
        }
        else {
            console.log("POST FUTURE TRIPS ERROR", error);
            res.status(500).send(error);
        }
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

// Start the server
app.listen(port, (error) => {
    if (error) {
        console.log('Something went wrong', error);
    } else {
        console.log(`Server is listening on port ${port}`);
    }
});