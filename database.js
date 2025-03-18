//This is the database.js file, and contains all the database queries for the application.

//Necessary imports are included.
const { Client } = require('pg');
require('dotenv').config();
const User = require('./User');
const FutureTrip = require('./FutureTrip');
const RideRequest = require('./RideRequest');
const Trip = require('./Trip');

//The PostgreSQL client is initialized with the connection details.
const client = new Client({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: process.env.PGPORT,
    ssl: {
        rejectUnauthorized: false
    }
});

//The gatherCurrentTripData function retrieves the current trip data for a given future trip ID and ride request ID.
const gatherCurrentTripData = async (futureTripId, rideRequestId) => {
    let res = {};
    res.futureTrip = await findFutureTrip(futureTripId);
    res.rideRequest = await findRideRequest(rideRequestId);
    res.driver = await findUserById(res.futureTrip.driverId);
    res.rider = await findUserById(res.rideRequest.riderId);
    return res;
}

//The doesUserExist function checks if a user with the given Firebase UID exists in the database.
const doesUserExist = async (firebaseUid) => {
    const query = {
        text: 'SELECT EXISTS (SELECT 1 FROM users WHERE firebase_uid = $1)',
        values: [firebaseUid],
    };
    const result = await client.query(query);
    return result.rows[0].exists;
};

//The insertUser function inserts a new user object into the database.
const insertUser = async (curUser) => {
    let result = null;
    if (curUser.driver == true) {
        result = await client.query('INSERT INTO users (firebase_uid, name, email, phone_number, school, fcm_token, driver, driver_rating, driver_review_count, rider_rating, rider_review_count, car_color, car_plate, car_make, car_model, car_mpg, payer_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING *', 
            [curUser.firebaseUid, curUser.name, curUser.email, curUser.phoneNumber, curUser.school, curUser.fcmToken, curUser.driver, 0, 0, 0, 0, curUser.carColor, curUser.carPlate, curUser.carMake, curUser.carModel, curUser.carMpg, curUser.payerId]);
    }
    else {
        //The user is inserted without car details if they are not a driver.
        result = await client.query('INSERT INTO users (firebase_uid, name, email, phone_number, school, fcm_token, driver, rider_rating, rider_review_count) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *', 
            [curUser.firebaseUid, curUser.name, curUser.email, curUser.phoneNumber, curUser.school, curUser.fcmToken, curUser.driver, 0, 0]);
    }
    return result;
}

//The findUser function retrieves a user object from the database based on the Firebase UID.
const findUser = async (firebaseUid) => {
    let query = {
        text: 'SELECT * FROM users WHERE firebase_uid = $1',
        values: [firebaseUid],
    };
    let result = await client.query(query);
    if (result.rows.length > 0) {
        return User.createUserFromDatabase(result.rows[0]);
    }
    return;
}

//The updateUser function updates the user object in the database.
const updateUser = async (curUser) => {
    let query = null;
    if (curUser.driver == false || curUser.driver == 'false') {
        query = {
            text: 'UPDATE users SET name = $1, phone_number = $2, school = $3, driver = $4, car_color = NULL, car_plate = NULL, car_make = NULL, car_model = NULL, car_mpg = NULL WHERE id = $5',
            values: [curUser.name, curUser.phoneNumber, curUser.school, curUser.driver, curUser.userId],
        }
    } else {
        if (curUser.payerId) {
            query = {
                text: 'UPDATE users SET name = $1, phone_number = $2, school = $3, driver = $4, car_color = $5, car_plate = $6, car_make = $7, car_model = $8, car_mpg = 15, payer_id = $9 WHERE id = $10',
                values: [curUser.name, curUser.phoneNumber, curUser.school, curUser.driver, curUser.carColor, curUser.carPlate, curUser.carMake, curUser.carModel, curUser.payerId, curUser.userId],
            }
        } else {
            query = {
                text: 'UPDATE users SET name = $1, phone_number = $2, school = $3, driver = $4, car_color = $5, car_plate = $6, car_make = $7, car_model = $8, car_mpg = 15 WHERE id = $9',
                values: [curUser.name, curUser.phoneNumber, curUser.school, curUser.driver, curUser.carColor, curUser.carPlate, curUser.carMake, curUser.carModel, curUser.userId],
            }
        }
    }
    let result = await client.query(query);
    return result;
}

//The updateFcmToken function updates the FCM Token of a user in the database.
const updateFcmToken = async (firebaseUid, fcmToken) => {
    let query = {
        text: 'UPDATE users SET fcm_token = $1 WHERE firebase_uid = $2',
        values: [fcmToken, firebaseUid],
    };
    let result = await client.query(query);
    return result;
}

