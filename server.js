// server.js

const express = require('express');
const axios = require('axios');
const { client, doesUserExist, insertUser, findUser, findRiderTrips, findDriverTrips } = require('./database'); // Import the client from database.js
const User = require('./User');
const Driver = require('./Driver');
require('dotenv').config();

const app = express();
const port = 8080;

const mapsAPIkey = process.env.MAPS_API_KEY;

// GET request to fetch a user with firebase_uid
app.get('/users', async (req, res) => {
    console.log("GET USERS: ", req.query);
    try {
        let result = await findUser(req.query.firebase_uid)
        res.json(result);
    } catch (error) {
        console.log("GET USER ERROR");
        res.status(500).send(error);
    }
});

// POST request to create a new user
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

// GET request to view trips
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
        console.log("GET TRIPS ERROR")
        res.status(500).send(error);
    }
});

//creating a new trip
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

//API call to google maps that gets the best route
const getBestRoute = async (src, dest, avoidHighways, avoidTolls) => {
    let avoidStuff = "";
    if (avoidHighways == true && avoidTolls == true) 
        avoidStuff = "tolls|highways";
    else if (avoidHighways == true)
        avoidStuff = "highways";
    else if (avoidTolls == true)
        avoidStuff = "tolls";
	let response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
		params: {
			origin: src, // origin
            destination: dest, // ending point
            mode: "DRIVE",
            key: mapsAPIkey,
            avoid: avoidStuff
		}
	});

	console.log("Maps API Response: ", response.data); // Check the API response
	return response.data;
}

// Start the server
app.listen(port, (error) => {
    if (error) {
        console.log('Something went wrong', error);
    } else {
        console.log(`Server is listening on port ${port}`);
    }
});