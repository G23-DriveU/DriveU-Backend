const User = require('./User');

class Driver extends User {
    constructor(reqBody) {
        super(reqBody);

        this.car_color = reqBody.car_color;
        this.car_plate = reqBody.car_plate;
        this.car_make = reqBody.car_make;
        this.car_model = reqBody.car_model;
        this.car_capacity = reqBody.car_capacity;
        this.car_mpg = reqBody.car_mpg;
        this.paypal_email = reqBody.paypal_email;
    }
}

module.exports = Driver;