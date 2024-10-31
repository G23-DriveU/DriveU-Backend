const axios = require('axios');
require('dotenv').config();
const findUserById = require('./database').findUserById;
const findFutureTrip = require('./database').findFutureTrip;
const findRideRequest = require('./database').findRideRequest;

const mapsAPIkey = process.env.MAPS_API_KEY;
let gasCost = 3;

class RideRequest {
    constructor(reqBody) {
        this.futureTripId = reqBody.futureTripId;
        this.riderId = reqBody.riderId;
        this.riderLocation = reqBody.riderLocation;
        this.status = "pending";
        this.authorizationId = reqBody.authorizationId;
        if (reqBody.roundTrip == 'true') this.roundTrip = true;
        else this.roundTrip = false;
    }

    static async createRideRequest(reqBody) {
        this.futureTrip = await findFutureTrip(reqBody.futureTripId);
        let rideRequests = await findRideRequest(reqBody.futureTripId);
        let rideRequestCount = rideRequests.rowCount;
        for (let i = 0; i < rideRequestCount; i++) {
            let rideRequest = rideRequests.rows[i];
            console.log("Ride Request: ", rideRequest);
            if (rideRequest.rider_id == reqBody.riderId) {
                throw new Error("Rider already requested ride");
            }
        }
        let newRideRequest = new RideRequest(reqBody);
        await newRideRequest.getBestRoute(this.futureTrip.start_location, newRideRequest.riderLocation, this.futureTrip.destination, this.futureTrip.avoid_highways, this.futureTrip.avoid_tolls);
        await newRideRequest.price(this.futureTrip);
        return newRideRequest;
    }

    //API call to google maps that gets the best route
    async getBestRoute(src, stop, dest, avoidHighways, avoidTolls) {
        let avoidStuff = "";
        if (avoidHighways == "true" && avoidTolls == "true") 
            avoidStuff = "tolls|highways";
        else if (avoidHighways == "true")
            avoidStuff = "highways";
        else if (avoidTolls == "true")
            avoidStuff = "tolls";
        let response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
            params: {
                origin: src, // origin
                destination: dest, // ending point
                mode: "DRIVE",
                waypoints: stop,
                key: mapsAPIkey,
                avoid: avoidStuff
            }
        });

        console.log("Maps API Response: ", response.data); // Check the API response
        
        if (response.data.status != "OK") {
            throw new Error("Error in API response");
        }

        this.distance = this.metersToMiles(response.data.routes[0].legs[0].distance.value) + this.metersToMiles(response.data.routes[0].legs[1].distance.value);
    }

    metersToMiles(meters) {
        return meters * 0.000621371;
    }

    //CHANGE BASED ON PAYMENT SCHEMA
    async price(futureTrip) {
        let driver = await findUserById(futureTrip.driver_id);
        this.riderCost = (this.distance - futureTrip.distance) / parseInt(driver.car_mpg) * gasCost;
        if (this.roundTrip) this.riderCost *= 2;
        this.driverPayout = this.riderCost * 0.8;
    }
}

module.exports = RideRequest;