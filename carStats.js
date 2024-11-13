const axios = require('axios');

const BASE_URL = 'https://vpic.nhtsa.dot.gov/api/vehicles';

exports.getAllCarMakes = async () => {
    const url = `${BASE_URL}/GetAllMakes?format=json`;
    try {
        const response = await axios.get(url);
        const makeNames = response.data.Results.map(make => make.Make_Name);
        return makeNames; // Returns an array of make names
    } catch (error) {
        console.error('Error fetching car makes:', error);
        throw error;
    }
};

exports.getModelsForMake = async (make) => {
    const url = `${BASE_URL}/GetModelsForMake/${make}?format=json`;
    try {
        const response = await axios.get(url);
        const modelNames = response.data.Results.map(model => model.Model_Name);
        return modelNames; // Returns an array of model names for the specified make
    } catch (error) {
        console.error(`Error fetching models for make ${make}:`, error);
        throw error;
    }
};