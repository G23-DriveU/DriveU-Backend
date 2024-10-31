const axios = require('axios');
require('dotenv').config();

const mapsAPIkey = process.env.MAPS_API_KEY;

class FutureTrip {
    constructor(reqBody) {
        this.driverId = reqBody.driverId;
        this.startLocation = reqBody.startLocation;
        this.destination = reqBody.destination;
        this.startTime = parseInt(reqBody.startTime, 10); // in seconds since epoch
        if (reqBody.avoidHighways == 'true') this.avoidHighways = true;
        else this.avoidHighways = false;
        if (reqBody.avoidTolls == 'true') this.avoidTolls = true;
        else this.avoidTolls = false;
    }

    static async createFutureTrip(reqBody) {
        let newTrip = new FutureTrip(reqBody);
        await newTrip.getBestRoute(newTrip.startLocation, newTrip.destination, newTrip.avoidHighways, newTrip.avoidTolls);
        return newTrip;
    }

    //API call to google maps that gets the best route
    async getBestRoute(src, dest, avoidHighways, avoidTolls) {
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
        
        if (response.data.status != "OK") {
            throw new Error("Error in API response");
        }

        this.distance = this.metersToMiles(response.data.routes[0].legs[0].distance.value);
        this.eta = this.startTime + response.data.routes[0].legs[0].duration.value;
    }

    metersToMiles(meters) {
        return meters * 0.000621371;
    }
}

module.exports = FutureTrip;