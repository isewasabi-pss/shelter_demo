const fetch = require('node-fetch');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: ''
    };
  }

  const ORS_API_KEY = process.env.ORS_API_KEY;
  if (!ORS_API_KEY) {
    console.error('❌ ORS_API_KEY is missing');
    return {
      statusCode: 500,
      body: 'ORS API key is not set in environment variables.'
    };
  }

  try {
    console.log('📥 Incoming event.body:', event.body);
    const body = JSON.parse(event.body);

    const res = await fetch('https://api.openrouteservice.org/v2/directions/foot-walking/geojson', {
      method: 'POST',
      headers: {
        'Authorization': ORS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const resultText = await res.text();

    console.log('📨 ORS Response Status:', res.status);
    console.log('📨 ORS Response Body:', resultText);

    return {
      statusCode: res.status,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: resultText
    };

  } catch (err) {
    console.error('❌ ORS proxy error:', err);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'ORS request failed', details: err.message })
    };
  }
};