//The findUserById function retrieves a user object from the database based on the user ID.
const findUserById = async (userId) => {
    let query = {
        text: 'SELECT * FROM users WHERE id = $1',
        values: [userId],
    };
    let result = await client.query(query);
    return User.createUserFromDatabase(result.rows[0]);
}

//The insertTestData function inserts a futureTrip object into the database.
const insertFutureTrip = async (newTrip) => {
    console.log(newTrip.gasPrice);
    let result = await client.query('INSERT INTO future_trips (driver_id, start_location, start_location_lat, start_location_lng, destination, destination_lat, destination_lng, start_time, eta, time_at_destination, distance, gas_price, avoid_highways, avoid_tolls, car_capacity, round_trip, is_full, ets) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING *',
        [newTrip.driverId, newTrip.startLocation, newTrip.startLocationLat, newTrip.startLocationLng, newTrip.destination, newTrip.destinationLat, newTrip.destinationLng, newTrip.startTime, newTrip.eta, newTrip.timeAtDestination, newTrip.distance, newTrip.gasPrice, newTrip.avoidHighways, newTrip.avoidTolls, newTrip.carCapacity, newTrip.roundTrip, false, newTrip.ets]);
    if (result.rows.length > 0) {
        result.rows[0] = await FutureTrip.createFutureTripFromDatabase(result.rows[0]);
        return result;
    }
    return;
}

//The findFutureTripsForDriver function retrieves all future trips for a given user ID of the driver.
const findFutureTripsForDriver = async (driverId) => {
    let query = {
        text: 'SELECT * FROM future_trips WHERE driver_id = $1',
        values: [driverId],
    };
    let result = await client.query(query);
    for (let i = 0; i < result.rows.length; i++) {
        result.rows[i] = await FutureTrip.createFutureTripFromDatabase(result.rows[i]);
    }
    return result;
}

//The findFutureTripsForRider function retrieves all future trips besides the ones where the rider is the driver.
const findFutureTripsForRider = async (riderId) => {
    let query = {
        text: 'SELECT * FROM future_trips WHERE driver_id <> $1 AND is_full = false',
        values: [riderId],
    };
    let result = await client.query(query);
    for (let i = 0; i < result.rows.length; i++) {
        result.rows[i] = await FutureTrip.createFutureTripFromDatabase(result.rows[i]);
    }
    return result;
}

//The findFutureTrip function retrieves a future trip object from the database based on the future trip ID.
const findFutureTrip = async (futureTripId) => {
    let query = {
        text: 'SELECT * FROM future_trips WHERE id = $1',
        values: [futureTripId],
    };
    let result = await client.query(query);
    if (result.rows.length > 0) {
        return await FutureTrip.createFutureTripFromDatabase(result.rows[0]);
    }
    return;
}

//The findFutureTripsByRadius function retrieves all open future trips based on the radius around a point.
const findFutureTripsByRadius = async (riderId, radius, lat, lng, roundTrip) => {
    let query = {
        text: 'SELECT * FROM future_trips WHERE driver_id <> $1 AND is_full = false AND round_trip = $2',
        values: [riderId, roundTrip],
    };
    let result = await client.query(query);
    latConversion = radius / 69;
    lngConversion = radius / (69 * Math.cos(lat * Math.PI / 180));

    //The future trip and driver details are added to the ride request object.
    let futureTripCount = result.rowCount;
    let futureTrips = result.rows;
    result = {};
    result.items = [];
    result.count = 0;
    for (let i = 0; i < futureTripCount; i++) {
        result.items[result.count] = await FutureTrip.createFutureTripFromDatabase(futureTrips[i]);
        let calculation = ((result.items[result.count].destinationLng - lng) ** 2) / (lngConversion ** 2) + ((result.items[result.count].destinationLat - lat) ** 2) / (latConversion ** 2);
        if (calculation <= 1) {
            result.count++;
        }
        else {
            result.items[result.count] = null;
        }
    }
    return result;
}

//The setFutureTripFull function updates the is_full attribute of a future trip to the given value.
const setFutureTripFull = async (futureTripId, full) => {
    let query = {
        text: 'UPDATE future_trips SET is_full = $1 WHERE id = $2',
        values: [full, futureTripId],
    };
    let result = await client.query(query);
    return result;
}

