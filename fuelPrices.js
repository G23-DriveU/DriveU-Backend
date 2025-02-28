const axios = require('axios');

// Create an Axios instance
const apiClient = axios.create({
    baseURL: 'https://api.collectapi.com/gasPrice',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': process.env.COLLECT_API_KEY
    }
});

// Function to get gas prices from coordinates
exports.getLocalGasPrices = async (lat, lng) => {
    try {
        const response = await apiClient.get(`/fromCoordinates`, {
            params: {
                lat: lat,
                lng: lng
            }
        });
        console.log('Gas prices:', response);
        return response.data; // Return the gas price data
    } catch (error) {
        console.error('Error fetching gas prices:', error);
        throw error; // Rethrow the error for further handling
    }
};