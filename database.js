// database.js
const { Client } = require('pg');

// PostgreSQL connection configuration
const client = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'postgres',
    password: 'postgres',
    port: 5432,
});

const doesUserExist = async (firebase_uid) => {
    const query = {
        text: 'SELECT EXISTS (SELECT 1 FROM users WHERE firebase_uid = $1)',
        values: [firebase_uid],
    };

    const result = await client.query(query);
    return result.rows[0].exists;
};

const insertUser = async (curUser) => {
    let result = null;
    if (curUser.driver == true) {
        result = await client.query('INSERT INTO users (firebase_uid, name, email, phone_number, school, driver, car_color, car_plate, car_make, car_model, car_capacity, car_mpg) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *', 
            [curUser.firebase_uid, curUser.name, curUser.email, curUser.phone_number, curUser.school, curUser.driver, curUser.car_color, curUser.car_plate, curUser.car_make, curUser.car_model, curUser.car_capacity, curUser.car_mpg]);
    }
    else {
        result = await client.query('INSERT INTO users (firebase_uid, name, email, phone_number, school, driver) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', 
            [curUser.firebase_uid, curUser.name, curUser.email, curUser.phone_number, curUser.school, curUser.driver]);
    }
    return result;
}

const findUser = async (firebaseUid) => {
    let query = {
        text: 'SELECT * FROM users WHERE firebase_uid = $1',
        values: [firebaseUid],
    };
    let result = await client.query(query);
    return result.rows[0];
}

const findUserById = async (userId) => {
    let query = {
        text: 'SELECT * FROM users WHERE id = $1',
        values: [userId],
    };
    let result = await client.query(query);
    return result.rows[0];
}

const insertFutureTrip = async (newTrip) => {
    let result = await client.query('INSERT INTO future_trips (driver_id, start_location, destination, start_time, eta, distance, avoid_highways, avoid_tolls, is_full) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
        [newTrip.driverId, newTrip.startLocation, newTrip.destination, newTrip.startTime, newTrip.eta, newTrip.distance, newTrip.avoidHighways, newTrip.avoidTolls, false]);
    return result;
}

const findFutureTrips = async (driverId) => {
    let query = {
        text: 'SELECT * FROM future_trips WHERE driver_id = $1',
        values: [driverId],
    };
    let result = await client.query(query);
    return result;
}

const findFutureTrip = async (futureTripId) => {
    let query = {
        text: 'SELECT * FROM future_trips WHERE id = $1',
        values: [futureTripId],
    };
    let result = await client.query(query);
    return result.rows[0];
}

const deleteFutureTrip = async (futureTripId) => {
    let query = {
        text: 'DELETE FROM future_trips WHERE id = $1',
        values: [futureTripId],
    };
    let result = await client.query(query);
    return result;
}

const insertRideRequest = async (newRideRequest) => {
    let result = await client.query('INSERT INTO ride_requests (future_trip_id, rider_id, rider_location, rider_cost, driver_payout, status, distance, round_trip, authorization_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
        [newRideRequest.futureTripId, newRideRequest.riderId, newRideRequest.riderLocation, newRideRequest.riderCost, newRideRequest.driverPayout, newRideRequest.status, newRideRequest.distance, newRideRequest.roundTrip, newRideRequest.authorizationId]);
    return result;
};

const findRideRequest = async (futureTripId) => {
    let query = {
        text: 'SELECT * FROM ride_requests WHERE future_trip_id = $1',
        values: [futureTripId],
    };
    let result = await client.query(query);
    return result;
}

const findRiderTrips = async (firebase_uid) => {    
    let query = {
        text: 'SELECT * FROM trips WHERE rider_id = $1',
        values: [firebase_uid],
    };
    let result = await client.query(query);
    return result.rows;
}

const findDriverTrips = async (firebase_uid) => {
    let query = {
        text: 'SELECT * FROM trips WHERE driver_id = $1',
        values: [firebase_uid],
    };
    let result = await client.query(query);
    return result.rows;
}

// Connect to PostgreSQL and create tables
client.connect()
    .then(() => {
        console.log('Connected to PostgreSQL');

        // Create the users table
        const createUserTableQuery = `
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                firebase_uid VARCHAR(128) UNIQUE NOT NULL,
                profile_image BYTEA,
                name VARCHAR(100),
                email VARCHAR(100) UNIQUE NOT NULL,
                phone_number VARCHAR(20) UNIQUE,
                school VARCHAR(100),
                device_id VARCHAR(64),
                driver BOOLEAN,
                driver_rating FLOAT DEFAULT 0,
                driver_review_count INTEGER DEFAULT 0,
                rider_rating FLOAT DEFAULT 0,
                rider_review_count INTEGER DEFAULT 0,
                car_color VARCHAR(100),
                car_plate VARCHAR(100),
                car_make VARCHAR(100),
                car_model VARCHAR(100),
                car_capacity INTEGER,
                car_mpg FLOAT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        // Create the trips table with a foreign key reference to the users table
        const createTripTableQuery = `
            CREATE TABLE IF NOT EXISTS trips (
                id SERIAL PRIMARY KEY,
                driver_id INTEGER REFERENCES users(id),
                rider_id INTEGER REFERENCES users(id),
                start_location VARCHAR(100),
                rider_location VARCHAR(100),
                destination VARCHAR(100),
                started_at TIMESTAMP,
                ended_at TIMESTAMP,
                round_trip BOOLEAN,
                driver_payout FLOAT,
                rider_cost FLOAT,
                distance FLOAT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        // Create the future_trips table
        const createFutureTripsTableQuery = `
            CREATE TABLE IF NOT EXISTS future_trips (
                id SERIAL PRIMARY KEY,
                driver_id INTEGER REFERENCES users(id),
                start_location VARCHAR(100),
                destination VARCHAR(100),
                start_time BIGINT,
                eta BIGINT,
                distance FLOAT,
                avoid_highways BOOLEAN,
                avoid_tolls BOOLEAN,  
                is_full BOOLEAN,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        // Create the ride_request table to handle the many-to-many relationship (many passengers can request many trips)
        const createRideRequestTableQuery = `
            CREATE TABLE IF NOT EXISTS ride_requests (
                id SERIAL PRIMARY KEY,
                future_trip_id INTEGER REFERENCES future_trips(id),
                rider_id INTEGER REFERENCES users(id),
                rider_location VARCHAR(128),
                rider_cost FLOAT,
                driver_payout FLOAT,
                status VARCHAR(10),
                distance FLOAT,
                round_trip BOOLEAN,
                authorization_id VARCHAR(128),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        // Execute the table creation queries
        return client.query(createUserTableQuery)
            .then(() => client.query(createTripTableQuery))
            .then(() => client.query(createFutureTripsTableQuery))
            .then(() => client.query(createRideRequestTableQuery));
    })
    .then(() => {
        console.log('Tables created successfully');
        //return insertTestData();
    })
    .catch((error) => {
        console.log('Error connecting to PostgreSQL or creating tables:', error);
    });

module.exports = { client, doesUserExist, insertUser, findUser, findUserById, findRiderTrips, findDriverTrips, insertFutureTrip, findFutureTrips, deleteFutureTrip, findFutureTrip, insertRideRequest, findRideRequest };