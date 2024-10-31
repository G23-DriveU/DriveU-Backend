//This class is used to create a user object that will be stored in the database.

//The User class is defined.
class User {
    //The constructor takes in the request body and initializes the object with the provided values.
    constructor(reqBody) {
        this.firebaseUid = reqBody.firebaseUid;
        this.name = reqBody.name;
        this.email = reqBody.email;
        this.phoneNumber = reqBody.phoneNumber;
        this.school = reqBody.school;
        if (reqBody.driver == 'true') this.driver = true;
        else  this.driver = false;
    }
}

//The User class is exported.
module.exports = User;