require('dotenv').config(); // <-- load environment variables
const { OAuth2Client } = require('google-auth-library');

const oauth2Client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || "http://localhost:5000/oauth2callback"
);

// Generate the URL for authorization
const authorizeUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.compose'
    ],
    prompt: 'consent'
});

console.log('Authorize this app by visiting this url:', authorizeUrl);

// Usage: node generateToken.js <authorization_code>
if (process.argv[2]) {
    oauth2Client.getToken(process.argv[2])
        .then(({ tokens }) => {
            console.log('Refresh Token:', tokens.refresh_token);
            console.log('Access Token:', tokens.access_token);
        })
        .catch(console.error);
}