//The deleteFutureTrip function deletes a future trip and all associated ride requests from the database.
const deleteFutureTrip = async (futureTripId) => {
    let result = {};

    //All ride requests associated with the trip are deleted.
    let query = {
        text: 'DELETE FROM ride_requests WHERE future_trip_id = $1',
        values: [futureTripId],
    };
    result.rideRequests = await client.query(query);

    //The future trip itself is deleted.
    query = {
        text: 'DELETE FROM future_trips WHERE id = $1',
        values: [futureTripId],
    };
    result.futureTrips = await client.query(query);
    return result;
}

//The insertRideRequest function inserts a new ride request object into the database.
const insertRideRequest = async (newRideRequest) => {
    let result = await client.query('INSERT INTO ride_requests (future_trip_id, rider_id, rider_location, rider_location_lat, rider_location_lng, pickup_time, eta, rider_cost, driver_payout, status, distance, round_trip, dropoff_time, authorization_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *', 
        [newRideRequest.futureTripId, newRideRequest.riderId, newRideRequest.riderLocation, newRideRequest.riderLocationLat, newRideRequest.riderLocationLng, newRideRequest.pickupTime, newRideRequest.eta, newRideRequest.riderCost, newRideRequest.driverPayout, newRideRequest.status, newRideRequest.distance, newRideRequest.roundTrip, newRideRequest.dropoffTime, newRideRequest.authorizationId]);
    if (result.rows.length > 0) {
        result.rows[0] = RideRequest.createRideRequestFromDatabase(result.rows[0]);
    }
    return result;
};

//The findRideRequest function retrieves the ride request from the database based on the ride request ID.
const findRideRequest = async (rideRequestId) => {
    let query = {
        text: 'SELECT * FROM ride_requests WHERE id = $1',
        values: [rideRequestId],
    };
    let result = await client.query(query);
    return RideRequest.createRideRequestFromDatabase(result.rows[0]);
}

//The findRideRequestsForTrip function retrieves all ride requests for a given future trip ID.
const findRideRequestsForTrip = async (futureTripId) => {
    let query = {
        text: 'SELECT * FROM ride_requests WHERE future_trip_id = $1',
        values: [futureTripId],
    };
    let result = await client.query(query);

    //The rider details are added to the ride request object.
    let rideRequestsCount = result.rowCount;
    let rideRequests = result.rows;
    result = {};
    result.items = rideRequests;
    result.count = rideRequestsCount;
    for (let i = 0; i < rideRequestsCount; i++) {
        result.items[i] = RideRequest.createRideRequestFromDatabase(result.items[i]);
        result.items[i].rider = await findUserById(result.items[i].riderId);
    }
    return result;
}

//The findRideRequestsForRider function retrieves all ride requests for a given rider ID.
const findRideRequestsForRider = async (riderId) => {
    let query = {
        text: 'SELECT * FROM ride_requests WHERE rider_id = $1',
        values: [riderId],
    };
    let result = await client.query(query);

    //The future trip and driver details are added to the ride request object.
    let rideRequestsCount = result.rowCount;
    let rideRequests = result.rows;
    result = {};
    result.items = rideRequests;
    result.count = rideRequestsCount;
    for (let i = 0; i < rideRequestsCount; i++) {
        result.items[i] = RideRequest.createRideRequestFromDatabase(result.items[i]);
        result.items[i].futureTrip = await findFutureTrip(result.items[i].futureTripId);
        result.items[i].futureTrip.driver = await findUserById(result.items[i].futureTrip.driverId);
    }
    return result;
}

//The acceptRideRequest function updates the status of a ride request.
const updateRideRequestStatus = async (rideRequestId, status) => {
    let query = {
        text: 'UPDATE ride_requests SET status = $1 WHERE id = $2',
        values: [status, rideRequestId],
    };
    let result = await client.query(query);
    return result;
}

//The deleteRideRequest function deletes a ride request from the database.
const deleteRideRequest = async (rideRequestId) => {
    let query = {
        text: 'DELETE FROM ride_requests WHERE id = $1',
        values: [rideRequestId],
    };
    let result = await client.query(query);
    return result;
}

//The insertTrip function inserts a new trip object into the database.
const insertTrip = async (newTrip) => {
    let result = await client.query('INSERT INTO trips (driver_id, rider_id, start_location, start_location_lat, start_location_lng, rider_location, rider_location_lat, rider_location_lng, destination, destination_lat, destination_lng, started_at, picked_up_at, arrived_at, round_trip, driver_rated, rider_rated, time_at_destination, dropped_off_at, ended_at, driver_payout, rider_cost, distance) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23) RETURNING *',
        [newTrip.driverId, newTrip.riderId, newTrip.startLocation, newTrip.startLocationLat, newTrip.startLocationLng, newTrip.riderLocation, newTrip.riderLocationLat, newTrip.riderLocationLng, newTrip.destination, newTrip.destinationLat, newTrip.destinationLng, newTrip.startedAt, newTrip.pickedUpAt, newTrip.arrivedAt, newTrip.roundTrip, false, false, newTrip.timeAtDestination, newTrip.droppedOffAt, newTrip.endedAt, newTrip.driverPayout, newTrip.riderCost, newTrip.distance]);
    if (result.rows.length > 0) {
        result.rows[0] = Trip.createTripFromDatabase(result.rows[0]);
        return result;
    }
    return;
}

