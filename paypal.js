const axios = require('axios');
const { response } = require('express');
const querystring = require('querystring');

// TODO
// add automatic reauthirization if expired.

async function generateAccessToken() {
    try {
        const response = await axios({
            url: process.env.PAYPAL_BASE_URL + '/v1/oauth2/token',
            method: 'post',
            data: 'grant_type=client_credentials',
            auth: 
            {
                username: process.env.PAYPAL_CLIENT_ID,
                password: process.env.PAYPAL_SECRET
            },
        })

        return response.data.access_token
    } catch (e) { 
        console.error('Error generating access token:', e.response ? e.response.data : e.message); throw e; 
    }
}

exports.getUserInfo = async (authCode) => {
    try {
        const tokenResponse = await axios({
            url: process.env.PAYPAL_BASE_URL + '/v1/oauth2/token',
            method: 'post',
            headers: {
                'Authorization': 'Basic ' + Buffer
                  .from(process.env.PAYPAL_CLIENT_ID + ':' + process.env.PAYPAL_SECRET)
                  .toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            data: querystring.stringify({
                grant_type: 'authorization_code',
                code: authCode
            })
        });

        const accessToken = tokenResponse.data.access_token;

        const userInfoResponse = await axios({
            url: process.env.PAYPAL_BASE_URL + '/v1/identity/openidconnect/userinfo?schema=openid',
            method: 'get',
            headers: {
                'Authorization': 'Bearer ' + accessToken
            }
        });

        return userInfoResponse.data;
    } catch (e) {
        console.error('Error getting user info:', e.response?.data || e);
        throw e;
    }
};

exports.createOrder = async (tripCost) => {
    try {
    const accessToken = await generateAccessToken()

    const response = await axios({
        url: process.env.PAYPAL_BASE_URL + '/v2/checkout/orders',
        method: 'post',
        headers: {
            'Authorization': 'Bearer ' + accessToken,
            'Content-Type': 'application/json'
        },
        data: JSON.stringify({
            intent: 'AUTHORIZE',
            purchase_units: [
                {
                    items: [
                        {
                            name: 'DriveU Trip',
                            unit_amount: {
                                currency_code: 'USD',    
                                value: tripCost
                            },
                            quantity: '1'
                        }
                    ],
                    amount: {
                        currency_code: 'USD',
                        value: tripCost,
                        breakdown: {
                            item_total: {
                                currency_code: 'USD',
                                value: tripCost
                            }
                        }
                    }
                }
            ],
            application_context: {
                return_url: process.env.BASE_URL + '/authorize-order',
                cancel_url: process.env.BASE_URL + '/cancel-order',
                shipping_preference: 'NO_SHIPPING',
                user_action: 'PAY_NOW',
                brand_name: 'DriveU'
            }
        })
    })

    return response.data.links.find(link => link.rel === 'approve').href
} catch (e) { 
    console.error('Error creating paypal order:', e.response ? e.response.data : e.message); throw e; 
}
}

exports.authorizeOrder = async (orderId) => {
    const accessToken = await generateAccessToken();

    try {
        const response = await axios({
            url: process.env.PAYPAL_BASE_URL + '/v2/checkout/orders/' + orderId + '/authorize',
            method: 'post',
            headers: {
                'Authorization': 'Bearer ' + accessToken,
                'Content-Type': 'application/json'
            }
        });
        //console.log('Authorization response:', response.data);
        return response.data.purchase_units[0].payments.authorizations[0].id;
    } catch (error) {
        console.error('Error authorizing payment:', error.response ? error.response.data : error.message);
        throw error;
    }
}

exports.reauthorizeOrder = async (authorizationId) => {
    const accessToken = await generateAccessToken();

    try {
        const response = await axios({
            url: process.env.PAYPAL_BASE_URL + '/v2/payments/authorizations/' + authorizationId + '/reauthorize',
            method: 'post',
            headers: {
                'Authorization': 'Bearer ' + accessToken,
                'Content-Type': 'application/json'
            }
        });
        //console.log('Reauthorization response:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error reauthorizing payment:', error.response ? error.response.data : error.message);
        throw error;
    }
}

exports.capturePayment = async (orderId) => {
    const accessToken = await generateAccessToken();

    try {
        const response = await axios({
            url: process.env.PAYPAL_BASE_URL + '/v2/payments/authorizations/' + orderId + '/capture',
            method: 'post',
            headers: {
                'Authorization': 'Bearer ' + accessToken,
                'Content-Type': 'application/json',
                'prefer': 'return=representation'
            }
        });
        //console.log('Capture response:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error capturing payment:', error.response ? error.response.data : error.message);
        throw error;
    }
}

exports.createPayout= async (recipientEmail, amount) => {
    const accessToken = await generateAccessToken()

    const response = await axios.post(process.env.PAYPAL_BASE_URL + '/v1/payments/payouts', {
        sender_batch_header: {
            sender_batch_id: `batch_${new Date().getTime()}`,
            email_subject: 'You have a payout!',
        },
        items: [
            {
                recipient_type: 'EMAIL',
                amount: {
                    value: amount,
                    currency: "USD"
                },
                receiver: recipientEmail,
                note: 'Thank you for your business.',
                sender_item_id: `item_${new Date().getTime()}`
            }
        ]
    }, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        }
    });

    return response.data;
}

exports.voidAuthorization = async (authorizationId) => {
    const accessToken = await generateAccessToken();

    try {
        const response = await axios({
            url: process.env.PAYPAL_BASE_URL + '/v2/payments/authorizations/' + authorizationId + '/void',
            method: 'post',
            headers: {
                'Authorization': 'Bearer ' + accessToken,
                'Content-Type': 'application/json'
            }
        });
        //console.log('Void response:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error voiding payment:', error.response ? error.response.data : error.message);
        throw error;
    }
}