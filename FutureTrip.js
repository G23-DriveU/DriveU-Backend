//This class is used to create a future trip object that will be stored in the database.

//Necessary imports from axios and dotenv are included.
const axios = require('axios');
require('dotenv').config();
const fuelPrices = require('./fuelPrices');

//The API key for Google Maps is retrieved from the environment variables.
const mapsAPIkey = process.env.MAPS_API_KEY;

//The FutureTrip class is defined.
class FutureTrip {
    //The constructor takes in the request body and initializes the object with the provided values.
    constructor(reqBody) {
        this.driverId = reqBody.driverId;
        this.startLocation = reqBody.startLocation;
        this.destination = reqBody.destination;
        this.startLocationLat = parseFloat(reqBody.startLocationLat);
        this.startLocationLng = parseFloat(reqBody.startLocationLng);
        this.destinationLat = parseFloat(reqBody.destinationLat);
        this.destinationLng = parseFloat(reqBody.destinationLng);
        this.carCapacity = reqBody.carCapacity;
        this.startTime = parseInt(reqBody.startTime, 10); //IN SECONDS SINCE EPOCH
        if (reqBody.avoidHighways == 'true') this.avoidHighways = true;
        else this.avoidHighways = false;
        if (reqBody.avoidTolls == 'true') this.avoidTolls = true;
        else this.avoidTolls = false;
        if (reqBody.roundTrip == 'true') {
            this.roundTrip = true;
            this.timeAtDestination = parseFloat(reqBody.timeAtDestination);
        } 
        else {
            this.roundTrip = false;
            this.timeAtDestination = 0;
        }
    }

    //This function creates a new FutureTrip object and calls the getBestRoute function to get the best route from the start location to the destination.
    static async createFutureTrip(reqBody) {
        let newTrip = new FutureTrip(reqBody);
        let src = `${newTrip.startLocationLat},${newTrip.startLocationLng}`;
        let dest = `${newTrip.destinationLat},${newTrip.destinationLng}`;
        await newTrip.getBestRoute(src, dest, newTrip.roundTrip, newTrip.avoidHighways, newTrip.avoidTolls);
        return newTrip;
    }

    //This function creates a new FutureTrip object from the database.
    static createFutureTripFromDatabase(reqBody) {
        let updatedBody = {
            driverId: reqBody.driver_id,
            startLocation: reqBody.start_location,
            destination: reqBody.destination,
            startTime: reqBody.start_time,
            avoidHighways: reqBody.avoid_highways,
            avoidTolls: reqBody.avoid_tolls,
            carCapacity: reqBody.car_capacity,
        };
        let futureTrip = new FutureTrip(updatedBody);
        futureTrip.id = reqBody.id;
        futureTrip.roundTrip = reqBody.round_trip;
        futureTrip.startLocationLat = reqBody.start_location_lat;
        futureTrip.startLocationLng = reqBody.start_location_lng;
        futureTrip.destinationLat = reqBody.destination_lat;
        futureTrip.destinationLng = reqBody.destination_lng
        futureTrip.startLocation = reqBody.start_location;
        futureTrip.destination = reqBody.destination;
        futureTrip.timeAtDestination = reqBody.time_at_destination;
        futureTrip.eta = reqBody.eta;
        futureTrip.distance = reqBody.distance;
        futureTrip.gasPrice = reqBody.gas_price;
        futureTrip.isFull = reqBody.is_full;
        futureTrip.ets = reqBody.ets;
        return futureTrip;
    }

    //This function makes an API call to Google Maps to get the best route from the source to the destination.
    async getBestRoute(src, dest, roundTrip, avoidHighways, avoidTolls) {
        //The avoidStuff variable is used to specify the type of routes to avoid based on the user's preferences.
        let avoidStuff = "";
        if (avoidHighways == true && avoidTolls == true) 
            avoidStuff = "tolls|highways";
        else if (avoidHighways == true)
            avoidStuff = "highways";
        else if (avoidTolls == true)
            avoidStuff = "tolls";
        let response = null;

        //If the roundTrip parameter is true, the API call is made to the Google Maps Directions API with the source as the destination.
        if (roundTrip == true) {
            response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
                params: {
                    origin: src, 
                    destination: src, 
                    mode: "DRIVE",
                    waypoints: dest,
                    key: mapsAPIkey,
                    avoid: avoidStuff
                }
            });
        }
        else {
            //The API call is made to the Google Maps Directions API with the specified parameters.
            response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
                params: {
                    origin: src, 
                    destination: dest, 
                    mode: "DRIVE",
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
        console.log("Routes API Legs: ", response.data.routes[0].legs);

        //The addresses of the source and destination are extracted from the API response.
        this.startLocation = response.data.routes[0].legs[0].start_address;
        this.destination = response.data.routes[0].legs[0].end_address;

        //The distance and estimated time of arrival (ETA) are extracted from the API response.
        this.distance = this.metersToMiles(response.data.routes[0].legs[0].distance.value);
        //TODO: Change this to back once COLLECT API FIXES UP
        this.gasPrice = 3.10;
        //this.gasPrice = (await fuelPrices.getLocalGasPrices(this.startLocationLat, this.startLocationLng)).result.gasoline;
        this.eta = this.startTime + response.data.routes[0].legs[0].duration.value;
        this.ets = this.eta;
        if (roundTrip == true) {
            this.ets = this.eta + this.timeAtDestination + response.data.routes[0].legs[1].duration.value;
        }
    }

    //This function converts meters to miles.
    metersToMiles(meters) {
        return meters * 0.000621371;
    }
}

//The FutureTrip class is exported.
module.exports = FutureTrip;