//The findRiderTrips function retrieves all trips for a given rider ID.
const findRiderTrips = async (userId) => {    
    let query = {
        text: 'SELECT * FROM trips WHERE rider_id = $1',
        values: [userId],
    };
    let result = await client.query(query);
    for (let i = 0; i < result.rows.length; i++) {
        result.rows[i] = Trip.createTripFromDatabase(result.rows[i]);
        result.rows[i].driver = await findUserById(result.rows[i].driverId);
    }
    return result.rows;
}

//The findDriverTrips function retrieves all trips for a given driver ID.
const findDriverTrips = async (userId) => {
    let query = {
        text: 'SELECT * FROM trips WHERE driver_id = $1',
        values: [userId],
    };
    let result = await client.query(query);
    for (let i = 0; i < result.rows.length; i++) {
        result.rows[i] = Trip.createTripFromDatabase(result.rows[i]);
        result.rows[i].rider = await findUserById(result.rows[i].riderId);
    }
    return result.rows;
}

//The findTrip function retrieves a trip object from the database based on the trip ID.
const findTrip = async (tripId) => {
    let query = {
        text: 'SELECT * FROM trips WHERE id = $1',
        values: [tripId],
    };
    let result = await client.query(query);
    return Trip.createTripFromDatabase(result.rows[0]);
}

//The updateFutureTripETA function updates the eta of a future trip to the actual arrival time.
const updateFutureTripETA = async (futureTripId, arrivalTime) => {
    let query = {
        text: 'UPDATE future_trips SET eta = $1 WHERE id = $2',
        values: [arrivalTime, futureTripId],
    };
    let result = await client.query(query);
    return result;
}

//The updateFutureTripStartTime function updates the start time of a future trip.
const updateFutureTripStartTime = async (futureTripId, newStartTime) => {
    let query = {
        text: 'UPDATE future_trips SET start_time = $1 WHERE id = $2',
        values: [newStartTime, futureTripId],
    };
    let result = await client.query(query);
    return result;
}

//The updateFutureTripTimeAtDestination function updates the time at destination of a future trip.
const updateFutureTripTimeAtDestination = async (futureTripId, timeAtDestination) => {
    let query = {
        text: 'UPDATE future_trips SET time_at_destination = $1 WHERE id = $2',
        values: [timeAtDestination, futureTripId],
    };
    let result = await client.query(query);
    return result;
}

//The updateRideRequestPickupTime function updates the pickup time of a ride request.
const updateRideRequestPickupTime = async (rideRequestId, newPickupTime) => {
    let query = {
        text: 'UPDATE ride_requests SET pickup_time = $1 WHERE id = $2',
        values: [newPickupTime, rideRequestId],
    };
    let result = await client.query(query);
    return result;
}

//The updateRideRequestDropOffTime function updates the dropoff time of a ride request.
const updateRideRequestDropOffTime = async (rideRequestId, newDropOffTime) => {
    let query = {
        text: 'UPDATE ride_requests SET dropoff_time = $1 WHERE id = $2',
        values: [newDropOffTime, rideRequestId],
    };
    let result = await client.query(query);
    return result;
}

//The updateDriverRating function updates the driver rating in the database.
const updateDriverRating = async (driverId, ratingCount, newRating, tripId) => {
    let query = {
        text: 'UPDATE users SET driver_rating = $1, driver_review_count = $2 WHERE id = $3',
        values: [newRating, ratingCount, driverId],
    }
    let result = {};
    result.rating = await client.query(query);
    query = {
        text: 'UPDATE trips SET driver_rated = true WHERE id = $1',
        values: [tripId],
    }
    result.boolean = await client.query(query);
    return result;
}

//The updateRiderRating function updates the rider rating in the database.
const updateRiderRating = async (riderId, ratingCount, newRating, tripId) => {
    let query = {
        text: 'UPDATE users SET rider_rating = $1, rider_review_count = $2 WHERE id = $3',
        values: [newRating, ratingCount, riderId],
    }
    let result = {};
    result.rating = await client.query(query);
    query = {
        text: 'UPDATE trips SET rider_rated = true WHERE id = $1',
        values: [tripId],
    }
    result.boolean = await client.query(query);
    return result;
}

