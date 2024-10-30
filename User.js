class User {
    constructor(reqBody) {
        this.firebase_uid = reqBody.firebase_uid;
        this.name = reqBody.name;
        this.email = reqBody.email;
        this.phone_number = reqBody.phone_number;
        this.school = reqBody.school;
        if (reqBody.driver == 'true') this.driver = true;
        else  this.driver = false;

        this.car_color = reqBody.car_color;
        this.car_plate = reqBody.car_plate;
        this.car_make = reqBody.car_make;
        this.car_model = reqBody.car_model;
        this.car_capacity = reqBody.car_capacity;
        this.car_mpg = reqBody.car_mpg;
        this.paypal_email = reqBody.paypal_email;
    }
}

module.exports = User;