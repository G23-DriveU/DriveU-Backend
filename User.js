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
        this.fcmToken = reqBody.fcmToken;
        if (reqBody.driver === 'true' || reqBody.driver === true) {
            this.driver = true;
        } else {
            this.driver = false;
        }
    }

    //This function creates a new User object from the database.
    static createUserFromDatabase(reqBody) {
        let updatedBody = {
            firebaseUid: reqBody.firebase_uid,
            name: reqBody.name,
            email: reqBody.email,
            phoneNumber: reqBody.phone_number,
            school: reqBody.school,
            driver: reqBody.driver,
        };
        let user = new User(updatedBody);
        user.id = reqBody.id;
        user.fcmToken = reqBody.fcm_token;
        user.driverRating = reqBody.driver_rating;
        user.driverReviewCount = reqBody.driver_review_count;
        user.riderRating = reqBody.rider_rating;
        user.riderReviewCount = reqBody.rider_review_count;
        user.payerId = reqBody.payer_id;
        user.carColor = reqBody.car_color;
        user.carPlate = reqBody.car_plate;
        user.carMake = reqBody.car_make;
        user.carModel = reqBody.car_model;
        user.carMpg = reqBody.car_mpg;
        return user;
    }
}

//The User class is exported.
module.exports = User;