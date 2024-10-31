//This class is used to create a ride request object that will be stored in the database.

//Necessary imports from axios, dotenv, and ./database are included.
const axios = require('axios');
require('dotenv').config();
const findUserById = require('./database').findUserById;
const findFutureTrip = require('./database').findFutureTrip;
const findRideRequestsForTrip = require('./database').findRideRequestsForTrip;

//The API key for Google Maps is retrieved from the environment variables, and gas cost is initialized.
const mapsAPIkey = process.env.MAPS_API_KEY;
let gasCost = 3;

//The RideRequest class is defined.
class RideRequest {
    //The constructor takes in the request body and initializes the object with the provided values.
    constructor(reqBody) {
        this.futureTripId = reqBody.futureTripId;
        this.riderId = reqBody.riderId;
        this.riderLocation = reqBody.riderLocation;
        this.status = "pending";
        this.authorizationId = reqBody.authorizationId; //ASSUMING HANDLED ON FRONTEND
        if (reqBody.roundTrip == 'true') this.roundTrip = true;
        else this.roundTrip = false;
    }

    //This function creates a new RideRequest object and calls the getBestRoute and price functions to get the best route and calculate the price.
    static async createRideRequest(reqBody) {
        //The future trip object is retrieved from the database.
        this.futureTrip = await findFutureTrip(reqBody.futureTripId);

        //It is checked if the rider has already requested a ride for the future trip.
        let rideRequests = await findRideRequestsForTrip(reqBody.futureTripId);
        let rideRequestCount = rideRequests.rowCount;
        for (let i = 0; i < rideRequestCount; i++) {
            let rideRequest = rideRequests.rows[i];
            if (rideRequest.rider_id == reqBody.riderId) {
                throw new Error("Rider already requested ride");
            }
        }

        //A new RideRequest object is created and the best route and price are calculated.
        let newRideRequest = new RideRequest(reqBody);
        await newRideRequest.getBestRoute(this.futureTrip.start_location, newRideRequest.riderLocation, this.futureTrip.destination, this.futureTrip.start_time, this.futureTrip.avoid_highways, this.futureTrip.avoid_tolls);
        await newRideRequest.price(this.futureTrip);
        return newRideRequest;
    }

    //This function makes an API call to Google Maps to get the best route from the source to the destination with a stop at the rider's location.
    async getBestRoute(src, stop, dest, startTime, avoidHighways, avoidTolls) {
        let avoidStuff = "";
        if (avoidHighways == "true" && avoidTolls == "true") 
            avoidStuff = "tolls|highways";
        else if (avoidHighways == "true")
            avoidStuff = "highways";
        else if (avoidTolls == "true")
            avoidStuff = "tolls";
        let response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
            params: {
                origin: src, 
                destination: dest, 
                mode: "DRIVE",
                waypoints: stop,
                key: mapsAPIkey,
                avoid: avoidStuff
            }
        });

        //The response status is checked.
        console.log("Maps API Response: ", response.data); 
        if (response.data.status != "OK") {
            throw new Error("Error in API response");
        }

        //The distance is extracted from the API response.
        this.distance = this.metersToMiles(response.data.routes[0].legs[0].distance.value) + this.metersToMiles(response.data.routes[0].legs[1].distance.value);
        this.pickupTime = startTime + response.data.routes[0].legs[0].duration.value;
    }

    //This function converts meters to miles.
    metersToMiles(meters) {
        return meters * 0.000621371;
    }

    //This function prices the trip based on the extra distance and the driver's car's miles per gallon.
    async price(futureTrip) {
        let driver = await findUserById(futureTrip.driver_id);
        this.riderCost = (this.distance - futureTrip.distance) / parseInt(driver.car_mpg) * gasCost;
        if (this.roundTrip) this.riderCost *= 2;
        this.driverPayout = this.riderCost * 0.8;
    }
}

//The RideRequest class is exported.
module.exports = RideRequest;