//This is the database.js file, and contains all the database queries for the application.

//Necessary imports from pg are included.
const { Client } = require('pg');
require('dotenv').config();

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
        result = await client.query('INSERT INTO users (firebase_uid, profile_image, name, email, phone_number, school, driver, car_color, car_plate, car_make, car_model, car_capacity, car_mpg) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *', 
            [curUser.firebaseUid, curUser.profileImage, curUser.name, curUser.email, curUser.phoneNumber, curUser.school, curUser.driver, curUser.carColor, curUser.carPlate, curUser.carMake, curUser.carModel, curUser.carCapacity, curUser.carMpg]);
    }
    else {
        //The user is inserted without car details if they are not a driver.
        result = await client.query('INSERT INTO users (firebase_uid, profile_image, name, email, phone_number, school, driver) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *', 
            [curUser.firebaseUid, curUser.profileImage, curUser.name, curUser.email, curUser.phoneNumber, curUser.school, curUser.driver]);
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
    return result.rows[0];
}

//The updateDeviceId function updates the device ID of a user in the database.
const updateDeviceId = async (firebaseUid, deviceId) => {
    let query = {
        text: 'UPDATE users SET device_id = $1 WHERE firebase_uid = $2',
        values: [deviceId, firebaseUid],
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
    return result.rows[0];
}

//The insertTestData function inserts a futureTrip object into the database.
const insertFutureTrip = async (newTrip) => {
    let result = await client.query('INSERT INTO future_trips (driver_id, start_location, destination, start_time, eta, distance, avoid_highways, avoid_tolls, round_trip, is_full) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
        [newTrip.driverId, newTrip.startLocation, newTrip.destination, newTrip.startTime, newTrip.eta, newTrip.distance, newTrip.avoidHighways, newTrip.avoidTolls, newTrip.roundTrip, false]);
    return result;
}

//The findFutureTripsForDriver function retrieves all future trips for a given user ID of the driver.
const findFutureTripsForDriver = async (driverId) => {
    let query = {
        text: 'SELECT * FROM future_trips WHERE driver_id = $1',
        values: [driverId],
    };
    let result = await client.query(query);
    return result;
}

//The findFutureTripsForRider function retrieves all future trips besides the ones where the rider is the driver.
const findFutureTripsForRider = async (riderId) => {
    let query = {
        text: 'SELECT * FROM future_trips WHERE driver_id <> $1 AND is_full = false',
        values: [riderId],
    };
    let result = await client.query(query);
    return result;
}

//The findFutureTrip function retrieves a future trip object from the database based on the future trip ID.
const findFutureTrip = async (futureTripId) => {
    let query = {
        text: 'SELECT * FROM future_trips WHERE id = $1',
        values: [futureTripId],
    };
    let result = await client.query(query);
    return result.rows[0];
}

//The setFutureTripFull function updates the is_full attribute of a future trip to true.
const setFutureTripFull = async (futureTripId) => {
    let query = {
        text: 'UPDATE future_trips SET is_full = $1 WHERE id = $2',
        values: [true, futureTripId],
    };
    let result = await client.query(query);
    return result;
}

//The deleteFutureTrip function deletes a future trip and all associated ride requests from the database.
const deleteFutureTrip = async (futureTripId) => {
    let result = {};

    //NOTIFY USERS WITH RIDE REQUESTS THAT THE TRIP HAS BEEN DELETED=========================================

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
    let result = await client.query('INSERT INTO ride_requests (future_trip_id, rider_id, rider_location, pickup_time, rider_cost, driver_payout, status, distance, round_trip, authorization_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
        [newRideRequest.futureTripId, newRideRequest.riderId, newRideRequest.riderLocation, newRideRequest.pickupTime, newRideRequest.riderCost, newRideRequest.driverPayout, newRideRequest.status, newRideRequest.distance, newRideRequest.roundTrip, newRideRequest.authorizationId]);
    return result;
};

//The findRideRequest function retrieves the ride request from the database based on the ride request ID.
const findRideRequest = async (rideRequestId) => {
    let query = {
        text: 'SELECT * FROM ride_requests WHERE id = $1',
        values: [rideRequestId],
    };
    let result = await client.query(query);
    return result.rows[0];
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
    for (let i = 0; i < rideRequestsCount; i++) {
        result.rows[i].rider = await findUserById(rideRequests[i].rider_id);
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
    for (let i = 0; i < rideRequestsCount; i++) {
        result.rows[i].futureTrip = await findFutureTrip(rideRequests[i].future_trip_id);
        result.rows[i].futureTrip.driver = await findUserById(rideRequests[i].futureTrip.driver_id);
    }
    return result;
}

//The acceptRideRequest function updates the status of a ride request to 'accepted'.
const acceptRideRequest = async (rideRequestId) => {
    let query = {
        text: 'UPDATE ride_requests SET status = $1 WHERE id = $2',
        values: ['accepted', rideRequestId],
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

//NOT WORKING
const findRiderTrips = async (firebaseUid) => {    
    let query = {
        text: 'SELECT * FROM trips WHERE rider_id = $1',
        values: [firebaseUid],
    };
    let result = await client.query(query);
    return result.rows;
}

//NOT WORKING
const findDriverTrips = async (firebaseUid) => {
    let query = {
        text: 'SELECT * FROM trips WHERE driver_id = $1',
        values: [firebaseUid],
    };
    let result = await client.query(query);
    return result.rows;
}

//The server connects to the database and creates the necessary tables if they do not exist.
client.connect()
    .then(() => {
        console.log('Connected to PostgreSQL');
        const createUserTableQuery = `
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                firebase_uid VARCHAR(128) UNIQUE NOT NULL,
                profile_image BYTEA,
                name VARCHAR(128),
                email VARCHAR(128) UNIQUE NOT NULL,
                phone_number VARCHAR(32),
                school VARCHAR(100),
                fcm_token VARCHAR(256),
                driver BOOLEAN,
                driver_rating FLOAT DEFAULT 0,
                driver_review_count INTEGER DEFAULT 0,
                rider_rating FLOAT DEFAULT 0,
                rider_review_count INTEGER DEFAULT 0,
                car_color VARCHAR(128),
                car_plate VARCHAR(128),
                car_make VARCHAR(128),
                car_model VARCHAR(128),
                car_capacity INTEGER,
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
                distance FLOAT,
                avoid_highways BOOLEAN,
                avoid_tolls BOOLEAN,  
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
    .then(() => {
        console.log('Tables created successfully');
    })
    .catch((error) => {
        console.log('Error connecting to PostgreSQL or creating tables:', error);
    });

//The functions are exported for use in other files.
module.exports = { doesUserExist, insertUser, findUser, findUserById, findRiderTrips, findDriverTrips, insertFutureTrip, findFutureTripsForDriver, findFutureTripsForRider, setFutureTripFull, deleteFutureTrip, findFutureTrip, insertRideRequest, findRideRequest, findRideRequestsForTrip, findRideRequestsForRider, deleteRideRequest, updateDeviceId, acceptRideRequest };