//This class is used to create a ride request object that will be stored in the database.

//Necessary imports from axios, dotenv, and ./database are included.
const axios = require('axios');
require('dotenv').config();

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

        //ADD AUTHORIZATION FROM PAYPAL CODE HERE ====================================
        this.authorizationId = reqBody.authorizationId;

        //Round trip is set to false by default.
        if (reqBody.roundTrip == 'true') {
            this.roundTrip = true;
        }
        else {
            this.roundTrip = false;
        }
    }

    //This function creates a new RideRequest object and calls the getBestRoute and price functions to get the best route and calculate the price.
    static async createRideRequest(reqBody) {
        const findFutureTrip = (await import('./database.js')).findFutureTrip;
        const findRideRequestsForTrip = (await import('./database.js')).findRideRequestsForTrip;

        //The future trip object is retrieved from the database.
        this.futureTrip = await findFutureTrip(reqBody.futureTripId);

        //It is checked if the rider has already requested a ride for the future trip.
        let rideRequests = await findRideRequestsForTrip(reqBody.futureTripId);
        let rideRequestCount = rideRequests.count;
        for (let i = 0; i < rideRequestCount; i++) {
            let rideRequest = rideRequests.items[i];
            if (rideRequest.riderId == reqBody.riderId) {
                throw new Error("Rider already requested ride");
            }
        }

        //A new RideRequest object is created and the best route and price are calculated.
        let newRideRequest = new RideRequest(reqBody);
        await newRideRequest.getBestRoute(this.futureTrip.startLocation, newRideRequest.riderLocation, this.futureTrip.destination, newRideRequest.roundTrip, this.futureTrip.startTime, this.futureTrip.avoidHighways, this.futureTrip.avoidTolls);
        await newRideRequest.price(this.futureTrip);
        return newRideRequest;
    }

    //This function creates a new RideRequest object from the database.
    static createRideRequestFromDatabase(reqBody) {
        let updatedBody = {
            futureTripId: reqBody.future_trip_id,
            riderId: reqBody.rider_id,
            riderLocation: reqBody.rider_location,
            status: reqBody.status,
            distance: reqBody.distance,
        };
        let rideRequest = new RideRequest(updatedBody);
        rideRequest.id = reqBody.id;
        rideRequest.riderLocationLat = reqBody.rider_location_lat;
        rideRequest.riderLocationLng = reqBody.rider_location_lng;
        rideRequest.roundTrip = reqBody.round_trip;
        rideRequest.pickupTime = reqBody.pickup_time;
        rideRequest.eta = reqBody.eta;
        rideRequest.riderCost = reqBody.rider_cost;
        rideRequest.driverPayout = reqBody.driver_payout;
        rideRequest.distance = reqBody.distance;
        rideRequest.dropoffTime = reqBody.dropoff_time;
        rideRequest.authorizationId = reqBody.authorization_id;
        return rideRequest;
    }

    //This function makes an API call to Google Maps to get the best route from the source to the destination with a stop at the rider's location.
    async getBestRoute(src, stop, dest, roundTrip, startTime, avoidHighways, avoidTolls) {
        let avoidStuff = "";
        if (avoidHighways == "true" && avoidTolls == "true") 
            avoidStuff = "tolls|highways";
        else if (avoidHighways == "true")
            avoidStuff = "highways";
        else if (avoidTolls == "true")
            avoidStuff = "tolls";
        let response = null;

        //The API call is made based on whether the trip is a round trip or not.
        if (roundTrip == true) {
            stop = stop + "|" + dest + "|" + stop;
            response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
                params: {
                    origin: src, 
                    destination: src, 
                    mode: "DRIVE",
                    waypoints: stop,
                    key: mapsAPIkey,
                    avoid: avoidStuff
                }
            });
        }
        else {
            response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
                params: {
                    origin: src, 
                    destination: dest, 
                    mode: "DRIVE",
                    waypoints: stop,
                    key: mapsAPIkey,
                    avoid: avoidStuff
                }
            });
        }

        //The response status is checked.
        console.log("Routes API Response: ", response.data); 
        if (response.data.status != "OK") {
            throw new Error("Error in API response");
        }
        console.log("Routes API Response Legs: ", response.data.routes[0].legs); 

        //The rider's location is extracted from the API response.
        this.riderLocationLat = response.data.routes[0].legs[0].end_location.lat;
        this.riderLocationLng = response.data.routes[0].legs[0].end_location.lng;

        //The distance is extracted from the API response.
        this.distance = this.metersToMiles(response.data.routes[0].legs[0].distance.value) + this.metersToMiles(response.data.routes[0].legs[1].distance.value);
        this.pickupTime = startTime + response.data.routes[0].legs[0].duration.value;
        this.eta = this.pickupTime + response.data.routes[0].legs[1].duration.value;
        this.dropoffTime = this.eta;
        if (roundTrip) {
            this.dropoffTime = this.eta + response.data.routes[0].legs[2].duration.value;
        }
    }

    //This function converts meters to miles.
    metersToMiles(meters) {
        return meters * 0.000621371;
    }

    //This function prices the trip based on the extra distance and the driver's car's miles per gallon.
    async price(futureTrip) {
        const findUserById = (await import('./database.js')).findUserById;
        //gasCost = 3; //ADD GAS COST FROM API HERE ====================================
        let driver = await findUserById(futureTrip.driverId);
        this.riderCost = (this.distance - futureTrip.distance) / parseInt(driver.carMpg) * gasCost;
        if (this.roundTrip) this.riderCost *= 2;
        this.driverPayout = this.riderCost * 0.8;
    }
}

//The RideRequest class is exported.
module.exports = RideRequest;