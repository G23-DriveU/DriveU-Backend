//This class is used to create a future trip object that will be stored in the database.

//Necessary imports from axios and dotenv are included.
const axios = require('axios');
require('dotenv').config();

//The API key for Google Maps is retrieved from the environment variables.
const mapsAPIkey = process.env.MAPS_API_KEY;

//The FutureTrip class is defined.
class FutureTrip {
    //The constructor takes in the request body and initializes the object with the provided values.
    constructor(reqBody) {
        this.driverId = reqBody.driverId;
        this.startLocation = reqBody.startLocation;
        this.destination = reqBody.destination;
        this.startTime = parseInt(reqBody.startTime, 10); //IN SECONDS SINCE EPOCH
        if (reqBody.avoidHighways == 'true') this.avoidHighways = true;
        else this.avoidHighways = false;
        if (reqBody.avoidTolls == 'true') this.avoidTolls = true;
        else this.avoidTolls = false;
    }

    //This function creates a new FutureTrip object and calls the getBestRoute function to get the best route from the start location to the destination.
    static async createFutureTrip(reqBody) {
        let newTrip = new FutureTrip(reqBody);
        await newTrip.getBestRoute(newTrip.startLocation, newTrip.destination, newTrip.avoidHighways, newTrip.avoidTolls);
        return newTrip;
    }

    //This function makes an API call to Google Maps to get the best route from the source to the destination.
    async getBestRoute(src, dest, avoidHighways, avoidTolls) {
        //The avoidStuff variable is used to specify the type of routes to avoid based on the user's preferences.
        let avoidStuff = "";
        if (avoidHighways == true && avoidTolls == true) 
            avoidStuff = "tolls|highways";
        else if (avoidHighways == true)
            avoidStuff = "highways";
        else if (avoidTolls == true)
            avoidStuff = "tolls";

        //The API call is made to the Google Maps Directions API with the specified parameters.
        let response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
            params: {
                origin: src, 
                destination: dest, 
                mode: "DRIVE",
                key: mapsAPIkey,
                avoid: avoidStuff
            }
        });

        //The response status is checked.
        console.log("Maps API Response: ", response.data);
        if (response.data.status != "OK") {
            throw new Error("Error in API response");
        }

        //The distance and estimated time of arrival (ETA) are extracted from the API response.
        this.distance = this.metersToMiles(response.data.routes[0].legs[0].distance.value);
        this.eta = this.startTime + response.data.routes[0].legs[0].duration.value;
    }

    //This function converts meters to miles.
    metersToMiles(meters) {
        return meters * 0.000621371;
    }
}

//The FutureTrip class is exported.
module.exports = FutureTrip;