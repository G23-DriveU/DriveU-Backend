//This file is used to test the Post users endpoint of the server via Jest.

//Necessary modules are imported.
const request = require('supertest');
const { app, server } = require('../server'); 
const close = require('../database').close;

//Testing the post users endpoint.
describe('POST /users', () => {
    //The database is cleared before running the tests.
    beforeAll(async () => {
        //REMOVE USERS with firebaseUid "testUid" and "existingUid" from the database.
    });

    //The database connection is closed after all the tests are run.
    afterAll(async () => {
        await close();
        server.close();
    });

    //The first test case is defined to create a new user and return user data.
    it('should create a new user and return user data', async () => {
        //A mock user object is created.
        const newUser  = {
            firebaseUid: 'testUid',
            name: 'Test User',
            email: 'testing@school.edu',
            phoneNumber: '123-456-7890',
            school: 'Test School',
            driver: 'false',
        };

        //The post request is made to the server with the mock user object.
        const response = await request(app).post('/users').query(newUser );

        //The response status and body are checked.
        expect(response.status).toBe(201);
        expect(response.body.status).toBe('OK');
        expect(response.body.user).toHaveProperty('id');
    });

    //The second test case is defined to test the case when the user already exists.
    it('should return conflict if user already exists', async () => {
        //A mock existing user object is created.
        const existingUser  = {
            firebaseUid: 'existingUid',
            name: 'Test User',
            email: 'test@school.edu',
            phoneNumber: '123-456-7890',
            school: 'Test School',
            driver: 'false',
        };

        //The post request is made to the server with the mock existing user object.
        await request(app).post('/users').query(existingUser); 

        //The post request is made to the server with the same mock existing user object.
        const response = await request(app).post('/users').query(existingUser);

        //The response status and body are checked.
        expect(response.status).toBe(409);
        expect(response.body.status).toBe('CONFLICT');
        expect(response.body.conflict).toBe('User already exists');
    });
});