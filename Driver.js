//This class is used to create a driver object that will be stored in the database.

//Necessary imports from ./User are included.
const User = require('./User');

//The Driver class is defined.
class Driver extends User {
    //The constructor takes in the request body and initializes the object with the provided values.
    constructor(reqBody) {
        super(reqBody);
        this.carColor = reqBody.carColor;
        this.carPlate = reqBody.carPlate;
        this.carMake = reqBody.carMake;
        this.carModel = reqBody.carModel;
        this.carMpg = 15; //ADD RESPONSE FROM API CALL TO GET CAR MPG HERE ====================================
    }
}

//The Driver class is exported.
module.exports = Driver;