//The server connects to the database and creates the necessary tables if they do not exist.
client.connect()
    .then(() => {
        console.log('Connected to PostgreSQL');
        const createUserTableQuery = `
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                firebase_uid VARCHAR(128) UNIQUE NOT NULL,
                name VARCHAR(128),
                email VARCHAR(128) UNIQUE NOT NULL,
                phone_number VARCHAR(32),
                school VARCHAR(100),
                fcm_token VARCHAR(256),
                driver BOOLEAN,
                payer_id VARCHAR(20),
                driver_rating FLOAT DEFAULT 0,
                driver_review_count INTEGER DEFAULT 0,
                rider_rating FLOAT DEFAULT 0,
                rider_review_count INTEGER DEFAULT 0,
                car_color VARCHAR(128),
                car_plate VARCHAR(128),
                car_make VARCHAR(128),
                car_model VARCHAR(128),
                car_mpg FLOAT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        const createTripTableQuery = `
            CREATE TABLE IF NOT EXISTS trips (
                id SERIAL PRIMARY KEY,
                driver_id INTEGER REFERENCES users(id),
                rider_id INTEGER REFERENCES users(id),
                start_location VARCHAR(128),
                start_location_lat FLOAT,
                start_location_lng FLOAT,
                rider_location VARCHAR(128),
                rider_location_lat FLOAT,
                rider_location_lng FLOAT,
                destination VARCHAR(128),
                destination_lat FLOAT,
                destination_lng FLOAT,
                started_at BIGINT,
                picked_up_at BIGINT,
                arrived_at BIGINT,
                round_trip BOOLEAN,
                driver_rated BOOLEAN,
                rider_rated BOOLEAN,
                time_at_destination BIGINT,
                dropped_off_at BIGINT,
                ended_at BIGINT,
                driver_payout FLOAT,
                rider_cost FLOAT,
                distance FLOAT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        const createFutureTripsTableQuery = `
            CREATE TABLE IF NOT EXISTS future_trips (
                id SERIAL PRIMARY KEY,
                driver_id INTEGER REFERENCES users(id),
                start_location VARCHAR(128),
                start_location_lat FLOAT,
                start_location_lng FLOAT,
                destination VARCHAR(128),
                destination_lat FLOAT,
                destination_lng FLOAT,
                start_time BIGINT,
                eta BIGINT,
                time_at_destination BIGINT,
                distance FLOAT,
                gas_price FLOAT,
                avoid_highways BOOLEAN,
                avoid_tolls BOOLEAN,  
                car_capacity INTEGER,
                round_trip BOOLEAN,
                is_full BOOLEAN,
                ets BIGINT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        const createRideRequestTableQuery = `
            CREATE TABLE IF NOT EXISTS ride_requests (
                id SERIAL PRIMARY KEY,
                future_trip_id INTEGER REFERENCES future_trips(id),
                rider_id INTEGER REFERENCES users(id),
                rider_location VARCHAR(128),
                rider_location_lat FLOAT,
                rider_location_lng FLOAT,
                pickup_time BIGINT,
                eta BIGINT,
                rider_cost FLOAT,
                driver_payout FLOAT,
                status VARCHAR(16),
                distance FLOAT,
                round_trip BOOLEAN,
                dropoff_time BIGINT,
                authorization_id VARCHAR(128),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        return client.query(createUserTableQuery)
            .then(() => client.query(createTripTableQuery))
            .then(() => client.query(createFutureTripsTableQuery))
            .then(() => client.query(createRideRequestTableQuery));
    })
    .catch((error) => {
        console.log('Error connecting to PostgreSQL or creating tables:', error);
    });

    //The close function is used to close the connection to the database.
    async function close() {
        await client.end();
        console.log('Connection to PostgreSQL closed');
    }

//The functions are exported for use in other files.
module.exports = { gatherCurrentTripData, close, doesUserExist, insertUser, findUser, findUserById, updateUser, findRiderTrips, findDriverTrips, insertFutureTrip, findFutureTripsForDriver, findFutureTripsForRider, findFutureTripsByRadius, setFutureTripFull, deleteFutureTrip, findFutureTrip, insertRideRequest, findRideRequest, findRideRequestsForTrip, findRideRequestsForRider, deleteRideRequest, insertTrip, findTrip, updateFcmToken, updateRideRequestStatus, updateFutureTripETA, updateFutureTripStartTime, updateFutureTripTimeAtDestination, updateRideRequestPickupTime, updateRideRequestDropOffTime, updateRiderRating, updateDriverRating };