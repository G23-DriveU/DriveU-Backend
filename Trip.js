//This class is used to create a (past) trip object that will be stored in the database.

//Necessary imports from dotenv are included.
require('dotenv').config();

//The FutureTrip class is defined.
class Trip {
    //The constructor takes in the future trip and ride request, and initializes the object with the provided values.
    constructor(futureTrip, rideRequest) {
        this.driverId = futureTrip.driverId;
        this.riderId = rideRequest.riderId;
        this.startLocation = futureTrip.startLocation;
        this.startLocationLat = futureTrip.startLocationLat;
        this.startLocationLng = futureTrip.startLocationLng;
        this.riderLocation = rideRequest.riderLocation;
        this.riderLocationLat = rideRequest.riderLocationLat;
        this.riderLocationLng = rideRequest.riderLocationLng;
        this.destination = futureTrip.destination;
        this.destinationLat = futureTrip.destinationLat;
        this.destinationLng = futureTrip.destinationLng;
        this.startedAt = futureTrip.startTime;
        this.pickedUpAt = rideRequest.pickupTime;
        this.arrivedAt = futureTrip.eta;
        this.roundTrip = rideRequest.roundTrip;
        this.droppedOffAt = rideRequest.dropOffTime;
        this.endedAt = futureTrip.ets;
        this.timeAtDestination = futureTrip.timeAtDestination;
        this.driverPayout = rideRequest.driverPayout;
        this.riderCost = rideRequest.riderCost;
        this.distance = rideRequest.distance;
        this.driverRated = false;
        this.riderRated = false;
        return this;
    }

    //This function creates a new Trip object from the database.
    static createTripFromDatabase(reqBody) {
        let futureTrip = {
            driverId: reqBody.driver_id,
            startLocation: reqBody.start_location,
            startLocationLat: reqBody.start_location_lat,
            startLocationLng: reqBody.start_location_lng,
            destination: reqBody.destination,
            destinationLat: reqBody.destination_lat,
            destinationLng: reqBody.destination_lng,
            startTime: reqBody.started_at,
            eta: reqBody.arrived_at,
            ets: reqBody.endedAt,
            timeAtDestination: reqBody.time_at_destination,
        };
        let rideRequest = {
            riderId: reqBody.rider_id,
            riderLocation: reqBody.rider_location,
            riderLocationLat: reqBody.rider_location_lat,
            riderLocationLng: reqBody.rider_location_lng,
            pickupTime: reqBody.picked_up_at,
            dropOffTime: reqBody.dropped_off_at,
            driverPayout: reqBody.driver_payout,
            riderCost: reqBody.rider_cost,
            distance: reqBody.distance,
            roundTrip: reqBody.round_trip,
        }
        let trip = new Trip(futureTrip, rideRequest);
        trip.driverRated = reqBody.driver_rated;
        trip.riderRated = reqBody.rider_rated;
        trip.id = reqBody.id;
        return trip;
    }
}

//The Trip class is exported.
module.exports = Trip;